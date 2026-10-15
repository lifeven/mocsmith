import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMosaic } from '../src/mosaic/mosaic.mjs';
import { mosaicPalette } from '../src/mosaic/palette.mjs';
import { deltaE2000, linToLab, toLinear, labToLin, linToOklab100, DEFAULT_METRIC } from '../src/mosaic/colour.mjs';
import { gridSize, fitCrop, sampleLab } from '../src/mosaic/sample.mjs';
import { quantize, KERNELS } from '../src/mosaic/quantize.mjs';

/** RGBA image filled by fn(x, y) -> [r, g, b] (or [r, g, b, a]). */
function image(width, height, fn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

test('deltaE2000 matches Sharma, Wu & Dalal (2005) test data', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[50, 2.5, 0], [56, -27, -3], 31.903],
    [[50, 2.5, 0], [58, 24, 15], 19.4535],
  ];
  for (const [a, b, want] of pairs) {
    assert.ok(Math.abs(deltaE2000(a, b) - want) < 1e-4, `${a} vs ${b}: ${deltaE2000(a, b)} != ${want}`);
    assert.ok(Math.abs(deltaE2000(b, a) - want) < 1e-4, 'symmetric');
  }
  assert.equal(deltaE2000([40, 10, -5], [40, 10, -5]), 0);
});

test('gridSize: long side in multiples of 16, short side keeps the aspect', () => {
  assert.deepEqual(gridSize({ w: 1000, h: 1000 }, 48), { width: 48, height: 48 });
  assert.deepEqual(gridSize({ w: 1600, h: 900 }, 64), { width: 64, height: 32 });
  assert.deepEqual(gridSize({ w: 900, h: 1600 }, 64), { width: 32, height: 64 });
  assert.deepEqual(gridSize({ w: 4000, h: 100 }, 50), { width: 48, height: 16 });
});

test('sampleLab: area average keeps a 1-pixel bright line as a lighter cell', () => {
  // 64×64 black image with one white column; shrunk to 16×16, its cell column is 1/4 white.
  const img = image(64, 64, (x) => (x === 9 ? [255, 255, 255] : [0, 0, 0]));
  const lab = sampleLab(img, { x: 0, y: 0, w: 64, h: 64 }, 16, 16);
  const L = (cx, cy) => lab[(cy * 16 + cx) * 3];
  const want = linToLab(0.25, 0.25, 0.25)[0];
  assert.ok(Math.abs(L(2, 5) - want) < 0.01, `line cell L ${L(2, 5)} want ${want}`);
  assert.ok(L(3, 5) < 0.01 && L(1, 5) < 0.01, 'neighbours stay black');
});

test('sampleLab: transparent pixels count as white', () => {
  const img = image(8, 8, () => [0, 0, 0, 0]);
  const lab = sampleLab(img, { x: 0, y: 0, w: 8, h: 8 }, 1, 1);
  assert.ok(Math.abs(lab[0] - 100) < 0.01);
});

test('a solid image uses one colour: the nearest made colour', () => {
  const m = buildMosaic(image(40, 40, () => [180, 0, 0]), { studs: 16 });
  assert.equal(m.width, 16);
  assert.equal(m.colours.length, 1);
  assert.equal(m.colours[0].count, 256);
  assert.match(m.colours[0].name, /red/i);
});

test('palette: only plain colours in ≥ 10 sets by default; special ones on request', () => {
  const plain = mosaicPalette('roundTile');
  assert.ok(plain.length >= 30 && plain.every((c) => c.sets >= 10));
  assert.ok(!plain.some((c) => /pearl|metallic|chrome/i.test(c.name)));
  assert.ok(mosaicPalette('roundTile', { special: true, minSets: 0 }).length > plain.length);
  for (const c of plain) assert.deepEqual(c.lab, linToLab(...c.rgb.map(toLinear)));
});

test('quantize: colour cap is respected and costs error', () => {
  const img = image(64, 64, (x, y) => [x * 4, y * 4, 255 - x * 2]);
  const free = buildMosaic(img, { studs: 64 });
  const capped = buildMosaic(img, { studs: 64, maxColours: 6 });
  assert.ok(free.colours.length > 6);
  assert.equal(capped.colours.length, 6);
  assert.ok(capped.error >= free.error);
  assert.equal(capped.colours.reduce((n, c) => n + c.count, 0), 64 * 64);
});

