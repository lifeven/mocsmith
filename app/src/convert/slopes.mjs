import { MAX_REMAINDER } from './config.mjs';
import { INVERTED_SLOPES, PLATES, SLOPES } from '../core/parts.mjs';
import { availableShapes, isAvailable } from '../core/catalog.mjs';
import { PALETTE } from '../core/palette.mjs';
import { EditableModel } from '../core/editable.mjs';

/**
 * Shape-preserving slopes, following legolization's profile rule
 * (`placement/slopes.py`; see NOTICE for attribution).
 *
 * A slope is 3 plates tall. Its stud columns are full height; each slope
 * column counts only its bottom plate as filled, and the two plates above it
 * must be empty in the shape. So a slope goes exactly where the voxel model
 * already has a one-brick step down to a one-plate ledge, and the filled
 * cells do not change. Parts covering the profile are removed; their cells
 * outside the profile (at most MAX_REMAINDER) are refilled with plates of the
 * same colour. A slope is kept only when no part becomes detached.
 *
 * Inverted slopes (`inverted`) are the same rule upside down, for the
 * underside of an overhang: the stud column is full height, each slope column
 * counts only its TOP plate as filled, and the plates under it must be empty.
 * Connections need no special case: `check` joins parts through owned cells,
 * and the empty cells under the sloped face belong to nobody.
 */

/** @typedef {import('../core/parts.mjs').SlopeShape} SlopeShape */

/** Downhill directions: +x, -x, +z, -z. */
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Place slopes. Replaces `result.parts` / `result.owner`; returns how many.
 *
 * With `tolerance`, a slope also goes on a two-plate ledge: under a slope
 * column the plate above the bottom one may be filled (the slope then owns
 * that cell), the top one must still be empty. The slope's wedge really
 * covers most of that middle cell (3/4 of it for a 45° slope), so this is no
 * further from the true shape than the strict rule; the filled cells still do
 * not change.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {{ parts: object[], owner: Int32Array }} result
 * With `inverted`, places inverted slopes under overhangs instead (mirrored
 * profile, `INVERTED_SLOPES`); the tolerance is mirrored too.
 *
 * @param {{ tolerance?: boolean, inverted?: boolean }} [options]
 */
export function applySlopes(grid, result, { tolerance = false, inverted = false } = {}) {
  let placed = 0;
  const model = new EditableModel(grid, result);
  let stats = model.groups();
  // The grid does not change here (slopes keep the filled cells), so the
  // places a slope could start are found once. All shapes have one stud row.
  const starts = slopeStarts(grid, tolerance, inverted);
  for (const shape of inverted ? INVERTED_SLOPES : SLOPES) {
    for (const [x, y, z, d] of starts) {
      const dir = DIRS[d];
      const profile = profileAt(grid, model.owner, shape, x, y, z, dir, tolerance, inverted);
      if (!profile) continue;
      const swap = planSwap(grid, model, shape, profile, x, y, z, dir, inverted);
      if (!swap) continue;
      // Same acceptance rule as running `check` on the swapped model, computed
      // on the part graph by a search outward from the swap (the slope and
      // refill plates cover exactly the donors' cells, as repair's merges do).
      // Refill plates go first in part order, the slope last.
      const next = model.whatIfLocal(swap.donors, [...swap.plates, swap.slope], swap.plates.length);
      if (next.detachedParts > stats.detachedParts || next.components > stats.components) continue;
      model.replace(swap.donors, swap.plates, [swap.slope]);
      stats = next;
      placed++;
    }
  }
  const { parts, owner } = model.toResult();
  result.parts = parts;
  result.owner = owner;
  return placed;
}

/**
 * Every (x, y, z, direction) where a one-stud-row slope could start: the stud
 * cell is filled, the cell downhill of it is filled (the ledge) and the cell
 * above the ledge is empty (with `tolerance`: the one two above). Found from
 * the ledge cells, then sorted into the order a full x / z / y / direction
 * scan would visit them, so the greedy result does not depend on how the
 * candidates were found. `y` is the bottom plate of the slope either way.
 *
 * Inverted: the ledge is a ceiling, the slope's top plate (y + 2) filled with
 * the cell under it empty (with `tolerance`: the one two under).
 *
 * @returns {[number, number, number, number][]}
 */
function slopeStarts(grid, tolerance, inverted) {
  const { sx, sz } = grid;
  const keys = [];
  // Ledge layer relative to the slope's bottom plate, and the step to the cells that must be empty.
  const at = inverted ? 2 : 0;
  const away = inverted ? -1 : 1;
  for (let y = 0; y + 3 <= grid.sy; y++) {
    const ly = y + at;
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        if (!grid.get(x, ly, z)) continue;
        const ledge = !grid.get(x, ly + away, z) || (tolerance && !grid.get(x, ly + 2 * away, z));
        if (!ledge) continue;
        for (let d = 0; d < DIRS.length; d++) {
          const [dx, dz] = DIRS[d];
          const bx = x - dx;
          const bz = z - dz;
          if (grid.get(bx, ly, bz)) keys.push((((y * sz + bz) * sx + bx) << 2) | d);
        }
      }
    }
  }
  keys.sort((a, b) => a - b);
  return keys.map((k) => {
    const d = k & 3;
    let rest = k >> 2;
    const x = rest % sx;
    rest = (rest - x) / sx;
    const z = rest % sz;
    return [x, (rest - z) / sz, z, d];
  });
}

