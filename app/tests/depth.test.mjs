import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPTH_SIDE, depthForGrid, inputSize, toInput } from '../src/mosaic/depth.mjs';

test('inputSize: longest side DEPTH_SIDE, both multiples of 14, aspect kept', () => {
  assert.deepEqual(inputSize(1024, 768), { w: 266, h: 196 });
  assert.deepEqual(inputSize(768, 1024), { w: 196, h: 266 });
  assert.deepEqual(inputSize(500, 500), { w: DEPTH_SIDE, h: DEPTH_SIDE });
  const { w, h } = inputSize(4000, 100);
  assert.equal(w % 14, 0);
  assert.equal(h, 14, 'never below one patch');
});

test('toInput: ImageNet normalisation, channels first, size iw × ih', () => {
  // 2 × 1 photo: a white pixel and a black one.
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const out = toInput(rgba, 2, 1, 2, 1);
  assert.equal(out.length, 6);
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
  close(out[0], (1 - 0.485) / 0.229); // R, white
  close(out[1], (0 - 0.485) / 0.229); // R, black
  close(out[4], (1 - 0.406) / 0.225); // B plane, white
  // Resizing a flat image keeps it flat.
  const flat = toInput(new Uint8ClampedArray(4 * 9).fill(128), 3, 3, 14, 14);
  assert.ok(flat.slice(0, 196).every((v) => Math.abs(v - flat[0]) < 1e-6));
});

test('depthForGrid: mean per cell over the crop, scaled 0…1 (1 = nearest)', () => {
  // A 4 × 2 depth map over a 40 × 20 photo: left half far (0), right half near (10).
  const depth = { data: new Float32Array([0, 0, 10, 10, 0, 0, 10, 10]), w: 4, h: 2 };
  const whole = depthForGrid(depth, { x: 0, y: 0, w: 40, h: 20 }, 40, 20, 2, 1);
  assert.deepEqual(Array.from(whole), [0, 1]);
  // A crop of the right half only is flat: scaled to 0 everywhere, no NaN.
  const right = depthForGrid(depth, { x: 20, y: 0, w: 20, h: 20 }, 40, 20, 2, 2);
  assert.ok(Array.from(right).every((v) => v === 0));
  // 4 cells across a 4-wide map: each cell one column.
  const four = depthForGrid({ data: new Float32Array([0, 1, 2, 3]), w: 4, h: 1 }, { x: 0, y: 0, w: 8, h: 2 }, 8, 2, 4, 1);
  assert.deepEqual(Array.from(four).map((v) => +v.toFixed(3)), [0, 0.333, 0.667, 1]);
});
