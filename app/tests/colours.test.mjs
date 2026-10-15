import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { cellValue } from '../src/core/palette.mjs';
import { limitColours, patches, colourDistance } from '../src/convert/colours.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { fillBox, boxesMesh } from './helpers.mjs';

const WHITE = cellValue(15);
const BLACK = cellValue(0);
const RED = cellValue(4);
const ORANGE = cellValue(191); // Bright Light Orange
const YELLOW = cellValue(14);
const LIGHT_YELLOW = cellValue(226); // Bright Light Yellow
const LIGHT_GREY = cellValue(71);

const coloursOf = (grid) => new Set(Array.from(grid.cells).filter(Boolean));

test('under the cap or without one nothing changes', () => {
  const grid = new VoxelGrid(6, 2, 2);
  fillBox(grid, [0, 0, 0], [3, 2, 2], WHITE);
  fillBox(grid, [3, 0, 0], [6, 2, 2], RED);
  const before = grid.cells.slice();
  assert.deepEqual(limitColours(grid, null), { merged: [], kept: 2 });
  assert.deepEqual(limitColours(grid, 2), { merged: [], kept: 2 });
  assert.deepEqual(grid.cells, before);
});

test('patches finds connected same-colour cells with surface and contacts', () => {
  const grid = new VoxelGrid(3, 3, 3);
  fillBox(grid, [0, 0, 0], [3, 3, 3], WHITE);
  grid.set(1, 1, 1, RED); // hidden in the middle
  const all = patches(grid);
  const red = all.find((p) => p.colour === RED);
  assert.equal(red.cells.length, 1);
  assert.equal(red.surface, 0);
  assert.equal(red.contacts.get(WHITE), 6);
  assert.equal(all.find((p) => p.colour === WHITE).surface, 26);
});

test('the cheapest colour goes to its nearest kept colour', () => {
  const grid = new VoxelGrid(12, 2, 4);
  fillBox(grid, [0, 0, 0], [6, 2, 4], WHITE);
  fillBox(grid, [6, 0, 0], [12, 2, 4], BLACK);
  fillBox(grid, [0, 0, 0], [2, 1, 1], LIGHT_GREY); // a small light grey patch on the white side
  fillBox(grid, [10, 0, 0], [12, 1, 1], RED); // and a red one on the black side
  const { merged, kept } = limitColours(grid, 3);
  assert.equal(kept, 3);
  assert.equal(coloursOf(grid).size, 3);
  // Light grey is closer to white than red is to anything, so it goes first.
  assert.ok(colourDistance(LIGHT_GREY, WHITE) < colourDistance(RED, BLACK));
  assert.deepEqual(merged, [[71, 15, 2]]);
  assert.equal(grid.get(0, 0, 0), WHITE);
  assert.equal(grid.get(11, 0, 0), RED);
});

test('a patch is not merged into the colour around it when another target keeps it', () => {
  // An orange car with a yellow headlight on its front, and a light yellow roof.
  const grid = new VoxelGrid(8, 4, 4);
  fillBox(grid, [0, 0, 0], [8, 3, 4], ORANGE);
  grid.set(0, 1, 1, YELLOW);
  fillBox(grid, [2, 3, 1], [6, 4, 3], LIGHT_YELLOW);
  fillBox(grid, [0, 3, 0], [2, 4, 4], WHITE);
  const { merged } = limitColours(grid, 3);
  assert.equal(grid.get(0, 1, 1), YELLOW, 'the headlight keeps its colour');
  assert.deepEqual(merged.map(([from]) => from), [226]);
  assert.equal(grid.get(3, 3, 1), YELLOW, 'the roof went to yellow');
});

test('a small detail stays while another colour can go', () => {
  // A white block with a black eye and a big light grey band; cap 2.
  const grid = new VoxelGrid(20, 4, 20);
  fillBox(grid, [0, 0, 0], [20, 4, 20], WHITE);
  fillBox(grid, [0, 0, 0], [20, 4, 3], LIGHT_GREY);
  grid.set(10, 3, 10, BLACK);
  limitColours(grid, 2);
  assert.deepEqual([...coloursOf(grid)].sort(), [WHITE, BLACK].sort());
  // When only details are left over the cap, they go too.
  limitColours(grid, 1);
  assert.deepEqual([...coloursOf(grid)], [WHITE]);
});

test('a colour only inside the model goes first, whatever its distance', () => {
  const grid = new VoxelGrid(4, 4, 4);
  fillBox(grid, [0, 0, 0], [4, 4, 4], WHITE);
  fillBox(grid, [0, 0, 0], [4, 4, 1], YELLOW);
  fillBox(grid, [1, 1, 1], [3, 3, 3], BLACK); // fully enclosed
  const { merged } = limitColours(grid, 2);
  assert.deepEqual(merged, [[0, 15, 8]]);
});

test('buildModel applies maxColours before paint and reports the merges', () => {
  const mesh = boxesMesh([
    [[0, 0, 0], [2, 1, 1], [244, 244, 244]],
    [[2, 0, 0], [3, 1, 1], [180, 0, 0]],
    [[0, 1, 0], [0.4, 1.2, 0.4], [160, 165, 169]],
  ]);
  const free = buildModel(mesh, { lengthStuds: 12 });
  assert.deepEqual(free.merged, []);
  const capped = buildModel(mesh, { lengthStuds: 12, maxColours: 2 });
  assert.equal(new Set(capped.result.parts.map((p) => p.color)).size, 2);
  assert.ok(capped.merged.length > 0);
  assert.equal(capped.sourceCodes.length, 2);
  // Paint after the cap: a third colour the visitor picks stays.
  const painted = buildModel(mesh, { lengthStuds: 12, maxColours: 2, paint: { colours: [[capped.sourceCodes[0], 1]], cells: null } });
  assert.ok(painted.result.parts.some((p) => p.color === cellValue(1)));
});
