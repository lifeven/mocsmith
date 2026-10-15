import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout } from '../src/convert/layout.mjs';
import { check } from '../src/core/check.mjs';
import { repair } from '../src/convert/repair.mjs';
import { applySlopes } from '../src/convert/slopes.mjs';
import { SLOPES } from '../src/core/parts.mjs';
import { applyTiles } from '../src/convert/tiles.mjs';
import { assertTiling, fillBox } from './helpers.mjs';

/** Brick-tall step down to a one-plate ledge: exactly a 45° slope's profile. */
function step(width, ledge = 1) {
  const grid = new VoxelGrid(1 + ledge, 3, width);
  fillBox(grid, [0, 0, 0], [1, 3, width], 1);
  fillBox(grid, [1, 0, 0], [1 + ledge, 1, width], 1);
  return grid;
}

test('a one-brick step to a one-plate ledge becomes one 2×2 slope (3039)', () => {
  const grid = step(2);
  const result = layout(grid);
  const placed = applySlopes(grid, result);
  assert.equal(placed, 1);
  const slope = result.parts.find((p) => p.kind === 'slope');
  assert.equal(SLOPES.find((s) => s.key === slope.slope)?.ldraw ?? slope.ldraw, '3039');
  assertTiling(grid, result);
});

test('slopes never change the filled cells or add loose parts', () => {
  // A stepped roof: every brick step down has a one-plate ledge in front.
  const grid = new VoxelGrid(8, 12, 4);
  for (let x = 0; x < 8; x++) {
    const h = 12 - 3 * Math.floor(x / 2) - (x % 2 ? 2 : 0);
    fillBox(grid, [x, 0, 0], [x + 1, Math.max(1, h), 4], 1);
  }
  const cells = grid.cells.slice();
  const result = repair(grid, layout(grid));
  const before = check(grid, result);
  applySlopes(grid, result);
  const after = check(grid, result);
  assert.deepEqual(grid.cells, cells);
  assertTiling(grid, result);
  assert.ok(after.detachedParts <= before.detachedParts);
  assert.ok(after.components <= before.components);
});

test('a two-plate ledge gets a slope only in tolerance mode, and the slope owns the middle cells', () => {
  const grid = step(2);
  fillBox(grid, [1, 1, 0], [2, 2, 2], 1); // ledge two plates thick, top plate still empty
  const cells = grid.cells.slice();
  const strict = layout(grid);
  assert.equal(applySlopes(grid, strict), 0);
  const loose = layout(grid);
  assert.equal(applySlopes(grid, loose, { tolerance: true }), 1);
  const slope = loose.parts.find((p) => p.kind === 'slope');
  assert.equal(slope.ldraw, '3039');
  assert.equal(slope.cells.length, 10); // 2 stud columns × 3 + 2 slope columns × 2
  assert.deepEqual(grid.cells, cells);
  assertTiling(grid, loose);
});

test('tolerance mode keeps the filled cells and adds no loose parts on a stepped roof', () => {
  // Brick steps whose ledges alternate between one and two plates, two studs deep.
  const grid = new VoxelGrid(8, 12, 2);
  for (let x = 0; x < 8; x++) {
    const h = 12 - 3 * Math.floor(x / 2) - (x % 2 ? (x % 4 === 1 ? 1 : 2) : 0);
    fillBox(grid, [x, 0, 0], [x + 1, Math.max(1, h), 2], 1);
  }
  const cells = grid.cells.slice();
  const strict = repair(grid, layout(grid));
  const strictPlaced = applySlopes(grid, strict);
  const result = repair(grid, layout(grid));
  const before = check(grid, result);
  const placed = applySlopes(grid, result, { tolerance: true });
  const after = check(grid, result);
  assert.ok(placed > strictPlaced, `${placed} > ${strictPlaced}`);
  assert.deepEqual(grid.cells, cells);
  assertTiling(grid, result);
  assert.ok(after.detachedParts <= before.detachedParts);
  assert.ok(after.components <= before.components);
});

test('flat tops with nothing on them become tiles; connections do not change', () => {
  const grid = new VoxelGrid(4, 4, 2);
  fillBox(grid, [0, 0, 0], [4, 4, 2], 1);
  const result = layout(grid);
  const before = check(grid, result);
  const tiles = applyTiles(grid, result);
  const after = check(grid, result);
  assert.ok(tiles > 0);
  assertTiling(grid, result);
  assert.equal(after.components, before.components);
  assert.equal(after.detachedParts, before.detachedParts);
  // Only the exposed top layer may hold tiles.
  for (const p of result.parts.filter((q) => q.kind === 'tile')) assert.equal(p.y + p.h, grid.sy);
});

test('a plate with something on top keeps its studs', () => {
  const grid = new VoxelGrid(2, 2, 2);
  fillBox(grid, [0, 0, 0], [2, 2, 2], 1);
  const result = layout(grid);
  applyTiles(grid, result);
  assert.ok(result.parts.filter((p) => p.y === 0).every((p) => p.kind !== 'tile'));
});
