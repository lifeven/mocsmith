import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { mirrorPartners, scorePlan } from '../src/steps/metrics.mjs';
import { PLANNERS } from '../src/steps/plan.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { boxesMesh, resultFrom } from './helpers.mjs';

/**
 * Side view (x across, y up), one stud deep:
 *
 *   y2  2 2..
 *   y1  1 3. 4     3 hangs under 2; 4 touches nothing
 *   y0  0...
 */
const grid = new VoxelGrid(4, 3, 1);
const model = {
  grid,
  result: resultFrom(grid, [
    { x: 0, y: 0, z: 0, w: 1, d: 1 },
    { x: 0, y: 1, z: 0, w: 1, d: 1 },
    { x: 0, y: 2, z: 0, w: 2, d: 1 },
    { x: 1, y: 1, z: 0, w: 1, d: 1 },
    { x: 3, y: 1, z: 0, w: 1, d: 1 },
  ]),
};
const steps = (...lists) => lists.map((ids) => ({ ids }));

test('a hanging part placed before the part holding it floats until that part comes', () => {
  const { perStep, summary } = scorePlan(model, steps([0], [1, 3], [2], [4]));
  assert.deepEqual(perStep.map((s) => s.floating), [0, 1, 0, 0]);
  assert.equal(summary.floatingSteps, 1);
  assert.equal(summary.floatingMax, 1);
  assert.equal(perStep[1].unattached, 1);
  assert.equal(summary.blocked, 0);
});

test('placed after its holder, the hanging part goes on from below; a part that never reaches the ground does not count as floating', () => {
  const { perStep, summary } = scorePlan(model, steps([0], [1], [2], [3], [4]));
  assert.equal(summary.floatingSteps, 0);
  assert.equal(summary.neverGrounded, 1);
  assert.equal(perStep[3].fromBelow, 1);
  assert.equal(perStep[3].unattached, 0);
  assert.equal(summary.fromBelow, 1);
  assert.equal(summary.unattached, 1); // part 4
  assert.equal(summary.blocked, 0);
});

test('a part with an earlier part above and below it cannot be put in', () => {
  const { perStep, summary } = scorePlan(model, steps([0], [2], [1], [3], [4]));
  assert.equal(perStep[2].blocked, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(perStep[1].unattached, 1); // the bar before anything holds it up
});

test('a ground part under an earlier part is blocked too', () => {
  const g = new VoxelGrid(1, 2, 1);
  const m = { grid: g, result: resultFrom(g, [{ x: 0, y: 0, z: 0, w: 1, d: 1 }, { x: 0, y: 1, z: 0, w: 1, d: 1 }]) };
  assert.equal(scorePlan(m, steps([1], [0])).summary.blocked, 1);
  assert.equal(scorePlan(m, steps([0], [1])).summary.blocked, 0);
});

test('patches, spread and step sizes', () => {
  const g = new VoxelGrid(5, 1, 1);
  const m = {
    grid: g,
    result: resultFrom(g, [{ x: 0, y: 0, z: 0, w: 1, d: 1 }, { x: 1, y: 0, z: 0, w: 1, d: 1 }, { x: 4, y: 0, z: 0, w: 1, d: 1 }]),
  };
  const one = scorePlan(m, steps([0, 1, 2]), { cap: 2 });
  assert.equal(one.perStep[0].patches, 2);
  assert.equal(one.perStep[0].spread, 1);
  assert.equal(one.summary.overCap, 1);
  const two = scorePlan(m, steps([0, 1], [2]), { cap: 2 });
  assert.deepEqual(two.perStep.map((s) => s.patches), [1, 1]);
  assert.ok(two.perStep[0].spread < 1);
  assert.deepEqual([two.summary.sizeMax, two.summary.sizeMean, two.summary.sizeMedian, two.summary.overCap], [2, 1.5, 1, 0]);
});

test('mirror partners: same part across the middle, the middle part has none; S6 shares', () => {
  const g = new VoxelGrid(5, 1, 1);
  const list = [0, 1, 2, 3, 4].map((x) => ({ x, y: 0, z: 0, w: 1, d: 1, color: x === 3 ? 2 : 1 }));
  const m = { grid: g, result: resultFrom(g, list) };
  assert.deepEqual([...mirrorPartners(m.result.parts)], [4, -1, -1, -1, 0]);
  const together = scorePlan(m, steps([0, 4], [1, 2, 3])).summary;
  assert.deepEqual([together.mirrorPairs, together.mirrorSame, together.mirrorClose], [1, 1, 1]);
  const apart = scorePlan(m, steps([0], [1], [2], [4], [3])).summary;
  assert.deepEqual([apart.mirrorSame, apart.mirrorClose], [0, 0]);
});

test('layer steps never block a part: everything above a part starts in a later layer', () => {
  const built = buildModel(
    boxesMesh([
      [[0, 0, 0], [1, 0.6, 0.5], [180, 0, 0]],
      [[0.2, 0.6, 0.1], [0.8, 0.9, 0.4], [244, 244, 244]],
    ]),
    { lengthStuds: 16 },
  );
  const { perStep, summary } = scorePlan(built, PLANNERS.layers(built, {}));
  assert.equal(summary.blocked, 0);
  assert.equal(perStep.reduce((t, s) => t + s.size, 0), built.result.parts.length);
});
