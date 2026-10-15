/**
 * Editing a finished model part by part (「编辑零件」): take a part off, change
 * one part's colour, or add a part (brick, plate, tile, round part, slope or
 * inverted slope). The part list is frozen:
 * nothing is laid out again, so an edit changes exactly one part. Every edit
 * returns a new model with the checks redone and leaves the old one as it
 * was, so undo is simply going back to the previous model. Works the same on
 * built and imported (.ldr) models.
 */

import { VoxelGrid } from './grid.mjs';
import { check } from './check.mjs';
import { cellsOfPart, rebuildWithCells } from './model.mjs';
import { isAvailable, ldrawId, shapeAvailable } from './catalog.mjs';
import { KIND_HEIGHT, partType, slopeCells, studsOnTop } from './parts.mjs';
import { PALETTE } from './palette.mjs';

/** Ids of the parts sitting directly on part `id` (a cell right above one of its cells is theirs). */
export function partsOnTop(model, id) {
  const { grid, result } = model;
  const on = new Set();
  for (const [x, y, z] of cellsOfPart(result.parts[id])) {
    if (y + 1 >= grid.sy) continue;
    const o = result.owner[grid.index(x, y + 1, z)];
    if (o >= 0 && o !== id) on.add(o);
  }
  return [...on];
}

/**
 * Whether part `id` can be taken off as it is: only when nothing rests on it.
 * @returns {{ ok: boolean, onTop: number[] }}
 */
export function canDelete(model, id) {
  const onTop = partsOnTop(model, id);
  return { ok: onTop.length === 0, onTop };
}

/** The model without part `id`; the other parts are unchanged (ids are renumbered in order). */
export function deletePart(model, id) {
  if (!canDelete(model, id).ok) throw new Error(`part ${id} has parts on top`);
  return withParts(model, model.result.parts.filter((p) => p.id !== id));
}

/** True when part `id` was really made in palette colour `color` (index + 1). */
export function canRecolour(model, id, color) {
  return isAvailable(ldrawId(model.result.parts[id]), PALETTE[color - 1].code);
}

/**
 * The model with part `id` in palette colour `color`, nothing else changed.
 * Only colours LEGO made that part in are allowed. In a frozen part list a
 * colour change is part by part, so the availability check is per part here
 * (the generated model recolours its voxels instead, `paint.mjs`).
 */
export function recolourPart(model, id, color) {
  if (!canRecolour(model, id, color)) throw new Error(`part ${id} was never made in colour ${color}`);
  return withParts(
    model,
    model.result.parts.map((p) => {
      if (p.id !== id) return p;
      // The visitor chose this colour: it is no longer a colour repair picked to join parts.
      const { recoloured, ...rest } = p;
      return { ...rest, color };
    }),
  );
}

/**
 * A part as it will sit in the model: a slope or inverted slope gets the
 * cells of its own shape (stud rows full height, sloped rows one plate,
 * `slopeCells`); other parts fill their box.
 */
function shaped(part) {
  if (part.cells || !partType(part)?.slope) return part;
  return { ...part, cells: slopeCells(part) };
}

/**
 * Whether a new part can go at its position. Reasons: `outside` (past the
 * model's sides or below the ground), `notMade` (LEGO never made this part
 * in this colour), `overlap` (a cell is taken, or a sloped face cuts through
 * it), `floating` (nothing holds it). A part is held when it stands on the
 * ground, when a column where it has a bottom sits on studs, or when a
 * column where it has studs on top is pushed into a part above. Tiles and
 * sloped faces have no studs on top, and an inverted slope has no bottom
 * under its sloped rows, so those columns hold nothing.
 *
 * @param {{ kind: string, x: number, y: number, z: number, w: number, d: number, h: number, color: number,
 *   ldraw?: string, dir?: [number, number] }} part a slope carries `ldraw` and its downhill `dir`
 * @returns {{ ok: boolean, reason?: 'outside'|'notMade'|'overlap'|'floating' }}
 */
