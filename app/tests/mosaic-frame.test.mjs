import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragFrame, hitFrame, isWhole, MIN_FRAME, nudgeFrame } from '../src/ui/mosaic/frame.mjs';

// A 1000 × 600 photo with a frame in the middle.
const W = 1000;
const H = 600;
const r = { x: 200, y: 100, w: 400, h: 300 };

test('hitFrame: corners within the grab distance, inside moves, outside draws new', () => {
  assert.equal(hitFrame(r, { x: 205, y: 95 }, 20), 'nw');
  assert.equal(hitFrame(r, { x: 600, y: 400 }, 20), 'se');
  assert.equal(hitFrame(r, { x: 590, y: 110 }, 20), 'ne');
  assert.equal(hitFrame(r, { x: 400, y: 250 }, 20), 'move');
  assert.equal(hitFrame(r, { x: 900, y: 500 }, 20), 'new');
  // A small frame: the nearest corner wins, not the first one listed.
  assert.equal(hitFrame({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9 }, 20), 'se');
});

test('dragFrame: moving keeps the size and stays inside the photo', () => {
  const moved = dragFrame({ mode: 'move', from: r, start: { x: 400, y: 250 } }, { x: 1400, y: -100 }, W, H);
  assert.deepEqual(moved, { x: 600, y: 0, w: 400, h: 300 });
});

test('dragFrame: a corner resizes around the opposite one, and can cross it', () => {
  assert.deepEqual(dragFrame({ mode: 'se', from: r, start: { x: 600, y: 400 } }, { x: 700, y: 500 }, W, H), { x: 200, y: 100, w: 500, h: 400 });
  assert.deepEqual(dragFrame({ mode: 'nw', from: r, start: { x: 200, y: 100 } }, { x: -50, y: 0 }, W, H), { x: 0, y: 0, w: 600, h: 400 });
  // Dragging the north-west corner past the south-east one flips the frame.
  assert.deepEqual(dragFrame({ mode: 'nw', from: r, start: { x: 200, y: 100 } }, { x: 800, y: 550 }, W, H), { x: 600, y: 400, w: 200, h: 150 });
});

test('dragFrame: never smaller than MIN_FRAME of the shorter side', () => {
  const min = MIN_FRAME * H;
  const tiny = dragFrame({ mode: 'new', from: r, start: { x: 500, y: 300 } }, { x: 505, y: 302 }, W, H);
  assert.equal(tiny.w, min);
  assert.equal(tiny.h, min);
  // Near the edge the minimum frame still fits inside the photo.
  const edge = dragFrame({ mode: 'new', from: r, start: { x: 995, y: 595 } }, { x: 999, y: 599 }, W, H);
  assert.deepEqual(edge, { x: W - min, y: H - min, w: min, h: min });
});

test('nudgeFrame: arrows move, Shift + arrows resize, other keys do nothing', () => {
  const step = 0.02 * W;
  assert.deepEqual(nudgeFrame(r, 'ArrowRight', false, W, H), { ...r, x: r.x + step });
  assert.deepEqual(nudgeFrame(r, 'ArrowUp', true, W, H), { ...r, h: r.h - step });
  assert.deepEqual(nudgeFrame({ ...r, x: 590 }, 'ArrowRight', false, W, H), { ...r, x: 600 });
  assert.equal(nudgeFrame(r, 'a', false, W, H), null);
});

test('isWhole: only a frame covering the whole photo', () => {
  assert.ok(isWhole({ x: 0, y: 0, w: W, h: H }, W, H));
  assert.ok(!isWhole(r, W, H));
});
