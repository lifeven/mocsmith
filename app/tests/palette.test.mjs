import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, BASE_PALETTE_SIZE, cellValue, nearestCell, nearestCellOf, srgbToLab } from '../src/core/palette.mjs';
import { isAvailable } from '../src/core/catalog.mjs';

test('the base palette keeps stable grid colour identifiers', () => {
  const base = [15, 0, 71, 72, 4, 320, 25, 484, 14, 226, 19, 28, 70, 308, 2, 288, 27, 1, 272, 322];
  assert.equal(BASE_PALETTE_SIZE, 20);
  assert.deepEqual(PALETTE.slice(0, 20).map((c) => c.code), base);
  assert.ok(PALETTE.length > 20, `palette contains ${PALETTE.length} colours`);
  // 1x1 brick and plate exist in every palette colour, so layout can always fill a cell.
  for (const c of PALETTE) for (const id of ['3005', '3024']) assert.ok(isAvailable(id, c.code), `${id} in ${c.name}`);
  // Pink shades remain distinct from neutral grey in the full palette.
  assert.ok(PALETTE.some((c) => c.code === 29) && PALETTE.some((c) => c.code === 5), 'bright and dark pink');
});

test('nearestCellOf limits to the first N colours', () => {
  const pink = PALETTE.find((c) => c.code === 29); // Bright Pink, outside the base palette
  const rgb = [(pink.hex >> 16) & 255, (pink.hex >> 8) & 255, pink.hex & 255];
  assert.equal(PALETTE[nearestCell(...rgb) - 1].code, 29);
  assert.ok(nearestCellOf(20)(...rgb) <= 20, 'the 20-colour palette cannot pick pink');
});

test('every palette colour maps to itself', () => {
  PALETTE.forEach((c, i) => {
    const r = (c.hex >> 16) & 255;
    const g = (c.hex >> 8) & 255;
    const b = c.hex & 255;
    assert.equal(nearestCell(r, g, b), i + 1, c.name);
  });
});

test('cellValue is palette index + 1 by LDraw code', () => {
  PALETTE.forEach((c, i) => assert.equal(cellValue(c.code), i + 1));
});

test('palette has no duplicate LDraw codes', () => {
  const codes = PALETTE.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
});

test('a near-white pixel picks white, a near-black one picks black', () => {
  assert.equal(PALETTE[nearestCell(250, 250, 248) - 1].code, 15);
  assert.equal(PALETTE[nearestCell(20, 30, 40) - 1].code, 0);
});

test('srgbToLab: white is L≈100, black is L≈0', () => {
  assert.ok(Math.abs(srgbToLab(255, 255, 255)[0] - 100) < 0.5);
  assert.ok(Math.abs(srgbToLab(0, 0, 0)[0]) < 0.5);
});