export function canPlace(model, part) {
  const { grid, result } = model;
  const { x, y, z, w, d, h } = part;
  if (x < 0 || z < 0 || y < 0 || x + w > grid.sx || z + d > grid.sz) return { ok: false, reason: 'outside' };
  if (!(part.ldraw ? isAvailable(part.ldraw, PALETTE[part.color - 1].code) : shapeAvailable(part.kind, w, d, part.color))) {
    return { ok: false, reason: 'notMade' };
  }
  const type = partType(part);
  const ownerAt = (cx, cy, cz) => (grid.inBounds(cx, cy, cz) ? result.owner[grid.index(cx, cy, cz)] : -1);
  const boxes = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d && a.y < b.y + b.h && b.y < a.y + a.h;
  const own = cellsOfPart(shaped(part));
  // A new slope's sloped face cuts through the empty cells of its box, so the whole box must be free.
  const needed = type.slope ? cellsOfPart({ x, y, z, w, d, h }) : own;
  for (const [cx, cy, cz] of needed) if (ownerAt(cx, cy, cz) >= 0) return { ok: false, reason: 'overlap' };
  // The same for slopes already there: their box counts as taken.
  if (result.parts.some((p) => partType(p)?.slope && boxes(p, part))) return { ok: false, reason: 'overlap' };

  const owns = new Set(own.map(([cx, cy, cz]) => `${cx},${cy},${cz}`));
  const studded = type.top === 'studs';
  let held = y === 0;
  for (let dz = 0; dz < d && !held; dz++) {
    for (let dx = 0; dx < w && !held; dx++) {
      const cx = x + dx;
      const cz = z + dz;
      if (owns.has(`${cx},${y},${cz}`)) {
        const below = ownerAt(cx, y - 1, cz);
        if (below >= 0 && studsOnTop(result.parts[below], y - 1)) held = true;
      }
      // Hangs under a part above: only where this part has studs on its top.
      if (studded && owns.has(`${cx},${y + h - 1},${cz}`) && ownerAt(cx, y + h, cz) >= 0) held = true;
    }
  }
  return held ? { ok: true } : { ok: false, reason: 'floating' };
}

/** The model with a new part added (see canPlace); a round part keeps its `ldraw`, a slope its shape and direction. */
export function addPart(model, part) {
  const { ok, reason } = canPlace(model, part);
  if (!ok) throw new Error(`cannot place part: ${reason}`);
  const { kind, x, y, z, w, d, h, color, ldraw, slope, studs, dir } = part;
  const placed = { kind, x, y, z, w, d, h, color, ...(ldraw && { ldraw }), ...(dir && { slope, studs, dir: [...dir] }) };
  return withParts(model, [...model.result.parts, shaped(placed)]);
}

/**
 * Where a new part of footprint w × d (along x × z) goes when it is pushed
 * onto the top of part `onId` at stud (studX, studZ): centred on that stud,
 * on the part's top in that column, moved inwards if it would stick out past
 * the model's sides. Everything else in `shape` (colour, `ldraw`, a slope's
 * `dir`, the height `h`) is carried through.
 */
export function placeOnTop(model, onId, stud, shape) {
  return placeBy(model, onId, stud, shape, 'top');
}

/**
 * Where a new part goes when it is hung under part `underId` at stud
 * (studX, studZ): centred on that stud, with its top right under the part's
 * bottom in that column (its studs go into that bottom), moved inwards past
 * the model's sides like placeOnTop. Below the ground is `outside` in canPlace.
 */
export function placeUnder(model, underId, stud, shape) {
  return placeBy(model, underId, stud, shape, 'bottom');
}

