import { BRIDGE_WEIGHT, STACK_PENALTY } from './config.mjs';
import { BRICKS, PLATES, PLATES_PER_BRICK, typeOfFootprint } from '../core/parts.mjs';
import { availableShapes } from '../core/catalog.mjs';
import { PALETTE } from '../core/palette.mjs';

/**
 * With a stock: how much more per stud a piece the stock still has scores
 * (an owned 1×2, 2 × (1 + 3) = 8, ties an unowned 2×4).
 */
export const OWN_BONUS = 3;

/** Stock pieces as a mutable `ldraw|code → count` map. */
function stockLeft(stock) {
  const left = new Map();
  for (const [ldraw, colours] of Object.entries(stock.parts)) for (const [code, n] of Object.entries(colours)) left.set(`${ldraw}|${code}`, n);
  return left;
}

/**
 * @typedef {object} PlacedPart
 * @property {number} id
 * @property {'brick' | 'plate' | 'tile'} kind tiles are only made by tiles.mjs
 * @property {number} x min stud x
 * @property {number} y bottom plate layer
 * @property {number} z min stud z
 * @property {number} w extent along x (studs)
 * @property {number} d extent along z (studs)
 * @property {number} h height (plates)
 * @property {number} color palette index + 1
 */

/**
 * Greedy layer-by-layer layout of a voxel grid into MVP bricks and plates.
 *
 * The grid is processed in bands of 3 plate layers. Columns filled with one
 * colour through the whole band become brick cells; everything else in the
 * band is covered with plates. Within a layer, each uncovered cell takes the
 * best-scoring part anchored at it, among the parts that were made in that
 * cell's colour (catalog.mjs): larger area wins, plus a bonus for every
 * additional part directly below it. Scan direction alternates per layer so
 * long parts change orientation between layers.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @returns {{ parts: PlacedPart[], owner: Int32Array }}
 */
export function layout(grid, options = {}) {
  const weights = {
    bridge: options.bridgeWeight ?? BRIDGE_WEIGHT,
    stack: options.stackPenalty ?? STACK_PENALTY,
    // Only the parts I have (core/stock.mjs): pieces still in the stock score OWN_BONUS per stud more,
    // and each one placed is taken out. A copy, so the caller's stock is untouched.
    left: options.stock ? stockLeft(options.stock) : null,
    own: options.ownBonus ?? OWN_BONUS,
  };
  const owner = new Int32Array(grid.cells.length).fill(-1);
  const parts = [];
  const bands = Math.ceil(grid.sy / PLATES_PER_BRICK);
  const area = grid.sx * grid.sz;

  for (let band = 0; band < bands; band++) {
    const y0 = band * PLATES_PER_BRICK;
    const fullBand = y0 + PLATES_PER_BRICK <= grid.sy;
    const brickMask = new Uint8Array(area);
    if (fullBand) {
      for (let z = 0; z < grid.sz; z++) {
        for (let x = 0; x < grid.sx; x++) {
          const c = grid.get(x, y0, z);
          if (c && grid.get(x, y0 + 1, z) === c && grid.get(x, y0 + 2, z) === c) {
            brickMask[z * grid.sx + x] = c;
          }
        }
      }
      coverLayer(grid, owner, parts, brickMask, y0, BRICKS, band % 2, weights);
    }
    for (let y = y0; y < Math.min(y0 + PLATES_PER_BRICK, grid.sy); y++) {
      const plateMask = new Uint8Array(area);
      for (let z = 0; z < grid.sz; z++) {
        for (let x = 0; x < grid.sx; x++) {
          const i = z * grid.sx + x;
          if (!brickMask[i]) plateMask[i] = grid.get(x, y, z);
        }
      }
      coverLayer(grid, owner, parts, plateMask, y, PLATES, y % 2, weights);
    }
  }
  return { parts, owner };
}

