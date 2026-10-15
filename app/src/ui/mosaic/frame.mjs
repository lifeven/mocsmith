/**
 * Framing a part of the photo on the mosaic page : the whole photo with
 * a rectangle on it, moved and resized by pointer or keyboard. The rectangle
 * (`region`, in photo-canvas pixels) is passed to buildMosaic as its `crop`;
 * its shape sets the grid (gridSize), and fitCrop trims it to the grid's
 * aspect. Opt-in: until the visitor frames something the whole photo is used.
 *
 * The geometry here is plain functions (unit-tested); drawFrame draws it and
 * bindFrame turns pointer and keyboard input into new frames.
 */

/** Smallest frame side, as a share of the photo's shorter side. */
export const MIN_FRAME = 0.1;
/** Keyboard step, as a share of the photo's longer side. */
export const FRAME_STEP = 0.02;

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

/**
 * What a press at `p` grabs: a corner (within `tol`), the inside (move) or
 * nothing (draw a new frame from there).
 * @param {Rect} r
 * @param {{ x: number, y: number }} p
 * @param {number} tol
 * @returns {'nw' | 'ne' | 'sw' | 'se' | 'move' | 'new'}
 */
export function hitFrame(r, p, tol) {
  const corners = { nw: [r.x, r.y], ne: [r.x + r.w, r.y], sw: [r.x, r.y + r.h], se: [r.x + r.w, r.y + r.h] };
  let best = null;
  let bestD = Infinity;
  for (const [k, [x, y]] of Object.entries(corners)) {
    const d = Math.max(Math.abs(p.x - x), Math.abs(p.y - y));
    if (d <= tol && d < bestD) [best, bestD] = [k, d];
  }
  if (best) return /** @type {'nw' | 'ne' | 'sw' | 'se'} */ (best);
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h ? 'move' : 'new';
}

/**
 * The frame while dragging: `mode` from hitFrame, `from` the frame and
 * `start` the point at the press, `p` the point now; kept inside the
 * W × H photo and at least MIN_FRAME of its shorter side.
 * @param {{ mode: string, from: Rect, start: { x: number, y: number } }} drag
 * @param {{ x: number, y: number }} p
 * @param {number} W
 * @param {number} H
 * @returns {Rect}
 */
