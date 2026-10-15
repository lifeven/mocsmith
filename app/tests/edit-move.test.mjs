import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importedModel } from '../src/io/ldr-import.mjs';
import { canPlace, canTurn, dropPart, liftPart, snapLifted, turnLifted } from '../src/core/edit.mjs';
import { slopeCells } from '../src/core/parts.mjs';
import { cellValue } from '../src/core/palette.mjs';

const W = cellValue(15);
const box = (kind, x, y, z, w, d) => ({ kind, x, y, z, w, d, h: kind === 'brick' ? 3 : 1, color: W });

/** An 8 × 8 floor of four 2 × 8 plates, a 2 × 4 plate lying across it (x 2–5, z 3–4) and a 1 × 1 brick on that plate. */
function scene(extra = []) {
  const floor = [0, 2, 4, 6].map((x) => box('plate', x, 0, 0, 2, 8));
  return importedModel({ parts: [...floor, box('plate', 2, 1, 3, 4, 2), box('brick', 5, 2, 4, 1, 1), ...extra], skipped: {} }).model;
}
const strip = ({ id, ...p }) => p;

test('only a part with nothing on top can be picked up', () => {
  const m = scene();
  const plate = m.result.parts.findIndex((p) => p.kind === 'plate' && p.y === 1);
  const brick = m.result.parts.findIndex((p) => p.kind === 'brick');
  assert.throws(() => liftPart(m, plate), /parts on top/);
  const lift = liftPart(m, brick);
  assert.equal(lift.without.result.parts.length, m.result.parts.length - 1);
  assert.equal(lift.shape.x, undefined); // the shape carries no position
});

test('moving is one edit: the part keeps its place in the list, everything else is unchanged, the old model too', () => {
  const m = scene();
  const before = structuredClone(m.result.parts);
  const brick = m.result.parts.findIndex((p) => p.kind === 'brick');
  const lift = liftPart(m, brick);
  // Pointed at the floor plate under x = 0 from above, at stud (0, 6).
  const snap = snapLifted(lift, { id: 0, stud: [0, 6], side: 'top' });
  assert.equal(snap.ok, true);
  const moved = dropPart(m, lift, snap.part);
  assert.equal(moved.result.parts.length, before.length);
  const p = moved.result.parts[brick];
  assert.deepEqual([p.kind, p.x, p.y, p.z], ['brick', 0, 1, 6]);
  assert.deepEqual(moved.result.parts.filter((q) => q.id !== brick).map(strip), before.filter((q) => q.id !== brick).map(strip));
  assert.equal(moved.edits, 1);
  assert.deepEqual(m.result.parts, before); // undo = the previous model, untouched
});

test('a part can go back exactly where it was', () => {
  const m = scene();
  const brick = m.result.parts.findIndex((p) => p.kind === 'brick');
  const lift = liftPart(m, brick);
  const home = { ...lift.shape, x: lift.part.x, y: lift.part.y, z: lift.part.z };
  assert.deepEqual(canPlace(lift.without, home), { ok: true });
  assert.deepEqual(dropPart(m, lift, home).result.parts, m.result.parts);
});

test('pointing at the part being moved itself is refused; ids after it are mapped to the model without it', () => {
  const m = scene([box('plate', 6, 1, 6, 2, 2)]);
  const brick = m.result.parts.findIndex((p) => p.kind === 'brick');
  const later = m.result.parts.length - 1; // the 2 × 2 plate comes after the brick
  const lift = liftPart(m, brick);
  assert.equal(snapLifted(lift, { id: brick, stud: [5, 4], side: 'top' }).reason, 'notFace');
  const onLater = snapLifted(lift, { id: later, stud: [6, 6], side: 'top' });
  assert.equal(onLater.ok, true);
  assert.equal(onLater.part.y, 2); // on top of that plate, not of whatever has its id in the smaller model
});

test('turning a rectangle swaps its sides around the middle stud; twice is back where it was', () => {
  const m = scene();
  const brick = m.result.parts.findIndex((p) => p.kind === 'brick');
  const free = dropPart(m, liftPart(m, brick), { ...liftPart(m, brick).shape, x: 0, y: 1, z: 0 }); // nothing on the 2 × 4 plate now
  const plate = free.result.parts.findIndex((p) => p.kind === 'plate' && p.y === 1);
  assert.equal(canTurn(free.result.parts[plate]), true);
  const once = turnLifted(liftPart(free, plate));
  assert.equal(once.ok, true);
  assert.deepEqual([once.part.x, once.part.z, once.part.w, once.part.d], [3, 2, 2, 4]);
  const turned = dropPart(free, liftPart(free, plate), once.part);
  const back = turnLifted(liftPart(turned, plate));
  assert.deepEqual([back.part.x, back.part.z, back.part.w, back.part.d], [2, 3, 4, 2]);
});

test('a slope turns to face the next way and gets the cells of its new direction; a square part does not turn', () => {
  const slope = { kind: 'slope', ldraw: '3039', slope: 'slope_45_2x2', studs: 1, dir: [0, 1], x: 0, y: 1, z: 0, w: 2, d: 2, h: 3, color: W };
  const m = scene([{ ...slope, cells: slopeCells(slope) }]);
  const id = m.result.parts.findIndex((p) => p.kind === 'slope');
  const turn = turnLifted(liftPart(m, id));
  assert.equal(turn.ok, true);
  assert.deepEqual(turn.part.dir, [1, 0]);
  const turned = dropPart(m, liftPart(m, id), turn.part).result.parts[id];
  assert.deepEqual(turned.cells, slopeCells({ ...turned }));
  assert.equal(canTurn(box('plate', 0, 0, 0, 2, 2)), false);
  assert.equal(canTurn({ ...slope }), true);
});