function coverLayer(grid, owner, parts, mask, y, shapes, parity, weights) {
  const { sx, sz } = grid;
  const covered = new Uint8Array(mask.length);
  const outer = parity ? sx : sz;
  const inner = parity ? sz : sx;
  for (let o = 0; o < outer; o++) {
    for (let n = 0; n < inner; n++) {
      const x = parity ? o : n;
      const z = parity ? n : o;
      const color = mask[z * sx + x];
      if (!color || covered[z * sx + x]) continue;

      let best = null;
      const code = weights.left && PALETTE[color - 1].code;
      for (const shape of availableShapes(shapes, color)) {
        const orients = shape.w === shape.d ? [[shape.w, shape.d]] : [[shape.w, shape.d], [shape.d, shape.w]];
        const ldraw = weights.left && typeOfFootprint(shape.kind, shape.w, shape.d).ldraw;
        const owned = weights.left && (weights.left.get(`${ldraw}|${code}`) ?? 0) > 0;
        for (const [w, d] of orients) {
          if (!fits(mask, covered, sx, sz, x, z, w, d, color)) continue;
          const score = w * d * (owned ? 1 + weights.own : 1) + seamScore(grid, owner, parts, x, y, z, w, d, weights);
          if (!best || score > best.score) best = { score, w, d, h: shape.h, kind: shape.kind, ldraw };
        }
      }
      if (weights.left) {
        const key = `${best.ldraw}|${code}`;
        const n = weights.left.get(key) ?? 0;
        if (n > 0) weights.left.set(key, n - 1);
      }

      const id = parts.length;
      parts.push({ id, kind: best.kind, x, y, z, w: best.w, d: best.d, h: best.h, color });
      for (let dz = 0; dz < best.d; dz++) {
        for (let dx = 0; dx < best.w; dx++) {
          covered[(z + dz) * sx + x + dx] = 1;
          for (let dy = 0; dy < best.h; dy++) owner[grid.index(x + dx, y + dy, z + dz)] = id;
        }
      }
    }
  }
}

function fits(mask, covered, sx, sz, x, z, w, d, color) {
  if (x + w > sx || z + d > sz) return false;
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const i = (z + dz) * sx + x + dx;
      if (mask[i] !== color || covered[i]) return false;
    }
  }
  return true;
}

/**
 * Seam term of a candidate's score: `bridge` for every part below beyond the
 * first (the part ties them together), minus `stack` when the candidate would
 * sit on exactly one part with the same footprint (a column stacked straight
 * up, seams aligned, which joins nothing new).
 */
function seamScore(grid, owner, parts, x, y, z, w, d, { bridge, stack }) {
  if (y === 0) return 0;
  const seen = new Set();
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const id = owner[grid.index(x + dx, y - 1, z + dz)];
      if (id >= 0) seen.add(id);
    }
  }
  if (seen.size === 1 && stack) {
    const b = parts[[...seen][0]];
    if (b.x === x && b.z === z && b.w === w && b.d === d) return -stack;
  }
  return bridge * Math.max(0, seen.size - 1);
}

/**
 * How well seams are staggered in a finished model, over the parts that do
 * not stand on the ground: `bridging` rest on two or more parts (they tie
 * those together), `stacked` rest on exactly one part with the same footprint
 * (a column built straight up, seams aligned). Shares in 0…1.
 */
export function seamStats(grid, { parts, owner }) {
  let above = 0;
  let bridging = 0;
  let stacked = 0;
  for (const p of parts) {
    if (p.y === 0) continue;
    const seen = new Set();
    for (let dz = 0; dz < p.d; dz++) {
      for (let dx = 0; dx < p.w; dx++) {
        if (p.cells && owner[grid.index(p.x + dx, p.y, p.z + dz)] !== p.id) continue; // outside a slope's cells
        const id = owner[grid.index(p.x + dx, p.y - 1, p.z + dz)];
        if (id >= 0) seen.add(id);
      }
    }
    if (seen.size === 0) continue; // hangs from above; not a seam question
    above++;
    if (seen.size >= 2) bridging++;
    else {
      const b = parts[[...seen][0]];
      if (b.x === p.x && b.z === p.z && b.w === p.w && b.d === p.d) stacked++;
    }
  }
  return { above, bridging: above ? bridging / above : 0, stacked: above ? stacked / above : 0 };
}
