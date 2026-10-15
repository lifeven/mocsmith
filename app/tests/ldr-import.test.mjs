import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportLdr } from '../src/io/ldr.mjs';
import { parseLdr, importedModel } from '../src/io/ldr-import.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout } from '../src/convert/layout.mjs';
import { repair } from '../src/convert/repair.mjs';
import { applySlopes } from '../src/convert/slopes.mjs';
import { applyTiles } from '../src/convert/tiles.mjs';
import { check } from '../src/core/check.mjs';
import { rebuildWithCells } from '../src/core/model.mjs';
import { cellValue } from '../src/core/palette.mjs';
import { boxesMesh, fillBox } from './helpers.mjs';

const RED = cellValue(4);
const WHITE = cellValue(15);

/** Comparable part records, shifted so the minimum corner is the origin. */
function normalised(parts) {
  const min = (k) => Math.min(...parts.map((p) => p[k]));
  const [ox, oy, oz] = [min('x'), min('y'), min('z')];
  return parts
    .map((p) => [p.kind, p.x - ox, p.y - oy, p.z - oz, p.w, p.d, p.h, p.color, p.dir?.join(',') ?? '', p.ldraw ?? ''].join('|'))
    .sort();
}

/**
 * A stepped roof (every brick step down has a one-plate ledge in front, as in
 * surface.test.mjs), stepping down along +x, −x, +z or −z, with a white top
 * row: lays out to bricks, plates, tiles and slopes in all four directions.
 */
function roofModel(axis, sign) {
  const n = 8;
  const width = 3;
  const grid = new VoxelGrid(axis === 'x' ? n : width, 13, axis === 'x' ? width : n);
  for (let i = 0; i < n; i++) {
    const k = sign > 0 ? i : n - 1 - i;
    const h = 12 - 3 * Math.floor(k / 2) - (k % 2 ? 2 : 0);
    const [x0, z0, x1, z1] = axis === 'x' ? [i, 0, i + 1, width] : [0, i, width, i + 1];
    fillBox(grid, [x0, 0, z0], [x1, Math.max(1, h), z1], RED);
  }
  fillBox(grid, axis === 'x' ? [0, 12, 0] : [0, 12, 0], axis === 'x' ? [1, 13, width] : [width, 13, 1], WHITE);
  const result = repair(grid, layout(grid));
  const slopes = applySlopes(grid, result);
  const tiles = applyTiles(grid, result);
  return { grid, result, stats: check(grid, result), counts: { slopes, tiles } };
}

test('export → import gives back exactly the same parts, slopes facing all four ways', () => {
  for (const [axis, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    const model = roofModel(axis, sign);
    assert.ok(model.counts.slopes > 0 && model.counts.tiles > 0, `${axis}${sign}: sample should have slopes and tiles`);
    const parsed = parseLdr(exportLdr(model, '测试块'));
    assert.equal(parsed.name, '测试块');
    assert.deepEqual(parsed.skipped, {});
    const { model: back, skipped } = importedModel(parsed);
    assert.deepEqual(skipped, {});
    assert.deepEqual(normalised(back.result.parts), normalised(model.result.parts), `${axis}${sign}`);
    assert.equal(back.stats.detachedParts, model.stats.detachedParts);
    assert.equal(back.counts.slopes, model.counts.slopes);
  }
});

test('round parts survive the round trip as round parts, and read at any turn', () => {
  // A 2×12 plate with each round part standing on it.
  const grid = new VoxelGrid(12, 4, 2);
  const parts = [{ kind: 'plate', x: 0, y: 0, z: 0, w: 12, d: 2, h: 1, color: RED }];
  let x = 0;
  for (const [kind, ldraw, n, h] of [['brick', '3062b', 1, 3], ['brick', '3941', 2, 3], ['plate', '6141', 1, 1], ['plate', '4032b', 2, 1], ['tile', '98138', 1, 1], ['tile', '14769', 2, 1]]) {
    parts.push({ kind, ldraw, x, y: 1, z: 0, w: n, d: n, h, color: WHITE });
    x += n;
  }
  for (const p of parts) fillBox(grid, [p.x, p.y, p.z], [p.x + p.w, p.y + p.h, p.z + p.d], p.color);
  const result = rebuildWithCells(grid, parts);
  const model = { grid, result, stats: check(grid, result) };
  const text = exportLdr(model, 'round');
  for (const id of ['3062b', '3941', '6141', '4032b', '98138', '14769']) assert.ok(text.includes(` ${id}.dat`), `${id} exported`);
  const parsed = parseLdr(text);
  assert.deepEqual(parsed.skipped, {});
  const { model: back } = importedModel(parsed);
  assert.deepEqual(normalised(back.result.parts), normalised(model.result.parts));
  assert.equal(back.stats.detachedParts, 0);
  // Turned 45° about Y: still a round 1×1 plate in the same cell.
  const s = Math.SQRT1_2;
  const turned = parseLdr(`1 4 10 -8 -10 ${s} 0 ${s} 0 1 0 ${-s} 0 ${s} 6141.dat\n`);
  assert.deepEqual(turned.skipped, {});
  assert.equal(turned.parts[0].ldraw, '6141');
});

test('a model built from a mesh survives the round trip too', () => {
  const model = buildModel(boxesMesh([[[0, 0, 0], [1.2, 0.4, 0.6], [180, 0, 0]], [[0.1, 0.4, 0.1], [0.7, 0.6, 0.5], [244, 244, 244]]]), { lengthStuds: 20 });
  const { model: back } = importedModel(parseLdr(exportLdr(model, 'm')));
  assert.deepEqual(normalised(back.result.parts), normalised(model.result.parts));
});

test('unknown parts, colours, tilted parts and off-grid parts are skipped and counted', () => {
  const text = [
    '0 FILE main.ldr',
    '0 Test',
    '1 15 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat', // fine
    '1 15 0 -48 0 1 0 0 0 1 0 0 0 1 3626c.dat', // minifig head: unknown part
    '1 999 0 -48 0 1 0 0 0 1 0 0 0 1 3001.dat', // colour not in palette
    '1 15 0 -48 0 1 0 0 0 0 -1 0 1 0 3001.dat', // lying on its side
    '1 15 5 -48 0 1 0 0 0 1 0 0 0 1 3001.dat', // 5 LDU off the stud grid
    '1 15 0 -48 0 1 0 0 0 1 0 0 0 1 wheel.ldr', // submodel reference
    '0 FILE wheel.ldr',
    '1 15 0 -72 0 1 0 0 0 1 0 0 0 1 3001.dat', // inside the submodel: not read
  ].join('\n');
  const parsed = parseLdr(text);
  assert.equal(parsed.name, 'Test');
  assert.equal(parsed.parts.length, 1);
  assert.deepEqual(parsed.skipped, { part: 1, colour: 1, rotation: 1, grid: 1, submodel: 1 });
});

test('overlapping parts keep the first one', () => {
  const brick = '1 15 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat';
  const { model, skipped } = importedModel(parseLdr(`${brick}\n${brick}`));
  assert.equal(model.result.parts.length, 1);
  assert.deepEqual(skipped, { overlap: 1 });
  assert.deepEqual([model.grid.sx, model.grid.sy, model.grid.sz], [4, 3, 2]);
});
