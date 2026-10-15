import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { thicken, thinMask, coveredInLayer } from '../src/convert/thicken.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { fillBox, boxesMesh } from './helpers.mjs';

const count = (mask) => mask.reduce((n, v) => n + v, 0);

test('a 1×1 post becomes 2×2, in its own colour, growing toward the body', () => {
  // A 4×4 slab on top, held up by a 1×1 post standing at its corner.
  const grid = new VoxelGrid(6, 8, 6);
  fillBox(grid, [1, 0, 1], [2, 5, 2], 7); // post, 5 plates
  fillBox(grid, [1, 5, 1], [5, 8, 5], 3); // slab
  const { thin, added } = thicken(grid);
  assert.equal(thin, 5);
  assert.equal(added, 15);
  for (let y = 0; y < 5; y++) assert.ok(coveredInLayer(grid, 1, y, 1), `layer ${y}`);
  // Grew under the slab (+x, +z), not outward.
  assert.equal(grid.get(2, 0, 2), 7);
  assert.equal(grid.get(0, 0, 0), 0);
});

test('short thin stretches and long 1-stud walls are left alone', () => {
  const grid = new VoxelGrid(8, 6, 8);
  fillBox(grid, [0, 0, 0], [8, 3, 8], 1); // a wide base
  grid.set(3, 3, 3, 2); // a 1-plate dot on top (a dome tip)
  grid.set(3, 4, 3, 2); // two plates: shorter than a brick
  fillBox(grid, [0, 3, 6], [8, 6, 7], 4); // a 1-stud wall, 8 long, 3 plates
  assert.equal(count(thinMask(grid, 'post')), 0);
  assert.ok(count(thinMask(grid, 'column')) >= 8 * 3, 'column counts the wall');
  assert.ok(count(thinMask(grid, 'layer')) > count(thinMask(grid, 'column')), 'layer also counts the dot');
  const before = grid.cells.slice();
  assert.equal(thicken(grid).added, 0);
  assert.deepEqual(grid.cells, before);
});

test('growth does not close the gap between two legs', () => {
  // Two 1×1 legs 2 studs apart under a bar: growing either toward the other would fill the gap.
  const grid = new VoxelGrid(7, 6, 3);
  fillBox(grid, [2, 0, 1], [3, 3, 2], 5);
  fillBox(grid, [4, 0, 1], [5, 3, 2], 5);
  fillBox(grid, [1, 3, 0], [6, 6, 3], 5);
  thicken(grid);
  for (let y = 0; y < 3; y++) assert.equal(grid.get(3, y, 1), 0, `gap kept at layer ${y}`);
  for (let y = 0; y < 3; y++) assert.ok(coveredInLayer(grid, 2, y, 1) && coveredInLayer(grid, 4, y, 1), `legs grew outward at layer ${y}`);
});

test('buildModel thickens only when asked, and counts the cells', () => {
  const mesh = boxesMesh([
    [[0, 0, 0], [0.12, 1, 0.12], [180, 0, 0]],
    [[0, 1, 0], [1, 1.3, 1], [244, 244, 244]],
  ]);
  const off = buildModel(mesh, { lengthStuds: 8 });
  assert.equal(off.counts.thickened, undefined);
  const on = buildModel(mesh, { lengthStuds: 8, thicken: true });
  assert.ok(on.counts.thickened > 0);
  assert.ok(on.grid.filledCount() === off.grid.filledCount() + on.counts.thickened);
});
