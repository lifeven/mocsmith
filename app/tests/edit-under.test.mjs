import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importedModel } from '../src/io/ldr-import.mjs';
import { addPart, canPlace, placeUnder, snapUnder } from '../src/core/edit.mjs';
import { cellValue } from '../src/core/palette.mjs';

const W = cellValue(15);
const box = (kind, x, y, z, w, d) => ({ kind, x, y, z, w, d, h: kind === 'brick' ? 3 : 1, color: W });
const plate = (w, d) => ({ kind: 'plate', w, d, color: W });

/** A 2 × 2 brick with a 6 × 2 plate on top reaching out along x (overhang x 2–5, one plate above the brick's top). */
function ledge() {
  const { model } = importedModel({ parts: [box('brick', 0, 0, 0, 2, 2), box('plate', 0, 3, 0, 6, 2)], skipped: {} });
  return { model, top: model.result.parts.find((p) => p.kind === 'plate').id };
}

test('a part hung under a part sits right below its bottom and is held by its studs', () => {
  const { model, top } = ledge();
  const under = placeUnder(model, top, [4, 0], plate(2, 2));
  assert.deepEqual([under.x, under.y, under.z, under.h], [4, 2, 0, 1]);
  assert.deepEqual(canPlace(model, under), { ok: true });
  const added = addPart(model, under);
  assert.equal(added.stats.detachedParts, 0);
  // A brick hung there reaches the ground: three plates tall, so its bottom is at y = 0.
  assert.equal(placeUnder(model, top, [4, 0], { kind: 'brick', w: 2, d: 2, color: W }).y, 0);
});

test('hanging next to a wall slides away from it, still under the pointed stud', () => {
  const { model, top } = ledge();
  // A 4 × 2 plate centred under stud (2, 0) covers x 1–4 and runs into the brick.
  assert.equal(canPlace(model, placeUnder(model, top, [2, 0], plate(4, 2))).reason, 'overlap');
  const snap = snapUnder(model, top, [2, 0], plate(4, 2));
  assert.equal(snap.ok, true);
  assert.deepEqual([snap.part.x, snap.part.y], [2, 2]);
});

test('nothing hangs below the ground or under an inverted slope\'s sloped face', () => {
  const { model } = ledge();
  const brick = model.result.parts.find((p) => p.kind === 'brick').id;
  assert.equal(canPlace(model, placeUnder(model, brick, [0, 0], plate(1, 1))).reason, 'outside');

  // An inverted 45° 2 × 2 slope hung under the overhang, sloped rows towards +x (x 5).
  const inv = { kind: 'inverted', ldraw: '3660b', slope: 'inverted_45_2x2', studs: 1, dir: [1, 0], x: 4, y: 0, z: 0, w: 2, d: 2, h: 3, color: W };
  const withSlope = addPart(model, inv);
  const slopeId = withSlope.result.parts.findIndex((p) => p.kind === 'inverted');
  // Under its straight row (x 4) a plate hangs; under the sloped row (x 5) the face cuts the cells away.
  const straight = snapUnder(withSlope, slopeId, [4, 0], plate(1, 1));
  assert.equal(straight.part.y, -1); // the slope stands on the ground: below it is outside
  assert.equal(straight.ok, false);
  const sloped = placeUnder(withSlope, slopeId, [5, 0], plate(1, 1));
  assert.equal(canPlace(withSlope, sloped).reason, 'overlap');
});
