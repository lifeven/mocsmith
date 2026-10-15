import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLANNER, EMPTY_PLAN, PLANNERS, planBuild, lastStepUpTo } from '../src/steps/plan.mjs';
import { createPlayer } from '../src/steps/player.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { boxesMesh } from './helpers.mjs';

const model = buildModel(
  boxesMesh([
    [[0, 0, 0], [1, 0.6, 0.5], [180, 0, 0]],
    [[0.2, 0.6, 0.1], [0.8, 0.9, 0.4], [244, 244, 244]],
  ]),
  { lengthStuds: 16 },
);
const ids = model.result.parts.map((p) => p.id);

// Every planner in the table: the contract the consumers rely on.
for (const name of Object.keys(PLANNERS)) {
  test(`planner ${name}: every part exactly once, no empty step, same plan every time`, () => {
    const plan = planBuild(model, { planner: name });
    assert.equal(plan.planner, name);
    const placed = plan.steps.flatMap((s) => s.ids).sort((a, b) => a - b);
    assert.deepEqual(placed, ids);
    assert.ok(plan.steps.every((s) => s.ids.length > 0));
    plan.steps.forEach((s, i) => s.ids.forEach((id) => assert.equal(plan.stepOf[id], i)));
    assert.deepEqual(PLANNERS[name](model, {}), plan.steps);
  });
}

test('plans are cached per model and options; unknown planners are refused', () => {
  assert.equal(planBuild(model), planBuild(model));
  assert.equal(planBuild(model).planner, DEFAULT_PLANNER);
  assert.equal(DEFAULT_PLANNER, 'forward');
  assert.throws(() => planBuild(model, { planner: 'nope' }), /unknown planner/);
});

test('lastStepUpTo is the last step placing a part at or below a height', () => {
  const parts = model.result.parts;
  const top = Math.max(...parts.map((p) => p.y));
  for (const planner of Object.keys(PLANNERS)) {
    const plan = planBuild(model, { planner });
    assert.equal(lastStepUpTo(plan, parts, top), plan.steps.length - 1);
    const ground = Math.max(...parts.filter((p) => p.y === 0).map((p) => plan.stepOf[p.id]));
    assert.equal(lastStepUpTo(plan, parts, 0), ground);
    assert.equal(lastStepUpTo(plan, parts, -1), -1);
  }
  assert.equal(lastStepUpTo(planBuild(model, { planner: 'layers' }), parts, 0), 0);
});

/** Fake timer: `run()` fires the pending callback. */
function fakeTimer() {
  let pending = null;
  return {
    setTimer: (fn) => (pending = fn),
    clearTimer: () => (pending = null),
    run: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    get pending() {
      return pending !== null;
    },
  };
}

test('player steps, clamps and reports changes once', () => {
  const plan = planBuild(model);
  const seen = [];
  const p = createPlayer(plan, { onChange: (i) => seen.push(i) });
  assert.equal(p.index, 0);
  assert.equal(p.count, plan.steps.length);
  assert.ok(p.atStart);
  p.prev();
  p.next();
  p.goTo(999);
  p.goTo(999);
  assert.equal(p.index, plan.steps.length - 1);
  assert.ok(p.atEnd);
  assert.deepEqual(seen, [1, plan.steps.length - 1]);
  const v = p.view();
  assert.equal(v.step, plan.steps.at(-1));
  assert.equal(v.stepOf, plan.stepOf);
});

test('player plays to the end, loops when asked, and stops on pause or a new plan', () => {
  const plan = planBuild(model);
  const n = plan.steps.length;
  assert.ok(n >= 3);
  const timer = fakeTimer();
  const p = createPlayer(plan, timer);
  p.play();
  for (let i = 0; i < n + 2; i++) timer.run();
  assert.equal(p.index, n - 1);
  assert.equal(p.playing, false);

  p.play({ loop: true }); // from the end: starts over
  assert.equal(p.index, 0);
  for (let i = 0; i < n; i++) timer.run();
  assert.equal(p.index, 0);
  assert.ok(p.playing);
  p.pause();
  assert.equal(p.playing, false);
  assert.equal(timer.pending, false);

  p.goTo(n - 1);
  p.play({ loop: true });
  p.setPlan(plan, { keepIndex: true });
  assert.equal(p.playing, false);
  p.goTo(2);
  p.setPlan(EMPTY_PLAN, { keepIndex: true });
  assert.equal(p.index, 0);
  assert.equal(p.step, null);
  p.play();
  assert.equal(p.playing, false);
});
