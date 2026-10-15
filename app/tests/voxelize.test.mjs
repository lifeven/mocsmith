import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voxelizeColoured } from '../src/convert/voxelize.mjs';
import { nearestCell } from '../src/core/palette.mjs';
import { STUD_TO_PLATE } from '../src/core/parts.mjs';
import { boxMesh, boxesMesh } from './helpers.mjs';

const RED = [180, 0, 0];
const WHITE = [244, 244, 244];

test('a unit cube at 4 studs fills a 4 × 10 × 4 core plus its surface cells', () => {
  const grid = voxelizeColoured(boxMesh([0, 0, 0], [1, 1, 1], RED), 4, nearestCell);
  assert.deepEqual([grid.sx, grid.sy, grid.sz], [5, 4 * STUD_TO_PLATE + 1, 5]);
  const n = grid.filledCount();
  assert.ok(n >= 4 * 10 * 4, `filled ${n}`);
  assert.ok(n <= 5 * 11 * 5, `filled ${n}`);
  const red = nearestCell(...RED);
  for (const v of grid.cells) assert.ok(v === 0 || v === red);
});

test('the cube is solid: its centre column is filled bottom to top', () => {
  const grid = voxelizeColoured(boxMesh([0, 0, 0], [1, 1, 1], RED), 4, nearestCell);
  for (let y = 0; y < 10; y++) assert.ok(grid.get(2, y, 2), `y=${y}`);
});

test('a thin open surface still leaves one layer of cells', () => {
  // A single horizontal quad: no inside, but the surface cells must survive (legs, ears).
  const mesh = boxMesh([0, 0, 0], [1, 1, 1], RED);
  const quad = { positions: mesh.positions, indices: mesh.indices.slice(12, 18), colourAt: mesh.colourAt };
  const grid = voxelizeColoured(quad, 4, nearestCell);
  assert.ok(grid.filledCount() > 0);
});

test('each surface cell takes the colour of the part it lies on', () => {
  // Red block with a white block on top, like a body and a head.
  const mesh = boxesMesh([
    [[0, 0, 0], [1, 0.5, 1], RED],
    [[0, 0.5, 0], [1, 1, 1], WHITE],
  ]);
  const grid = voxelizeColoured(mesh, 4, nearestCell);
  assert.equal(grid.get(2, 0, 2), nearestCell(...RED));
  assert.equal(grid.get(2, grid.sy - 2, 2), nearestCell(...WHITE));
});

test('voxelizing is deterministic', () => {
  const mesh = boxMesh([0, 0, 0], [2, 1, 1], RED);
  const a = voxelizeColoured(mesh, 12, nearestCell);
  const b = voxelizeColoured(mesh, 12, nearestCell);
  assert.deepEqual(a.cells, b.cells);
});
