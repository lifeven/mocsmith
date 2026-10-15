import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { check } from '../src/core/check.mjs';
import { weld } from '../src/convert/weld.mjs';
import { cellValue } from '../src/core/palette.mjs';
import { assertTiling, fillBox, resultFrom } from './helpers.mjs';

const W = cellValue(15);
const R = cellValue(4);

/** Grid and result from hand-placed parts (cells filled with each part's colour). */
function build(sx, sy, sz, parts) {
  const grid = new VoxelGrid(sx, sy, sz);
  for (const p of parts) fillBox(grid, [p.x, p.y, p.z], [p.x + p.w, p.y + (p.h ?? 1), p.z + p.d], p.color);
  return { grid, result: resultFrom(grid, parts) };
}

test('a beam touching the body only on its side gets a seam plate and joins', () => {
  // A 1×1 brick with a plate on top; a red 3×1 plate beside that top plate,
  // in the same layer, with nothing under or over it.
  const { grid, result } = build(4, 6, 1, [
    { kind: 'brick', x: 0, y: 0, z: 0, w: 1, d: 1, h: 3, color: W },
    { kind: 'plate', x: 0, y: 3, z: 0, w: 1, d: 1, color: W },
    { kind: 'plate', x: 1, y: 3, z: 0, w: 3, d: 1, color: R },
  ]);
  assert.equal(check(grid, result).detachedParts, 1);
  const welded = weld(grid, result);
  assert.equal(welded.welds, 1);
  assert.equal(welded.droppedCells, 0);
  assertTiling(grid, welded);
  assert.equal(check(grid, welded).detachedParts, 0);
  // Under the touching cells is the brick, so the plate goes over them, in the beam's colour.
  const plate = welded.parts.at(-1);
  assert.deepEqual([plate.kind, plate.x, plate.y, plate.z, plate.w, plate.d, plate.color], ['plate', 0, 4, 0, 2, 1, R]);
});

test('a plate is only kept when it really joins something', () => {
  // Main body on the ground; a loose 1×1 two cells away touching nothing → dropped as a crumb.
  const { grid, result } = build(5, 3, 1, [
    { kind: 'brick', x: 0, y: 0, z: 0, w: 2, d: 1, h: 3, color: W },
    { kind: 'plate', x: 4, y: 2, z: 0, w: 1, d: 1, color: R },
  ]);
  const welded = weld(grid, result);
  assert.equal(welded.welds, 0);
  assert.equal(welded.droppedCells, 1);
  assert.equal(welded.parts.length, 1);
  assert.equal(grid.get(4, 2, 0), 0);
  assertTiling(grid, welded);
  assert.equal(check(grid, welded).detachedParts, 0);
});

test('nothing changes when every part is already joined', () => {
  const { grid, result } = build(2, 4, 1, [
    { kind: 'brick', x: 0, y: 0, z: 0, w: 2, d: 1, h: 3, color: W },
    { kind: 'plate', x: 0, y: 3, z: 0, w: 2, d: 1, color: R },
  ]);
  const cells = grid.filledCount();
  const welded = weld(grid, result);
  assert.deepEqual([welded.welds, welded.droppedCells, welded.parts.length, grid.filledCount()], [0, 0, 2, cells]);
});
