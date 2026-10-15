import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importedModel, parseLdr } from '../src/io/ldr-import.mjs';
import { addPart, canDelete, canPlace, canRecolour, deletePart, partsOnTop, placeOnTop, recolourPart, snapOnTop } from '../src/core/edit.mjs';
import { FLAG_DETACHED } from '../src/core/check.mjs';
import { exportLdr } from '../src/io/ldr.mjs';
import { cellValue } from '../src/core/palette.mjs';

const W = cellValue(15);
const R = cellValue(4);
const part = (kind, x, y, z, w, d, color = W) => ({ kind, x, y, z, w, d, h: kind === 'brick' ? 3 : 1, color });

/**
 * A 2×2 brick on the ground with a 4×2 plate on top reaching past it, a 2×2
 * plate hanging under that overhang (held only by the top plate), and a
 * separate brick on the ground.
 */
function sample() {
  const parts = [
    part('brick', 0, 0, 0, 2, 2),
    part('plate', 0, 3, 0, 4, 2, R),
    part('plate', 2, 2, 0, 2, 2),
    part('brick', 6, 0, 0, 2, 2),
  ];
  return importedModel({ parts, skipped: {} }).model;
}

test('a part can come off only when nothing rests on it', () => {
  const model = sample();
  const [brick, top, hanging, loose] = model.result.parts.map((p) => p.id);
  assert.deepEqual(partsOnTop(model, brick), [top]);
  assert.equal(canDelete(model, brick).ok, false);
  assert.equal(canDelete(model, hanging).ok, false); // the top plate sits on it too
  assert.equal(canDelete(model, top).ok, true);
  assert.equal(canDelete(model, loose).ok, true);
  assert.throws(() => deletePart(model, brick), /parts on top/);
});

test('deleting changes exactly one part and leaves the old model as it was', () => {
  const model = sample();
  const before = structuredClone(model.result.parts);
  const cells = model.grid.filledCount();
  const loose = model.result.parts[3];
  const edited = deletePart(model, loose.id);

  assert.equal(edited.result.parts.length, 3);
  const strip = ({ id, ...p }) => p;
  assert.deepEqual(edited.result.parts.map(strip), before.slice(0, 3).map(strip));
  assert.equal(edited.grid.filledCount(), cells - 12);
  assert.equal(edited.grid.get(loose.x, 0, loose.z), 0);
  assert.equal(edited.result.owner[edited.grid.index(loose.x, 0, loose.z)], -1);
  assert.deepEqual([edited.grid.sx, edited.grid.sy, edited.grid.sz], [model.grid.sx, model.grid.sy, model.grid.sz]);
  assert.equal(edited.edits, 1);

  // Undo is the previous model: untouched.
  assert.deepEqual(model.result.parts, before);
  assert.equal(model.grid.filledCount(), cells);
  assert.equal(model.stats.parts, 4);
});

test('the checks are redone: taking off the top plate leaves the hanging plate unconnected', () => {
  const model = sample();
  // The separate brick stands on its own, so it already counts as not joined to the main body.
  assert.equal(model.stats.detachedParts, 1);
  const top = model.result.parts[1];
  const edited = deletePart(model, top.id);
  assert.equal(edited.stats.parts, 3);
  assert.equal(edited.stats.detachedParts, 2);
  const hanging = edited.result.parts.find((p) => p.y === 2);
  assert.ok(edited.stats.flags[hanging.id] & FLAG_DETACHED);
  // The edited model exports like any other.
  assert.equal((exportLdr(edited, 'edited').match(/^1 /gm) ?? []).length, 3);
});

