/**
 * Sample "parts I have" lists for 3D building: the full inventories of a few LEGO
 * Classic creative boxes, so a visitor without a Rebrickable account can try
 * the feature. Counts are summed over the set's newest inventory, spares
 * included; mould variants count as the part (partAliases). Parts our part
 * table does not have (wheels, eyes, windows, …) are left out but counted in
 * `other`, so the page can say how much of the box we can use.
 *
 *   node tools/stock-sets.mjs   (Rebrickable CSVs cached first, see tools/rebrickable.mjs)
 *   -> src/data/stock-sets.json   { sets: [{ id, name, year, total, other, parts: { ldraw: { ldrawCode: n } } }] }
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CACHE, eachRow, ldrawCodeOf, partAliases } from './rebrickable.mjs';
import { PART_TYPES } from '../src/core/parts.mjs';
import { PALETTE } from '../src/core/palette.mjs';

/** LEGO Classic creative boxes with mostly plain bricks and plates. */
const SETS = ['10696-1', '10698-1', '11717-1', '11030-1'];
const cache = process.argv[2] ?? DEFAULT_CACHE;

// Rebrickable number -> our LDraw number.
const rbToLdraw = new Map(PART_TYPES.map((p) => [p.rb ?? p.ldraw, p.ldraw]));
const alias = await partAliases(cache, [...rbToLdraw.keys()]);
const paletteCodes = new Set(PALETTE.map((c) => c.code));

const sets = new Map();
await eachRow(cache, 'sets', (r) => {
  if (SETS.includes(r.set_num)) sets.set(r.set_num, { id: r.set_num, name: r.name, year: Number(r.year), total: 0, other: 0, parts: {} });
});
const inventory = new Map();
await eachRow(cache, 'inventories', (r) => {
  if (!sets.has(r.set_num)) return;
  const v = Number(r.version);
  if (!inventory.has(r.set_num) || inventory.get(r.set_num).version < v) inventory.set(r.set_num, { id: r.id, version: v });
});
const setOf = new Map([...inventory].map(([set, inv]) => [inv.id, set]));
await eachRow(cache, 'inventory_parts', (r) => {
  const set = sets.get(setOf.get(r.inventory_id));
  if (!set) return;
  const n = Number(r.quantity);
  set.total += n;
  const rb = alias.get(r.part_num);
  const code = ldrawCodeOf(r.color_id);
  if (!rb || !paletteCodes.has(code)) {
    set.other += n;
    return;
  }
  const byColour = (set.parts[rbToLdraw.get(rb)] ??= {});
  byColour[code] = (byColour[code] ?? 0) + n;
});

const out = SETS.map((id) => sets.get(id)).filter(Boolean).map((s) => ({
  ...s,
  // Sorted so the file diffs cleanly.
  parts: Object.fromEntries(
    Object.entries(s.parts)
      .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))
      .map(([p, c]) => [p, Object.fromEntries(Object.entries(c).sort((a, b) => a[0] - b[0]))]),
  ),
}));
const file = join(dirname(fileURLToPath(import.meta.url)), '../src/data/stock-sets.json');
writeFileSync(file, `${JSON.stringify({ source: 'Rebrickable data downloads, LEGO Classic creative boxes', sets: out })}\n`);
for (const s of out) {
  const usable = s.total - s.other;
  const kinds = Object.keys(s.parts).length;
  const colours = new Set(Object.values(s.parts).flatMap((c) => Object.keys(c))).size;
  console.log(`${s.id} ${s.name} (${s.year}): ${s.total} pieces, ${usable} usable in ${kinds} part types x ${colours} colours`);
}