export function dragFrame({ mode, from, start }, p, W, H) {
  if (mode === 'move') {
    return round({ x: clamp(from.x + p.x - start.x, 0, W - from.w), y: clamp(from.y + p.y - start.y, 0, H - from.h), w: from.w, h: from.h });
  }
  // The corner opposite the one being dragged stays put; a new frame grows from the press.
  const anchor =
    mode === 'new'
      ? start
      : { x: mode.endsWith('w') ? from.x + from.w : from.x, y: mode.startsWith('n') ? from.y + from.h : from.y };
  const min = MIN_FRAME * Math.min(W, H);
  const side = (a, v, size) => {
    v = clamp(v, 0, size);
    let lo = Math.min(a, v);
    let hi = Math.max(a, v);
    if (hi - lo < min) {
      if (v < a) [lo, hi] = [Math.max(0, a - min), Math.max(0, a - min) + min];
      else [lo, hi] = [Math.min(size, a + min) - min, Math.min(size, a + min)];
    }
    return [lo, hi];
  };
  const [x0, x1] = side(anchor.x, p.x, W);
  const [y0, y1] = side(anchor.y, p.y, H);
  return round({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

/**
 * The frame after one arrow key: moved by FRAME_STEP of the photo's longer
 * side, or with Shift resized (right/down grow, left/up shrink).
 * @param {Rect} r
 * @param {string} key KeyboardEvent.key
 * @param {boolean} resize
 * @param {number} W
 * @param {number} H
 * @returns {Rect | null} null for other keys
 */
export function nudgeFrame(r, key, resize, W, H) {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!d) return null;
  const step = FRAME_STEP * Math.max(W, H);
  if (!resize) return round({ ...r, x: clamp(r.x + d[0] * step, 0, W - r.w), y: clamp(r.y + d[1] * step, 0, H - r.h) });
  const min = MIN_FRAME * Math.min(W, H);
  const w = clamp(r.w + d[0] * step, min, W - r.x);
  const h = clamp(r.h + d[1] * step, min, H - r.y);
  return round({ ...r, w, h });
}

/** True when the frame is the whole W × H photo (then no crop is passed). */
export const isWhole = (r, W, H) => r.x <= 0 && r.y <= 0 && r.x + r.w >= W && r.y + r.h >= H;

/** CSS pixels per canvas pixel (the canvas is scaled down to fit, `object-fit: contain` from the top left). */
export function cssScale(out) {
  const r = out.getBoundingClientRect();
  return out.width && r.width ? Math.min(r.width / out.width, r.height / out.height) : 1;
}

/**
 * Pointer and keyboard on the canvas that shows the whole photo while
 * framing: a press grabs a corner (within `grabPx` CSS pixels, a fingertip),
 * the inside, or starts a new frame; arrow keys nudge it, Esc ends framing.
 * @param {HTMLCanvasElement} out drawn by drawFrame
 * @param {{ active: () => boolean, size: () => { w: number, h: number }, current: () => Rect, onFrame: (r: Rect) => void, onEscape: () => void, grabPx?: number }} hooks
 *   size: the photo in pixels; current: the frame now; onFrame: each new frame
 */
export function bindFrame(out, { active, size, current, onFrame, onEscape, grabPx = 22 }) {
  /** @type {{ mode: string, from: Rect, start: { x: number, y: number }, id: number, moved: boolean } | null} */
  let drag = null;
  /** A pointer event in photo pixels, and the grab distance there. */
  const at = (e) => {
    const r = out.getBoundingClientRect();
    const s = cssScale(out) * (out.width / size().w);
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s, tol: grabPx / s };
  };
  out.addEventListener('pointerdown', (e) => {
    if (!active() || drag) return;
    const p = at(e);
    const { w, h } = size();
    // With the whole photo framed, a press inside it starts a new frame (there is nothing to move).
    let mode = hitFrame(current(), p, p.tol);
    if (mode === 'move' && isWhole(current(), w, h)) mode = 'new';
    drag = { mode, from: current(), start: p, id: e.pointerId, moved: false };
    out.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  out.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = at(e);
    // A new frame starts only once the press has moved a little (a tap outside changes nothing).
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < p.tol / 2) return;
    drag.moved = true;
    onFrame(dragFrame(drag, p, size().w, size().h));
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    out.releasePointerCapture?.(e.pointerId);
  };
  out.addEventListener('pointerup', end);
  out.addEventListener('pointercancel', end);
  out.addEventListener('keydown', (e) => {
    if (!active()) return;
    if (e.key === 'Escape') {
      onEscape();
      return;
    }
    const r = nudgeFrame(current(), e.key, e.shiftKey, size().w, size().h);
    if (!r) return;
    e.preventDefault();
    onFrame(r);
  });
}

/**
 * The whole photo on `out` (long side at most `maxSide`), the part outside
 * the frame dimmed, the frame's outline and its four corner handles.
 * @param {HTMLCanvasElement} out
 * @param {HTMLCanvasElement} photo
 * @param {Rect} r in photo pixels
 * @param {{ maxSide?: number, cssScale?: number }} [opts] cssScale: CSS pixels per canvas pixel, so lines and handles keep their on-screen size
 */
export function drawFrame(out, photo, r, { maxSide = 768, cssScale = 1 } = {}) {
  const k = Math.min(1, maxSide / Math.max(photo.width, photo.height));
  out.width = Math.round(photo.width * k);
  out.height = Math.round(photo.height * k);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(photo, 0, 0, out.width, out.height);
  const [x, y, w, h] = [r.x * k, r.y * k, r.w * k, r.h * k];
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.rect(0, 0, out.width, out.height);
  ctx.rect(x, y, w, h);
  ctx.fill('evenodd');
  const px = 1 / cssScale;
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(x, y, w, h);
  const s = 12 * px;
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.lineWidth = px;
    ctx.strokeStyle = '#1e5aa8';
    ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
  }
  return k;
}
