import { MAX_MERGES } from './config.mjs';
import { BRICKS, PLATES } from '../core/parts.mjs';
import { availableShapes, shapeAvailable } from '../core/catalog.mjs';
import { FLAG_DETACHED } from '../core/check.mjs';
import { EditableModel } from '../core/editable.mjs';

/**
 * Join everything to the model's main body (see FLAG_DETACHED).
 *
 * A detached part is re-tiled together with one side neighbour so that one
 * new part spans cells of both. That new part inherits the vertical contacts
 * of both old parts and joins their groups. When the two differ in height (a
 * plate beside a brick), the brick is first split into three plates.
 *
 * Two phases. Phase 1 only pairs parts of the same colour. Phase 2, for what
 * is still detached, pairs across a colour seam: the spanning part takes one
 * of the two colours, chosen so the fewest visible cells change colour. Each
 * such part records that count in `recoloured`.
 *
 * Every candidate is judged on the part graph (same counts as `check`, see
 * `graph.mjs`); see `improves` for what
 * counts as progress.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {{ parts: import('./layout.mjs').PlacedPart[], owner: Int32Array }} result
 * @param {{ maxMerges?: number, crossColour?: boolean }} [options]
 * @returns {{ parts: import('./layout.mjs').PlacedPart[], owner: Int32Array, merges: number, trials: number, recolouredCells: number }}
 */
export function repair(grid, result, { maxMerges = MAX_MERGES, crossColour = true, fill = true } = {}) {
  const model = new EditableModel(grid, result);
  let stats = model.groups();
  let merges = 0;
  let trials = 0;
  let filledCells = 0;

  const phases = crossColour ? [false, true] : [false];
  // A cross-colour merge can attach a part whose same-colour neighbours were
  // detached, so repeat both phases until a full round changes nothing.
  for (let before = -1; before !== merges; ) {
    before = merges;
    for (const acrossSeams of phases) {
      merges += mergePhase(acrossSeams);
    }
    // Last resort for what is still detached: let a merge fill a hidden notch next to it.
    if (fill && before === merges && stats.detachedParts > 0) {
      for (const acrossSeams of phases) merges += mergePhase(acrossSeams, hiddenGap(grid, model.owner));
    }
  }

  function mergePhase(acrossSeams, gap = null) {
    let done = 0;
    /** Parts already tried without success, keyed by geometry, so a restart skips them. */
    const failed = new Set();
    while (stats.detachedParts > 0 && merges + done < maxMerges) {
      let accepted = null;
      const parts = model.parts();
      const view = { parts: model.slots, owner: model.owner };
      for (const p of parts) {
        if (!(stats.flags[p.id] & FLAG_DETACHED) || failed.has(key(p))) continue;
        const options = sideNeighbours(grid, view, p, stats.flags, acrossSeams)
          .flatMap((q) => [...candidates(grid, p, q, gap)].map((c) => ({ ...c, q })))
          .filter((c) => !gap || c.filled)
          .sort((a, b) => a.recoloured - b.recoloured || (a.filled?.length ?? 0) - (b.filled?.length ?? 0));
        for (const { pieces, q, filled } of options) {
          trials++;
          // Judged on the part graph, searching only around the edit; only an accepted merge touches the model.
          const removed = new Set([p.id, q.id]);
          if (improves(stats, model.whatIfLocal(removed, pieces))) {
            accepted = { removed, pieces, filled };
            break;
          }
        }
        if (accepted) break;
        failed.add(key(p));
      }
      if (!accepted) break;
      // Filled cells become part of the voxel model in the spanning part's colour.
      for (const c of accepted.filled ?? []) {
        const piece = accepted.pieces.find((s) => c.x >= s.x && c.x < s.x + s.w && c.z >= s.z && c.z < s.z + s.d && c.y >= s.y && c.y < s.y + s.h);
        grid.set(c.x, c.y, c.z, piece.color);
        filledCells++;
      }
      model.replace(accepted.removed, [], accepted.pieces);
      stats = model.groups();
      done++;
    }
    return done;
  }

  const { parts, owner } = model.toResult();
  const recolouredCells = parts.reduce((n, p) => n + (p.recoloured ?? 0), 0);
  return { parts, owner, merges, trials, recolouredCells, filledCells };
}

