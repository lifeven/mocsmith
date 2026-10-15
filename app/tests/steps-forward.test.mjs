import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { chapterZones, planForward } from '../src/steps/forward.mjs';
import { scorePlan } from '../src/steps/metrics.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { boxesMesh, resultFrom } from './helpers.mjs';

/**
 * Side view (x across, y up), one stud deep:
 *
 *   y2  2 2..
 *   y1  1 3. 4     3 hangs under 2; 4 touches nothing
 *   y0  0...
 */
function hangingModel() {
  const grid = new VoxelGrid(4, 3, 1);
  return {
    grid,
    result: resultFrom(grid, [
      { x: 0, y: 0, z: 0, w: 1, d: 1 },
      { x: 0, y: 1, z: 0, w: 1, d: 1 },
      { x: 0, y: 2, z: 0, w: 2, d: 1 },
      { x: 1, y: 1, z: 0, w: 1, d: 1 },
      { x: 3, y: 1, z: 0, w: 1, d: 1 },
    ]),
  };
}

test('a hanging part comes after the part holding it and is pushed on from below', () => {
  const model = hangingModel();
  const steps = planForward(model);
  const stepOf = new Map(steps.flatMap((s, i) => s.ids.map((id) => [id, i])));
  assert.ok(stepOf.get(3) > stepOf.get(2));
  assert.equal(steps[stepOf.get(3)].fromBelow, true);
  assert.equal(steps[stepOf.get(4)].forced, 'loose'); // touches nothing
  const { summary } = scorePlan(model, steps);
  assert.equal(summary.floatingSteps, 0);
  assert.equal(summary.blocked, 0);
  assert.equal(summary.fromBelow, 1);
});

test('a step holds at most `cap` parts, all in one layer and put on the same way', () => {
  const grid = new VoxelGrid(10, 1, 1);
  const model = { grid, result: resultFrom(grid, Array.from({ length: 10 }, (_, x) => ({ x, y: 0, z: 0, w: 1, d: 1 }))) };
  const steps = planForward(model, { cap: 4, mirror: false });
  assert.deepEqual(steps.map((s) => s.ids.length), [4, 4, 2]);
  // grows along the row from the first part, nearest first
  assert.deepEqual(steps[0].ids, [0, 1, 2, 3]);
});

test('a step goes up to `rise` plates above its first part: a brick and the plate pressed on it', () => {
  const grid = new VoxelGrid(2, 5, 1);
  const model = {
    grid,
    result: resultFrom(grid, [
      { x: 0, y: 0, z: 0, w: 2, d: 1, h: 3, kind: 'brick' },
      { x: 0, y: 3, z: 0, w: 2, d: 1 },
      { x: 0, y: 4, z: 0, w: 1, d: 1 },
    ]),
  };
  assert.deepEqual(planForward(model, { rise: 0 }).map((s) => s.ids), [[0], [1], [2]]);
  assert.deepEqual(planForward(model, { rise: 3 }).map((s) => s.ids), [[0, 1], [2]]);
  assert.deepEqual(planForward(model).map((s) => s.ids), [[0, 1], [2]]); // default rise 3
});

test('mirror partners go on in the same step', () => {
  // Two mirrored columns, x 0 and x 4, two plates each.
  const grid = new VoxelGrid(5, 2, 1);
  const model = {
    grid,
    result: resultFrom(grid, [
      { x: 0, y: 0, z: 0, w: 1, d: 1 },
      { x: 4, y: 0, z: 0, w: 1, d: 1 },
      { x: 0, y: 1, z: 0, w: 1, d: 1 },
      { x: 4, y: 1, z: 0, w: 1, d: 1 },
    ]),
  };
  assert.deepEqual(planForward(model).map((s) => s.ids), [[0, 1, 2, 3]]);
  assert.deepEqual(planForward(model, { mirror: false }).map((s) => s.ids), [[0, 2], [1, 3]]);
  assert.deepEqual(planForward(model, { cap: 3 }).map((s) => s.ids), [[0, 1], [2, 3]]); // no room for the second pair: it waits
});