function placeBy(model, id, [studX, studZ], shape, side) {
  const { grid, result } = model;
  const { cells, ...rest } = shape;
  const { w, d } = rest;
  const h = rest.h ?? KIND_HEIGHT[rest.kind];
  const column = cellsOfPart(result.parts[id])
    .filter(([cx, , cz]) => cx === studX && cz === studZ)
    .map(([, cy]) => cy);
  const y = side === 'top' ? Math.max(...column) + 1 : Math.min(...column) - h;
  const clamp = (v, size, extent) => Math.max(0, Math.min(size - extent, v));
  return {
    ...rest,
    h,
    x: clamp(studX - Math.floor((w - 1) / 2), grid.sx, w),
    y,
    z: clamp(studZ - Math.floor((d - 1) / 2), grid.sz, d),
  };
}

/**
 * Where a new part goes when it is pushed onto part `onId` at stud
 * (studX, studZ), and whether it fits there. The centred position
 * (placeOnTop) wins when it fits. Otherwise the part slides: every other
 * position on the same layer whose footprint still covers the pointed stud
 * is tried, nearest the centred one first (ties: smaller x, then smaller z),
 * and the first that fits is taken, the way Studio lines a part up with the
 * stud under the pointer. When none fits, the centred position comes back
 * with its reason, so the preview can say why.
 *
 * @returns {{ part: object, ok: boolean, reason?: 'outside'|'notMade'|'overlap'|'floating' }}
 */
export function snapOnTop(model, onId, stud, shape) {
  return slide(model, placeOnTop(model, onId, stud, shape), stud);
}

/** The same as snapOnTop for a part hung under part `underId` (placeUnder). */
export function snapUnder(model, underId, stud, shape) {
  return slide(model, placeUnder(model, underId, stud, shape), stud);
}

function slide(model, centred, stud) {
  const first = canPlace(model, centred);
  // A colour LEGO never made is not fixed by moving the part.
  if (first.ok || first.reason === 'notMade') return { part: centred, ...first };
  const { sx, sz } = model.grid;
  const [studX, studZ] = stud;
  const { w, d } = centred;
  const tries = [];
  for (let x = Math.max(0, studX - w + 1); x <= Math.min(studX, sx - w); x++) {
    for (let z = Math.max(0, studZ - d + 1); z <= Math.min(studZ, sz - d); z++) {
      if (x !== centred.x || z !== centred.z) tries.push([x, z, (x - centred.x) ** 2 + (z - centred.z) ** 2]);
    }
  }
  tries.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  for (const [x, z] of tries) {
    const part = { ...centred, x, z };
    if (canPlace(model, part).ok) return { part, ok: true };
  }
  return { part: centred, ...first };
}

/**
 * A slope's downhill direction after each quarter turn, in order (the
 * editor's 「转 90°」 for a new part and for a part already placed).
 * @type {[number, number][]}
 */
export const TURN = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/**
 * Part `id` picked up to move or turn: the part, its shape (everything but
 * position), and the model without it, which every check for the move runs
 * on, so the part can always go back where it was. In the model without it
 * the parts after it have ids one lower. Only a part with nothing on top
 * can be picked up (the same rule as deleting).
 *
 * @returns {{ id: number, part: object, shape: object, without: object }}
 */
export function liftPart(model, id) {
  if (!canDelete(model, id).ok) throw new Error(`part ${id} has parts on top`);
  const part = model.result.parts[id];
  const { id: _, x, y, z, cells, ...shape } = part;
  return { id, part, shape, without: withParts(model, model.result.parts.filter((p) => p.id !== id)) };
}

/**
 * Where the lifted part goes for a pick on the model as drawn with the part
 * hidden (`hit` from BrickView.pickFace, in the model's own ids): on top of
 * or under the part pointed at, slid like a new part (snapOnTop / snapUnder).
 */
export function snapLifted(lift, hit) {
  if (hit.id === lift.id) return { part: null, ok: false, reason: 'notFace' };
  const other = hit.id < lift.id ? hit.id : hit.id - 1;
  return (hit.side === 'top' ? snapOnTop : snapUnder)(lift.without, other, hit.stud, lift.shape);
}

