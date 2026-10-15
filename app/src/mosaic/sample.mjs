import { linToLab, toLinear } from './colour.mjs';

/**
 * Photo → grid: grid size for a crop, the crop that fits the grid, shrinking
 * by area averaging in linear light, and brightness / contrast / saturation
 * in Lab.
 *
 * @typedef {import('./palette.mjs').Pixels} Pixels
 */

/**
 * Grid size for a crop: the long side gets `studs` (rounded to a multiple of
 * 16), the short side keeps the crop's aspect, also a multiple of 16, at least 16.
 * @param {{ w: number, h: number }} crop
 * @param {number} studs
 */
export function gridSize(crop, studs) {
  const long = Math.max(16, Math.round(studs / 16) * 16);
  const short = Math.max(16, Math.round((long * Math.min(crop.w, crop.h)) / Math.max(crop.w, crop.h) / 16) * 16);
  return crop.w >= crop.h ? { width: long, height: short } : { width: short, height: long };
}

/**
 * The largest centred part of `region` with the grid's aspect ratio, so every
 * cell covers a square of the photo (rounding the grid to multiples of 16
 * would otherwise stretch it a little).
 * @param {{ x: number, y: number, w: number, h: number }} region
 * @param {number} width  grid width in cells
 * @param {number} height
 */
export function fitCrop(region, width, height) {
  const want = width / height;
  if (region.w / region.h > want) {
    const w = region.h * want;
    return { x: region.x + (region.w - w) / 2, y: region.y, w, h: region.h };
  }
  const h = region.w / want;
  return { x: region.x, y: region.y + (region.h - h) / 2, w: region.w, h };
}

/**
 * Shrink a crop of the image to width × height cells by area averaging in
 * linear light; transparent pixels are composited over white.
 * @param {Pixels} img
 * @param {{ x: number, y: number, w: number, h: number }} crop  in image pixels
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array}  Lab per cell, 3 floats each, row-major
 */
export function sampleLab(img, crop, width, height) {
  const sums = new Float64Array(width * height * 4);
  const sx = width / crop.w;
  const sy = height / crop.h;
  const x0 = Math.max(0, Math.floor(crop.x));
  const y0 = Math.max(0, Math.floor(crop.y));
  const x1 = Math.min(img.width, Math.ceil(crop.x + crop.w));
  const y1 = Math.min(img.height, Math.ceil(crop.y + crop.h));
  for (let py = y0; py < y1; py++) {
    // Pixel py covers [py, py+1) in image space; split it across the cell rows it overlaps.
    const ca = (py - crop.y) * sy;
    const cb = (py + 1 - crop.y) * sy;
    for (let px = x0; px < x1; px++) {
      const i = (py * img.width + px) * 4;
      const alpha = img.data[i + 3] / 255;
      const r = toLinear(img.data[i]) * alpha + (1 - alpha);
      const g = toLinear(img.data[i + 1]) * alpha + (1 - alpha);
      const b = toLinear(img.data[i + 2]) * alpha + (1 - alpha);
      const ra = (px - crop.x) * sx;
      const rb = (px + 1 - crop.x) * sx;
      for (let cy = Math.max(0, Math.floor(ca)); cy < Math.min(height, Math.ceil(cb)); cy++) {
        const wy = Math.min(cb, cy + 1) - Math.max(ca, cy);
        if (wy <= 0) continue;
        for (let cx = Math.max(0, Math.floor(ra)); cx < Math.min(width, Math.ceil(rb)); cx++) {
          const w = wy * (Math.min(rb, cx + 1) - Math.max(ra, cx));
          if (w <= 0) continue;
          const k = (cy * width + cx) * 4;
          sums[k] += r * w;
          sums[k + 1] += g * w;
          sums[k + 2] += b * w;
          sums[k + 3] += w;
        }
      }
    }
  }
  const lab = new Float32Array(width * height * 3);
  for (let c = 0; c < width * height; c++) {
    const w = sums[c * 4 + 3] || 1;
    const [L, A, B] = sums[c * 4 + 3] ? linToLab(sums[c * 4] / w, sums[c * 4 + 1] / w, sums[c * 4 + 2] / w) : [100, 0, 0];
    lab[c * 3] = L;
    lab[c * 3 + 1] = A;
    lab[c * 3 + 2] = B;
  }
  return lab;
}

/**
 * Brightness, contrast and saturation in Lab, in place.
 * @param {Float32Array} lab
 * @param {{ brightness?: number, contrast?: number, saturation?: number }} adj  each −100…100, 0 = unchanged
 */
export function adjustLab(lab, { brightness = 0, contrast = 0, saturation = 0 } = {}) {
  if (!brightness && !contrast && !saturation) return lab;
  const k = (100 + contrast) / 100;
  const s = (100 + saturation) / 100;
  for (let i = 0; i < lab.length; i += 3) {
    lab[i] = Math.min(100, Math.max(0, (lab[i] - 50) * k + 50 + brightness / 2));
    lab[i + 1] *= s;
    lab[i + 2] *= s;
  }
  return lab;
}
