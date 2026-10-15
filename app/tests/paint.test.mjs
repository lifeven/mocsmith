import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { cellValue } from '../src/core/palette.mjs';
import { applyPaint, paintColour, paintCells, isEmptyPaint, NO_PAINT } from '../src/core/paint.mjs';
import { cellsOfPart } from '../src/core/model.mjs';
import { partAvailable } from '../src/core/catalog.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { boxesMesh } from './helpers.mjs';

const RED = 4;
const WHITE = 15;
const BLUE = 1;
const AZURE = 322;

function grid() {
  const g = new VoxelGrid(2, 1, 1);
  g.set(0, 0, 0, cellValue(RED));
  g.set(1, 0, 0, cellValue(WHITE));
  return g;
}

test('a colour mapping repaints every cell of that source colour', () => {
  const g = grid();
  const r = applyPaint(g, { colours: [[RED, BLUE]], cells: null }, 16);
  assert.deepEqual([...g.cells], [cellValue(BLUE), cellValue(WHITE)]);
  assert.deepEqual(r, { changed: 1, cellsDropped: false });
});

test('single cells apply only at the size they were painted at', () => {
  const paint = paintCells(NO_PAINT, [[1, 0, 0]], BLUE, 16);
  const same = grid();
  assert.equal(applyPaint(same, paint, 16).changed, 1);
  assert.equal(same.get(1, 0, 0), cellValue(BLUE));
  const other = grid();
  assert.deepEqual(applyPaint(other, paint, 24), { changed: 0, cellsDropped: true });
  assert.equal(other.get(1, 0, 0), cellValue(WHITE));
});

test('paintColour follows earlier mappings and single cells', () => {
  const sources = [RED, WHITE];
  let p = paintColour(NO_PAINT, sources, RED, BLUE); // red → blue
  p = paintCells(p, [[1, 0, 0]], BLUE, 16); // the white cell → blue too
  p = paintColour(p, sources, BLUE, AZURE); // everything shown blue → azure
  assert.deepEqual(p.colours, [[RED, AZURE]]);
  assert.deepEqual(p.cells.list, [[1, 0, 0, AZURE]]);
  // Mapping a colour back to itself drops the entry.
  assert.deepEqual(paintColour(p, sources, AZURE, RED).colours, []);
  assert.ok(isEmptyPaint(NO_PAINT));
});

test('paintCells replaces single-cell paint from another size', () => {
  const p = paintCells(paintCells(NO_PAINT, [[0, 0, 0]], BLUE, 16), [[1, 0, 0]], RED, 24);
  assert.deepEqual(p.cells, { lengthStuds: 24, list: [[1, 0, 0, RED]] });
});

test('recolouring through the pipeline re-lays the bricks with parts made in the new colour', () => {
  // A white slab; Medium Azure has no 2x8 brick (3007) and no 1x12 plate (60479 in some colours).
  const mesh = boxesMesh([[[0, 0, 0], [2, 0.3, 0.25], [244, 244, 244]]]);
  const plain = buildModel(mesh, { lengthStuds: 24 });
  assert.deepEqual(plain.sourceCodes, [WHITE]);
  const azure = buildModel(mesh, { lengthStuds: 24, paint: paintColour(NO_PAINT, plain.sourceCodes, WHITE, AZURE) });
  assert.ok(azure.result.parts.every((p) => p.color === cellValue(AZURE)));
  assert.ok(azure.result.parts.every(partAvailable));
  assert.ok(azure.painted.changed > 0);
  assert.equal(azure.stats.detachedParts, plain.stats.detachedParts);
});

test('cellsOfPart covers a brick box and a slope cell list', () => {
  assert.equal(cellsOfPart({ kind: 'brick', x: 1, y: 0, z: 2, w: 2, d: 4, h: 3 }).length, 24);
  assert.deepEqual(cellsOfPart({ kind: 'slope', cells: [[0, 0, 0], [1, 0, 0]] }), [[0, 0, 0], [1, 0, 0]]);
});

test('painting one built part re-lays only that spot in the new colour', () => {
  const mesh = boxesMesh([[[0, 0, 0], [2, 0.3, 0.25], [244, 244, 244]]]);
  const plain = buildModel(mesh, { lengthStuds: 24 });
  const part = plain.result.parts.find((p) => p.kind === 'brick');
  const paint = paintCells(NO_PAINT, cellsOfPart(part), RED, 24);
  const one = buildModel(mesh, { lengthStuds: 24, paint });
  const red = one.result.parts.filter((p) => p.color === cellValue(RED));
  assert.equal(red.reduce((n, p) => n + p.w * p.d * p.h, 0), part.w * part.d * part.h);
  assert.ok(one.result.parts.every(partAvailable));
});
