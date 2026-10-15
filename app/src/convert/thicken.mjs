/**
 * Thicken thin details: posts, legs,
 * ears and antennas only one stud thick get grown to 2 × 2 studs, so they can
 * be laid with 2 × 2 parts instead of a stack of 1 × 1s.
 *
 * A cell is thin when no fully filled 2 × 2 window in its own layer contains
 * it (a 2D opening with a 2 × 2 structuring element). Which thin cells count
 * depends on `rule`:
 *
 * - `'layer'`: every thin cell (the plain opening).
 * - `'column'`: thin cells in a vertical run of at least MIN_RUN thin cells
 *   at the same (x, z), i.e. thinner than a 2 × 2 brick for a brick's height.
 *   A single thin plate on a wide layer (the top of a dome, a roof ridge) is
 *   left alone.
 * - `'post'` (default): as `'column'`, but only where the thin cells of that
 *   layer form a patch no longer than POST_SIDE in either direction. A
 *   1-stud wall or rail is long; it is laid with 1 × N bricks that overlap,
 *   which is how LEGO builds walls, so it stays.
 *
 * Each counted cell that is still thin is grown to the 2 × 2 window around it
 * that needs the fewest new cells, ties going to the window whose new cells
 * touch the most filled cells, then to the one nearest the middle of the
 * model (legs grow inward). A new cell may not close a gap: no cell with
 * something filled within GAP cells on both sides along x or along z (a
 * window opening, the space between two legs). Only empty cells inside the
 * grid are filled, in the colour of the thin cell. It changes the shape, so
 * it is off by default (`settings.thicken`).
 */

/** Plates a thin stretch must span before it is thickened (one brick). */
export const MIN_RUN = 3;
/** 'post': the longest side of a layer's thin patch that still counts as a post. */
export const POST_SIDE = 2;
/** A new cell with filled cells this close on both sides would close a gap. */
export const GAP = 2;

const WINDOWS = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
const SIX = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

/** True when a fully filled 2 × 2 window in layer y contains (x, z). */
export function coveredInLayer(grid, x, y, z) {
  for (const [dx, dz] of WINDOWS) {
    const x0 = x + dx;
    const z0 = z + dz;
    if (grid.get(x0, y, z0) && grid.get(x0 + 1, y, z0) && grid.get(x0, y, z0 + 1) && grid.get(x0 + 1, y, z0 + 1)) return true;
  }
  return false;
}

/**
 * Thin cells by rule, as a 0/1 mask over the grid.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {'layer' | 'column' | 'post'} [rule]
 */
export function thinMask(grid, rule = 'post') {
  const { sx, sy, sz } = grid;
  const mask = new Uint8Array(grid.cells.length);
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        if (grid.get(x, y, z) && !coveredInLayer(grid, x, y, z)) mask[grid.index(x, y, z)] = 1;
      }
    }
  }
  if (rule === 'layer') return mask;
  if (rule === 'post') dropLongPatches(grid, mask);
  // Keep only vertical runs of at least MIN_RUN thin cells.
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      let y = 0;
      while (y < sy) {
        if (!mask[grid.index(x, y, z)]) {
          y++;
          continue;
        }
        let end = y;
        while (end < sy && mask[grid.index(x, end, z)]) end++;
        if (end - y < MIN_RUN) for (let k = y; k < end; k++) mask[grid.index(x, k, z)] = 0;
        y = end;
      }
    }
  }
  return mask;
}

/** Clear thin patches (4-connected within a layer) longer than POST_SIDE in x or z. */
function dropLongPatches(grid, mask) {
  const { sx, sz } = grid;
  const seen = new Uint8Array(mask.length);
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const patch = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      patch.push(i);
      const x = i % sx;
      const z = Math.floor(i / sx) % sz;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) continue;
        const j = i + dx + dz * sx;
        if (mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (maxX - minX + 1 > POST_SIDE || maxZ - minZ + 1 > POST_SIDE) for (const i of patch) mask[i] = 0;
  }
}

/** True when filling (x, y, z) would close a gap: filled cells within GAP on both sides along x or z. */
function closesGap(grid, x, y, z) {
  const near = (dx, dz) => {
    for (let k = 1; k <= GAP; k++) if (grid.get(x + dx * k, y, z + dz * k)) return true;
    return false;
  };
  return (near(-1, 0) && near(1, 0)) || (near(0, -1) && near(0, 1));
}

/**
 * Thicken in place.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {{ rule?: 'layer' | 'column' | 'post' }} [opts]
 * @returns {{ thin: number, added: number }} thin: cells that counted as thin; added: cells filled
 */
export function thicken(grid, { rule = 'post' } = {}) {
  const { sx, sz } = grid;
  const mask = thinMask(grid, rule);
  // Ties go toward the middle of the model, so legs and posts grow inward and the outline stays.
  let cx = 0;
  let cz = 0;
  let n = 0;
  for (let i = 0; i < grid.cells.length; i++) {
    if (!grid.cells[i]) continue;
    cx += i % sx;
    cz += Math.floor(i / sx) % sz;
    n++;
  }
  cx = cx / Math.max(1, n) - 0.5;
  cz = cz / Math.max(1, n) - 0.5;
  let thin = 0;
  let added = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    thin++;
    const x = i % sx;
    const z = Math.floor(i / sx) % sz;
    const y = Math.floor(i / (sx * sz));
    if (coveredInLayer(grid, x, y, z)) continue; // an earlier growth already covers it
    let best = null;
    for (const [dx, dz] of WINDOWS) {
      const x0 = x + dx;
      const z0 = z + dz;
      if (!grid.inBounds(x0, y, z0) || !grid.inBounds(x0 + 1, y, z0 + 1)) continue;
      const empty = [];
      for (const [ex, ez] of [[x0, z0], [x0 + 1, z0], [x0, z0 + 1], [x0 + 1, z0 + 1]]) if (!grid.get(ex, y, ez)) empty.push([ex, ez]);
      if (empty.some(([ex, ez]) => closesGap(grid, ex, y, ez))) continue;
      let touch = 0;
      for (const [ex, ez] of empty) for (const [ox, oy, oz] of SIX) if (grid.get(ex + ox, y + oy, ez + oz)) touch++;
      const far = Math.hypot(x0 - cx, z0 - cz); // window centre is (x0 + 0.5, z0 + 0.5)
      const better = !best || empty.length < best.empty.length ||
        (empty.length === best.empty.length && (touch > best.touch || (touch === best.touch && far < best.far)));
      if (better) best = { empty, touch, far };
    }
    if (!best) continue;
    const colour = grid.cells[i];
    for (const [ex, ez] of best.empty) grid.set(ex, y, ez, colour);
    added += best.empty.length;
  }
  return { thin, added };
}
