/**
 * Depth for the 2.5D mosaic: the pure parts.
 * The model itself runs in a Web Worker (runtime/depth-worker.mjs); these
 * functions prepare its input and turn its output into one number per
 * mosaic cell, so they can be tested without it.
 *
 * Model: Depth Anything V2 Small (Apache-2.0), ONNX int8 from Hugging Face.
 * It outputs relative inverse depth: larger means nearer, no unit.
 */

/** Pinned model file (Hugging Face revision of onnx-community/depth-anything-v2-small, 2026-04-14). */
export const DEPTH_MODEL_URL =
  'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_int8.onnx';
/** Its size in bytes, for download progress when the server sends no length. */
export const DEPTH_MODEL_BYTES = 27258801;
/** Longest side of the model input: a multiple of 14 (the model's patch size); 266 is enough for ≤ 160 cells. */
export const DEPTH_SIDE = 266;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** Model input size for a w × h photo: longest side DEPTH_SIDE, both sides multiples of 14. */
export function inputSize(w, h, side = DEPTH_SIDE) {
  const s = side / Math.max(w, h);
  const round14 = (v) => Math.max(14, Math.round((v * s) / 14) * 14);
  return { w: round14(w), h: round14(h) };
}

/**
 * RGBA pixels → the model's input: bilinear resize to `iw × ih`, ImageNet
 * mean / std, channels first.
 *
 * @param {Uint8ClampedArray | Uint8Array} rgba
 * @param {number} w
 * @param {number} h
 * @param {number} iw
 * @param {number} ih
 * @returns {Float32Array} 3 × ih × iw
 */
export function toInput(rgba, w, h, iw, ih) {
  const out = new Float32Array(3 * iw * ih);
  const plane = iw * ih;
  for (let y = 0; y < ih; y++) {
    const sy = Math.min(h - 1, Math.max(0, ((y + 0.5) * h) / ih - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < iw; x++) {
      const sx = Math.min(w - 1, Math.max(0, ((x + 0.5) * w) / iw - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      for (let c = 0; c < 3; c++) {
        const p = (yy, xx) => rgba[(yy * w + xx) * 4 + c];
        const v = (p(y0, x0) * (1 - fx) + p(y0, x1) * fx) * (1 - fy) + (p(y1, x0) * (1 - fx) + p(y1, x1) * fx) * fy;
        out[c * plane + y * iw + x] = (v / 255 - MEAN[c]) / STD[c];
      }
    }
  }
  return out;
}

/**
 * Model output (one value per input pixel, over the whole photo) → one value
 * per mosaic cell: the mean over the cell's area of the cropped region,
 * scaled to 0 (farthest cell) … 1 (nearest cell).
 *
 * @param {{ data: Float32Array, w: number, h: number }} depth over the whole photo
 * @param {{ x: number, y: number, w: number, h: number }} crop region of the photo, in photo pixels
 * @param {number} photoW
 * @param {number} photoH
 * @param {number} gw grid width in cells
 * @param {number} gh grid height in cells
 * @returns {Float32Array} gw × gh, row by row
 */
export function depthForGrid(depth, crop, photoW, photoH, gw, gh) {
  const sx = depth.w / photoW;
  const sy = depth.h / photoH;
  const out = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const y0 = (crop.y + (gy * crop.h) / gh) * sy;
    const y1 = (crop.y + ((gy + 1) * crop.h) / gh) * sy;
    for (let gx = 0; gx < gw; gx++) {
      const x0 = (crop.x + (gx * crop.w) / gw) * sx;
      const x1 = (crop.x + ((gx + 1) * crop.w) / gw) * sx;
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(y0); y < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); y++) {
        for (let x = Math.floor(x0); x < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); x++) {
          const yy = Math.min(depth.h - 1, Math.max(0, y));
          const xx = Math.min(depth.w - 1, Math.max(0, x));
          sum += depth.data[yy * depth.w + xx];
          n++;
        }
      }
      out[gy * gw + gx] = sum / n;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of out) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / span;
  return out;
}
