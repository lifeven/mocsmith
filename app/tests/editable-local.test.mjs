import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout } from '../src/convert/layout.mjs';
import { EditableModel } from '../src/core/editable.mjs';

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random stepped terrain with overhangs, holes and a few colours. */
function randomGrid(rand) {
  const grid = new VoxelGrid(8, 9, 6);
  for (let z = 0; z < grid.sz; z++) {
    for (let x = 0; x < grid.sx; x++) {
      const h = Math.floor(rand() * grid.sy);
      for (let y = 0; y < h; y++) if (rand() > 0.12) grid.set(x, y, z, 1 + Math.floor(rand() * 3));
    }
  }
  return grid;
}

/** The part split into 1×1 columns of the same kind and height (covers exactly its cells). */
const columns = (p) => {
  const out = [];
  for (let dz = 0; dz < p.d; dz++) for (let dx = 0; dx < p.w; dx++) out.push({ ...p, x: p.x + dx, z: p.z + dz, w: 1, d: 1 });
  return out.map(({ id, ...q }) => q);
};

test('the local what-if gives the same group counts as the full one', () => {
  const rand = rng(7);
  let compared = 0;
  for (let round = 0; round < 40; round++) {
    const grid = randomGrid(rand);
    const model = new EditableModel(grid, layout(grid));
    for (let k = 0; k < 25; k++) {
      const parts = model.parts();
      const p = parts[Math.floor(rand() * parts.length)];
      const removed = new Set([p.id]);
      // Sometimes a second, touching part goes too (as in a repair merge).
      const nb = [...model.adj[p.id]];
      if (nb.length && rand() < 0.5) removed.add(nb[Math.floor(rand() * nb.length)]);
      const pieces = [...removed].flatMap((id) => columns(model.slots[id]));
      const kept = parts.filter((r) => !removed.has(r.id));
      const full = model.whatIf(removed, [...kept, ...pieces], (i) => i >= kept.length);
      const local = model.whatIfLocal(removed, pieces);
      assert.deepEqual(local, { components: full.components, detachedParts: full.detachedParts }, `round ${round} edit ${k}`);
      compared++;
      // Apply some edits so later ones start from changed models.
      if (rand() < 0.3) model.replace(removed, [], pieces);
    }
  }
  assert.equal(compared, 1000);
});