test('a growing step takes a part of a colour it already has before a nearer one', () => {
  // A (red) at x0 z0; B (blue) beside it at x1; C (red, 1 x 2) beside it at z1–2, a little farther.
  const grid = new VoxelGrid(2, 1, 3);
  const model = {
    grid,
    result: resultFrom(grid, [
      { x: 0, y: 0, z: 0, w: 1, d: 1, color: 1 },
      { x: 1, y: 0, z: 0, w: 1, d: 1, color: 2 },
      { x: 0, y: 0, z: 1, w: 1, d: 2, color: 1 },
    ]),
  };
  const opts = { cap: 2, mirror: false };
  assert.deepEqual(planForward(model, opts).map((s) => s.ids), [[0, 2], [1]]);
  assert.deepEqual(planForward(model, { ...opts, colour: false }).map((s) => s.ids), [[0, 1], [2]]);
  assert.equal(scorePlan(model, planForward(model, opts), { cap: 2 }).summary.coloursMean, 1);
});

test('chapter zones: foundation, then two halves per band; a support under the first half joins it', () => {
  const opts = { foundation: 6, band: 6, minParts: 0, mirrorShare: 0.05, chapterParts: 200 };
  const plate = (id, x, y, w = 1) => ({ id, x, y, z: 0, w, d: 1 });
  // Floor from x 0 to 10 (the cut is at x 5); S at x 6 holds T, which reaches from x 2 to 6 (centre 4.5).
  const parts = [plate(0, 0, 0, 5), plate(1, 5, 0, 5), plate(2, 1, 7), plate(3, 8, 7), plate(4, 6, 6), plate(5, 2, 7, 5)];
  const none = { axis: null, pairs: 0 };
  assert.deepEqual([...chapterZones(parts, none, opts)], [0, 0, 1, 2, 2, 1]);
  const above = parts.map(() => new Set());
  above[4].add(5);
  assert.deepEqual([...chapterZones(parts, none, opts, above)], [0, 0, 1, 2, 1, 1]); // S comes with T
  assert.deepEqual([...chapterZones(parts, none, { ...opts, minParts: 100 })], [0, 0, 1, 1, 1, 1]); // small: one chapter above the foundation
  // Mirror pairs across x: the cut runs along z instead, so each pair stays in one half.
  const zs = chapterZones(parts, { axis: 'x', pairs: 3 }, opts);
  assert.equal(zs[2], zs[3]);
});

test('chapters are numbered from 0 in build order, each with steps', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const steps = planForward(randomModel(seed));
    const chapters = steps.map((s) => s.chapter);
    assert.equal(chapters[0], 0);
    chapters.forEach((c, i) => i && assert.ok(c === chapters[i - 1] || c === chapters[i - 1] + 1, `seed ${seed}`));
  }
});

/** Small seeded random number generator (mulberry32). */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random pile of 1 × 1 / 1 × 2 / 2 × 2 plates and bricks, overhangs and loose bits included. */
function randomModel(seed) {
  const rnd = random(seed);
  const grid = new VoxelGrid(6, 7, 6);
  const used = new Uint8Array(grid.cells.length);
  const list = [];
  for (let tries = 0; tries < 120; tries++) {
    const w = 1 + Math.floor(rnd() * 2);
    const d = 1 + Math.floor(rnd() * 2);
    const h = rnd() < 0.3 ? 3 : 1;
    const x = Math.floor(rnd() * (7 - w));
    const z = Math.floor(rnd() * (7 - d));
    const y = Math.floor(rnd() * (8 - h));
    let free = true;
    for (let dy = 0; dy < h && free; dy++)
      for (let dz = 0; dz < d && free; dz++) for (let dx = 0; dx < w && free; dx++) free = !used[grid.index(x + dx, y + dy, z + dz)];
    if (!free) continue;
    for (let dy = 0; dy < h; dy++) for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) used[grid.index(x + dx, y + dy, z + dz)] = 1;
    list.push({ x, y, z, w, d, h, kind: h === 3 ? 'brick' : 'plate' });
  }
  return { grid, result: resultFrom(grid, list) };
}

