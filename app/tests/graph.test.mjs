import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout } from '../src/convert/layout.mjs';
import { check, FLAG_DETACHED } from '../src/core/check.mjs';
import { rebuildWithCells } from '../src/core/model.mjs';
import { EditableModel } from '../src/core/editable.mjs';
import { assertTiling } from './helpers.mjs';

/** Random height field with brick steps, plate ledges and colour noise. */
function stepped(sx, sz, seed) {
  const grid = new VoxelGrid(sx, 15, sz);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const h = 3 * (1 + Math.floor(rnd() * 4)) + (rnd() < 0.3 ? 1 : 0);
      for (let y = 0; y < h; y++) grid.set(x, y, z, 1 + ((x >> 2) % 2) + (rnd() < 0.15 ? 2 : 0));
    }
  return grid;
}

/** A valid local edit: the same cells, as 1×1 one-plate pieces. */
const unitPieces = (p) => {
  const out = [];
  for (let dy = 0; dy < p.h; dy++)
    for (let dz = 0; dz < p.d; dz++)
      for (let dx = 0; dx < p.w; dx++)
        out.push({ kind: 'plate', x: p.x + dx, y: p.y + dy, z: p.z + dz, w: 1, d: 1, h: 1, color: p.color });
  return out;
};

const sameGroups = (got, ref, msg) => {
  assert.equal(got.components, ref.components, `${msg}: components`);
  assert.equal(got.detachedParts, ref.detachedParts, `${msg}: detachedParts`);
};

for (const seed of [1, 2, 3, 4]) {
  test(`what-if group counts equal check on the edited model (seed ${seed})`, () => {
    const grid = stepped(14, 10, seed);
    const model = new EditableModel(grid, layout(grid));
    for (let k = 0; k < 12; k++) {
      const parts = model.parts();
      const p = parts[(k * 37 + seed) % parts.length];
      const pieces = unitPieces(p);
      const removed = new Set([p.id]);
      const kept = parts.filter((r) => r.id !== p.id);
      // Pieces at the end (repair's order) and at the front (slopes' refills).
      const atEnd = [...kept, ...pieces];
      sameGroups(model.whatIf(removed, atEnd, (i) => i >= kept.length), check(grid, rebuildWithCells(grid, atEnd)), `end ${k}`);
      const atFront = [...pieces, ...kept];
      sameGroups(model.whatIf(removed, atFront, (i) => i < pieces.length), check(grid, rebuildWithCells(grid, atFront)), `front ${k}`);

      model.replace(removed, k % 2 ? pieces : [], k % 2 ? [] : pieces);
      const result = model.toResult();
      assertTiling(grid, result);
      const ref = check(grid, result);
      const groups = model.groups();
      sameGroups(groups, ref, `applied ${k}`);
      model.parts().forEach((q, i) =>
        assert.equal(groups.flags[q.id] & FLAG_DETACHED, ref.flags[i] & FLAG_DETACHED, `flag of part ${i}`),
      );
    }
  });
}

test('toResult numbers parts in edit order, like rebuilding after every edit', () => {
  const grid = stepped(10, 8, 9);
  const laid = layout(grid);
  const model = new EditableModel(grid, laid);
  const p = model.parts()[3];
  const pieces = unitPieces(p);
  model.replace(new Set([p.id]), pieces, []);
  const expected = rebuildWithCells(grid, [...pieces, ...laid.parts.filter((r) => r.id !== p.id)]);
  const got = model.toResult();
  assert.deepEqual(got.parts, expected.parts);
  assert.deepEqual(got.owner, expected.owner);
});
