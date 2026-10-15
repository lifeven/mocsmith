#!/usr/bin/env node
/**
 * Build src/data/availability.json:
 * - `colours`: the 3D palette, as [LDraw code, Rebrickable id, LDraw name, hex].
 *   The first 20 are the original base colours in stable order (grid
 *   cells store palette index + 1); after them every other colour that passes
 *   COLOUR_RULE, most widely made first.
 * - `parts`: for each part of the part table (`src/core/parts.mjs`, keyed by
 *   its LDraw number) and palette colour (keyed by LDraw code), how many
 *   official sets contain that part in that colour, the last year one of them
 *   came out, and whether LEGO has an element id for it. Looked up under the
 *   part's Rebrickable number (`rb` when it differs).
 * - `names`: each part's English name (Rebrickable's), keyed by LDraw number.
 *
 * Input: Rebrickable's CSV downloads and LDraw's LDConfig.ldr, cached outside
 * the repo (how to fetch: tools/rebrickable.mjs). Usage:
 * node tools/availability.mjs [cacheDir]
 *
 * Mould variants and alternates of a part count as the same part; prints do
 * not; spare parts are ignored (tools/rebrickable.mjs). RGB is LDConfig's.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PART_TYPES, typeById } from '../src/core/parts.mjs';
import { LDRAW_IDS } from '../src/core/catalog.mjs';
import { DEFAULT_CACHE, eachRow, partAliases, partColourSets, elementKeys, fetchedDate, SPECIAL, ldrawCodeOf, readLdconfig } from './rebrickable.mjs';

const cache = process.argv[2] ?? DEFAULT_CACHE;
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/data/availability.json');

/** The 20 base colours (LDraw codes), in palette order. */
const BASE = [15, 0, 71, 72, 4, 320, 25, 484, 14, 226, 19, 28, 70, 308, 2, 288, 27, 1, 272, 322];

/**
 * A colour joins the palette when it is opaque and not special (pearl,
 * metallic …), at least MIN_PARTS of the palette parts (below) were made in it
 * in ≥ MIN_SETS sets each, 1×1 brick and 1×1 plate exist in it (layout fills any leftover
 * cell with them), and a set with one of our parts in it came out in
 * LAST_YEAR or later (drops old grey, old brown and other retired colours).
 */
export const COLOUR_RULE = { MIN_PARTS: 8, MIN_SETS: 10, LAST_YEAR: 2010, ONE_BY_ONE: ['3005', '3024'] };

/** Rebrickable number → LDraw number, for every part in the table (bricks, plates and tiles in size order, then the slopes and round parts). */
const order = [...Object.values(LDRAW_IDS), ...PART_TYPES.filter((p) => p.slope || p.round).map((p) => p.ldraw)];
const RB = new Map(order.map((ldraw) => [typeById(ldraw).rb ?? ldraw, ldraw]));
const targets = [...RB.keys()];
/**
 * The parts the colour rule counts: the bricks, plates, tiles and slopes the
 * palette was chosen with (2026-10-08). Parts added later (inverted slopes and
 * round parts, 2026-10-09) get colour entries but do not change the palette,
 * which would change every model.
 */
const paletteTargets = PART_TYPES.filter((p) => ['brick', 'plate', 'tile', 'slope'].includes(p.kind) && !p.round).map((p) => p.rb ?? p.ldraw);

const opaque = new Map(); // Rebrickable id -> name
await eachRow(cache, 'colors', (r) => {
  if (r.is_trans === 'False' && Number(r.id) >= 0 && r.id !== '9999' && !SPECIAL.test(r.name)) opaque.set(r.id, r.name);
});
const alias = await partAliases(cache, targets);
const seen = await partColourSets(cache, alias, (id) => opaque.has(id));
const elements = await elementKeys(cache, alias, (id) => opaque.has(id));
const ldconfig = readLdconfig();

const entry = (id, rb) => {
  const e = seen.get(id)?.get(rb);
  const element = elements.has(`${id}/${rb}`) ? 1 : 0;
  return e || element ? [e?.sets.size ?? 0, e?.last ?? 0, element] : null;
};

const candidates = [];
for (const rb of opaque.keys()) {
  const code = ldrawCodeOf(rb);
  if (!ldconfig.has(code)) continue;
  const wide = paletteTargets.filter((id) => (entry(id, rb)?.[0] ?? 0) >= COLOUR_RULE.MIN_SETS).length;
  const last = Math.max(0, ...paletteTargets.map((id) => entry(id, rb)?.[1] ?? 0));
  const ones = COLOUR_RULE.ONE_BY_ONE.every((id) => entry(id, rb));
  const base = BASE.includes(code);
  if (base || (wide >= COLOUR_RULE.MIN_PARTS && last >= COLOUR_RULE.LAST_YEAR && ones)) candidates.push({ code, rb: Number(rb), wide, base });
}
for (const code of BASE) if (!candidates.some((c) => c.code === code)) throw new Error(`base colour ${code} missing`);
candidates.sort((a, b) => (a.base !== b.base ? (a.base ? -1 : 1) : a.base ? BASE.indexOf(a.code) - BASE.indexOf(b.code) : b.wide - a.wide || a.code - b.code));
const colours = candidates.map((c) => [c.code, c.rb, ldconfig.get(c.code).name, ldconfig.get(c.code).hex]);

// English part names, shown in the part info card.
const names = {};
await eachRow(cache, 'parts', (r) => {
  if (RB.has(r.part_num)) names[RB.get(r.part_num)] = r.name;
});

const parts = {};
for (const [id, ldraw] of RB) {
  parts[ldraw] = {};
  for (const c of candidates) {
    const e = entry(id, String(c.rb));
    if (e) parts[ldraw][c.code] = e;
  }
}

const source = {
  name: 'Rebrickable set inventories and colours (rebrickable.com/downloads); RGB from LDraw LDConfig.ldr',
  fetched: fetchedDate(cache),
  rule: 'part (incl. mould variants/alternates, excl. prints) in that colour, non-spare, in ≥1 official set, or with a LEGO element id',
  colourRule: `the 20 base colours, then opaque non-special colours with ≥${COLOUR_RULE.MIN_PARTS} of our parts in ≥${COLOUR_RULE.MIN_SETS} sets, 1×1 brick and plate made, last made ≥${COLOUR_RULE.LAST_YEAR}`,
  colour: '[LDraw code, Rebrickable id, LDraw name, hex]',
  entry: '[sets, lastYear, hasElementId], keyed by LDraw code',
};
writeFileSync(out, `${JSON.stringify({ source, colours, names, parts })}\n`);

const combos = Object.values(parts).reduce((n, p) => n + Object.keys(p).length, 0);
console.log(`${out}: ${targets.length} parts × ${colours.length} colours, ${combos} combos available`);
for (const c of candidates.filter((x) => !x.base)) console.log(`  + ${c.code} (Rebrickable ${c.rb}) ${ldconfig.get(c.code).name}: ${c.wide} parts in ≥${COLOUR_RULE.MIN_SETS} sets`);
