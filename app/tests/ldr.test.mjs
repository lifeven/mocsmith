import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placement, partLine, exportLdr, exportPartsCsv, fileStem } from '../src/io/ldr.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { planBuild } from '../src/steps/plan.mjs';
import { cellValue } from '../src/core/palette.mjs';
import { boxesMesh } from './helpers.mjs';

const WHITE = cellValue(15);

/** World-space LDraw box of a brick/plate/tile from its line: local box is long side along X. */
function ldrawBox(p) {
  const { pos, rot } = placement(p);
  const long = Math.max(p.w, p.d) * 10;
  const short = Math.min(p.w, p.d) * 10;
  const corners = [];
  for (const x of [-long, long]) for (const y of [0, p.h * 8]) for (const z of [-short, short]) corners.push([x, y, z]);
  const world = corners.map(([x, y, z]) => [0, 1, 2].map((r) => rot[r * 3] * x + rot[r * 3 + 1] * y + rot[r * 3 + 2] * z + pos[r]));
  return [0, 1, 2].map((a) => [Math.min(...world.map((c) => c[a])) + 0, Math.max(...world.map((c) => c[a])) + 0]);
}

/** The same box from our grid coordinates: (20x, −8y, −20z). */
function gridBox(p) {
  return [
    [p.x * 20, (p.x + p.w) * 20],
    [-(p.y + p.h) * 8, -p.y * 8],
    [-(p.z + p.d) * 20, -p.z * 20],
  ].map((r) => r.map((v) => v + 0));
}

test('a 2x4 brick lying along x or z lands on its grid box', () => {
  const along = { kind: 'brick', x: 0, y: 0, z: 0, w: 4, d: 2, h: 3, color: WHITE };
  assert.deepEqual(placement(along), { pos: [40, -24, -20], rot: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
  assert.equal(partLine(along), '1 15 40 -24 -20 1 0 0 0 1 0 0 0 1 3001.dat');
  const across = { ...along, x: 3, y: 6, z: 1, w: 2, d: 4 };
  assert.deepEqual(ldrawBox(across), gridBox(across));
});

test('slopes face downhill: local −Z turns to the slope direction', () => {
  const base = { kind: 'slope', ldraw: '4286', studs: 1, y: 0, h: 3, color: WHITE };
  // Downhill +x in the grid is +X in LDraw; stud row at the low-x end.
  const east = placement({ ...base, dir: [1, 0], x: 0, z: 0, w: 3, d: 1 });
  assert.deepEqual(east.pos, [10, -24, -10]);
  const r = east.rot;
  assert.deepEqual([-r[2], -r[5], -r[8]].map((v) => v + 0), [1, 0, 0]); // R · (0, 0, −1)
  // Downhill +z in the grid is −Z in LDraw, which is the part's own orientation.
  const south = placement({ ...base, dir: [0, 1], x: 0, z: 0, w: 1, d: 3 });
  assert.deepEqual(south.rot.map((v) => v + 0), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  // Downhill −x: the stud row is at the high-x end.
  const west = placement({ ...base, dir: [-1, 0], x: 0, z: 0, w: 3, d: 1 });
  assert.deepEqual(west.pos, [50, -24, -10]);
});

test('a built model exports every part once, one 0 STEP per building step, boxes matching the grid', () => {
  const model = buildModel(boxesMesh([[[0, 0, 0], [1, 0.5, 0.6], [180, 0, 0]], [[0.1, 0.5, 0.1], [0.9, 0.8, 0.5], [244, 244, 244]]]), { lengthStuds: 16 });
  const text = exportLdr(model, '我的 模型/1');
  const lines = text.split('\r\n');
  assert.equal(lines[0], '0 我的 模型/1');
  assert.equal(lines[1], '0 Name: 我的-模型-1.ldr');
  assert.match(lines[3], /^0 \/\/ LEGO® /, 'the header carries the trademark note');
  assert.equal(lines.filter((l) => l.startsWith('1 ')).length, model.result.parts.length);
  assert.equal(lines.filter((l) => l === '0 STEP').length, planBuild(model).steps.length);
  for (const p of model.result.parts.filter((q) => q.kind !== 'slope')) assert.deepEqual(ldrawBox(p), gridBox(p));
});

test('parts CSV has Rebrickable columns and adds up', () => {
  const model = buildModel(boxesMesh([[[0, 0, 0], [1, 0.4, 0.5], [244, 244, 244]]]), { lengthStuds: 16 });
  const rows = exportPartsCsv(model).trim().split('\n');
  assert.equal(rows[0], 'Part,Color,Quantity');
  const total = rows.slice(1).reduce((n, r) => n + Number(r.split(',')[2]), 0);
  assert.equal(total, model.result.parts.length);
  assert.ok(rows.slice(1).every((r) => r.split(',')[1] === '15'));
});

test('file stems drop characters file systems reject', () => {
  assert.equal(fileStem('a/b:c d'), 'a-b-c-d');
  assert.equal(fileStem('  '), 'model');
});