test('slopes use their own cells: a slope on a brick comes off, the brick under it does not', () => {
  const text = ['1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat', '1 15 -20 -24 10 1 0 0 0 1 0 0 0 1 3039.dat'].join('\n');
  const { model } = importedModel(parseLdr(text));
  const brick = model.result.parts.find((p) => p.kind === 'brick');
  const slope = model.result.parts.find((p) => p.kind === 'slope');
  assert.equal(slope.cells.length, 8); // stud row 2 × 3 plates, slope row 2 × 1 plate
  assert.equal(canDelete(model, brick.id).ok, false);
  const edited = deletePart(model, slope.id);
  assert.equal(edited.grid.filledCount(), 24);
  assert.equal(edited.stats.parts, 1);
  assert.equal(edited.stats.detachedParts, 0);
});

test('recolouring one part changes only that part, and only to colours it was made in', () => {
  const model = sample();
  const loose = model.result.parts[3]; // 2×2 brick, 3003
  const blue = cellValue(322);
  assert.equal(canRecolour(model, loose.id, blue), true);
  const edited = recolourPart(model, loose.id, blue);
  assert.equal(edited.result.parts[3].color, blue);
  assert.equal(edited.grid.get(loose.x, 0, loose.z), blue);
  assert.deepEqual(edited.result.parts.slice(0, 3), model.result.parts.slice(0, 3));
  assert.equal(model.result.parts[3].color, W); // the old model is untouched

  // A 1×8 brick (3008) was never made in Medium Azure.
  const long = importedModel({ parts: [part('brick', 0, 0, 0, 8, 1)], skipped: {} }).model;
  assert.equal(canRecolour(long, 0, blue), false);
  assert.throws(() => recolourPart(long, 0, blue), /never made/);
});

test('adding a part: on studs, hanging under a part, or on the ground; never overlapping, floating or in an unmade colour', () => {
  const model = sample(); // grid 8 × 4 × 2 plates high
  const top = model.result.parts[1];
  const plate = (x, y, z, color = W) => part('plate', x, y, z, 2, 2, color);

  // Pushed onto the top plate at stud (1, 0): centred there, one plate up; the grid grows upward.
  const placed = placeOnTop(model, top.id, [1, 0], { kind: 'plate', w: 2, d: 2, color: W });
  assert.deepEqual([placed.x, placed.y, placed.z, placed.h], [1, 4, 0, 1]);
  assert.deepEqual(canPlace(model, placed), { ok: true });
  const added = addPart(model, placed);
  assert.equal(added.result.parts.length, 5);
  assert.equal(added.grid.sy, 5);
  assert.equal(added.stats.detachedParts, model.stats.detachedParts);
  assert.equal(model.result.parts.length, 4); // the old model is untouched

  assert.equal(canPlace(model, plate(0, 3, 0)).reason, 'overlap');
  assert.equal(canPlace(model, plate(4, 2, 0)).reason, 'floating'); // past the overhang, nothing under or over it
  assert.deepEqual(canPlace(model, plate(2, 1, 0)), { ok: true }); // hangs under the hanging plate
  assert.deepEqual(canPlace(model, plate(4, 0, 0)), { ok: true }); // on the ground
  assert.equal(canPlace(model, plate(7, 0, 0)).reason, 'outside');
  assert.equal(canPlace(model, { ...part('brick', 0, 4, 0, 8, 1), color: cellValue(322) }).reason, 'notMade');
  assert.throws(() => addPart(model, plate(4, 2, 0)), /floating/);
  // Near a side, the footprint moves in instead of sticking out.
  assert.equal(placeOnTop(model, model.result.parts[3].id, [7, 1], { kind: 'brick', w: 2, d: 2, color: W }).x, 6);
});

test('nothing can be pushed onto a tile', () => {
  const { model } = importedModel({ parts: [part('brick', 0, 0, 0, 2, 2), part('tile', 0, 3, 0, 2, 2)], skipped: {} });
  assert.equal(canPlace(model, part('plate', 0, 4, 0, 2, 2)).reason, 'floating');
});

