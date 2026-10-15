import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMosaic } from '../src/mosaic/mosaic.mjs';
import { SURFACE_PARTS, mosaicPalette, ldrawCode } from '../src/mosaic/palette.mjs';
import { planBases, partsList, baseColours, defaultBaseColour, BASES } from '../src/mosaic/base.mjs';
import { mosaicLdr, mosaicPartsCsv } from '../src/io/mosaic-ldr.mjs';

/** RGBA image with colour bands, so a mosaic uses several colours. */
function bands(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  const colours = [[200, 30, 20], [20, 90, 190], [250, 205, 50], [30, 30, 30], [245, 245, 245]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([...colours[Math.floor((x + y) / 7) % colours.length], 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

const byKey = (plans) => Object.fromEntries(plans.map((p) => [p.key, p]));

test('planBases: panel, pin and baseplate counts for four sizes', () => {
  // [width, height, panels, pins, 48 × 48 count or 0, 32 × 32 count or 0]
  const cases = [
    [32, 32, 4, 12, 0, 1],
    [48, 48, 9, 36, 1, 0],
    [64, 48, 12, 51, 0, 0],
    [96, 64, 24, 114, 0, 6],
  ];
  for (const [w, h, panels, pins, b48, b32] of cases) {
    const p = byKey(planBases(w, h));
    assert.equal(p.panels.count, panels, `${w}×${h} panels`);
    assert.equal(p.panels.pins, pins, `${w}×${h} pins`);
    assert.ok(p.panels.fits && p.panels.joined);
    assert.equal(p.baseplate48.fits, b48 > 0);
    assert.equal(p.baseplate48.count, b48);
    assert.equal(p.baseplate32.fits, b32 > 0);
    assert.equal(p.baseplate32.count, b32);
    // One baseplate holds together; several need a board behind them.
    assert.equal(p.baseplate32.joined, b32 === 1);
    assert.equal(p.baseplate48.pins, 0);
  }
  // LEGO's World Map 31203 is 8 × 5 panels: 67 shared edges, 201 pins (+5 for the hanger).
  assert.equal(byKey(planBases(128, 80)).panels.pins, 201);
});

test('base colours are ones LEGO made; defaults are black panels and pins, grey baseplates', () => {
  assert.equal(defaultBaseColour(BASES.panels.part), 0);
  assert.equal(defaultBaseColour(BASES.panels.pin), 0);
  assert.equal(defaultBaseColour(BASES.baseplate32.part), 72);
  assert.equal(defaultBaseColour(BASES.baseplate48.part), 71);
  for (const { part, pin } of Object.values(BASES)) {
    for (const id of [part, pin].filter(Boolean)) assert.ok(baseColours(id).some((c) => c.code === defaultBaseColour(id)), `${id} default is a made colour`);
  }
  assert.ok(baseColours('65803').length <= 6, '65803 came in only a few colours');
});

test('partsList: one surface part per cell, then base and pins', () => {
  const m = buildMosaic(bands(640, 480), { studs: 64, maxColours: 6 });
  assert.deepEqual([m.width, m.height], [64, 48]);
  const plan = byKey(planBases(m.width, m.height)).panels;
  const rows = partsList(m, plan);
  const surface = rows.filter((r) => r.role === 'surface');
  assert.equal(surface.reduce((s, r) => s + r.quantity, 0), 64 * 48);
  assert.equal(new Set(surface.map((r) => r.colour)).size, surface.length, 'one row per colour');
  assert.ok(surface.every((r) => r.part === '98138'));
  assert.deepEqual(rows.filter((r) => r.role !== 'surface').map((r) => [r.part, r.colour, r.quantity]), [['65803', 0, 12], ['2780', 0, 51]]);
  assert.throws(() => partsList(m, byKey(planBases(64, 48)).baseplate48), /does not fit/);
  const csv = mosaicPartsCsv(rows).trim().split('\n');
  assert.equal(csv[0], 'Part,Color,Quantity');
  assert.equal(csv.length, rows.length + 1);
});

test('partsList: 2.5D raise plates come last, largest first, in black', () => {
  const m = buildMosaic(bands(640, 480), { studs: 64, maxColours: 6 });
  const plan = byKey(planBases(m.width, m.height)).panels;
  const raise = new Map([['3024', 5], ['3035', 2], ['3023', 0]]);
  const rows = partsList(m, plan, { raise });
  const tail = rows.slice(-2);
  assert.deepEqual(tail.map((r) => [r.part, r.colour, r.quantity, r.role, r.size]), [['3035', 0, 2, 'raise', [4, 8]], ['3024', 0, 5, 'raise', [1, 1]]]);
  assert.equal(rows.filter((r) => r.role === 'raise').length, 2, 'no row for a size with 0');
  assert.equal(partsList(m, plan, { raise: null }).length, rows.length - 2);
});

test('mosaicLdr with 2.5D: black raise plates under raised cells, surface parts lifted, plates step before their block', async () => {
  const { raisePlates } = await import('../src/mosaic/relief.mjs');
  const m = buildMosaic(bands(640, 480), { studs: 64, maxColours: 6 });
  const plan = byKey(planBases(m.width, m.height)).panels;
  const levels = new Uint8Array(m.width * m.height);
  // Left 20 columns 2 plates up, the next 3 columns 1 plate up.
  for (let r = 0; r < m.height; r++) for (let c = 0; c < 23; c++) levels[r * m.width + c] = c < 20 ? 2 : 1;
  const relief = raisePlates(levels, m.width, m.height, plan.side);
  const flat = mosaicLdr(m, plan, { name: 'flat' });
  assert.equal(mosaicLdr(m, plan, { name: 'flat', relief: null }), flat);
  const lines = mosaicLdr(m, plan, { name: 'raised', relief }).split('\r\n');
  const parts = lines.filter((l) => l.startsWith('1 ')).map((l) => l.split(' '));
  const plates = parts.filter((p) => p[14] !== `${m.partId}.dat` && !['65803.dat', '2780.dat'].includes(p[14]));
  assert.equal(plates.length, relief.plates.length);
  assert.ok(plates.every((p) => p[1] === '0'), 'raise plates are black');
  assert.deepEqual([...new Set(plates.map((p) => p[3]))].sort(), ['-16', '-8']);
  // A 2 × 8 strip down the picture is turned (long side along Z).
  const p = relief.plates.find((q) => q.h > q.w);
  const turned = plates.find((q) => Number(q[2]) === (p.x + p.w / 2) * 20 && Number(q[4]) === -(p.y + p.h / 2) * 20 && Number(q[3]) === -8 * (p.z + 1));
  assert.deepEqual(turned.slice(5, 14).map(Number), [0, 0, 1, 0, 1, 0, -1, 0, 0]);
  // Surface parts: y = -8 - 8 × height.
  const surface = parts.filter((q) => q[14] === `${m.partId}.dat`);
  assert.equal(surface.length, m.width * m.height);
  const yOf = (c, r) => Number(surface.find((q) => Number(q[2]) === (c + 0.5) * 20 && Number(q[4]) === -(r + 0.5) * 20)[3]);
  assert.deepEqual([yOf(0, 0), yOf(21, 5), yOf(40, 30)], [-24, -16, -8]);
  // Steps: the base, then for the first block its plates, then its surface parts.
  const steps = lines.join('\n').split('0 STEP');
  assert.ok(steps[1].includes('0 ') && !steps[1].includes(`${m.partId}.dat`), 'block 1 starts with plates only');
  assert.ok(steps[2].includes(`${m.partId}.dat`));
});

test('mosaicLdr: every cell on top of the base, pins on shared edges, steps per 16 × 16 block', () => {
  const m = buildMosaic(bands(640, 480), { studs: 64, maxColours: 6 });
  const plan = byKey(planBases(m.width, m.height)).panels;
  const text = mosaicLdr(m, plan, { name: 'test mosaic' });
  const lines = text.split('\r\n');
  assert.equal(lines[1], '0 Name: test-mosaic.ldr');
  assert.match(lines[3], /^0 \/\/ LEGO® /, 'the header carries the trademark note');
  const parts = lines.filter((l) => l.startsWith('1 ')).map((l) => l.split(' '));
  const of = (id) => parts.filter((p) => p[14] === `${id}.dat`);
  assert.equal(of('98138').length, 64 * 48);
  assert.equal(of('65803').length, 12);
  assert.equal(of('2780').length, 51);
  assert.equal(lines.filter((l) => l === '0 STEP').length, 1 + 4 * 3);
  // Cells sit 8 LDU above the base top, inside the base's 64 × 48 stud area.
  for (const p of of('98138')) {
    const [x, y, z] = p.slice(2, 5).map(Number);
    assert.equal(y, -8);
    assert.ok(x > 0 && x < 64 * 20 && z < 0 && z > -48 * 20);
  }
  // Pins on a panel border, 18 LDU below the top.
  for (const p of of('2780')) {
    const [x, y, z] = p.slice(2, 5).map(Number);
    assert.equal(y, 18);
    assert.ok(x % 320 === 0 || z % 320 === 0);
  }
  // Tile colours in the file add up to the parts list (LDraw codes).
  const want = new Map(partsList(m, plan).filter((r) => r.role === 'surface').map((r) => [String(ldrawCode(r.colour)), r.quantity]));
  const got = new Map();
  for (const p of of('98138')) got.set(p[1], (got.get(p[1]) ?? 0) + 1);
  assert.deepEqual(got, want);
  assert.throws(() => mosaicLdr(m, byKey(planBases(32, 32)).panels, { name: 'x' }), /does not match/);
});

test('mosaicLdr on one 48 × 48 baseplate: no pins', () => {
  const m = buildMosaic(bands(480, 480), { studs: 48, part: 'squareTile' });
  const plan = byKey(planBases(48, 48)).baseplate48;
  const parts = mosaicLdr(m, plan, { name: 'b' }).split('\r\n').filter((l) => l.startsWith('1 '));
  assert.equal(parts.filter((l) => l.endsWith(' 4186.dat')).length, 1);
  assert.equal(parts.filter((l) => l.endsWith(' 2780.dat')).length, 0);
  assert.equal(parts.filter((l) => l.endsWith(' 3070b.dat')).length, 48 * 48);
  assert.ok(parts.find((l) => l.endsWith(' 4186.dat')).startsWith('1 71 480 0 -480 '), 'centred under the 48 × 48 stud area');
});

test('ldrawCode maps the Rebrickable ids that differ from LDraw', () => {
  assert.equal(ldrawCode(0), 0);
  assert.equal(ldrawCode(1050), 353); // Coral
  assert.equal(ldrawCode(158), 326); // Yellowish Green
  assert.equal(ldrawCode(1051), '0x25AC4DA'); // no LDraw code: direct colour
  for (const c of mosaicPalette('roundTile')) assert.ok(c.ldraw !== undefined);
});

test('every colour a mosaic can use by default, and every base default, has a name in both languages', () => {
  const zh = JSON.parse(readFileSync(new URL('../src/i18n/zh-CN.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
  const codes = new Set();
  for (const kind of Object.keys(SURFACE_PARTS)) for (const c of mosaicPalette(kind)) codes.add(c.code);
  for (const { part, pin } of Object.values(BASES)) for (const id of [part, pin].filter(Boolean)) codes.add(defaultBaseColour(id));
  for (const code of codes) {
    const key = `colour.${ldrawCode(code)}`;
    assert.ok(zh[key] && en[key], `${key} (Rebrickable ${code})`);
  }
});