test('quantize: a small distinct patch survives the cap', () => {
  const palette = mosaicPalette('roundTile');
  const find = (name) => palette.findIndex((c) => c.name === name);
  const white = find('White');
  const grey = find('Light Bluish Gray');
  const red = find('Red');
  assert.ok(white >= 0 && grey >= 0 && red >= 0, 'test colours exist');
  // 300 white cells, 200 light-grey cells, 4 red cells (0.8 %); cap at 2.
  // Dropping red would cost the least total ΔE, but it is a detail: grey goes.
  const cells = [...Array(300).fill(white), ...Array(200).fill(grey), ...Array(4).fill(red)];
  const lab = new Float32Array(cells.flatMap((p) => palette[p].lab));
  const q = quantize(lab, palette, { maxColours: 2 });
  assert.deepEqual(q.used, [white, red].sort((a, b) => a - b));
  // With a cap of 1 the detail has to go too.
  assert.deepEqual(quantize(lab, palette, { maxColours: 1 }).used, [white]);
});

test('buildMosaic: 64×64 from a 1024×1024 photo-like image is fast', () => {
  const img = image(1024, 1024, (x, y) => [(x * 7 + y * 3) % 256, (x * y) % 256, (y * 5) % 256]);
  const t0 = performance.now();
  const m = buildMosaic(img, { studs: 64, maxColours: 12 });
  const ms = performance.now() - t0;
  assert.equal(m.width * m.height, 4096);
  assert.ok(m.colours.length <= 12);
  console.log(`  64×64 from 1024×1024, 12 colours: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 2000, `${ms} ms`);
});

test('dither kernels pass on all error (Floyd–Steinberg) or 6/8 of it (Atkinson)', () => {
  const sum = (k) => k.reduce((s, [, , w]) => s + w, 0);
  assert.ok(Math.abs(sum(KERNELS.floyd) - 1) < 1e-12);
  assert.ok(Math.abs(sum(KERNELS.atkinson) - 0.75) < 1e-12);
});

test('dithering: a grey ramp with 3 colours averages closer to the source', () => {
  // Black-to-white ramp across 64 columns; only black, light grey and white kept.
  const img = image(64, 64, (x) => {
    const v = Math.round((x / 63) * 255);
    return [v, v, v];
  });
  const opts = { studs: 64, maxColours: 3 };
  const flat = buildMosaic(img, opts);
  const src = sampleLab(img, { x: 0, y: 0, w: 64, h: 64 }, 64, 64);
  // Mean L of each 8×8 block: source vs result.
  const blockError = (m) => {
    let err = 0;
    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let s = 0;
        let r = 0;
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const c = (by * 8 + y) * 64 + bx * 8 + x;
            s += src[c * 3];
            r += m.palette[m.cells[c]].lab[0];
          }
        }
        err += Math.abs(s - r) / 64;
      }
    }
    return err / 64;
  };
  const kept = flat.colours.map((c) => c.index);
  for (const dither of ['floyd', 'atkinson']) {
    const d = buildMosaic(img, { ...opts, dither });
    assert.ok(d.colours.every((c) => kept.includes(c.index)), `${dither} uses only the kept colours`);
    const e = blockError(d);
    console.log(`  ramp, 3 colours: block mean |ΔL| none ${blockError(flat).toFixed(2)}, ${dither} ${e.toFixed(2)}`);
    assert.ok(e < blockError(flat), `${dither} ${e} vs none ${blockError(flat)}`);
  }
});

test('dithering leaves a solid image solid', () => {
  const img = image(32, 32, () => [180, 0, 0]);
  for (const dither of ['floyd', 'atkinson']) {
    const m = buildMosaic(img, { studs: 32, dither });
    assert.equal(m.colours.length, 1, dither);
  }
});

test('thin lines: a 1-pixel line shrunk 4× comes back as a line of cells', () => {
  // White page, a black block on the left (so black is a kept colour), and a
  // 1-pixel black line at x = 41 that shrinks to a cell only a quarter dark.
  const img = image(64, 64, (x) => (x < 16 || x === 41 ? [0, 0, 0] : [255, 255, 255]));
  const opts = { studs: 16, maxColours: 2 };
  const off = buildMosaic(img, { ...opts, keepLines: false });
  const on = buildMosaic(img, opts);
  const col = (m, cx) => Array.from({ length: 16 }, (_, cy) => m.palette[m.cells[cy * 16 + cx]].name);
  assert.ok(col(off, 10).every((n) => n === col(off, 11)[0]), 'without the step the line is gone');
  assert.ok(col(on, 10).every((n) => n === 'Black'), `line kept: ${col(on, 10)}`);
  assert.ok(col(on, 11).every((n) => n !== 'Black') && col(on, 9).every((n) => n !== 'Black'), 'neighbours untouched');
  assert.equal(on.lineCells, 16);
});

test('thin lines: a small dark dot is kept, a flat area and a soft gradient are left alone', () => {
  const dot = image(64, 64, (x, y) => (x < 16 || (x >= 40 && x < 42 && y >= 40 && y < 42) ? [0, 0, 0] : [255, 255, 255]));
  const m = buildMosaic(dot, { studs: 16, maxColours: 2 });
  assert.equal(m.palette[m.cells[10 * 16 + 10]].name, 'Black');
  assert.equal(m.lineCells, 1);
  const ramp = image(64, 64, (x, y) => [x * 4, 128, 255 - y * 4]);
  assert.equal(buildMosaic(ramp, { studs: 32, maxColours: 6 }).lineCells, 0);
});

test('colour distance: a muted purplish grey stays grey by default, CIEDE2000 makes it magenta', () => {
  // A cool shadow in the bundled Labrador sample remains neutral.
  const cell = new Float32Array([36.8, 10.5, -0.2]);
  const palette = mosaicPalette('roundTile');
  const pick = (metric) => palette[quantize(cell, palette, { metric }).cells[0]].name;
  assert.equal(pick('ciede2000'), 'Magenta');
  assert.notEqual(pick(DEFAULT_METRIC), 'Magenta');
  assert.match(pick(DEFAULT_METRIC), /gray|grey|brown|black/i);
});

test('labToLin inverts linToLab; Oklab of white is L 100', () => {
  for (const rgb of [[0.2, 0.5, 0.8], [1, 1, 1], [0.01, 0.3, 0.02]]) {
    const back = labToLin(...linToLab(...rgb));
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - rgb[i]) < 1e-3, `${rgb} -> ${back}`);
  }
  assert.ok(Math.abs(linToOklab100(1, 1, 1)[0] - 100) < 0.01);
});

test('fitCrop keeps cells square: a 3:2 photo on a 64 × 48 grid loses its sides', () => {
  const near = (got, want) => Object.entries(want).forEach(([k, v]) => assert.ok(Math.abs(got[k] - v) < 1e-6, `${k}: ${got[k]} != ${v}`));
  near(fitCrop({ x: 0, y: 0, w: 1500, h: 1000 }, 64, 48), { x: 250 / 3, y: 0, w: 4000 / 3, h: 1000 });
  near(fitCrop({ x: 10, y: 0, w: 400, h: 400 }, 16, 32), { x: 110, y: 0, w: 200, h: 400 });
  const m = buildMosaic(image(150, 100, () => [200, 40, 40]), { studs: 64 });
  assert.deepEqual([m.width, m.height], [64, 48]);
  assert.ok(Math.abs(m.crop.w / m.crop.h - 64 / 48) < 1e-9);
});

test('cache: the shrunk photo is reused, results are the same', () => {
  const img = image(320, 240, (x, y) => [x % 256, y % 256, 128]);
  const cache = new Map();
  const a = buildMosaic(img, { studs: 32, cache });
  assert.equal(cache.size, 1);
  const b = buildMosaic(img, { studs: 32, cache, part: 'squarePlate' });
  assert.equal(cache.size, 1, 'same grid: no new entry');
  const fresh = buildMosaic(img, { studs: 32, part: 'squarePlate' });
  assert.deepEqual(Array.from(b.cells), Array.from(fresh.cells));
  assert.notEqual(a.partId, b.partId);
  // Adjustments must not change the cached copy.
  buildMosaic(img, { studs: 32, cache, brightness: 50 });
  assert.deepEqual(Array.from(buildMosaic(img, { studs: 32, cache }).cells), Array.from(a.cells));
  buildMosaic(img, { studs: 48, cache });
  assert.equal(cache.size, 2);
});

test('gridSize keeps as much of the photo as any multiple-of-16 grid could', () => {
  const aspects = [16 / 9, 1.5, 4 / 3, 1.25, 1, 9 / 16, 0.75, 2];
  const kept = (ga, a) => Math.min(ga, a) / Math.max(ga, a);
  for (const a of aspects) {
    for (const studs of [32, 48, 64, 96]) {
      const crop = a >= 1 ? { w: 1000 * a, h: 1000 } : { w: 1000, h: 1000 / a };
      const g = gridSize(crop, studs);
      let best = 0;
      for (let s = 16; s <= studs; s += 16) best = Math.max(best, kept(a >= 1 ? studs / s : s / studs, a));
      assert.ok(kept(g.width / g.height, a) >= best - 1e-9, `aspect ${a.toFixed(2)} at ${studs}: ${g.width}x${g.height}`);
      assert.ok(kept(g.width / g.height, a) >= 0.75 - 1e-9);
    }
  }
});
