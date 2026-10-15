import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps } from '../src/steps/layers.mjs';
import { stepNeeds } from '../src/steps/plan.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { boxesMesh } from './helpers.mjs';

const parts = [
  { id: 0, kind: 'brick', y: 0, w: 2, d: 4, color: 1 },
  { id: 1, kind: 'brick', y: 0, w: 4, d: 2, color: 1 },
  { id: 2, kind: 'plate', y: 3, w: 1, d: 2, color: 2 },
  { id: 3, kind: 'plate', y: 1, w: 1, d: 1, color: 1 },
];

test('one step per layer where parts start, bottom up', () => {
  assert.deepEqual(buildSteps(parts), [
    { layer: 0, ids: [0, 1] },
    { layer: 1, ids: [3] },
    { layer: 3, ids: [2] },
  ]);
});

test('step needs group by colour, kind and footprint regardless of orientation', () => {
  assert.deepEqual(stepNeeds(parts, [0, 1, 3]), [
    { color: 1, kind: 'brick', w: 2, d: 4, count: 2, ids: [0, 1] },
    { color: 1, kind: 'plate', w: 1, d: 1, count: 1, ids: [3] },
  ]);
});

test('every part of a built model is in exactly one step, and steps only rest on earlier ones', () => {
  const model = buildModel(boxesMesh([[[0, 0, 0], [1, 0.6, 0.5], [180, 0, 0]], [[0.2, 0.6, 0.1], [0.8, 0.9, 0.4], [244, 244, 244]]]), { lengthStuds: 16 });
  const steps = buildSteps(model.result.parts);
  const seen = steps.flatMap((s) => s.ids).sort((a, b) => a - b);
  assert.deepEqual(seen, model.result.parts.map((p) => p.id));
  const stepOf = new Map(steps.flatMap((s, i) => s.ids.map((id) => [id, i])));
  const { grid, result } = model;
  for (const p of result.parts) {
    if (p.y === 0) continue;
    for (let dz = 0; dz < p.d; dz++) {
      for (let dx = 0; dx < p.w; dx++) {
        const below = result.owner[grid.index(p.x + dx, p.y - 1, p.z + dz)];
        if (below >= 0) assert.ok(stepOf.get(below) < stepOf.get(p.id), `part ${p.id} rests on a later step`);
      }
    }
  }
});
