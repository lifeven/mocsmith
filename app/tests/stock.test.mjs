import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STOCK_SETS, mergeStocks, stockFromSets, stockFromCsv, owned, ownedColours, shortfall, stockSize } from '../src/core/stock.mjs';
import { exportToBuyCsv } from '../src/io/ldr.mjs';
import { isAvailable, withStock, shapeAvailable } from '../src/core/catalog.mjs';
import { cellValue } from '../src/core/palette.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { ldrawId } from '../src/core/catalog.mjs';
import { boxesMesh, fillBox } from './helpers.mjs';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout } from '../src/convert/layout.mjs';

test('sample boxes: known sets, pieces add up, unknown ids give null', () => {
  assert.ok(STOCK_SETS.length >= 3);
  const box = STOCK_SETS.find((s) => s.id === '10698-1');
  assert.ok(box && box.usable > 0 && box.usable <= box.total);
  const one = stockFromSets(['10698-1']);
  assert.equal(stockSize(one), box.usable);
  const two = stockFromSets(['10698-1', '10696-1']);
  assert.equal(stockSize(two), box.usable + STOCK_SETS.find((s) => s.id === '10696-1').usable);
  assert.equal(stockFromSets(['nope-1']), null);
});

test('CSV: Rebrickable ids and colour ids map to LDraw; unknown parts are skipped', () => {
  const csv = 'Part,Color,Quantity\n3001,4,10\n3660,15,2\n"3024",1050,3\n99999,4,5\n3001,9999,1\n';
  const { stock, rows, used, skipped } = stockFromCsv(csv);
  assert.equal(rows, 5);
  assert.equal(used, 15);
  assert.equal(skipped, 6);
  assert.equal(owned(stock, '3001', 4), 10);
  assert.equal(owned(stock, '3660b', 15), 2, 'inverted slope: Rebrickable 3660 is LDraw 3660b');
  assert.equal(owned(stock, '3024', 353), 3, 'Coral: Rebrickable 1050 is LDraw 353');
  assert.deepEqual([...ownedColours(stock)].sort((a, b) => a - b), [4, 15, 353]);
  assert.throws(() => stockFromCsv('a,b\n1,2'), /csv-header/);
});

test('withStock limits the catalog to owned parts plus 1×1 fillers, only while it runs', () => {
  const stock = { parts: { 3001: { 4: 2 } } };
  assert.ok(isAvailable('3003', 4));
  withStock(stock, () => {
    assert.ok(isAvailable('3001', 4));
    assert.ok(!isAvailable('3003', 4), '2×2 brick not owned');
    assert.ok(isAvailable('3005', 4) && isAvailable('3024', 4), '1×1 brick and plate always');
    assert.ok(!shapeAvailable('brick', 2, 2, cellValue(4)));
  });
  assert.ok(isAvailable('3003', 4), 'back to normal after');
});

test('shortfall: what the parts take from the stock and what is left to buy', () => {
  const stock = { parts: { 3001: { 4: 2 }, 3024: { 15: 10 } } };
  const pieces = [
    ...Array(3).fill({ ldraw: '3001', code: 4 }),
    ...Array(4).fill({ ldraw: '3024', code: 15 }),
    { ldraw: '3005', code: 4 },
  ];
  assert.deepEqual(shortfall(stock, pieces), { have: 6, buy: 2, toBuy: [['3001', 4, 1], ['3005', 4, 1]] });
});

test('buildModel with a stock: only owned colours and parts, the rest on the to-buy list', () => {
  // A red block with a yellow top; the stock has red and blue 2×4 bricks only.
  const mesh = boxesMesh([
    [[0, 0, 0], [1, 0.4, 0.5], [180, 0, 0]],
    [[0, 0.4, 0], [1, 0.5, 0.5], [250, 200, 10]],
  ]);
  const stock = { parts: { 3001: { 4: 4, 1: 4 } } };
  const model = buildModel(mesh, { lengthStuds: 8, stock, stockMode: 'strict' });
  const codes = new Set(model.sourceCodes);
  assert.ok([...codes].every((c) => c === 4 || c === 1), `colours ${[...codes]}`);
  assert.ok(model.stocked.recoloured.some(([from]) => from === 14), 'yellow moved');
  for (const p of model.result.parts) {
    const id = ldrawId(p);
    assert.ok(['3001', '3005', '3024'].includes(id), `only owned parts and 1×1 fillers, got ${id}`);
  }
  assert.equal(model.stocked.have + model.stocked.buy, model.result.parts.length);
  assert.ok(model.stocked.have > 0 && model.stocked.have <= 8);
  // Default mode: colours follow the stock, parts stay free (any part LEGO made); still counted.
  const colours = buildModel(mesh, { lengthStuds: 8, stock });
  assert.ok(colours.sourceCodes.every((c) => c === 4 || c === 1));
  assert.equal(colours.stocked.have + colours.stocked.buy, colours.result.parts.length);
  // Without a stock nothing changes and nothing is reported.
  const free = buildModel(mesh, { lengthStuds: 8 });
  assert.equal(free.stocked, undefined);
  assert.ok(free.sourceCodes.includes(14));
});

test('layout with a stock prefers pieces still in it, and only as many as there are', () => {
  // A 4 × 4 × 3 red block: normally two 2 × 4 bricks; with four red 2 × 2 bricks in stock, those.
  const grid = new VoxelGrid(4, 3, 4);
  fillBox(grid, [0, 0, 0], [4, 3, 4], cellValue(4));
  const plain = layout(grid).parts.map((p) => `${p.w}x${p.d}`).sort();
  assert.deepEqual(plain, ['2x4', '2x4']);
  const own = layout(grid, { stock: { parts: { 3003: { 4: 4 } } } }).parts.map((p) => `${Math.min(p.w, p.d)}x${Math.max(p.w, p.d)}`);
  assert.deepEqual(own, ['2x2', '2x2', '2x2', '2x2']);
  // Only two in stock: two 2 × 2, then the rest as usual.
  const two = layout(grid, { stock: { parts: { 3003: { 4: 2 } } } }).parts;
  assert.equal(two.filter((p) => p.w === 2 && p.d === 2).length, 2);
  assert.equal(two.length, 3);
});

test('to-buy CSV uses Rebrickable part and colour numbers; stocks merge', () => {
  const csv = exportToBuyCsv([['3660b', 15, 2], ['3024', 353, 5]]);
  assert.equal(csv, 'Part,Color,Quantity\n3660,15,2\n3024,1050,5\n');
  const merged = mergeStocks([{ parts: { 3001: { 4: 2 } } }, null, { parts: { 3001: { 4: 3, 1: 1 } } }]);
  assert.deepEqual(merged, { parts: { 3001: { 4: 5, 1: 1 } } });
  assert.equal(mergeStocks([null, undefined]), null);
  // Round trip: the to-buy list read back as a stock holds exactly those pieces.
  const back = stockFromCsv(csv).stock;
  assert.equal(owned(back, '3660b', 15), 2);
  assert.equal(owned(back, '3024', 353), 5);
});
