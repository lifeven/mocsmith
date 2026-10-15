import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHARDS, inventoryOf, loadSetIndex, loadSetParts, searchSets, shardFile, shardOf } from '../src/io/set-library.mjs';
import { stockFromRows, stockFromCsv } from '../src/core/stock.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const INDEX = [
  ['10698-1', 'Large Creative Brick Box', 2015, 537],
  ['10698-2', 'Large Creative Brick Box (2nd edition)', 2016, 500],
  ['106980-1', 'Some Other Box', 2020, 10],
  ['31197-1', "Andy Warhol's Marilyn Monroe", 2020, 3212],
  ['21330-1', 'Home Alone', 2021, 1991],
  ['40179-1', 'Mosaic Maker', 2016, 4512],
  ['41999-1', 'Pokémon Café', 2022, 120],
];

test('searchSets: a number finds that set first, then numbers starting with it', () => {
  assert.deepEqual(searchSets(INDEX, '10698').map((s) => s[0]), ['10698-1', '10698-2', '106980-1']);
  assert.deepEqual(searchSets(INDEX, '10698-2').map((s) => s[0]), ['10698-2']);
  assert.deepEqual(searchSets(INDEX, ' 31197 ').map((s) => s[0]), ['31197-1']);
  assert.deepEqual(searchSets(INDEX, '99999'), []);
  assert.deepEqual(searchSets([['102A-1', 'Front-End Loader', 1970, 45, '102a-1.jpg']], '102a').map((s) => s[0]), ['102A-1']);
  assert.deepEqual(searchSets(INDEX, ''), []);
});

test('searchSets: words must all be in the name, bigger sets first; case and accents ignored', () => {
  assert.deepEqual(searchSets(INDEX, 'brick box').map((s) => s[0]), ['10698-1', '10698-2']);
  assert.deepEqual(searchSets(INDEX, 'MOSAIC').map((s) => s[0]), ['40179-1']);
  assert.deepEqual(searchSets(INDEX, 'pokemon cafe').map((s) => s[0]), ['41999-1']);
  assert.equal(searchSets(INDEX, 'box', 1).length, 1);
});

test('inventoryOf: rows in Rebrickable numbers, times the copies', () => {
  const data = { parts: ['3001', '98138'], sets: { 'x-1': [0, 4, 10, 1, 15, 3] } };
  assert.deepEqual(inventoryOf(data, 'x-1'), [{ part: '3001', colour: '4', quantity: 10 }, { part: '98138', colour: '15', quantity: 3 }]);
  assert.deepEqual(inventoryOf(data, 'x-1', 2).map((r) => r.quantity), [20, 6]);
  assert.deepEqual(inventoryOf(data, 'nope-1'), []);
});

test('loadSetIndex fetches once, and again after a failure', async () => {
  let calls = 0;
  const failing = async () => (calls++, { ok: false, status: 503 });
  await assert.rejects(loadSetIndex(failing), /HTTP 503/);
  const ok = async () => (calls++, { ok: true, json: async () => ({ sets: INDEX }) });
  assert.equal((await loadSetIndex(ok)).length, INDEX.length);
  assert.equal((await loadSetIndex(ok)).length, INDEX.length);
  assert.equal(calls, 2);
});

test('shards: stable, spread over all 16 files; loadSetParts fetches only the file with that set', async () => {
  assert.equal(shardOf('10698-1'), shardOf('10698-1'));
  const counts = new Array(SHARDS).fill(0);
  for (let i = 0; i < 4000; i++) counts[shardOf(`${10000 + i}-1`)]++;
  assert.ok(Math.min(...counts) > 150 && Math.max(...counts) < 350, counts.join(','));
  assert.equal(shardFile(3), 'sets-parts-03.json');
  const asked = [];
  const fetcher = async (url) => (asked.push(url), { ok: true, json: async () => ({ parts: [], sets: {} }) });
  await loadSetParts('10698-1', fetcher);
  await loadSetParts('10698-1', fetcher);
  assert.deepEqual(asked, [`/data/${shardFile(shardOf('10698-1'))}`]);
});

test('stockFromRows is what stockFromCsv uses', () => {
  const csv = stockFromCsv('Part,Color,Quantity\n3001,4,10\n3001,4,2\nxyz,4,3\n');
  const rows = stockFromRows([{ part: '3001', colour: '4', quantity: 12 }, { part: 'xyz', colour: '4', quantity: 3 }]);
  assert.deepEqual(rows.stock, csv.stock);
  assert.deepEqual([rows.used, rows.skipped, csv.rows], [12, 3, 3]);
});

test('the shipped set data agrees with the hand-made sample files', () => {
  const index = read('../public/data/sets-index.json').sets;
  const files = Array.from({ length: SHARDS }, (_, k) => read(`../public/data/${shardFile(k)}`));
  assert.ok(index.length > 10000, `${index.length} sets`);
  // Every listed set is in exactly the file shardOf names.
  assert.equal(files.reduce((n, f) => n + Object.keys(f.sets).length, 0), index.length);
  for (const [id] of index) assert.ok(files[shardOf(id)].sets[id], id);
  const data = { parts: files[0].parts, sets: Object.assign({}, ...files.map((f) => f.sets)) };
  // LEGO Art: the surface parts of every set, colour by colour.
  for (const s of read('../src/data/mosaic-sets.json').sets) {
    const got = {};
    for (const r of inventoryOf(data, s.id)) if (s.parts[r.part]) (got[r.part] ??= {})[r.colour] = r.quantity;
    assert.deepEqual(got, s.parts, s.id);
  }
  // Classic boxes: the 3D stock from the set data is the sample stock.
  for (const s of read('../src/data/stock-sets.json').sets) {
    assert.deepEqual(stockFromRows(inventoryOf(data, s.id)).stock.parts, s.parts, s.id);
  }
});
