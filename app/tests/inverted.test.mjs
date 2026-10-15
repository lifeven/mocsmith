import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout } from '../src/convert/layout.mjs';
import { check } from '../src/core/check.mjs';
import { applySlopes } from '../src/convert/slopes.mjs';
import { buildModel, STAGES, withStage } from '../src/convert/build.mjs';
import { slopeCells } from '../src/core/parts.mjs';
import { partLine, exportLdr, exportPartsCsv } from '../src/io/ldr.mjs';
import { parseLdr, importedModel } from '../src/io/ldr-import.mjs';
import { canPlace } from '../src/core/edit.mjs';
import { partInfo } from '../src/ui/words.mjs';
import { slopeShape, PLATE_H, STUD_H, GAP } from '../src/render/shapes.mjs';
import { cellValue } from '../src/core/palette.mjs';
import { assertTiling, boxesMesh, fillBox } from './helpers.mjs';

const W = cellValue(15);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

/**
 * A brick-tall column at x = 0 with a shelf `length` studs long sticking out
 * along +x from its top (`thick` plates), nothing under the shelf: the
 * underside an inverted slope fits.
 */
function overhang(width, length = 1, thick = 1) {
  const grid = new VoxelGrid(1 + length, 3, width);
  fillBox(grid, [0, 0, 0], [1, 3, width], W);
  fillBox(grid, [1, 3 - thick, 0], [1 + length, 3, width], W);
  return grid;
}

const inverted = (result) => result.parts.filter((p) => p.kind === 'inverted');

test('an overhang one plate thick gets an inverted slope, and the shelf is no longer loose or hanging', () => {
  for (const [width, length, ldraw] of [[1, 1, '3665b'], [2, 1, '3660b'], [1, 2, '4287b']]) {
    const grid = overhang(width, length);
    const cells = grid.cells.slice();
    const result = layout(grid);
    const before = check(grid, result);
    assert.ok(before.detachedParts > 0, 'the shelf only touches the column at its side');
    assert.equal(applySlopes(grid, result, { inverted: true }), 1, ldraw);
    const [slope] = inverted(result);
    assert.equal(slope.ldraw, ldraw);
    assert.deepEqual(slope.dir, [1, 0]);
    assert.equal(slope.cells.length, width * (3 + length)); // full-height column + the top plate of each slope column
    assert.ok(slope.cells.filter(([x]) => x > 0).every(([, y]) => y === 2), 'slope columns own only their top plate');
    const after = check(grid, result);
    assert.equal(after.detachedParts, 0);
    assert.equal(after.hangingParts, 0);
    assert.deepEqual(grid.cells, cells, 'filled cells unchanged');
    assertTiling(grid, result);
  }
});

test('a two-plate overhang gets one only with the tolerance, which lets it own the middle cells', () => {
  const grid = overhang(1, 1, 2);
  assert.equal(applySlopes(grid, layout(grid), { inverted: true }), 0);
  const loose = layout(grid);
  assert.equal(applySlopes(grid, loose, { inverted: true, tolerance: true }), 1);
  assert.equal(inverted(loose)[0].cells.length, 5); // 3 + the middle and top plate in front
  assertTiling(grid, loose);
});

test('the inverted pass leaves an ordinary step alone, and the slope pass leaves an overhang alone', () => {
  const step = new VoxelGrid(2, 3, 1);
  fillBox(step, [0, 0, 0], [1, 3, 1], W);
  fillBox(step, [1, 0, 0], [2, 1, 1], W);
  assert.equal(applySlopes(step, layout(step), { inverted: true }), 0);
  const shelf = overhang(1);
  assert.equal(applySlopes(shelf, layout(shelf)), 0);
});

test('the stage is on by default and can be switched off', () => {
  // The whole instant layer on the overhang grid (voxelize swapped for it).
  const stages = withStage(STAGES, 'voxelize', (ctx) => {
    ctx.grid = overhang(2);
    ctx.sourceCodes = [15];
  });
  const mesh = boxesMesh([[[0, 0, 0], [1, 1, 1], [255, 255, 255]]]);
  const on = buildModel(mesh, { lengthStuds: 2 }, stages);
  const off = buildModel(mesh, { lengthStuds: 2, parts: { inverted: false } }, stages);
  assert.equal(on.counts.inverted, 1);
  assert.equal(inverted(on.result).length, 1);
  assert.equal(off.counts.inverted, 0);
  assert.equal(inverted(off.result).length, 0);
  assert.equal(buildModel(mesh, { lengthStuds: 2, parts: { slopes: false } }, stages).counts.inverted, 1, 'its own switch, not tied to the slopes');
  assert.ok(on.stats.detachedParts <= off.stats.detachedParts);
  assert.ok(on.stats.hangingParts <= off.stats.hangingParts);
  assert.ok(Number.isFinite(on.ms.inverted));
});

