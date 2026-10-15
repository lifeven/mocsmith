import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { colouredMeshFromGltf, meshDataFromGltf } from '../src/io/gltf.mjs';
import { colouredMesh } from '../src/core/mesh-data.mjs';
import { packModel, unpackModel } from '../src/runtime/transport.mjs';
import { buildModel, STAGES, withStage } from '../src/convert/build.mjs';
import { OPTIONAL_PARTS, withDefaults } from '../src/convert/config.mjs';
import { layout } from '../src/convert/layout.mjs';
import { nearestCell } from '../src/core/palette.mjs';
import { assertTiling, boxesMesh } from './helpers.mjs';

const RED = [180, 0, 0];
const WHITE = [244, 244, 244];

/** A simple "animal": a red body on four legs with a white head on one end. */
function figure() {
  return boxesMesh([
    [[0, 0.4, 0], [2, 1, 1], RED],
    [[0, 0, 0], [0.3, 0.4, 0.3], RED],
    [[1.7, 0, 0], [2, 0.4, 0.3], RED],
    [[0, 0, 0.7], [0.3, 0.4, 1], RED],
    [[1.7, 0, 0.7], [2, 0.4, 1], RED],
    [[1.6, 1, 0.2], [2.2, 1.5, 0.8], WHITE],
  ]);
}

test('buildModel runs the whole instant layer and returns one tiled model', () => {
  const model = buildModel(figure(), { lengthStuds: 16 });
  assertTiling(model.grid, model.result);
  assert.equal(model.stats.parts, model.result.parts.length);
  assert.ok(model.stats.detachedParts <= model.before.detachedParts);
  assert.ok(model.ms.total >= 0);
  const colours = new Set(model.result.parts.map((p) => p.color));
  assert.deepEqual(colours, new Set([nearestCell(...RED), nearestCell(...WHITE)]));
});

test('stage table: the order of the instant layer, every stage timed', () => {
  assert.deepEqual(STAGES.map((st) => st.name), ['voxelize', 'stock', 'colours', 'paint', 'thicken', 'layout', 'check-laid', 'repair', 'weld', 'slopes', 'inverted', 'tiles', 'round', 'check']);
  const model = buildModel(figure(), { lengthStuds: 16 });
  assert.deepEqual(Object.keys(model.ms), ['voxelize', 'layout', 'check', 'repair', 'weld', 'slopes', 'inverted', 'tiles', 'round', 'total']);
  for (const st of STAGES) assert.ok(st.timer in model.ms, st.name);
});

test('withStage swaps one stage and leaves the others; the default table is unchanged', () => {
  const calls = [];
  const stages = withStage(STAGES, 'layout', (ctx, s) => {
    calls.push(s.lengthStuds);
    STAGES.find((st) => st.name === 'layout').run(ctx, s);
  });
  const swapped = buildModel(figure(), { lengthStuds: 16 }, stages);
  const plain = buildModel(figure(), { lengthStuds: 16 });
  assert.deepEqual(calls, [16]);
  assert.deepEqual(swapped.result.parts, plain.result.parts);
  assert.equal(STAGES.find((st) => st.name === 'layout').run.length, 2);
  assert.throws(() => withStage(STAGES, 'nope', () => {}), /no stage nope/);
  // A replacement really is used: a layout without the stacking penalty gives what that setting gives.
  const unstaggered = (ctx) => {
    ctx.laid = layout(ctx.grid, { stackPenalty: 0 });
    ctx.result = { ...ctx.laid };
  };
  const viaStage = buildModel(figure(), { lengthStuds: 16 }, withStage(STAGES, 'layout', unstaggered));
  const viaSetting = buildModel(figure(), { lengthStuds: 16, layout: { stackPenalty: 0 } });
  assert.notDeepEqual(viaSetting.result.parts, plain.result.parts);
  assert.deepEqual(viaStage.result.parts, viaSetting.result.parts);
});

test('buildModel is deterministic for the same mesh and settings', () => {
  const a = buildModel(figure(), { lengthStuds: 20 });
  const b = buildModel(figure(), { lengthStuds: 20 });
  assert.deepEqual(a.result.parts, b.result.parts);
});

test('switching off repair, slopes and tiles skips those steps', () => {
  const model = buildModel(figure(), { lengthStuds: 16, repair: false, parts: { slopes: false, inverted: false, tiles: false, round: false } });
  assert.deepEqual(model.counts, { slopes: 0, inverted: 0, tiles: 0, round: 0, welds: 0, droppedCells: 0, filled: 0 });
  assert.ok(model.result.parts.every((p) => p.kind === 'brick' || p.kind === 'plate'));
  assert.equal(model.stats.detachedParts, model.before.detachedParts);
});

test('leaving out one kind of part keeps the others on', () => {
  const s = withDefaults({ parts: { inverted: false } });
  assert.deepEqual(OPTIONAL_PARTS, ['tiles', 'slopes', 'inverted', 'round']);
  assert.deepEqual(s.parts, { tiles: true, slopes: true, inverted: false, round: true });
  assert.deepEqual(withDefaults().parts, { tiles: true, slopes: true, inverted: true, round: true }, 'every kind is on by default');
  const model = buildModel(figure(), { lengthStuds: 16, parts: { tiles: false } });
  assert.equal(model.counts.tiles, 0);
  assert.ok(model.result.parts.every((p) => p.kind !== 'tile'));
  assert.deepEqual(model.settings.parts, { tiles: false, slopes: true, inverted: true, round: true });
});

test('glTF scene → one coloured mesh in world space, material colour as sRGB', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xb40000 }));
  mesh.position.set(5, 0, 0);
  root.add(mesh);
  const coloured = colouredMeshFromGltf(root);
  assert.equal(coloured.triangles, 12);
  let minX = Infinity;
  for (let i = 0; i < coloured.positions.length; i += 3) minX = Math.min(minX, coloured.positions[i]);
  assert.ok(Math.abs(minX - 4.5) < 1e-6, 'world transform applied');
  const [r, g, b] = coloured.colourAt(0, 0.3, 0.3);
  assert.ok(Math.abs(r - 0xb4) <= 2 && g <= 2 && b <= 2, `got ${r},${g},${b}`);
});

test('mesh data and built models survive a postMessage-style structured clone', () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0xb40000 })));
  const data = meshDataFromGltf(root);
  // What the Worker receives: a structured clone, colour lookup rebuilt from data.
  const inWorker = buildModel(colouredMesh(structuredClone(data)), { lengthStuds: 12 });
  const onMain = buildModel(colouredMeshFromGltf(root), { lengthStuds: 12 });
  assert.deepEqual(inWorker.result.parts, onMain.result.parts);

  const { model, transfer } = packModel(inWorker);
  const back = unpackModel(structuredClone(model, { transfer }));
  assert.deepEqual(back.result.parts, onMain.result.parts);
  assert.equal(back.grid.index(1, 2, 0), onMain.grid.index(1, 2, 0));
  assert.deepEqual(back.grid.cells, onMain.grid.cells);
  assert.deepEqual(back.stats.flags, onMain.stats.flags);
});