test('a round part is added as a round part, and only in colours it was made in', () => {
  const model = sample();
  const top = model.result.parts[1];
  const placed = placeOnTop(model, top.id, [1, 0], { kind: 'brick', ldraw: '3941', w: 2, d: 2, color: W });
  assert.equal(placed.ldraw, '3941');
  assert.deepEqual(canPlace(model, placed), { ok: true });
  const added = addPart(model, placed);
  const last = added.result.parts.at(-1);
  assert.deepEqual([last.kind, last.ldraw, last.w, last.h], ['brick', '3941', 2, 3]);
  // The round plate 6141 was never made in Coral (LDraw 353), the square 3024 was.
  const coral = cellValue(353);
  assert.equal(canPlace(model, { ...part('plate', 0, 4, 0, 1, 1, coral), ldraw: '6141' }).reason, 'notMade');
  assert.deepEqual(canPlace(model, part('plate', 0, 4, 0, 1, 1, coral)), { ok: true });
});

/** The pointed stud is under the part's footprint. */
const covers = (p, [x, z]) => p.x <= x && x < p.x + p.w && p.z <= z && z < p.z + p.d;

test('snapping: where the centred position fits, the part stays there', () => {
  const model = sample();
  const top = model.result.parts[1];
  const shape = { kind: 'plate', w: 2, d: 2, color: W };
  const snap = snapOnTop(model, top.id, [1, 0], shape);
  assert.deepEqual(snap, { part: placeOnTop(model, top.id, [1, 0], shape), ok: true });
});

test('snapping: next to a wall the part slides away from it and still covers the pointed stud', () => {
  // A 2 × 6 plate on the ground with a 2 × 2 brick standing on its right end (x 4–5).
  const { model } = importedModel({ parts: [part('plate', 0, 0, 0, 6, 2), part('brick', 4, 1, 0, 2, 2)], skipped: {} });
  const shape = { kind: 'plate', w: 4, d: 2, color: W };
  // Centred on stud (3, 0) the 2 × 4 plate covers x 2–5 and runs into the brick.
  assert.equal(canPlace(model, placeOnTop(model, 0, [3, 0], shape)).reason, 'overlap');
  const snap = snapOnTop(model, 0, [3, 0], shape);
  assert.equal(snap.ok, true);
  assert.deepEqual([snap.part.x, snap.part.y, snap.part.z], [0, 1, 0]);
  assert.ok(covers(snap.part, [3, 0]));
});

test('snapping: in a corner between two walls the part moves out of both', () => {
  // A 4 × 4 floor of two plates, a 1 × 3 brick along x = 3 and a 4 × 1 brick along z = 3.
  const parts = [
    part('plate', 0, 0, 0, 4, 2),
    part('plate', 0, 0, 2, 4, 2),
    part('brick', 3, 1, 0, 1, 3),
    part('brick', 0, 1, 3, 4, 1),
  ];
  const { model } = importedModel({ parts, skipped: {} });
  const floor = model.result.parts.find((p) => p.z === 2 && p.kind === 'plate');
  const snap = snapOnTop(model, floor.id, [2, 2], { kind: 'plate', w: 2, d: 2, color: W });
  assert.equal(snap.ok, true);
  assert.deepEqual([snap.part.x, snap.part.z], [1, 1]);
  assert.ok(covers(snap.part, [2, 2]));
});

test('snapping: when no position fits, the centred one comes back with its reason', () => {
  // A 2 × 2 floor boxed in by bricks: a 2 × 4 plate cannot fit anywhere over stud (0, 0).
  const parts = [part('plate', 0, 0, 0, 2, 2), part('brick', 0, 1, 1, 2, 1)];
  const { model } = importedModel({ parts, skipped: {} });
  const shape = { kind: 'plate', w: 2, d: 2, color: W };
  const snap = snapOnTop(model, 0, [0, 0], shape);
  assert.deepEqual(snap, { part: placeOnTop(model, 0, [0, 0], shape), ok: false, reason: 'overlap' });
  // A colour LEGO never made does not slide around: it is refused where it is.
  const wide = sample();
  const azure = snapOnTop(wide, wide.result.parts[1].id, [1, 0], { kind: 'brick', w: 8, d: 1, color: cellValue(322) });
  assert.equal(azure.reason, 'notMade');
});
