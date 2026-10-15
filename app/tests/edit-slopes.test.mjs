import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importedModel, parseLdr } from '../src/io/ldr-import.mjs';
import { addPart, canPlace, snapOnTop } from '../src/core/edit.mjs';
import { exportLdr } from '../src/io/ldr.mjs';
import { isAvailable } from '../src/core/catalog.mjs';
import { PALETTE, cellValue } from '../src/core/palette.mjs';

const W = cellValue(15);
const box = (kind, x, y, z, w, d) => ({ kind, x, y, z, w, d, h: kind === 'brick' ? 3 : 1, color: W });
const model = (...parts) => importedModel({ parts, skipped: {} }).model;

/** A 45° 2 × 2 slope (3039) or inverted slope (3660b), downhill along `dir`, as the editor builds it. */
const slope = (x, y, z, dir = [0, 1], inverted = false) => ({
  kind: inverted ? 'inverted' : 'slope',
  ldraw: inverted ? '3660b' : '3039',
  slope: inverted ? 'inverted_45_2x2' : 'slope_45_2x2',
  studs: 1,
  dir,
  x,
  y,
  z,
  w: 2,
  d: 2,
  h: 3,
  color: W,
});

/** A 2 × 4 floor plate, long side along z. */
const floor = () => [box('plate', 0, 0, 0, 2, 4)];

test('a slope goes on studs and keeps its own cells; its whole box must be free', () => {
  const m = model(...floor());
  assert.deepEqual(canPlace(m, slope(0, 1, 0)), { ok: true });
  const added = addPart(m, slope(0, 1, 0));
  const s = added.result.parts.at(-1);
  assert.deepEqual([s.kind, s.ldraw, s.dir], ['slope', '3039', [0, 1]]);
  assert.equal(s.cells.length, 8); // stud row 2 × 3 plates, sloped row 2 × 1 plate
  assert.equal(added.counts.slopes, 1);
  assert.equal(added.stats.detachedParts, 0);

  // A plate in the empty cells over where the sloped face would be: the slope cannot go there.
  const blocked = model(...floor(), box('plate', 0, 2, 1, 1, 1));
  assert.equal(canPlace(blocked, slope(0, 1, 0)).reason, 'overlap');
});

test('nothing goes on a sloped face; the stud row on top takes parts', () => {
  const m = addPart(model(...floor()), slope(0, 1, 0));
  assert.deepEqual(canPlace(m, box('plate', 0, 4, 0, 2, 1)), { ok: true }); // on the stud row
  assert.equal(canPlace(m, box('plate', 0, 2, 1, 1, 1)).reason, 'overlap'); // inside the box, over the face
  assert.equal(canPlace(m, box('plate', 0, 4, 1, 2, 1)).reason, 'floating'); // above the face, no studs under it
});

test('a slope hangs under a part only by its stud row; an inverted slope by its whole top', () => {
  // A 2 × 4 ground plate, two 2 × 2 bricks stacked on its back half, a 2 × 3 plate on top reaching out to z = 2.
  const tower = [box('plate', 0, 0, 0, 2, 4), box('brick', 0, 1, 0, 2, 2), box('brick', 0, 4, 0, 2, 2), box('plate', 0, 7, 0, 2, 3)];
  const m = model(...tower);
  // Stud row at z = 2, under the plate: held.
  assert.deepEqual(canPlace(m, slope(0, 4, 2, [0, 1])), { ok: true });
  // Turned round, the stud row is at z = 3 with nothing above; the sloped face is under the plate: not held.
  assert.equal(canPlace(m, slope(0, 4, 2, [0, -1])).reason, 'floating');
  // An inverted slope has studs over its whole top, so both ways round it hangs there.
  assert.deepEqual(canPlace(m, slope(0, 4, 2, [0, 1], true)), { ok: true });
  assert.deepEqual(canPlace(m, slope(0, 4, 2, [0, -1], true)), { ok: true });
});

test('an inverted slope stands on studs only under its stud row', () => {
  // A 2 × 1 plate on the ground at z = 1 (a stray 1 × 1 plate high up at z = 0 makes the grid 2 deep).
  const m = model(box('plate', 0, 0, 1, 2, 1), box('plate', 0, 6, 0, 1, 1));
  // Stud row at z = 1, over the plate: held. Turned round, only the sloped underside is over it: not held.
  assert.deepEqual(canPlace(m, slope(0, 1, 0, [0, -1], true)), { ok: true });
  assert.equal(canPlace(m, slope(0, 1, 0, [0, 1], true)).reason, 'floating');
});

test('a tile has no studs, so it cannot hang under a part', () => {
  // A 2 × 2 plate three plates up, and a brick on the ground beside it so heights are kept.
  const m = model(box('plate', 0, 3, 0, 2, 2), box('brick', 3, 0, 0, 1, 1));
  assert.equal(canPlace(m, box('tile', 0, 2, 0, 2, 2)).reason, 'floating');
  assert.deepEqual(canPlace(m, box('plate', 0, 2, 0, 2, 2)), { ok: true });
});

test('a slope only comes in colours LEGO made it in', () => {
  const never = PALETTE.findIndex((c) => !isAvailable('3039', c.code)) + 1;
  assert.ok(never > 0);
  assert.equal(canPlace(model(...floor()), { ...slope(0, 1, 0), color: never }).reason, 'notMade');
});

test('a snapped slope keeps its direction, and an added slope survives .ldr export and import', () => {
  // A 1 × 2 brick across the floor's far end: a slope pointed next to it slides away and keeps its direction.
  const m = model(...floor(), box('brick', 0, 1, 3, 2, 1));
  const shape = slope(0, 0, 0, [0, 1]);
  const snap = snapOnTop(m, 0, [0, 2], shape);
  assert.equal(snap.ok, true);
  assert.deepEqual([snap.part.x, snap.part.z, snap.part.dir], [0, 1, [0, 1]]);

  const added = addPart(m, snap.part);
  const back = importedModel(parseLdr(exportLdr(added, 'slope'))).model;
  const strip = ({ id, color, ...p }) => p;
  assert.deepEqual(strip(back.result.parts.find((p) => p.kind === 'slope')), strip(added.result.parts.at(-1)));
});
