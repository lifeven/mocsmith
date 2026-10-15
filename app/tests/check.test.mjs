import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { check, FLAG_DETACHED, FLAG_FLOATING, FLAG_HANGING } from '../src/core/check.mjs';
import { fillBox, resultFrom } from './helpers.mjs';

test('two parts touching only at their sides are two groups', () => {
  const grid = new VoxelGrid(2, 1, 1);
  fillBox(grid, [0, 0, 0], [2, 1, 1], 1);
  const stats = check(grid, resultFrom(grid, [
    { x: 0, y: 0, z: 0, w: 1, d: 1 },
    { x: 1, y: 0, z: 0, w: 1, d: 1 },
  ]));
  assert.equal(stats.components, 2);
  assert.equal(stats.floatingParts, 0, 'both stand on the ground');
});

test('a part stacked on another joins its group', () => {
  const grid = new VoxelGrid(2, 2, 1);
  fillBox(grid, [0, 0, 0], [2, 1, 1], 1);
  fillBox(grid, [0, 1, 0], [1, 2, 1], 1);
  const stats = check(grid, resultFrom(grid, [
    { x: 0, y: 0, z: 0, w: 2, d: 1 },
    { x: 0, y: 1, z: 0, w: 1, d: 1 },
  ]));
  assert.equal(stats.components, 1);
  assert.equal(stats.detachedParts, 0);
  assert.equal(stats.hangingParts, 0);
});

test('a bridge on two parts joins them into one group', () => {
  const grid = new VoxelGrid(2, 2, 1);
  fillBox(grid, [0, 0, 0], [2, 2, 1], 1);
  const stats = check(grid, resultFrom(grid, [
    { x: 0, y: 0, z: 0, w: 1, d: 1 },
    { x: 1, y: 0, z: 0, w: 1, d: 1 },
    { x: 0, y: 1, z: 0, w: 2, d: 1 },
  ]));
  assert.equal(stats.components, 1);
  assert.equal(stats.interlockedShare, 1);
});

test('a part with a gap under it is floating, hanging and detached', () => {
  const grid = new VoxelGrid(1, 3, 1);
  grid.set(0, 0, 0, 1);
  grid.set(0, 2, 0, 1);
  const stats = check(grid, resultFrom(grid, [
    { x: 0, y: 0, z: 0, w: 1, d: 1 },
    { x: 0, y: 2, z: 0, w: 1, d: 1 },
  ]));
  assert.equal(stats.flags[0], 0);
  assert.equal(stats.flags[1], FLAG_FLOATING | FLAG_HANGING | FLAG_DETACHED);
  assert.equal(stats.floatingParts, 1);
});

test('the main body is the biggest grounded group; a loose grounded part is detached', () => {
  const grid = new VoxelGrid(4, 3, 1);
  fillBox(grid, [0, 0, 0], [2, 3, 1], 1);
  grid.set(3, 0, 0, 1);
  const stats = check(grid, resultFrom(grid, [
    { x: 0, y: 0, z: 0, w: 2, d: 1, h: 3, kind: 'brick' },
    { x: 3, y: 0, z: 0, w: 1, d: 1 },
  ]));
  assert.equal(stats.flags[0], 0);
  assert.equal(stats.flags[1], FLAG_DETACHED, 'on the ground but not part of the body');
});