/** True when a quarter turn changes the part: a slope faces another way, a rectangle swaps its sides. */
export function canTurn(part) {
  return Boolean(partType(part)?.slope) || part.w !== part.d;
}

/**
 * Footprint and direction of a part after a quarter turn: a rectangle swaps
 * its sides, a slope faces the next way in TURN (its length then runs along
 * the other axis).
 * @returns {{ w: number, d: number, dir?: [number, number] }}
 */
export function quarterTurn(part) {
  const type = partType(part);
  if (!type?.slope) return { w: part.d, d: part.w };
  const i = TURN.findIndex(([a, b]) => a === part.dir[0] && b === part.dir[1]);
  const dir = TURN[(i + 1) % TURN.length];
  const along = dir[0] !== 0;
  return { w: along ? type.d : type.w, d: along ? type.w : type.d, dir };
}

/**
 * The lifted part turned a quarter where it stands: its footprint swaps
 * sides around the middle stud, a slope also faces the next way in TURN.
 * When the turned part does not fit, it slides like a new part, keeping the
 * middle stud covered; when nothing fits, the reason comes back.
 */
export function turnLifted(lift) {
  const p = lift.part;
  const { w, d, dir } = quarterTurn(p);
  const turned = { ...lift.shape, w, d, ...(dir && { dir }), x: p.x + Math.floor((p.w - w) / 2), y: p.y, z: p.z + Math.floor((p.d - d) / 2) };
  const middle = [p.x + Math.floor((p.w - 1) / 2), p.z + Math.floor((p.d - 1) / 2)];
  return slide(lift.without, turned, middle);
}

/**
 * The model with the lifted part put down at `target` (from snapLifted or
 * turnLifted): the same part in its old place in the part list, so this is
 * one edit and undo goes straight back. A slope keeps its own cells when it
 * only moved; turned, it gets the cells of its new direction.
 */
export function dropPart(model, lift, target) {
  const { ok, reason } = canPlace(lift.without, target);
  if (!ok) throw new Error(`cannot place part: ${reason}`);
  const { id, cells, ...rest } = lift.part;
  const { x, y, z, w, d, dir } = target;
  const sameWay = !dir || (dir[0] === rest.dir[0] && dir[1] === rest.dir[1]);
  const placed = { ...rest, x, y, z, w, d, ...(dir && { dir: [...dir] }) };
  if (cells && sameWay) placed.cells = cells.map(([cx, cy, cz]) => [cx + x - lift.part.x, cy + y - lift.part.y, cz + z - lift.part.z]);
  return withParts(model, model.result.parts.map((p) => (p.id === id ? shaped(placed) : p)));
}

/**
 * A model from an edited part list, with owner table and checks redone.
 * The grid keeps its size (so the view does not jump) and only grows upward
 * when a part was added on top. Parts carry their own colour; ids are given
 * by list order.
 */
export function withParts(model, list) {
  const { sx, sz } = model.grid;
  const sy = Math.max(model.grid.sy, ...list.map((p) => p.y + p.h));
  const grid = new VoxelGrid(sx, sy, sz);
  for (const p of list) for (const [x, y, z] of cellsOfPart(p)) grid.set(x, y, z, p.color);
  const result = rebuildWithCells(grid, list.map(({ id, ...p }) => p));
  // Same sum repair reports: visible cells recoloured to join parts.
  result.recolouredCells = result.parts.reduce((n, p) => n + (p.recoloured ?? 0), 0);
  const stats = check(grid, result);
  const count = (kind) => result.parts.filter((p) => p.kind === kind).length;
  return {
    ...model,
    grid,
    result,
    // Edits come after repair: "before repair" no longer means anything.
    before: stats,
    stats,
    counts: { slopes: count('slope'), inverted: count('inverted'), tiles: count('tile') },
    edits: (model.edits ?? 0) + 1,
  };
}
