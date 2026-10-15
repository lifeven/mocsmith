import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { check } from '../src/core/check.mjs';
import { rebuildWithCells } from '../src/core/model.mjs';
import { PALETTE, cellValue } from '../src/core/palette.mjs';
import { shapeAvailable, isAvailable } from '../src/core/catalog.mjs';
import { applyRound, standsAlone } from '../src/convert/round.mjs';
import { fillBox } from './helpers.mjs';

const WHITE = cellValue(15);

/** A 6×1 base plate with parts standing on it: `posts` are [x, kind, n, h]. */
function scene(posts, colour = WHITE) {
  const grid = new VoxelGrid(8, 5, 2);
  const parts = [{ kind: 'plate', x: 0, y: 0, z: 0, w: 8, d: 2, h: 1, color: WHITE }];
  for (const [x, kind, n, h] of posts) parts.push({ kind, x, y: 1, z: 0, w: n, d: n, h, color: colour });
  for (const p of parts) fillBox(grid, [p.x, p.y, p.z], [p.x + p.w, p.y + p.h, p.z + p.d], p.color);
  return { grid, result: rebuildWithCells(grid, parts) };
}

test('a lone 1×1 or 2×2 post becomes round; one with a neighbour stays square', () => {
  // 1×1 brick at x0 (alone), 2×2 brick at x2–3 (alone), two 1×1 plates side by side at x5, x6.
  const { grid, result } = scene([[0, 'brick', 1, 3], [2, 'brick', 2, 3], [5, 'plate', 1, 1], [6, 'plate', 1, 1]]);
  const before = check(grid, result);
  assert.ok(standsAlone(grid, result.parts[1]));
  assert.ok(!standsAlone(grid, result.parts[3]), 'the two plates touch each other');
  assert.equal(applyRound(grid, result), 2);
  assert.deepEqual(result.parts.map((p) => p.ldraw ?? ''), ['', '3062b', '3941', '', '']);
  // Same cells and connections: the checks do not change.
  assert.deepEqual(check(grid, result), before);
});

test('a post stays square when LEGO never made the round part in its colour', () => {
  // A palette colour with a 1×1 brick but no 3062b round brick.
  const colour = PALETTE.map((_, i) => i + 1).find((c) => shapeAvailable('brick', 1, 1, c) && !isAvailable('3062b', PALETTE[c - 1].code));
  assert.ok(colour, 'precondition: such a colour exists');
  const { grid, result } = scene([[0, 'brick', 1, 3]], colour);
  assert.equal(applyRound(grid, result), 0);
  assert.equal(result.parts[1].ldraw, undefined);
});
