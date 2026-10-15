/**
 * Set inventories for "only the parts I have". Only the
 * part types our part table has (core/parts.mjs; it includes the mosaic
 * surface parts) are kept, in every colour, so one data set serves the 3D page
 * (which keeps its palette colours) and the mosaic page (which keeps one
 * surface part). Counts are the set's newest inventory, spares included,
 * mould variants and alternates counted as the part (partAliases); parts that
 * come inside minifigures or sub-sets are not counted.
 *
 * Files, fetched by the page only when a visitor searches or adds a set:
 *   sets-index.json        [[set_num, name, year, usable, image?],...]   the search list;
 *                          image: Rebrickable picture file, only when it is not `<set_num>.jpg`
 *   sets-parts-NN.json     { parts: [rb part ids], sets: { set_num: [part index, colour id, count,...] } }
 *                          16 files, a set is in shardOf(set_num) (io/set-library.mjs)
 *
 *   node tools/set-index.mjs [outDir] [minUsable]
 *     outDir defaults to public/data, minUsable (fewest usable pieces for a set to be listed) to 1
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CACHE, eachRow, partAliases } from './rebrickable.mjs';
import { PART_TYPES } from '../src/core/parts.mjs';
import { SHARDS, shardFile, shardOf } from '../src/io/set-library.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? join(here, '../public/data');
const minUsable = Number(process.argv[3] ?? 1);
const cache = DEFAULT_CACHE;

const targets = [...new Set(PART_TYPES.map((p) => p.rb ?? p.ldraw))];
const alias = await partAliases(cache, targets);
const partIndex = new Map(targets.map((id, i) => [id, i]));

const sets = new Map();
await eachRow(cache, 'sets', (r) => {
  const file = (r.img_url ?? '').split('/').pop();
  sets.set(r.set_num, { name: r.name, year: Number(r.year), image: file && file !== `${r.set_num}.jpg` ? file : '', parts: new Map(), usable: 0 });
});
const newest = new Map();
await eachRow(cache, 'inventories', (r) => {
  const v = Number(r.version);
  if (!newest.has(r.set_num) || newest.get(r.set_num).version < v) newest.set(r.set_num, { id: r.id, version: v });
});
const setOf = new Map([...newest].map(([set, inv]) => [inv.id, set]));
await eachRow(cache, 'inventory_parts', (r) => {
  const set = sets.get(setOf.get(r.inventory_id));
  const part = alias.get(r.part_num);
  if (!set || !part) return;
  const n = Number(r.quantity);
  const key = `${partIndex.get(part)},${r.color_id}`;
  set.parts.set(key, (set.parts.get(key) ?? 0) + n);
  set.usable += n;
});

const listed = [...sets].filter(([, s]) => s.usable >= minUsable).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
const index = listed.map(([id, s]) => (s.image ? [id, s.name, s.year, s.usable, s.image] : [id, s.name, s.year, s.usable]));
const shards = Array.from({ length: SHARDS }, () => ({}));
for (const [id, s] of listed) {
  shards[shardOf(id)][id] = [...s.parts]
    .map(([k, n]) => [...k.split(',').map(Number), n])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .flat();
}

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (/^sets-parts(-\d+)?\.json$/.test(f)) rmSync(join(outDir, f));
const kb = (n) => (n / 1e3).toFixed(0);
const write = (name, data) => {
  const text = JSON.stringify(data);
  writeFileSync(join(outDir, name), text);
  return { raw: text.length, gz: gzipSync(text, { level: 9 }).length };
};
console.log(`${sets.size} sets, ${listed.length} with >= ${minUsable} usable pieces, ${index.filter((r) => r[4]).length} with their own picture file name`);
const i = write('sets-index.json', { source: 'Rebrickable data downloads', sets: index });
console.log(`sets-index.json ${kb(i.raw)} KB, gzip ${kb(i.gz)} KB`);
const sizes = shards.map((s, k) => ({ k, n: Object.keys(s).length, ...write(shardFile(k), { source: 'Rebrickable data downloads', parts: targets, sets: s }) }));
const gz = sizes.map((s) => s.gz).sort((a, b) => a - b);
console.log(`${SHARDS} parts files: ${sizes.map((s) => s.n).join('/')} sets; gzip ${kb(gz[0])}–${kb(gz.at(-1))} KB, median ${kb(gz[SHARDS >> 1])}, total ${kb(gz.reduce((a, b) => a + b, 0))} KB (raw ${kb(sizes.reduce((a, s) => a + s.raw, 0))} KB)`);