function key(p) {
  return `${p.x},${p.y},${p.z},${p.w},${p.d},${p.h},${p.color}`;
}

/**
 * A merge is kept when fewer parts are detached and no group was added, or
 * when two detached groups became one (they may join the main body later).
 */
function improves(a, b) {
  if (b.components > a.components || b.detachedParts > a.detachedParts) return false;
  return b.detachedParts < a.detachedParts || b.components < a.components;
}

/**
 * Parts touching p's sides on any layer p occupies: same colour only, or only
 * other colours when `acrossSeams`. Main-body neighbours come first, since
 * joining one of them is what actually fixes p.
 */
function sideNeighbours(grid, { parts, owner }, p, flags, acrossSeams) {
  const ids = new Set();
  const probe = (x, y, z) => {
    if (!grid.inBounds(x, y, z)) return;
    const id = owner[grid.index(x, y, z)];
    if (id < 0 || id === p.id) return;
    if ((parts[id].color !== p.color) === acrossSeams) ids.add(id);
  };
  for (let y = p.y; y < p.y + p.h; y++) {
    for (let dx = 0; dx < p.w; dx++) {
      probe(p.x + dx, y, p.z - 1);
      probe(p.x + dx, y, p.z + p.d);
    }
    for (let dz = 0; dz < p.d; dz++) {
      probe(p.x - 1, y, p.z + dz);
      probe(p.x + p.w, y, p.z + dz);
    }
  }
  return [...ids]
    .map((id) => parts[id])
    .sort((a, b) => (flags[a.id] & FLAG_DETACHED) - (flags[b.id] & FLAG_DETACHED));
}

/**
 * Replacement options for the pair (p, q). Same layer and height: re-tile the
 * two directly. Otherwise split any brick into three plates and re-tile the
 * two plates on one shared layer; the other plates stay where they were.
 *
 * @yields {{ pieces: object[], recoloured: number }}
 */
function* candidates(grid, p, q, fill = null) {
  if (p.y === q.y && p.h === q.h) {
    const merged = mergeCandidate(grid, p, q, fill);
    if (merged) yield merged;
  }
  if (p.h === 1 && q.h === 1) return;
  const lo = Math.max(p.y, q.y);
  const hi = Math.min(p.y + p.h, q.y + q.h);
  for (let y = lo; y < hi; y++) {
    const ps = splitToPlates(p);
    const qs = splitToPlates(q);
    const pp = ps.find((r) => r.y === y);
    const qq = qs.find((r) => r.y === y);
    const merged = mergeCandidate(grid, pp, qq, fill);
    if (merged) {
      const rest = [...ps.filter((r) => r !== pp), ...qs.filter((r) => r !== qq)];
      yield {
        pieces: [...rest.flatMap(madePieces), ...merged.pieces],
        recoloured: merged.recoloured,
        ...(merged.filled && { filled: merged.filled }),
      };
    }
  }
}

function splitToPlates(part) {
  if (part.h === 1) return [part];
  // A recolour count belongs to the part's columns; keep it once, on the bottom plate.
  return Array.from({ length: part.h }, (_, dy) => ({
    ...part,
    kind: 'plate',
    y: part.y + dy,
    h: 1,
    recoloured: dy === 0 ? part.recoloured : undefined,
  }));
}

/**
 * A split plate keeps its brick's footprint, and that plate may not exist in
 * the brick's colour (no 2×8 plate in Dark Orange, say). Then cover the same
 * cells with plates that were made in it, largest first; a 1×1 plate exists in
 * every palette colour, so the cover always closes.
 */
