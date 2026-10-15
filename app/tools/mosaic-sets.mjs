/**
 * The LEGO Art sets (Rebrickable theme 709) and how many mosaic surface parts
 * of each colour come in each box, for "only use the parts I have". Counts are summed over the set's newest
 * inventory, spares included (they are in the box); mould variants count as
 * the part (tools/rebrickable.mjs partAliases). Sets with fewer than 500
 * surface parts (the 3D builds) are left out.
 *
 *   node tools/mosaic-sets.mjs   (Rebrickable CSVs cached first, see tools/rebrickable.mjs)
 *   -> src/data/mosaic-sets.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CACHE, eachRow, partAliases } from './rebrickable.mjs';
import table from '../src/data/mosaic-colours.json' with { type: 'json' };

const THEME = '709';
const MIN_PARTS = 500;
const cache = process.argv[2] ?? DEFAULT_CACHE;
const surface = Object.keys(table.surface); // part ids of the four surface parts
const alias = await partAliases(cache, surface);

const sets = new Map();
await eachRow(cache, 'sets', (r) => {
  if (r.theme_id === THEME) sets.set(r.set_num, { id: r.set_num, name: r.name, year: Number(r.year) });
});
// The newest inventory of each set.
const inventory = new Map();
await eachRow(cache, 'inventories', (r) => {
  if (!sets.has(r.set_num)) return;
  const v = Number(r.version);
  if (!inventory.has(r.set_num) || inventory.get(r.set_num).version < v) inventory.set(r.set_num, { id: r.id, version: v });
});
const setOf = new Map([...inventory].map(([set, inv]) => [inv.id, set]));
const counts = new Map();
await eachRow(cache, 'inventory_parts', (r) => {
  const set = setOf.get(r.inventory_id);
  const part = alias.get(r.part_num);
  if (!set || !part) return;
  const byPart = counts.get(set) ?? {};
  const byColour = (byPart[part] ??= {});
  byColour[r.color_id] = (byColour[r.color_id] ?? 0) + Number(r.quantity);
  counts.set(set, byPart);
});

const out = [...sets.values()]
  .map((s) => {
    const parts = counts.get(s.id) ?? {};
    const total = Object.values(parts).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0);
    // Colours sorted by id so the file diffs cleanly.
    const sorted = Object.fromEntries(Object.entries(parts).map(([p, c]) => [p, Object.fromEntries(Object.entries(c).sort((a, b) => a[0] - b[0]))]));
    return { ...s, total, parts: sorted };
  })
  .filter((s) => s.total >= MIN_PARTS)
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

const file = join(dirname(fileURLToPath(import.meta.url)), '../src/data/mosaic-sets.json');
writeFileSync(file, `${JSON.stringify({ source: 'Rebrickable data downloads, theme 709 (LEGO Art)', sets: out })}\n`);
for (const s of out) {
  const kinds = Object.entries(s.parts).map(([p, c]) => `${table.surface[p]} ${Object.keys(c).length} colours ${Object.values(c).reduce((a, b) => a + b, 0)}`).join(', ');
  console.log(`${s.id} ${s.name} (${s.year}): ${s.total} — ${kinds}`);
}
