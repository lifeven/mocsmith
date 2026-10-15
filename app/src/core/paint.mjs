/**
 * Recolouring as paint on the voxel model.
 *
 * A recolour is not applied to bricks. It changes the colour of voxel cells,
 * and the instant layer lays the bricks out again (≤ 100 ms at the size
 * tiers). So every result still uses only parts made in their colour
 * (catalog.mjs), the bricks re-merge where neighbouring colours become equal,
 * and any colour can be offered.
 *
 * Paint is plain data kept in the build settings (`settings.paint`), so it
 * goes to the Web Worker unchanged and a project stores it instead of bricks:
 *
 *   {
 *     colours: [[fromCode, toCode], …],   // LDraw codes; source colour → shown colour,
 *                                         // survives size changes
 *     cells: { lengthStuds, list: [[x, y, z, code], …] }  // single cells, only for that size
 *   }
 *
 * Helpers here are pure: they return new paint objects.
 */

import { PALETTE, cellValue } from './palette.mjs';

/** @typedef {{ colours: [number, number][], cells: { lengthStuds: number, list: [number, number, number, number][] } | null }} Paint */

/** @type {Paint} */
export const NO_PAINT = Object.freeze({ colours: [], cells: null });

/**
 * Apply paint to a freshly voxelized grid, in place: colour mapping first,
 * then single cells (only when they were painted at this size).
 *
 * @returns {{ changed: number, cellsDropped: boolean }} cells changed; whether
 *   single-cell paint was skipped because the model has another size now
 */
export function applyPaint(grid, paint, lengthStuds) {
  if (!paint) return { changed: 0, cellsDropped: false };
  let changed = 0;
  if (paint.colours.length) {
    const map = new Uint8Array(PALETTE.length + 1).map((_, v) => v);
    for (const [from, to] of paint.colours) map[cellValue(from)] = cellValue(to);
    const { cells } = grid;
    for (let i = 0; i < cells.length; i++) {
      const v = cells[i];
      if (v && map[v] !== v) {
        cells[i] = map[v];
        changed++;
      }
    }
  }
  const single = paint.cells?.list ?? [];
  const sameSize = paint.cells?.lengthStuds === lengthStuds;
  if (sameSize) {
    for (const [x, y, z, code] of single) {
      if (!grid.inBounds(x, y, z)) continue;
      const v = cellValue(code);
      if (grid.get(x, y, z) && grid.get(x, y, z) !== v) {
        grid.set(x, y, z, v);
        changed++;
      }
    }
  }
  return { changed, cellsDropped: single.length > 0 && !sameSize };
}

/**
 * Paint every cell now shown in colour `from` with colour `to` (LDraw codes):
 * source colours that map to `from` are re-pointed, and single cells painted
 * `from` follow along.
 *
 * @param {Paint} paint
 * @param {number[]} sourceCodes colours present in the voxelized source
 */
export function paintColour(paint, sourceCodes, from, to) {
  const shown = new Map(sourceCodes.map((c) => [c, c]));
  for (const [f, t] of paint.colours) shown.set(f, t);
  const colours = new Map(paint.colours);
  for (const [src, now] of shown) if (now === from) colours.set(src, to);
  for (const [src, now] of colours) if (src === now) colours.delete(src);
  const cells = paint.cells && {
    lengthStuds: paint.cells.lengthStuds,
    list: paint.cells.list.map(([x, y, z, c]) => [x, y, z, c === from ? to : c]),
  };
  return { colours: [...colours], cells };
}

/**
 * Paint the given cells (grid coordinates at size `lengthStuds`) with colour
 * `code`. Single-cell paint from another size is replaced, since its
 * coordinates no longer match.
 *
 * @param {Paint} paint
 * @param {[number, number, number][]} cells
 */
export function paintCells(paint, cells, code, lengthStuds) {
  const keep = paint.cells?.lengthStuds === lengthStuds ? paint.cells.list : [];
  const byCell = new Map(keep.map((e) => [`${e[0]},${e[1]},${e[2]}`, e]));
  for (const [x, y, z] of cells) byCell.set(`${x},${y},${z}`, [x, y, z, code]);
  return { colours: paint.colours, cells: { lengthStuds, list: [...byCell.values()] } };
}

/** True when the paint changes nothing. */
export function isEmptyPaint(paint) {
  return !paint || (paint.colours.length === 0 && !(paint.cells?.list.length));
}