test('on random piles: every part once, nothing shut in or floating unless the step says it was forced', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const model = randomModel(seed);
    const { parts } = model.result;
    const steps = planForward(model, { cap: 6 });
    assert.deepEqual(steps.flatMap((s) => s.ids).sort((a, b) => a - b), parts.map((p) => p.id), `seed ${seed}`);
    assert.deepEqual(planForward(model, { cap: 6 }), steps, `seed ${seed}: same steps every time`);
    const { perStep } = scorePlan(model, steps, { cap: 6 });
    steps.forEach((s, i) => {
      assert.ok(s.ids.length <= 6);
      const ys = s.ids.map((id) => parts[id].y);
      // Steps going on from below, and sub-assemblies (built turned over), count down from their layer.
      const down = s.fromBelow || s.sub !== undefined;
      const inReach = down ? ys.every((y) => y <= s.layer && y >= s.layer - 3) : ys.every((y) => y >= s.layer && y <= s.layer + 3);
      assert.ok(inReach, `seed ${seed} step ${i}: within 3 plates of its first part`);
      const sc = perStep[i];
      if (s.forced !== 'shutIn' && s.forced !== 'loose') assert.equal(sc.blocked, 0, `seed ${seed} step ${i}: shut in`);
      if (s.forced !== 'loose') assert.equal(sc.unattached, 0, `seed ${seed} step ${i}: touches nothing`);
      // A step pushed on from below has at least one such part (the others may hang under it); a pressed step none.
      // A sub-assembly hangs too once it is on, but it is built on its own, so it is not marked.
      assert.equal(sc.fromBelow > 0, !!s.fromBelow || s.sub !== undefined, `seed ${seed} step ${i}: from below`);
    });
    const loose = steps.filter((s) => s.forced === 'loose').length;
    if (!loose) assert.equal(perStep.reduce((t, s) => Math.max(t, s.floating), 0), 0, `seed ${seed}: floating`);
  }
});

test('a column of parts still to come is never closed off from both ends', () => {
  // A random 6 × 7 × 3 pile (seed 104462) on which a one-level check let a
  // part go on above an unplaced column whose bottom later got a part under
  // it: [x, y, z, w, d].
  const grid = new VoxelGrid(6, 7, 3);
  const list = [[2,5,1,1,2],[2,1,0,2,1],[3,4,1,3,1],[1,5,0,1,1],[3,5,1,3,2],[1,0,0,1,1],[0,5,1,2,2],[0,2,1,2,2],[3,4,2,3,1],[1,4,0,3,1],[2,2,1,1,2],[0,4,2,3,1],[3,6,1,1,1],[0,1,1,2,2],[0,3,2,1,1],[3,3,0,2,2],[4,3,2,1,1],[2,6,2,2,1],[0,6,0,3,2]]; // prettier-ignore
  const model = { grid, result: resultFrom(grid, list.map(([x, y, z, w, d]) => ({ x, y, z, w, d }))) };
  const steps = planForward(model);
  assert.ok(steps.every((s) => s.forced !== 'shutIn'));
  assert.equal(scorePlan(model, steps).summary.blocked, 0);
});

test('a built model: no step floats or shuts a part in, and steps stay within the cap', () => {
  const model = buildModel(
    boxesMesh([
      [[0, 0, 0], [1, 0.6, 0.5], [180, 0, 0]],
      [[0.2, 0.6, 0.1], [0.8, 0.9, 0.4], [244, 244, 244]],
    ]),
    { lengthStuds: 16 },
  );
  const steps = planForward(model, { cap: 6 });
  const { summary } = scorePlan(model, steps, { cap: 6 });
  assert.equal(summary.floatingSteps, 0);
  assert.equal(summary.blocked, 0);
  assert.equal(summary.unattached, 0);
  assert.equal(summary.overCap, 0);
  assert.ok(steps.every((s) => !s.forced));
});

test('a part does not go on over a step-mate whose top and visible sides the step would all hide', () => {
  // A 1×1 brick A walled in on the left, right and front by three bricks, all on the ground,
  // with a 1×1 plate on A. One step would take the four bricks and then the plate,
  // hiding A completely from the front views; the plate has to wait for the next step.
  const grid = new VoxelGrid(3, 4, 2);
  const brick = (x, z) => ({ x, y: 0, z, w: 1, d: 1, h: 3, kind: 'brick' });
  const model = { grid, result: resultFrom(grid, [brick(1, 0), brick(0, 0), brick(2, 0), brick(1, 1), { x: 1, y: 3, z: 0, w: 1, d: 1 }]) };
  const stepOf = (steps) => new Map(steps.flatMap((s, i) => s.ids.map((id) => [id, i])));
  const anySteps = planForward(model, { cover: 'any' });
  const any = stepOf(anySteps);
  assert.equal(any.get(4), any.get(0));
  assert.equal(scorePlan(model, anySteps).summary.covered, 1);
  const front = planForward(model);
  const at = stepOf(front);
  assert.ok(at.get(4) > at.get(0));
  assert.equal(scorePlan(model, front).summary.covered, 0);
  // The back side does not show in the build views, but `cover: 'sides'` counts it as open (it is outside the model).
  const sides = stepOf(planForward(model, { cover: 'sides' }));
  assert.equal(sides.get(4), sides.get(0));
});
