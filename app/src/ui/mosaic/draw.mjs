import table from '../../data/mosaic-colours.json' with { type: 'json' };

/** CSS colour of a mosaic colour (Rebrickable id). */
export const hexOf = (code) => `#${table.colours[code].rgb}`;

/**
 * 2.5D preview, light from the top left: the shadow a step casts on the lower
 * cell beside it (share of a cell per plate of height difference, at most a
 * cell) and the lit edge on the raised side. The part colours stay as they are.
 */
const SHADOW_BAND = 0.5;
const SHADOW = 'rgba(0, 0, 0, 0.5)';
const LIT_BAND = 0.22;
const LIT = 'rgba(255, 255, 255, 0.35)';
/** 「标出垫高的地方」: white over a raised cell, by plates under it (1, 2, 3…). */
const MARKS = ['', 'rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.6)', 'rgba(255, 255, 255, 0.75)'];

/**
 * Draw a mosaic onto a canvas: one circle or square per cell on the base
 * colour, a lighter ring for studded plates, and (optionally) a faint line
 * between 16 × 16 panels. Used by the mosaic page and the start-page examples.
 *
 * With `heights` (2.5D, plates under each cell), light from the top left: a
 * cell lower than the one to its left or above gets a shadow along that edge,
 * wider for a taller step, and a raised cell gets a lit edge where its left or
 * upper neighbour is lower. Colours are not changed unless `markRaised`,
 * which lays white over each raised cell, more for a taller one.
 *
 * @param {HTMLCanvasElement} out
 * @param {{ width: number, height: number, cells: Uint8Array, palette: { code: number }[], part: string }} mosaic
 * @param {{ cellPx?: number, base: number, panels?: boolean, heights?: Uint8Array | null, markRaised?: boolean }} options base: Rebrickable colour id of the base
 */
export function drawMosaicCanvas(out, mosaic, { cellPx = 12, base, panels = true, heights = null, markRaised = false }) {
  const { width, height, cells, palette, part } = mosaic;
  out.width = width * cellPx;
  out.height = height * cellPx;
  const ctx = out.getContext('2d');
  ctx.fillStyle = hexOf(base);
  ctx.fillRect(0, 0, out.width, out.height);
  const round = part === 'roundTile' || part === 'roundPlate';
  const studded = part === 'roundPlate' || part === 'squarePlate';
  const fills = palette.map((c) => hexOf(c.code));
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const x = c * cellPx;
      const y = r * cellPx;
      ctx.fillStyle = fills[cells[r * width + c]];
      ctx.beginPath();
      if (round) ctx.arc(x + cellPx / 2, y + cellPx / 2, cellPx * 0.46, 0, Math.PI * 2);
      else ctx.rect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
      ctx.fill();
      if (studded) {
        // A stud: a lighter ring so plates read differently from tiles.
        ctx.strokeStyle = '#ffffff40';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + cellPx / 2, y + cellPx / 2, cellPx * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  if (heights) {
    const band = (k, d) => Math.min(cellPx, Math.ceil(cellPx * k * d));
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const h = heights[r * width + c];
        const left = c > 0 ? heights[r * width + c - 1] - h : 0;
        const up = r > 0 ? heights[(r - 1) * width + c] - h : 0;
        const x = c * cellPx;
        const y = r * cellPx;
        if (markRaised && h) {
          ctx.fillStyle = MARKS[Math.min(h, MARKS.length - 1)];
          ctx.fillRect(x, y, cellPx, cellPx);
        }
        ctx.fillStyle = SHADOW;
        if (left > 0) ctx.fillRect(x, y, band(SHADOW_BAND, left), cellPx);
        if (up > 0) ctx.fillRect(x, y, cellPx, band(SHADOW_BAND, up));
        ctx.fillStyle = LIT;
        if (left < 0) ctx.fillRect(x, y, band(LIT_BAND, 1), cellPx);
        if (up < 0) ctx.fillRect(x, y, cellPx, band(LIT_BAND, 1));
      }
    }
  }
  if (!panels) return;
  ctx.strokeStyle = '#ffffff26';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 16; c < width; c += 16) {
    ctx.moveTo(c * cellPx + 0.5, 0);
    ctx.lineTo(c * cellPx + 0.5, out.height);
  }
  for (let r = 16; r < height; r += 16) {
    ctx.moveTo(0, r * cellPx + 0.5);
    ctx.lineTo(out.width, r * cellPx + 0.5);
  }
  ctx.stroke();
}
