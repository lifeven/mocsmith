import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout, seamStats } from '../src/convert/layout.mjs';
import { check } from '../src/core/check.mjs';
import { BRICKS, PLATES } from '../src/core/parts.mjs';
import { assertTiling, fillBox } from './helpers.mjs';

const isKnownPart = (p) =>
  (p.kind === 'brick' ? BRICKS : PLATES).some(
    (s) => s.h === p.h && ((s.w === p.w && s.d === p.d) || (s.w === p.d && s.d === p.w)),
  );

test('a solid one-colour block becomes bricks only and is tiled exactly', () => {
  const grid = new VoxelGrid(6, 6, 4);
  fillBox(grid, [0, 0, 0], [6, 6, 4], 1);
  const result = layout(grid);
  assertTiling(grid, result);
  assert.ok(result.parts.every((p) => p.kind === 'brick'));
  assert.ok(result.parts.every(isKnownPart));
});

test('a colour change inside a 3-plate band is covered with plates', () => {
  const grid = new VoxelGrid(2, 3, 2);
  fillBox(grid, [0, 0, 0], [2, 1, 2], 1);
  fillBox(grid, [0, 1, 0], [2, 3, 2], 2);
  const result = layout(grid);
  assertTiling(grid, result);
  assert.ok(result.parts.every((p) => p.kind === 'plate'));
  for (const p of result.parts) assert.equal(grid.get(p.x, p.y, p.z), p.color);
});

test('seams are staggered: most parts above the ground sit on two or more parts', () => {
  const grid = new VoxelGrid(8, 9, 8);
  fillBox(grid, [0, 0, 0], [8, 9, 8], 1);
  const result = layout(grid);
  const stats = check(grid, result);
  assert.equal(stats.components, 1, 'a solid block must hold together');
  assert.ok(stats.interlockedShare > 0.5, `interlocked ${stats.interlockedShare}`);
});

test('every part uses one colour and a footprint from the part set', () => {
  const grid = new VoxelGrid(7, 5, 5);
  fillBox(grid, [0, 0, 0], [7, 5, 5], 1);
  fillBox(grid, [2, 0, 1], [5, 4, 4], 3);
  const result = layout(grid);
  assertTiling(grid, result);
  for (const p of result.parts) {
    assert.ok(isKnownPart(p), `${p.kind} ${p.w}x${p.d}x${p.h}`);
    for (let y = p.y; y < p.y + p.h; y++)
      for (let z = p.z; z < p.z + p.d; z++)
        for (let x = p.x; x < p.x + p.w; x++) assert.equal(grid.get(x, y, z), p.color);
  }
});

test('layout is deterministic', () => {
  const grid = new VoxelGrid(9, 7, 5);
  fillBox(grid, [0, 0, 0], [9, 4, 5], 1);
  fillBox(grid, [2, 4, 1], [7, 7, 4], 2);
  assert.deepEqual(layout(grid).parts, layout(grid).parts);
});

test('a solid 6x6x4 block holds together straight from layout: no column stacked straight up', () => {
  const grid = new VoxelGrid(6, 6, 4);
  fillBox(grid, [0, 0, 0], [6, 6, 4], 1);
  // Without the stacking penalty the second band repeats the first one exactly.
  const aligned = layout(grid, { stackPenalty: 0 });
  assert.equal(check(grid, aligned).components, 2);
  assert.equal(seamStats(grid, aligned).stacked, 1);
  const staggered = layout(grid);
  assert.equal(check(grid, staggered).components, 1);
  assert.deepEqual(seamStats(grid, staggered), { above: 3, bridging: 1, stacked: 0 });
  assertTiling(grid, staggered);
});
