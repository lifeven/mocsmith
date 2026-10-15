/**
 * The colour cap for 3D models : when the voxelized model uses more
 * colours than `maxColours`, colours are dropped one at a time, cheapest
 * first, until the cap holds. Each connected patch of a dropped colour moves
 * to the kept colour that does it least harm, so one colour's patches can go
 * to different colours.
 *
 * Harm is counted on surface cells (a cell with an empty side), since those
 * are what a builder sees; a colour that only fills the inside costs nothing
 * to drop. A patch's harm is its surface cells × the colour distance (CIE76 ΔE
 * in Lab, the measure that picked the voxel colours, core/palette.mjs). When
 * one colour makes up most of what the patch touches, two moves cost extra:
 * into that colour (VANISH_DE: a yellow headlight on an orange car would
 * disappear; only when a colour within VANISH_RANGE of the patch's own is
 * left to take it instead), and into a colour that stands out from it much
 * more than the patch did (light grey on white turning black).
 *
 * Small details are kept as in the mosaic (mosaic/quantize.mjs): a colour on
 * fewer than SMALL_SHARE of the surface whose patches would move by more than
 * DETAIL_DE on average is spared while two other colours can still go.
 */

import { PALETTE, srgbToLab } from '../core/palette.mjs';
import { ownedColours } from '../core/stock.mjs';

/** A colour on less than this share of the surface … */
export const SMALL_SHARE = 0.02;
/** … that would move by more than this ΔE (CIE76) on average counts as a detail. */
export const DETAIL_DE = 20;
/** Extra ΔE per surface cell for a patch that merges into the colour around it … */
export const VANISH_DE = 15;
/** … charged only when another colour within this ΔE of the patch's own is left. */
export const VANISH_RANGE = 30;
/** A patch is surrounded by a colour when at least this share of its contacts are with it. */
export const SURROUND_SHARE = 0.5;

const LAB = PALETTE.map((c) => srgbToLab((c.hex >> 16) & 255, (c.hex >> 8) & 255, c.hex & 255));

