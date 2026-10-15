import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout } from '../src/convert/layout.mjs';
import { check } from '../src/core/check.mjs';
import { hiddenGap, repair } from '../src/convert/repair.mjs';
import { partAvailable, shapeAvailable } from '../src/core/catalog.mjs';
import { assertTiling, fillBox, resultFrom } from './helpers.mjs';

/** A one-brick-tall wall with a one-plate ledge beside it: layout leaves the ledge loose. */
function wallAndLedge(ledgeColour) {
  const grid = new VoxelGrid(4, 3, 2);
  fillBox(grid, [0, 0, 0], [2, 3, 2], 1);
  fillBox(grid, [2, 0, 0], [4, 1, 2], ledgeColour);
  return grid;
}

test('a same-colour ledge beside a brick gets joined (brick split into plates)', () => {
  const grid = wallAndLedge(1);
  const laid = layout(grid);
  assert.ok(check(grid, laid).detachedParts > 0, 'precondition: layout leaves the ledge loose');
  const fixed = repair(grid, laid);
  assertTiling(grid, fixed);
  assert.equal(check(grid, fixed).detachedParts, 0);
  assert.equal(fixed.recolouredCells, 0, 'same colour: nothing recoloured');
});

test('a split brick only becomes plates LEGO made in its colour', () => {
  // Sand Blue (35): the 2×8 brick exists in it, the 2×8 plate does not.
  const sandBlue = 35;
  assert.ok(shapeAvailable('brick', 2, 8, sandBlue) && !shapeAvailable('plate', 2, 8, sandBlue), 'precondition: catalogue');
  const grid = new VoxelGrid(4, 3, 8);
  fillBox(grid, [0, 0, 0], [2, 3, 8], sandBlue);
  fillBox(grid, [2, 0, 0], [4, 1, 2], sandBlue);
  const laid = layout(grid);
  assert.ok(laid.parts.some((p) => p.kind === 'brick' && p.w * p.d === 16), 'precondition: the wall is one 2×8 brick');
  assert.ok(check(grid, laid).detachedParts > 0, 'precondition: layout leaves the ledge loose');
  const fixed = repair(grid, laid);
  assertTiling(grid, fixed);
  assert.equal(check(grid, fixed).detachedParts, 0);
  assert.deepEqual(fixed.parts.filter((p) => !partAvailable(p)), [], 'every part exists in its colour');
});

test('across a colour seam the joining part takes one colour and counts the change', () => {
  const grid = wallAndLedge(2);
  const fixed = repair(grid, layout(grid));
  assertTiling(grid, fixed);
  assert.equal(check(grid, fixed).detachedParts, 0);
  assert.ok(fixed.recolouredCells > 0);
  assert.ok(fixed.parts.some((p) => p.recoloured > 0));
});

test('with crossColour off a different-colour ledge stays loose', () => {
  const grid = wallAndLedge(2);
  const fixed = repair(grid, layout(grid), { crossColour: false });
  assert.ok(check(grid, fixed).detachedParts > 0);
});

test('repair never leaves more detached parts than it was given', () => {
  // A staircase with colour bands: many seams, several loose parts after layout.
  const grid = new VoxelGrid(10, 9, 4);
  for (let x = 0; x < 10; x++) fillBox(grid, [x, 0, 0], [x + 1, 1 + x, 4], 1 + (x % 3));
  const laid = layout(grid);
  const before = check(grid, laid).detachedParts;
  const fixed = repair(grid, laid);
  assertTiling(grid, fixed);
  assert.ok(check(grid, fixed).detachedParts <= before);
});

test('a model that is already one piece is left as it is', () => {
  const grid = new VoxelGrid(8, 9, 8);
  fillBox(grid, [0, 0, 0], [8, 9, 8], 1);
  const laid = layout(grid);
  assert.equal(check(grid, laid).components, 1, 'precondition');
  const fixed = repair(grid, laid);
  assert.equal(fixed.merges, 0);
  assert.deepEqual(fixed.parts, laid.parts);
});

test('a solid block whose layout stacks seams straight up gets joined', () => {
  // 6×2 bricks on 6×2 bricks, seams aligned, two groups: what layout gives
  // without its stacking penalty, used here as a repair input.
  const grid = new VoxelGrid(6, 6, 4);
  fillBox(grid, [0, 0, 0], [6, 6, 4], 1);
  const laid = layout(grid, { stackPenalty: 0 });
  assert.equal(check(grid, laid).components, 2, 'precondition: layout does not stagger here');
  const fixed = repair(grid, laid);
  assertTiling(grid, fixed);
  assert.equal(check(grid, fixed).components, 1);
});

/**
 * A one-plate ledge sticking out beside a post, with a plate over the post and
 * the empty notch next to the ledge (the fox's chest at shelf size): re-tiling
 * the ledge with the post alone leaves one cell of it loose.
 */
function ledgeByNotch() {
  const grid = new VoxelGrid(2, 3, 2);
  fillBox(grid, [1, 0, 1], [2, 2, 2], 1); // post at x1 z1, plates 0-1
  fillBox(grid, [0, 2, 1], [2, 3, 2], 1); // plate over the post and the notch
  fillBox(grid, [0, 1, 0], [2, 2, 1], 1); // the ledge, plate 1, nothing above or below
  const laid = resultFrom(grid, [
    { x: 1, y: 0, z: 1, w: 1, d: 1 },
    { x: 1, y: 1, z: 1, w: 1, d: 1 },
    { x: 0, y: 2, z: 1, w: 2, d: 1 },
    { x: 0, y: 1, z: 0, w: 2, d: 1 },
  ]);
  return { grid, laid };
}

test('a ledge the side merges cannot join fills the hidden notch next to it', () => {
  const plain = ledgeByNotch();
  assert.ok(check(plain.grid, plain.laid).detachedParts > 0, 'precondition: the ledge is loose');
  assert.ok(check(plain.grid, repair(plain.grid, plain.laid, { fill: false })).detachedParts > 0, 'without filling it stays loose');

  const { grid, laid } = ledgeByNotch();
  const fixed = repair(grid, laid);
  assert.equal(check(grid, fixed).detachedParts, 0);
  assert.equal(fixed.filledCells, 1);
  assert.equal(grid.get(0, 1, 1), 1, 'the notch is now part of the model, in the ledge colour');
  assertTiling(grid, fixed);
});

test('hiddenGap: only an empty cell held from above or below with three sides against parts', () => {
  const { grid, laid } = ledgeByNotch();
  const gap = hiddenGap(grid, laid.owner);
  assert.equal(gap(0, 1, 1), true); // the notch: post, plate over it, ledge
  assert.equal(gap(0, 0, 0), false); // under the ledge: held from above, but open on most sides
  assert.equal(gap(1, 1, 1), false); // a filled cell
  assert.equal(gap(5, 1, 1), false); // outside the grid
});