function madePieces(part) {
  if (shapeAvailable(part.kind, part.w, part.d, part.color)) return [part];
  const shapes = part.h === 3 ? BRICKS : PLATES;
  const cells = new Map();
  for (let dz = 0; dz < part.d; dz++) {
    for (let dx = 0; dx < part.w; dx++) cells.set(cellKey(part.x + dx, part.z + dz), { color: part.color });
  }
  const pieces = [];
  const left = [...cells.keys()].map(parseKey).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [x, z] of left) {
    if (!cells.has(cellKey(x, z))) continue;
    for (const shape of availableShapes(shapes, part.color)) {
      const fit = orientations(shape).find(([w, d]) => covers(cells, x, z, w, d, part.color));
      if (!fit) continue;
      const [w, d] = fit;
      pieces.push({ ...part, kind: shape.kind, x, z, w, d, recoloured: pieces.length === 0 ? part.recoloured : undefined });
      for (let dz = 0; dz < d; dz++) {
        for (let dx = 0; dx < w; dx++) cells.delete(cellKey(x + dx, z + dz));
      }
      break;
    }
  }
  return pieces;
}

/**
 * New pieces covering the cells of p and q (same layer, same height): the
 * largest legal part that holds at least one cell of each, plus a greedy
 * tiling of what is left, one colour at a time. When p and q differ in
 * colour, the spanning part takes whichever of the two changes fewer visible
 * cells. Null when no legal part can span the two.
 *
 * With `fill` (plates only), the spanning part may also cover up to
 * MAX_FILL empty cells inside the two parts' bounding box that `fill`
 * accepts (`hiddenGap`); they are returned in `filled` and become part of
 * the model. Empty cells the spanning part does not take stay empty.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {object} p
 * @param {object} q
 * @param {((x: number, y: number, z: number) => boolean) | null} [fill]
 * @returns {{ pieces: object[], recoloured: number, filled?: { x: number, y: number, z: number }[] } | null}
 */
export function mergeCandidate(grid, p, q, fill = null) {
  const shapes = p.h === 3 ? BRICKS : PLATES;
  /** @type {Map<string, { tag: number, color: number }>} */
  const cells = new Map();
  for (const [part, tag] of [[p, 1], [q, 2]]) {
    for (let dz = 0; dz < part.d; dz++) {
      for (let dx = 0; dx < part.w; dx++) cells.set(cellKey(part.x + dx, part.z + dz), { tag, color: part.color });
    }
  }
  const x0 = Math.min(p.x, q.x);
  const z0 = Math.min(p.z, q.z);
  const x1 = Math.max(p.x + p.w, q.x + q.w);
  const z1 = Math.max(p.z + p.d, q.z + q.d);
  if (fill && p.h === 1) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        if (!cells.has(cellKey(x, z)) && fill(x, p.y, z)) cells.set(cellKey(x, z), { tag: 0, color: p.color, gap: true });
      }
    }
  }

  let best = null;
  for (const shape of shapes) {
    for (const [w, d] of orientations(shape)) {
      for (let z = z0; z + d <= z1; z++) {
        for (let x = x0; x + w <= x1; x++) {
          let tags = 0;
          let gaps = 0;
          let inside = true;
          for (let dz = 0; dz < d && inside; dz++) {
            for (let dx = 0; dx < w; dx++) {
              const cell = cells.get(cellKey(x + dx, z + dz));
              if (!cell) {
                inside = false;
                break;
              }
              tags |= cell.tag;
              if (cell.gap) gaps++;
            }
          }
          if (!inside || tags !== 3 || gaps > MAX_FILL) continue;
          // Largest first; between two of the same size, the one that fills fewer gaps.
          if (!best || w * d > best.w * best.d || (w * d === best.w * best.d && gaps < best.gaps)) best = { x, z, w, d, kind: shape.kind, gaps };
        }
      }
    }
  }
  if (!best) return null;

  const spanned = [];
  const filled = [];
  for (let dz = 0; dz < best.d; dz++) {
    for (let dx = 0; dx < best.w; dx++) {
      const k = cellKey(best.x + dx, best.z + dz);
      const cell = cells.get(k);
      spanned.push({ x: best.x + dx, z: best.z + dz, color: cell.color });
      if (cell.gap) filled.push({ x: best.x + dx, y: p.y, z: best.z + dz });
      cells.delete(k);
    }
  }
  // Gaps the spanning part did not take stay empty.
  for (const [k, cell] of cells) if (cell.gap) cells.delete(k);
  const pick = pickColour(grid, p, q, spanned, (c) => shapeAvailable(best.kind, best.w, best.d, c));
  if (!pick) return null;
  const { color, recoloured } = pick;
  const piece = (x, z, w, d, kind, c) => ({ kind, x, y: p.y, z, w, d, h: p.h, color: c });
  const pieces = [{ ...piece(best.x, best.z, best.w, best.d, best.kind, color), recoloured }];

  // Greedy cover of the leftover cells, largest part first, never mixing colours.
  const left = [...cells.keys()].map(parseKey).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [x, z] of left) {
    const anchor = cells.get(cellKey(x, z));
    if (!anchor) continue;
    for (const shape of availableShapes(shapes, anchor.color)) {
      const fit = orientations(shape).find(([w, d]) => covers(cells, x, z, w, d, anchor.color));
      if (!fit) continue;
      const [w, d] = fit;
      pieces.push(piece(x, z, w, d, shape.kind, anchor.color));
      for (let dz = 0; dz < d; dz++) {
        for (let dx = 0; dx < w; dx++) cells.delete(cellKey(x + dx, z + dz));
      }
      break;
    }
  }
  return filled.length ? { pieces, recoloured, filled } : { pieces, recoloured };
}

