import { isAvailable } from '../core/catalog.mjs';
import { PALETTE } from '../core/palette.mjs';
import { ROUND_PARTS } from '../core/parts.mjs';

/** The round part with the same kind and footprint as a square one: `brick:1` → 3062b … */
const ROUND_OF = new Map(ROUND_PARTS.map((t) => [`${t.kind}:${t.w}`, t]));

/**
 * Round parts for posts, poles and dots: a 1×1 or 2×2 brick, plate or tile
 * with nothing beside it at any of its layers (all four sides empty) becomes
 * the round part of the same kind and size, when LEGO made that part in its
 * colour. It keeps its cells, studs and connections, so nothing else in the
 * model changes.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {{ parts: object[] }} result changed in place
 * @returns {number} parts made round
 */
export function applyRound(grid, result) {
  let count = 0;
  result.parts.forEach((p, i) => {
    // Slopes, inverted slopes and round parts already carry their own number.
    if (p.ldraw || p.w !== p.d) return;
    const round = ROUND_OF.get(`${p.kind}:${p.w}`);
    if (!round || !standsAlone(grid, p)) return;
    if (!isAvailable(round.ldraw, PALETTE[p.color - 1].code)) return;
    result.parts[i] = { ...p, ldraw: round.ldraw };
    count++;
  });
  return count;
}

/** True when every cell beside the part's footprint is empty, at each of its layers. */
export function standsAlone(grid, p) {
  for (let y = p.y; y < p.y + p.h; y++) {
    for (let i = 0; i < p.w; i++) {
      if (grid.get(p.x - 1, y, p.z + i) || grid.get(p.x + p.w, y, p.z + i)) return false;
      if (grid.get(p.x + i, y, p.z - 1) || grid.get(p.x + i, y, p.z + p.d)) return false;
    }
  }
  return true;
}
