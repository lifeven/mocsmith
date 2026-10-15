/**
 * After repair: join what repair cannot. Parts that touch the main body only
 * on the side, in the same layer, can never be joined by re-tiling — bricks
 * hold through studs, top to bottom. A "seam plate" right under (or over) the
 * two touching cells holds both, so it is added when both cells there are
 * empty. Tiny loose crumbs that touch nothing at all are dropped.
 *
 */

import { check, FLAG_DETACHED } from '../core/check.mjs';
import { shapeAvailable } from '../core/catalog.mjs';
import { EditableModel } from '../core/editable.mjs';
import { cellsOfPart, rebuildWithCells } from '../core/model.mjs';

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Loose groups of at most this many cells that touch nothing are dropped. */
const MAX_CRUMB_CELLS = 2;

/**
 * @param {import('../core/grid.mjs').VoxelGrid} grid changed in place: seam plates added, crumbs cleared
 * @param {{ parts: object[], owner: Int32Array }} result repair output
 * @returns {{ parts: object[], owner: Int32Array, welds: number, droppedCells: number }}
 */
export function weld(grid, result) {
  // Trials are judged on the part graph (as in repair); only accepted plates touch the model.
  const model = new EditableModel(grid, result);
  let stats = model.groups();
  let welds = 0;
  const tried = new Set();

  for (let changed = true; changed && stats.detachedParts > 0; ) {
    changed = false;
    const parts = model.parts();
    for (const plate of seamPlates(grid, parts, model, stats.flags)) {
      const key = `${plate.x},${plate.y},${plate.z},${plate.w},${plate.d}`;
      if (tried.has(key)) continue;
      tried.add(key);
      const list = [...parts, plate];
      const after = model.whatIf(new Set(), list, (i) => i === parts.length);
      if (after.detachedParts < stats.detachedParts && after.components <= stats.components) {
        model.replace(new Set(), [], [plate]);
        setCells(grid, plate, plate.color);
        stats = model.groups();
        welds++;
        changed = true;
        break; // flags changed: look again from the start
      }
    }
  }

  const current = model.toResult();
  const { parts, droppedCells } = dropCrumbs(grid, current, check(grid, current).flags);
  const done = droppedCells ? rebuildWithCells(grid, parts) : current;
  return { parts: done.parts, owner: done.owner, welds, droppedCells };
}

/**
 * Candidate seam plates: for each cell of a detached part with a main-body
 * cell beside it in the same layer, a 1×2 plate under both cells (first) or
 * over both, when both cells there are empty. Colour: the detached part's if
 * that plate was made in it, else the main part's. Ids are the model's slot ids.
 */
function* seamPlates(grid, parts, { owner, slots }, flags) {
  const ownerAt = (x, y, z) => (grid.inBounds(x, y, z) ? owner[grid.index(x, y, z)] : -1);
  for (const p of parts) {
    if (!(flags[p.id] & FLAG_DETACHED)) continue;
    for (const [x, y, z] of cellsOfPart(p)) {
      for (const [dx, dz] of SIDES) {
        const o = ownerAt(x + dx, y, z + dz);
        if (o < 0 || flags[o] & FLAG_DETACHED) continue;
        const [w, d] = dx ? [2, 1] : [1, 2];
        const color = [p.color, slots[o].color].find((c) => shapeAvailable('plate', w, d, c));
        if (!color) continue;
        for (const yy of [y - 1, y + 1]) {
          if (yy < 0 || yy >= grid.sy) continue;
          if (grid.get(x, yy, z) || grid.get(x + dx, yy, z + dz)) continue;
          yield { kind: 'plate', x: Math.min(x, x + dx), y: yy, z: Math.min(z, z + dz), w, d, h: 1, color };
        }
      }
    }
  }
}

/** Detached groups of at most MAX_CRUMB_CELLS cells with no neighbour at all are removed. */
function dropCrumbs(grid, { parts, owner }, flags) {
  const ownerAt = (x, y, z) => (grid.inBounds(x, y, z) ? owner[grid.index(x, y, z)] : -1);
  const loose = parts.filter((p) => flags[p.id] & FLAG_DETACHED);
  const drop = new Set();
  for (const p of loose) {
    const cells = cellsOfPart(p);
    if (cells.length > MAX_CRUMB_CELLS) continue;
    const touches = cells.some(([x, y, z]) =>
      [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => {
        const o = ownerAt(x + dx, y + dy, z + dz);
        return o >= 0 && o !== p.id;
      }),
    );
    if (!touches) drop.add(p.id);
  }
  let droppedCells = 0;
  for (const id of drop) {
    setCells(grid, parts[id], 0);
    droppedCells += cellsOfPart(parts[id]).length;
  }
  return { parts: parts.filter((p) => !drop.has(p.id)), droppedCells };
}

function setCells(grid, part, value) {
  for (const [x, y, z] of cellsOfPart(part)) grid.set(x, y, z, value);
}