/** At most this many empty cells one repair merge may fill (`hiddenGap`). */
const MAX_FILL = 2;

/**
 * An empty cell a repair merge may fill: outside every part, with a part
 * directly above or below it (so the new piece is held by studs), and at
 * least three of its six faces against parts, so it sits in a notch of the
 * model rather than sticking out.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {Int32Array} owner
 */
export function hiddenGap(grid, owner) {
  const at = (x, y, z) => grid.inBounds(x, y, z) && owner[grid.index(x, y, z)] >= 0;
  return (x, y, z) => {
    if (!grid.inBounds(x, y, z) || grid.get(x, y, z) || owner[grid.index(x, y, z)] >= 0) return false;
    if (!at(x, y + 1, z) && !at(x, y - 1, z)) return false;
    let faces = 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (at(x + dx, y + dy, z + dz)) faces++;
    return faces >= 3;
  };
}

/**
 * Colour for a part spanning a seam: the one that changes the fewest visible
 * cells; ties go to the colour already on more of its cells. Only colours the
 * spanning part was made in (`made`) qualify; null when neither does.
 */
function pickColour(grid, p, q, spanned, made) {
  if (p.color === q.color) return made(p.color) ? { color: p.color, recoloured: 0 } : null;
  const score = (c) => {
    let visible = 0;
    let own = 0;
    for (const cell of spanned) {
      if (cell.color === c) own++;
      else if (columnVisible(grid, cell.x, p.y, p.h, cell.z)) visible++;
    }
    return { color: c, recoloured: visible, own };
  };
  const options = [p.color, q.color].filter(made).map(score);
  if (options.length === 0) return null;
  if (options.length === 1) return { color: options[0].color, recoloured: options[0].recoloured };
  const [a, b] = options;
  const pick = a.recoloured !== b.recoloured ? (a.recoloured < b.recoloured ? a : b) : a.own >= b.own ? a : b;
  return { color: pick.color, recoloured: pick.recoloured };
}

/** True when any of the h stacked cells has an empty face neighbour. */
function columnVisible(grid, x, y, h, z) {
  for (let dy = 0; dy < h; dy++) {
    const yy = y + dy;
    if (
      !grid.get(x - 1, yy, z) || !grid.get(x + 1, yy, z) ||
      !grid.get(x, yy - 1, z) || !grid.get(x, yy + 1, z) ||
      !grid.get(x, yy, z - 1) || !grid.get(x, yy, z + 1)
    ) {
      return true;
    }
  }
  return false;
}

function orientations(shape) {
  return shape.w === shape.d ? [[shape.w, shape.d]] : [[shape.w, shape.d], [shape.d, shape.w]];
}

function covers(cells, x, z, w, d, color) {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const cell = cells.get(cellKey(x + dx, z + dz));
      if (!cell || cell.color !== color) return false;
    }
  }
  return true;
}

function cellKey(x, z) {
  return `${x},${z}`;
}

function parseKey(k) {
  return k.split(',').map(Number);
}
