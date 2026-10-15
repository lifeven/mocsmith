import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitToStock, setsWithPart, STOCK_MODES, stockFromSets } from '../src/mosaic/stock.mjs';
import { mosaicPalette } from '../src/mosaic/palette.mjs';
import { buildMosaic } from '../src/mosaic/mosaic.mjs';
import sets from '../src/data/mosaic-sets.json' with { type: 'json' };

const palette = mosaicPalette('roundTile');
const byName = (name) => palette.findIndex((c) => c.name === name);
const W = byName('White');
const K = byName('Black');
const G = byName('Light Bluish Gray');

/** Cells in Lab: `n` of them going from black (L 0) to white (L 100). */
function ramp(n) {
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) lab[i * 3] = (100 * i) / (n - 1);
  return lab;
}

test('limitToStock: enough of every colour gives the nearest colour everywhere', () => {
  const lab = ramp(10);
  const stock = new Map([[palette[W].code, 10], [palette[K].code, 10]]);
  const { cells, buy, short } = limitToStock(lab, palette, stock);
  assert.equal(short, 0);
  assert.equal(buy.size, 0);
  assert.deepEqual([...cells].slice(0, 3), [K, K, K]);
  assert.deepEqual([...cells].slice(-3), [W, W, W]);
});

test('limitToStock: a colour that runs out keeps the cells it suits best, the rest take the next nearest', () => {
  const lab = ramp(10); // nearest: 5 black-ish, 5 white-ish
  const stock = new Map([[palette[W].code, 2], [palette[K].code, 4], [palette[G].code, 10]]);
  const { cells, short } = limitToStock(lab, palette, stock);
  assert.equal(short, 0);
  const used = (p) => [...cells].filter((c) => c === p).length;
  assert.ok(used(W) <= 2 && used(K) <= 4);
  // The whitest two cells keep white, the darkest four keep black.
  assert.deepEqual([...cells].slice(-2), [W, W]);
  assert.deepEqual([...cells].slice(0, 4), [K, K, K, K]);
  assert.equal(used(W) + used(K) + used(G), 10);
});

test('limitToStock: fewer parts than cells, the rest are parts to buy', () => {
  const lab = ramp(20);
  const stock = new Map([[palette[W].code, 5], [palette[K].code, 5]]);
  const { cells, buy, short } = limitToStock(lab, palette, stock);
  assert.equal(short, 10);
  assert.equal([...buy.values()].reduce((a, b) => a + b, 0), 10);
  assert.equal([...cells].filter((c) => c === W).length - (buy.get(W) ?? 0), 5);
  assert.equal([...cells].filter((c) => c === K).length - (buy.get(K) ?? 0), 5);
});

test('limitToStock: a box colour goes to the cells it suits, not to cells far from it', () => {
  // 10 cells: 5 near black, 5 near white. The box has 5 black and 5 white parts, plus 5 red the photo has no use for:
  // with every part used, red still lands on the cells where it hurts least, and with a tolerance it is not used at all.
  const lab = ramp(10);
  const R = byName('Red');
  const stock = new Map([[palette[K].code, 3], [palette[W].code, 3], [palette[R].code, 5]]);
  const all = limitToStock(lab, palette, stock);
  assert.equal(all.short, 0);
  const strict = limitToStock(lab, palette, stock, { tolerance: STOCK_MODES.closest });
  assert.ok(![...strict.cells].includes(R), 'red is far from every cell');
  // The box's black and white go to cells they suit (the darkest and the lightest); the rest are bought.
  assert.deepEqual([...strict.cells].slice(0, 2), [K, K]);
  assert.deepEqual([...strict.cells].slice(-2), [W, W]);
  // Only 6 black and white parts for 10 cells and red unused: at least 4 are bought.
  assert.ok(strict.short >= 4, `short ${strict.short}`);
});

test('limitToStock: shortBy counts every mode in one pass, fewer parts to buy for looser modes', () => {
  const lab = new Float32Array(300 * 3);
  for (let i = 0; i < 300; i++) lab.set([(i * 37) % 100, ((i * 53) % 120) - 60, ((i * 71) % 120) - 60], i * 3);
  const set = sets.sets.find((s) => s.id === '31197-1');
  const stock = new Map(Object.entries(set.parts['98138']).map(([code, n]) => [Number(code), Math.ceil(n / 30)]));
  const one = limitToStock(lab, palette, stock);
  for (const [mode, tolerance] of Object.entries(STOCK_MODES)) {
    const r = limitToStock(lab, palette, stock, { tolerance });
    assert.equal(one.shortBy[mode], r.short, mode);
    for (const [p, n] of countBy(r.cells)) assert.ok(n - (r.buy.get(p) ?? 0) <= (stock.get(palette[p].code) ?? 0), `${mode}: over stock`);
  }
  assert.ok(one.shortBy.fewest <= one.shortBy.balanced && one.shortBy.balanced <= one.shortBy.closest);
});

function countBy(cells) {
  const m = new Map();
  for (const p of cells) m.set(p, (m.get(p) ?? 0) + 1);
  return m;
}

test('buildMosaic with a LEGO Art set: uses no more of any colour than the box has', () => {
  // A gradient photo at 48 x 48 studs against 31197 (3,212 round tiles in 7 colours).
  const w = 96;
  const h = 96;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data.set([(x * 255) / w, (y * 255) / h, 128, 255], i);
    }
  }
  const set = sets.sets.find((s) => s.id === '31197-1');
  const stock = new Map(Object.entries(set.parts['98138']).map(([code, n]) => [Number(code), n]));
  const m = buildMosaic({ width: w, height: h, data }, { part: 'roundTile', studs: 48, stock });
  assert.equal(m.width * m.height, 2304);
  assert.equal(m.short, 0);
  for (const c of m.colours) assert.ok(c.count <= (stock.get(c.code) ?? 0), `${c.name}: ${c.count} > ${stock.get(c.code)}`);
  assert.deepEqual(m.buy, []);
  assert.equal(m.stocked, set.total);
});

test('setsWithPart / stockFromSets: boxes of one part, added up', () => {
  const tiles = setsWithPart('roundTile');
  assert.ok(tiles.some((s) => s.id === '31197-1' && s.count === 3212));
  assert.ok(!tiles.some((s) => s.id === '31199-1'), 'Iron Man is round plates only');
  const two = stockFromSets('roundTile', ['31197-1', '31198-1']);
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum(two), 3212 + 2812);
  // A box without this part adds nothing; only such boxes → not limited.
  assert.equal(sum(stockFromSets('roundTile', ['31197-1', '31199-1'])), 3212);
  assert.equal(stockFromSets('roundTile', ['31199-1']), null);
  assert.equal(stockFromSets('roundTile', []), null);
});
