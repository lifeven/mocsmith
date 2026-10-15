import { hasTile, tileShapes } from '../core/parts.mjs';
import { shapeAvailable } from '../core/catalog.mjs';
import { rebuildWithCells } from '../core/model.mjs';

/**
 * Surface finishing that does not change the shape or the connections.
 *
 * Tiles: a plate with nothing anywhere on top of it becomes a tile (smooth
 * top, no studs). When no tile has its footprint (2x10, 2x12 …), the plate is
 * split into tile sizes, but only if the parts underneath stay joined: the
 * plate may be what bridges two parts below, so the pieces together must
 * still link every part the plate sat on. Plates that are partly covered keep
 * their studs. Nothing sits on a tile, so connectivity is unchanged.
 *
 * Replaces `result.parts` and `result.owner` when it splits plates, and
 * returns how many tiles there are.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {{ parts: import('./layout.mjs').PlacedPart[], owner: Int32Array }} result
 */
export function applyTiles(grid, result) {
  const { parts, owner } = result;
  const out = [];
  let tiles = 0;
  for (const p of parts) {
    if (p.kind !== 'plate' || isCovered(grid, owner, p)) {
      out.push(p);
      continue;
    }
    if (hasTile(p.w, p.d) && shapeAvailable('tile', p.w, p.d, p.color)) {
      out.push({ ...p, kind: 'tile' });
      tiles++;
      continue;
    }
    const pieces = splitIntoTiles(p);
    if (pieces && keepsBelowJoined(grid, owner, p, pieces)) {
      out.push(...pieces);
      tiles += pieces.length;
    } else {
      out.push(p);
    }
  }
  if (out.length !== parts.length) {
    const rebuilt = rebuildWithCells(grid, out);
    result.parts = rebuilt.parts;
    result.owner = rebuilt.owner;
  } else {
    result.parts = out;
  }
  return tiles;
}

function isCovered(grid, owner, p) {
  const top = p.y + p.h;
  if (top >= grid.sy) return false;
  for (let dz = 0; dz < p.d; dz++) {
    for (let dx = 0; dx < p.w; dx++) if (owner[grid.index(p.x + dx, top, p.z + dz)] >= 0) return true;
  }
  return false;
}

/** Cover p's footprint with tile sizes along its long side, largest first. Null if impossible. */
function splitIntoTiles(p) {
  const alongX = p.w >= p.d;
  const length = alongX ? p.w : p.d;
  const width = alongX ? p.d : p.w;
  const sizes = tileShapes(width)
    .filter((len) => shapeAvailable('tile', width, len, p.color))
    .sort((a, b) => b - a);
  const pieces = [];
  let at = 0;
  while (at < length) {
    const len = sizes.find((s) => s <= length - at);
    if (!len) return null;
    pieces.push(
      alongX
        ? { ...p, kind: 'tile', x: p.x + at, w: len }
        : { ...p, kind: 'tile', z: p.z + at, d: len },
    );
    at += len;
  }
  return pieces;
}

/**
 * Splitting p must not loosen anything: every piece needs a part under it,
 * and every part under p must still be linked to the others through some piece.
 */
function keepsBelowJoined(grid, owner, p, pieces) {
  if (p.y === 0) return true;
  const below = (r) => {
    const ids = new Set();
    for (let dz = 0; dz < r.d; dz++) {
      for (let dx = 0; dx < r.w; dx++) {
        const id = owner[grid.index(r.x + dx, r.y - 1, r.z + dz)];
        if (id >= 0) ids.add(id);
      }
    }
    return ids;
  };
  const all = below(p);
  const under = pieces.map(below);
  if (under.some((ids) => ids.size === 0)) return false;
  if (all.size <= 1) return true;
  // Union-find over the parts below, joined when one piece sits on both.
  const parent = new Map([...all].map((id) => [id, id]));
  const find = (a) => (parent.get(a) === a ? a : find(parent.get(a)));
  for (const ids of under.map((s) => [...s])) {
    for (let i = 1; i < ids.length; i++) parent.set(find(ids[i]), find(ids[0]));
  }
  const roots = new Set([...all].map(find));
  return roots.size === 1;
}
