import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAISE_PLATES, depthLevels, raisePlates, smoothLevels } from '../src/mosaic/relief.mjs';

test('depthLevels splits where the depths split, near = high', () => {
  // Far background around 0.1, a near subject around 0.9, a few mid cells.
  const depth = new Float32Array([0.05, 0.1, 0.12, 0.08, 0.5, 0.55, 0.9, 0.95, 0.88]);
  assert.deepEqual(Array.from(depthLevels(depth, 3)), [0, 0, 0, 0, 1, 1, 2, 2, 2]);
  assert.deepEqual(Array.from(depthLevels(depth, 2)), [0, 0, 0, 0, 1, 1, 1, 1, 1]);
  // A flat picture stays one level.
  assert.ok(depthLevels(new Float32Array(16), 3).every((v) => v === depthLevels(new Float32Array(16), 3)[0]));
});

test('smoothLevels removes a lone speck and keeps a real shape', () => {
  const gw = 7;
  const gh = 7;
  const levels = new Uint8Array(gw * gh);
  levels[3 * gw + 1] = 2; // a speck
  for (let y = 2; y <= 4; y++) for (let x = 3; x <= 5; x++) levels[y * gw + x] = 1; // a 3 × 3 block
  const out = smoothLevels(levels, gw, gh);
  assert.equal(out[3 * gw + 1], 0, 'speck gone');
  assert.equal(out[3 * gw + 4], 1, 'middle of the block kept');
});

/** Check a plate layout: every raised cell covered exactly once per layer, nothing else, no plate across a base seam. */
function checkPlates(levels, gw, gh, side, plates) {
  const per = new Map();
  for (const p of plates) {
    assert.ok(RAISE_PLATES.some(([a, b, part]) => part === p.part && ((a === p.w && b === p.h) || (a === p.h && b === p.w))), `size ${p.w}x${p.h} matches ${p.part}`);
    assert.equal(Math.floor(p.x / side), Math.floor((p.x + p.w - 1) / side), 'no seam across x');
    assert.equal(Math.floor(p.y / side), Math.floor((p.y + p.h - 1) / side), 'no seam across y');
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        assert.ok(levels[y * gw + x] > p.z, `cell ${x},${y} is raised above layer ${p.z}`);
        const key = `${x},${y},${p.z}`;
        assert.ok(!per.has(key), `cell ${key} covered once`);
        per.set(key, 1);
      }
    }
  }
  let want = 0;
  for (const v of levels) want += v;
  assert.equal(per.size, want, 'every raised cell is lifted by its full height');
}

test('raisePlates covers each level exactly, stays inside base blocks, uses big plates', () => {
  const gw = 32;
  const gh = 24;
  const side = 16;
  const levels = new Uint8Array(gw * gh);
  // A near 20 × 12 block across the vertical seam at x = 16, with a nearer 6 × 4 inside it.
  for (let y = 6; y < 18; y++) for (let x = 6; x < 26; x++) levels[y * gw + x] = 1;
  for (let y = 9; y < 13; y++) for (let x = 13; x < 19; x++) levels[y * gw + x] = 2;
  const { plates, counts } = raisePlates(levels, gw, gh, side);
  checkPlates(levels, gw, gh, side, plates);
  assert.ok(plates.some((p) => p.z === 1), 'second layer present');
  // 240 + 24 cells; mostly 4 × 8 / 4 × 6 plates, far fewer pieces than cells.
  assert.ok(plates.length < 40, `${plates.length} plates`);
  assert.ok((counts.get('3035') ?? 0) + (counts.get('3032') ?? 0) > 0);
});

test('raisePlates on random levels is always a valid cover', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let t = 0; t < 30; t++) {
    const gw = 16 + Math.floor(rand() * 33);
    const gh = 16 + Math.floor(rand() * 17);
    const levels = new Uint8Array(gw * gh).map(() => Math.floor(rand() * 3));
    const { plates } = raisePlates(levels, gw, gh, 16);
    checkPlates(levels, gw, gh, 16, plates);
  }
});
