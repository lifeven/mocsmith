import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleStock, stockFromRows, stockFromSets, stockSize } from '../src/core/stock.mjs';
import { ownStock } from '../src/ui/result/own.mjs';
import { setNumber } from '../src/ui/set-picker.mjs';
import { artSetRows, mergeColourStocks, stockFromSets as artStock, surfaceStock } from '../src/mosaic/stock.mjs';

test('scaleStock: every count times the copies; one copy is the same stock', () => {
  const box = stockFromSets(['10698-1']);
  assert.equal(scaleStock(box, 1), box);
  const three = scaleStock(box, 3);
  assert.equal(stockSize(three), 3 * stockSize(box));
  assert.equal(three.parts['3001']['4'], 3 * box.parts['3001']['4']);
  assert.equal(stockSize(box), 520, 'the sample box itself is unchanged');
});

test('ownStock: added sets times their copies plus every imported list; nothing added → null', () => {
  assert.equal(ownStock({ sets: new Map(), files: [] }), null);
  const box = stockFromSets(['10698-1']);
  const list = stockFromRows([{ part: '3001', colour: '4', quantity: 7 }]).stock;
  const own = { sets: new Map([['10698-1', { copies: 2, stock: box }]]), files: [{ stock: list }, { stock: list }] };
  const all = ownStock(own);
  assert.equal(stockSize(all), 2 * 520 + 14);
  assert.equal(all.parts['3001']['4'], 2 * box.parts['3001']['4'] + 14);
});

test('setNumber drops only the first-edition suffix', () => {
  assert.deepEqual(['10698-1', '10698-2', '6000-10'].map(setNumber), ['10698', '10698-2', '6000-10']);
});

test('mosaic: a LEGO Art set as rows gives the same stock as before; copies and other sets add up', () => {
  const one = surfaceStock('roundTile', artSetRows('31197-1'));
  assert.deepEqual([...one], [...artStock('roundTile', ['31197-1'])]);
  const two = surfaceStock('roundTile', artSetRows('31197-1'), 2);
  for (const [code, n] of one) assert.equal(two.get(code), 2 * n);
  assert.equal(surfaceStock('squarePlate', artSetRows('31197-1')), null, 'Marilyn has no square plates');
  const rows = [{ part: '98138', colour: '1', quantity: 5 }, { part: '3001', colour: '1', quantity: 9 }];
  const merged = mergeColourStocks([one, surfaceStock('roundTile', rows), null]);
  assert.equal(merged.get(1), (one.get(1) ?? 0) + 5);
  assert.equal(mergeColourStocks([null, null]), null);
});

test('badFit: a stock that makes the picture much worse is flagged, a mild one is not', async () => {
  const { badFit } = await import('../src/mosaic/stock.mjs');
  assert.equal(badFit(30.1, 12.0), true);
  assert.equal(badFit(17.5, 12.0), false);
  assert.equal(badFit(5, 0), false);
});
