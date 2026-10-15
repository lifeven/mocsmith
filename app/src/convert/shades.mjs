import { srgbToLab } from '../core/palette.mjs';

/**
 * Palette colours for the surface cells of a voxel grid, one colour per patch
 * of one paint. A texture often shades a paint a little (a car body darker at
 * the bottom, a wall lighter at the top). Mapped cell by cell, a shade range
 * that straddles the boundary between two palette colours splits one paint
 * into two LEGO colours, far more different than the source ever was.
 *
 * So neighbouring surface cells (6-neighbours) whose source colours differ by
 * less than `step` (CIE76 ΔE) join one patch: shading changes a little from
 * cell to cell, while two paints meet in a jump. Each patch takes the palette
 * colour nearest to its mean colour. A patch whose colours spread more than
 * `span` from its mean is a real gradient (a photo texture, a sunset), not one
 * paint, and keeps the colour of each cell.
 *
 * @param {{ sx: number, sz: number, cells: ArrayLike<number> }} grid only its size is read
 * @param {ArrayLike<number>} surface grid indices of the surface cells
 * @param {ArrayLike<number>} rgb sRGB 0–255, 3 per surface cell
 * @param {(r: number, g: number, b: number) => number} toCell
 * @param {{ step?: number, span?: number }} [options] step 0 maps each cell on its own
 * @returns {Uint8Array} grid value per surface cell
 */
export function paintPatches(grid, surface, rgb, toCell, { step = 0, span = 15 } = {}) {
  const m = surface.length;
  const out = new Uint8Array(m);
  const own = (k) => toCell(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]);
  if (!(step > 0)) {
    for (let k = 0; k < m; k++) out[k] = own(k);
    return out;
  }
  const lab = new Float64Array(m * 3);
  for (let k = 0; k < m; k++) lab.set(srgbToLab(rgb[k * 3], rgb[k * 3 + 1], rgb[k * 3 + 2]), k * 3);
  const slot = new Map();
  for (let k = 0; k < m; k++) slot.set(surface[k], k);

  const parent = new Int32Array(m).map((_, k) => k);
  const find = (k) => {
    while (parent[k] !== k) k = parent[k] = parent[parent[k]];
    return k;
  };
  const { sx, sz } = grid;
  const layer = sx * sz;
  const step2 = step * step;
  // Half of the 26 neighbours (the other half is visited from their side); corners count,
  // so a band of paint that touches the rest only along an edge still joins it.
  const offsets = [];
  for (let dy = 0; dy <= 1; dy++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && (dz < 0 || (dz === 0 && dx <= 0))) continue;
        offsets.push([dx, dy, dz]);
      }
    }
  }
  for (let k = 0; k < m; k++) {
    const i = surface[k];
    const x = i % sx;
    const z = Math.floor(i / sx) % sz;
    for (const [dx, dy, dz] of offsets) {
      if (x + dx < 0 || x + dx >= sx || z + dz < 0 || z + dz >= sz) continue;
      const l = slot.get(i + dx + dz * sx + dy * layer);
      if (l === undefined) continue;
      const d = (lab[k * 3] - lab[l * 3]) ** 2 + (lab[k * 3 + 1] - lab[l * 3 + 1]) ** 2 + (lab[k * 3 + 2] - lab[l * 3 + 2]) ** 2;
      if (d < step2) parent[find(k)] = find(l);
    }
  }

  // Mean colour per patch, then how far its colours spread from that mean.
  const sum = new Map();
  for (let k = 0; k < m; k++) {
    const r = find(k);
    const e = sum.get(r) ?? { rgb: [0, 0, 0], n: 0, spread: 0 };
    e.rgb[0] += rgb[k * 3];
    e.rgb[1] += rgb[k * 3 + 1];
    e.rgb[2] += rgb[k * 3 + 2];
    e.n++;
    sum.set(r, e);
  }
  for (const e of sum.values()) e.lab = srgbToLab(e.rgb[0] / e.n, e.rgb[1] / e.n, e.rgb[2] / e.n);
  const span2 = span * span;
  for (let k = 0; k < m; k++) {
    const e = sum.get(find(k));
    const d = (lab[k * 3] - e.lab[0]) ** 2 + (lab[k * 3 + 1] - e.lab[1]) ** 2 + (lab[k * 3 + 2] - e.lab[2]) ** 2;
    if (d > e.spread) e.spread = d;
  }
  for (const e of sum.values()) e.cell = e.n > 1 && e.spread <= span2 ? toCell(e.rgb[0] / e.n, e.rgb[1] / e.n, e.rgb[2] / e.n) : -1;
  for (let k = 0; k < m; k++) {
    const c = sum.get(find(k)).cell;
    out[k] = c < 0 ? own(k) : c;
  }
  return out;
}
