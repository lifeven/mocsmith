import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { planForward } from '../src/steps/forward.mjs';
import { gatherSubAssemblies } from '../src/steps/subs.mjs';
import { scorePlan } from '../src/steps/metrics.mjs';
import { resultFrom } from './helpers.mjs';

/**
 * A mushroom, side view, one stud deep: a stem of four plates at x 2, a cap
 * plate across x 0–4 on top with a post of five plates on it (too tall for
 * one step), and under each end of the cap a column of three hanging plates
 * (nothing under them down to the floor).
 *
 *   y5–9.. T..
 *   y4  C C C C C
 *   y3  L. S. R
 *   y2  L. S. R
 *   y1  L. S. R
 *   y0.. S..
 */
function mushroom() {
  const grid = new VoxelGrid(5, 10, 1);
  const p = (x, y, w = 1) => ({ x, y, z: 0, w, d: 1 });
  const list = [p(2, 0), p(2, 1), p(2, 2), p(2, 3), p(0, 4, 5), p(0, 3), p(0, 2), p(0, 1), p(4, 3), p(4, 2), p(4, 1), ...[5, 6, 7, 8, 9].map((y) => p(2, y))];
  return { grid, result: resultFrom(grid, list) };
}

test('each hanging column under the cap becomes a sub-assembly, built in one block after the cap and attached before the top', () => {
  const model = mushroom();
  const steps = planForward(model);
  const subs = [...new Set(steps.filter((s) => s.sub !== undefined).map((s) => s.sub))];
  assert.deepEqual(subs, [0, 1]);
  const stepOf = new Map(steps.flatMap((s, i) => s.ids.map((id) => [id, i])));
  // Both columns come after the cap, each in its own contiguous run of steps, top part first.
  for (const column of [[5, 6, 7], [8, 9, 10]]) {
    const at = column.map((id) => stepOf.get(id));
    assert.ok(at.every((i) => i > stepOf.get(4)));
    assert.equal(new Set(at.map((i) => steps[i].sub)).size, 1);
    assert.deepEqual([...at].sort((a, b) => a - b), at);
  }
  // The top of the post stays in the main build, after both blocks: that is where they go on.
  assert.equal(steps[stepOf.get(15)].sub, undefined);
  assert.ok(Math.max(...[5, 6, 7, 8, 9, 10].map((id) => stepOf.get(id))) < stepOf.get(15));
  const { summary } = scorePlan(model, steps);
  assert.equal(summary.floatingSteps, 0);
  assert.equal(summary.blocked, 0);
  // Without sub-assemblies the columns are pushed on from below part by part.
  assert.ok(planForward(model, { subs: false }).every((s) => s.sub === undefined));
});

test('a cluster that something else is pressed onto before it is finished stays in the main build', () => {
  // Part 0 holds a column 1-2-3 hanging under it; part 4 is pressed onto part 1.
  const parts = [5, 4, 3, 2, 5].map((y, id) => ({ id, y }));
  const sets = (pairs) => {
    const out = parts.map(() => new Set());
    for (const [a, b] of pairs) out[a].add(b);
    return out;
  };
  const c = { above: sets([[1, 0], [1, 4], [2, 1], [3, 2]]), below: sets([[0, 1], [4, 1], [1, 2], [2, 3]]) };
  const later = [{ ids: [0] }, { ids: [1], fromBelow: true }, { ids: [2], fromBelow: true }, { ids: [3], fromBelow: true }, { ids: [4] }];
  const moved = gatherSubAssemblies({ parts }, c, later);
  assert.deepEqual(moved.map((s) => s.ids), [[0], [1, 2, 3], [4]]);
  assert.equal(moved[1].sub, 0);
  const between = [{ ids: [0] }, { ids: [1], fromBelow: true }, { ids: [4] }, { ids: [2], fromBelow: true }, { ids: [3], fromBelow: true }];
  assert.equal(gatherSubAssemblies({ parts }, c, between), between);
});

test('a cluster with no main step after it stays in the main build (nowhere to attach it)', () => {
  const parts = [5, 4, 3, 2].map((y, id) => ({ id, y }));
  const sets = (pairs) => {
    const out = parts.map(() => new Set());
    for (const [a, b] of pairs) out[a].add(b);
    return out;
  };
  const c = { above: sets([[1, 0], [2, 1], [3, 2]]), below: sets([[0, 1], [1, 2], [2, 3]]) };
  const steps = [{ ids: [0] }, { ids: [1], fromBelow: true }, { ids: [2], fromBelow: true }, { ids: [3], fromBelow: true }];
  assert.equal(gatherSubAssemblies({ parts }, c, steps), steps);
});

test('a cluster that something is pressed onto part-way is cut there into two sub-assemblies', () => {
  // Part 0 holds a column 1-2-3; part 4 is pressed onto 1; then 5-6-7 hang on under 3; part 8 ends the build.
  const parts = [9, 8, 7, 6, 9, 5, 4, 3, 9].map((y, id) => ({ id, y }));
  const sets = (pairs) => {
    const out = parts.map(() => new Set());
    for (const [a, b] of pairs) out[a].add(b);
    return out;
  };
  const pairs = [[1, 0], [1, 4], [2, 1], [3, 2], [5, 3], [6, 5], [7, 6]]; // [lower, upper]
  const c = { above: sets(pairs), below: sets(pairs.map(([a, b]) => [b, a])) };
  const fb = (id) => ({ ids: [id], fromBelow: true });
  const steps = [{ ids: [0] }, fb(1), fb(2), fb(3), { ids: [4] }, fb(5), fb(6), fb(7), { ids: [8] }];
  const out = gatherSubAssemblies({ parts }, c, steps);
  assert.deepEqual(out.map((s) => [s.ids, s.sub]), [[[0], undefined], [[1, 2, 3], 0], [[4], undefined], [[5, 6, 7], 1], [[8], undefined]]);
});