/** CIE76 ΔE between two grid values (palette index + 1). */
export function colourDistance(u, v) {
  const a = LAB[u - 1];
  const b = LAB[v - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Only the parts I have (core/stock.mjs): every cell in a colour the stock has
 * no part in moves, in place, to the nearest colour (CIE76) the stock has.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {import('../core/stock.mjs').Stock} stock
 * @returns {[number, number, number][]} [fromCode, toCode, cells] per colour moved
 */
export function recolourToStock(grid, stock) {
  const have = [...ownedColours(stock)].map((code) => PALETTE.findIndex((c) => c.code === code) + 1).filter((v) => v > 0);
  if (!have.length) return [];
  const map = new Uint8Array(PALETTE.length + 1).map((_, v) => v);
  const keep = new Set(have);
  for (let v = 1; v <= PALETTE.length; v++) {
    if (keep.has(v)) continue;
    let best = have[0];
    for (const q of have) if (colourDistance(v, q) < colourDistance(v, best)) best = q;
    map[v] = best;
  }
  const moved = new Map();
  const { cells } = grid;
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (!v || map[v] === v) continue;
    cells[i] = map[v];
    moved.set(v, (moved.get(v) ?? 0) + 1);
  }
  return [...moved].map(([v, n]) => [PALETTE[v - 1].code, PALETTE[map[v] - 1].code, n]);
}

/**
 * Connected patches of one colour (six neighbours), with what a merge needs:
 * the cells, how many are on the surface, and how many faces touch each other
 * colour.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @returns {{ colour: number, cells: number[], surface: number, contacts: Map<number, number>, touching: number }[]}
 */
export function patches(grid) {
  const { sx, sy, sz, cells } = grid;
  const seen = new Uint8Array(cells.length);
  const out = [];
  const stack = [];
  const steps = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
  for (let start = 0; start < cells.length; start++) {
    const colour = cells[start];
    if (!colour || seen[start]) continue;
    const patch = { colour, cells: [], surface: 0, contacts: new Map(), touching: 0 };
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      patch.cells.push(i);
      const x = i % sx;
      const z = Math.floor(i / sx) % sz;
      const y = Math.floor(i / (sx * sz));
      let open = false;
      for (const [dx, dy, dz] of steps) {
        const v = grid.get(x + dx, y + dy, z + dz);
        if (!v) {
          open = true;
          continue;
        }
        const j = grid.index(x + dx, y + dy, z + dz);
        if (v === colour) {
          if (!seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        } else {
          patch.contacts.set(v, (patch.contacts.get(v) ?? 0) + 1);
          patch.touching++;
        }
      }
      if (open) patch.surface++;
    }
    out.push(patch);
  }
  return out;
}

/**
 * Where one patch should go among `live` colours (not its own), and the harm
 * per surface cell: the colour distance, plus VANISH_DE when the target is the
 * colour around the patch (it would disappear), or plus how much more than
 * DETAIL_DE the patch would newly stand out from what is around it (light grey
 * on white must not turn black).
 * @returns {{ to: number, harm: number, de: number }}
 */
function bestTarget(patch, live) {
  let around = 0;
  for (const [v, n] of patch.contacts) if (n >= SURROUND_SHARE * patch.touching && live.has(v)) around = v;
  const contrast = around ? colourDistance(patch.colour, around) : 0;
  // Keeping a patch from disappearing is only worth it when it can go to a
  // colour still close to its own; black tyres on a grey body must not turn blue.
  let near = false;
  for (const q of live) if (q !== patch.colour && q !== around && colourDistance(patch.colour, q) <= VANISH_RANGE) near = true;
  let best = null;
  for (const q of live) {
    if (q === patch.colour) continue;
    const de = colourDistance(patch.colour, q);
    let extra = 0;
    if (around && q === around) extra = near ? VANISH_DE : 0;
    else if (around) extra = Math.max(0, colourDistance(q, around) - contrast - DETAIL_DE);
    const harm = patch.surface * (de + extra);
    if (!best || harm < best.harm || (harm === best.harm && de < best.de)) best = { to: q, harm, de };
  }
  return best;
}

/**
 * Drop colours in place until at most `maxColours` are left.
 *
 * Each round looks at every colour still in use and what dropping it would
 * cost: the sum of its patches' least harm. The cheapest non-detail colour
 * goes, each of its patches to its own best target. Details are spared while
 * two other colours are left (the last big colour never goes to save a
 * detail). Patches are found again after every round, since merged
 * patches join their neighbours.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {number | null | undefined} maxColours null / undefined / Infinity = no cap
 * @returns {{ merged: [number, number, number][], kept: number }} merged: [fromCode, toCode, cells]
 *   per move, in the order made; kept: colours left
 */
export function limitColours(grid, maxColours) {
  const cap = maxColours == null ? Infinity : Math.max(1, maxColours);
  const live = new Set();
  for (const v of grid.cells) if (v) live.add(v);
  const merged = [];
  while (live.size > cap) {
    const all = patches(grid);
    let surfaceTotal = 0;
    const byColour = new Map();
    for (const p of all) {
      surfaceTotal += p.surface;
      if (!byColour.has(p.colour)) byColour.set(p.colour, []);
      byColour.get(p.colour).push(p);
    }
    let best = null;
    let bestAny = null;
    let others = 0;
    for (const c of [...live].sort((a, b) => a - b)) {
      const moves = byColour.get(c).map((p) => ({ patch: p, ...bestTarget(p, live) }));
      let cost = 0;
      let surface = 0;
      let moved = 0;
      for (const m of moves) {
        cost += m.harm;
        surface += m.patch.surface;
        moved += m.de * m.patch.surface;
      }
      const detail = surface > 0 && surface < SMALL_SHARE * surfaceTotal && moved / surface > DETAIL_DE;
      const entry = { colour: c, cost, moves };
      if (!bestAny || cost < bestAny.cost) bestAny = entry;
      if (detail) continue;
      others++;
      if (!best || cost < best.cost) best = entry;
    }
    // Details are spared while two other colours are left; the last big colour
    // is never dropped to save a detail.
    const drop = others >= 2 ? best : bestAny;
    const moved = new Map();
    for (const m of drop.moves) {
      for (const i of m.patch.cells) grid.cells[i] = m.to;
      moved.set(m.to, (moved.get(m.to) ?? 0) + m.patch.cells.length);
    }
    for (const [to, n] of moved) merged.push([PALETTE[drop.colour - 1].code, PALETTE[to - 1].code, n]);
    live.delete(drop.colour);
  }
  return { merged, kept: live.size };
}