/**
 * Filled and void cells of a slope whose stud row starts at (x, z) and runs
 * downhill along `dir`, or null when the shape does not have that profile or
 * a cell is already a slope. With `tolerance` a filled middle cell under a
 * slope column joins the filled cells instead of failing the profile.
 * Inverted: a slope column keeps its top plate instead of its bottom one.
 */
function profileAt(grid, owner, shape, x, y, z, [dx, dz], tolerance, inverted) {
  const keep = inverted ? 2 : 0;
  // Width runs perpendicular to the downhill direction.
  const wx = dz !== 0 ? 1 : 0;
  const wz = dx !== 0 ? 1 : 0;
  const filled = [];
  const voids = [];
  for (let k = 0; k < shape.width; k++) {
    const bx = x + wx * k;
    const bz = z + wz * k;
    for (let s = 0; s < shape.studs + shape.slope; s++) {
      const cx = bx + dx * s;
      const cz = bz + dz * s;
      const isStud = s < shape.studs;
      for (let dy = 0; dy < 3; dy++) {
        const cell = [cx, y + dy, cz];
        if (isStud || dy === keep) filled.push(cell);
        else if (tolerance && dy === 1 && grid.get(cx, y + 1, cz)) filled.push(cell);
        else voids.push(cell);
      }
    }
  }
  for (const [cx, cy, cz] of filled) {
    if (!grid.inBounds(cx, cy, cz) || !grid.get(cx, cy, cz)) return null;
  }
  for (const [cx, cy, cz] of voids) {
    if (grid.inBounds(cx, cy, cz) && (grid.get(cx, cy, cz) || owner[grid.index(cx, cy, cz)] >= 0)) return null;
  }
  return { filled, voids };
}

/**
 * The swap that puts the slope in place: the parts it replaces (`donors`),
 * the refill plates and the slope; null when the swap is not allowed.
 * Nothing is rebuilt yet.
 */
function planSwap(grid, model, shape, { filled }, x, y, z, dir, inverted) {
  const { slots: parts, owner } = model;
  const donors = new Set();
  for (const [cx, cy, cz] of filled) {
    const id = owner[grid.index(cx, cy, cz)];
    if (id < 0) return null;
    if (parts[id].cells) return null; // already a slope or an inverted slope
    donors.add(id);
  }
  const colours = new Set([...donors].map((id) => parts[id].color));
  if (colours.size !== 1) return null;
  const color = parts[[...donors][0]].color;
  if (!isAvailable(shape.ldraw, PALETTE[color - 1].code)) return null;

  // Donor cells outside the profile must be refilled.
  const inProfile = new Set(filled.map(([cx, cy, cz]) => grid.index(cx, cy, cz)));
  const remainder = [];
  for (const id of donors) {
    const p = parts[id];
    for (let dy = 0; dy < p.h; dy++) {
      for (let dz = 0; dz < p.d; dz++) {
        for (let dx = 0; dx < p.w; dx++) {
          const i = grid.index(p.x + dx, p.y + dy, p.z + dz);
          if (!inProfile.has(i)) remainder.push([p.x + dx, p.y + dy, p.z + dz]);
        }
      }
    }
  }
  if (remainder.length > MAX_REMAINDER) return null;

  const [ddx, ddz] = dir;
  const length = shape.studs + shape.slope;
  const slope = {
    kind: inverted ? 'inverted' : 'slope',
    slope: shape.key,
    ldraw: shape.ldraw,
    dir,
    studs: shape.studs,
    // Bounding box of the part; owner marks only its filled cells.
    x: Math.min(x, x + ddx * (length - 1)),
    z: Math.min(z, z + ddz * (length - 1)),
    w: ddx !== 0 ? length : shape.width,
    d: ddz !== 0 ? length : shape.width,
    y,
    h: 3,
    color,
    cells: filled,
  };
  const refill = remainder.map(([cx, cy, cz]) => ({ kind: 'plate', x: cx, y: cy, z: cz, w: 1, d: 1, h: 1, color }));
  return { donors, plates: mergePlates(refill), slope };
}

/** Join 1×1 refill plates in the same layer into larger plates where they line up. */
function mergePlates(plates) {
  const byLayer = new Map();
  for (const p of plates) {
    const key = p.y;
    if (!byLayer.has(key)) byLayer.set(key, []);
    byLayer.get(key).push(p);
  }
  const out = [];
  for (const layer of byLayer.values()) {
    const cells = new Set(layer.map((p) => `${p.x},${p.z}`));
    const color = layer[0].color;
    const y = layer[0].y;
    for (const p of layer) {
      if (!cells.has(`${p.x},${p.z}`)) continue;
      let best = { w: 1, d: 1 };
      for (const s of availableShapes(PLATES, color)) {
        for (const [w, d] of [[s.w, s.d], [s.d, s.w]]) {
          if (w * d <= best.w * best.d) continue;
          let ok = true;
          for (let a = 0; a < w && ok; a++) for (let b = 0; b < d && ok; b++) ok = cells.has(`${p.x + a},${p.z + b}`);
          if (ok) best = { w, d };
        }
      }
      for (let a = 0; a < best.w; a++) for (let b = 0; b < best.d; b++) cells.delete(`${p.x + a},${p.z + b}`);
      out.push({ kind: 'plate', x: p.x, y, z: p.z, w: best.w, d: best.d, h: 1, color });
    }
  }
  return out;
}
