/**
 * Drawing helpers shared by the two books (`pages.mjs` for the 3D model,
 * `mosaic.mjs` for the mosaic): ink colours, the font stack, and fitting
 * pictures and words into boxes on a 2D canvas.
 */

export const INK = '#1f1d1a';
export const MUTED = '#6b665d';
export const FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", system-ui, sans-serif';

/**
 * Draw an image as large as fits in the box, keeping its shape, centred.
 * Returns where it went, or null when the image or the box is empty.
 */
export function fitImage(ctx, img, x, y, w, h) {
  const iw = img.width;
  const ih = img.height;
  if (!iw || !ih || w <= 0 || h <= 0) return null;
  const s = Math.min(w / iw, h / ih);
  const box = { x: x + (w - iw * s) / 2, y: y + (h - ih * s) / 2, w: iw * s, h: ih * s };
  ctx.drawImage(img, box.x, box.y, box.w, box.h);
  return box;
}

/** Shorten text with "…" until it fits `max` pixels. */
export function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Break text into lines of at most `max` pixels (at spaces, or anywhere for CJK). */
export function wrap(ctx, text, max) {
  const lines = [];
  let line = '';
  const tokens = text.match(/[\u3000-\u9fff\uff00-\uffef]|[^\s\u3000-\u9fff\uff00-\uffef]+\s*|\s+/g) ?? [];
  for (const tok of tokens) {
    if (line && ctx.measureText(line + tok).width > max) {
      lines.push(line.trimEnd());
      line = tok.trimStart();
    } else line += tok;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}