/** Four posts, each with a shelf toward a different side (−x, +x, −z, +z), as one model. */
function fourWays() {
  const grid = new VoxelGrid(9, 3, 9);
  for (const [px, pz, sx, sz] of [[1, 4, 0, 4], [7, 4, 8, 4], [4, 1, 4, 0], [4, 7, 4, 8]]) {
    fillBox(grid, [px, 0, pz], [px + 1, 3, pz + 1], W);
    fillBox(grid, [sx, 2, sz], [sx + 1, 3, sz + 1], W);
  }
  const result = layout(grid);
  applySlopes(grid, result, { inverted: true });
  return importedModel({ parts: result.parts.map(({ id, ...p }) => p), skipped: {} }).model;
}

test('.ldr: inverted slopes are written as the current LDraw parts and read back the same, in every direction', () => {
  const model = fourWays();
  const dirs = inverted(model.result).map((p) => p.dir.join(','));
  assert.deepEqual([...new Set(dirs)].sort(), ['-1,0', '0,-1', '0,1', '1,0']);
  const text = exportLdr(model, 'shelves');
  assert.match(text, /3665b\.dat/);
  const back = importedModel(parseLdr(text));
  assert.deepEqual(back.skipped, {});
  const key = (p) => [p.kind, p.x, p.y, p.z, p.w, p.d, p.h, p.dir?.join(',') ?? '', p.ldraw ?? '', (p.cells ?? []).map(String).sort().join(' ')].join('|'); // cells as a set
  assert.deepEqual(back.model.result.parts.map(key).sort(), model.result.parts.map(key).sort());
});

test('.ldr line and CSV: LDraw number in the file, Rebrickable number in the parts list', () => {
  const p = { kind: 'inverted', ldraw: '3665b', studs: 1, dir: [1, 0], x: 0, y: 0, z: 0, w: 2, d: 1, h: 3, color: W };
  // Origin at the top of the full-height column, thin front toward local −Z (same frame as a slope).
  assert.equal(partLine(p), '1 15 10 -24 -10 0 0 -1 0 1 0 1 0 0 3665b.dat');
  const model = importedModel({ parts: [p], skipped: {} }).model;
  assert.match(exportPartsCsv(model), /^3665,15,1$/m);
  assert.equal(partInfo(model.result.parts[0]).url, 'https://rebrickable.com/parts/3665/');
});

test('editing: studs all over an inverted slope\u2019s top, nothing under its sloped face', () => {
  const slope = { kind: 'inverted', ldraw: '3665b', studs: 1, dir: [1, 0], x: 0, y: 3, z: 0, w: 2, d: 1, h: 3, color: W };
  const parts = [{ kind: 'brick', x: 0, y: 0, z: 0, w: 1, d: 1, h: 3, color: W }, { ...slope, cells: slopeCells(slope) }];
  const { model } = importedModel({ parts, skipped: {} });
  const plate = (x, y) => ({ kind: 'plate', x, y, z: 0, w: 1, d: 1, h: 1, color: W });
  assert.deepEqual(canPlace(model, plate(1, 6)), { ok: true }); // on the front stud
  assert.equal(canPlace(model, plate(1, 4)).reason, 'overlap'); // inside the sloped face
  assert.equal(canPlace(model, plate(1, 2)).reason, 'floating'); // under it: no tube to hang from
});

test('the drawn shape: studs over the whole top, the underside rising to a thin front', () => {
  const g = slopeShape('3665b');
  const pos = g.getAttribute('position');
  const H = 3 * PLATE_H;
  let studMinX = Infinity;
  let studMaxX = -Infinity;
  let frontBottom = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const [x, y] = [pos.getX(i), pos.getY(i)];
    if (y > H) [studMinX, studMaxX] = [Math.min(studMinX, x), Math.max(studMaxX, x)];
    if (x > 1 - GAP) frontBottom = Math.min(frontBottom, y);
  }
  assert.ok(studMinX < -0.5 && studMaxX > 0.5, `studs over both rows: ${studMinX}..${studMaxX}`);
  near(g.boundingBox.max.y, H + STUD_H, 'top of studs');
  near(frontBottom, H * (5 / 6), 'front lip: 4 of 24 LDU thick');
});
