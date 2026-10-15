import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintPatches } from '../src/convert/shades.mjs';

// A row of surface cells along x in a 1-deep, 1-high grid.
const row = (n) => ({ grid: { sx: n, sz: 1, cells: new Uint8Array(n) }, surface: Array.from({ length: n }, (_, i) => i) });
// Two palette colours split at red = 240: a shade range across 240 straddles them.
const toCell = (r) => (r >= 240 ? 1 : 2);
const rgbOf = (reds) => reds.flatMap((r) => [r, 100, 70]);

test('a gentle shade across a palette boundary keeps one colour', () => {
  const { grid, surface } = row(8);
  const reds = [250, 248, 246, 244, 242, 240, 238, 236];
  assert.deepEqual([...paintPatches(grid, surface, rgbOf(reds), toCell, { step: 0 })], [1, 1, 1, 1, 1, 1, 2, 2]);
  assert.deepEqual([...paintPatches(grid, surface, rgbOf(reds), toCell, { step: 2 })], [1, 1, 1, 1, 1, 1, 1, 1]);
});

test('two paints that meet in a jump stay two colours', () => {
  const { grid, surface } = row(6);
  const reds = [252, 252, 252, 228, 228, 228];
  assert.deepEqual([...paintPatches(grid, surface, rgbOf(reds), toCell, { step: 2 })], [1, 1, 1, 2, 2, 2]);
});

test('a wide gradient is not one paint and keeps each cell', () => {
  const { grid, surface } = row(40);
  const reds = Array.from({ length: 40 }, (_, i) => 255 - i * 2); // 255 … 177, ΔE about 1 per cell
  const own = [...paintPatches(grid, surface, rgbOf(reds), toCell, { step: 0 })];
  assert.deepEqual([...paintPatches(grid, surface, rgbOf(reds), toCell, { step: 2, span: 15 })], own);
});

test('cells touching only along an edge join one patch', () => {
  // Two cells diagonal in x/y: (0, 0) and (1, 1) in a 2 x 2 x 1 grid.
  const grid = { sx: 2, sz: 1, cells: new Uint8Array(4) };
  const surface = [0, 3];
  assert.deepEqual([...paintPatches(grid, surface, rgbOf([241, 239]), toCell, { step: 2 })], [1, 1]);
});
