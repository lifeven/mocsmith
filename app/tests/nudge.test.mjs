import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridStep } from '../src/render/camera.mjs';

test('arrow keys move along the grid axis nearest to the screen direction', () => {
  // Looking along −z (screen up = −z, screen right = +x).
  const away = [0, -1];
  assert.deepEqual(gridStep('up', away), [0, -1]);
  assert.deepEqual(gridStep('down', away), [0, 1]);
  assert.deepEqual(gridStep('right', away), [1, 0]);
  assert.deepEqual(gridStep('left', away), [-1, 0]);
});

test('from the default camera (front right, looking towards −x −z) each arrow picks the nearer axis', () => {
  // Screen up on the ground is mostly −z with some −x.
  const away = [-0.5, -0.9];
  assert.deepEqual(gridStep('up', away), [0, -1]);
  assert.deepEqual(gridStep('right', away), [1, 0]);
  // Turned past 45°, the same key switches axis.
  assert.deepEqual(gridStep('up', [-0.9, -0.5]), [-1, 0]);
  assert.deepEqual(gridStep('right', [-0.9, -0.5]), [0, -1]);
});
