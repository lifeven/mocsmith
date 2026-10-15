#!/usr/bin/env node
/**
 * Build src/data/mosaic-colours.json: which opaque colours the 1×1 mosaic
 * parts (and the base parts under them) were made in, with each colour's RGB
 * and name. A 2D mosaic may use any of these, not just the 20-colour 3D
 * palette.
 *
 * Input: Rebrickable's CSV downloads, cached outside the repo (how to fetch:
 * tools/rebrickable.mjs). Usage: node tools/mosaic-colours.mjs [cacheDir]
 *
 * Colour ids are Rebrickable's (the parts-list CSV uses them). Most equal the
 * LDraw colour code; where they don't, the colour carries `ldraw` (see
 * LDRAW_CODE in tools/rebrickable.mjs) for the.ldr export. RGB is Rebrickable's colors.csv value. Transparent colours are left out
 * (a mosaic is opaque); pearl, metallic, chrome, glitter, speckle, satin and
 * glow-in-the-dark colours are kept but flagged `special`, so the page can
 * leave them out by default.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CACHE, eachRow, partAliases, partColourSets, elementKeys, fetchedDate, LDRAW_CODE, SPECIAL } from './rebrickable.mjs';

const cache = process.argv[2] ?? DEFAULT_CACHE;
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/data/mosaic-colours.json');

/** Surface parts: one per stud. */
export const SURFACE = { '98138': 'roundTile', '3070b': 'squareTile', '6141': 'roundPlate', '3024': 'squarePlate' };
/** Base parts: LEGO Art panel, the Technic pin joining panels, baseplates and a 16×16 plate. */
export const BASE = ['65803', '2780', '3811', '4186', '91405'];
const targets = [...Object.keys(SURFACE), ...BASE];

const colours = {};
await eachRow(cache, 'colors', (r) => {
  if (r.is_trans !== 'False' || Number(r.id) < 0 || r.id === '9999') return;
  colours[r.id] = {
    name: r.name,
    rgb: r.rgb.toLowerCase(),
    ...(SPECIAL.test(r.name) ? { special: 1 } : {}),
    ...(LDRAW_CODE[r.id] ? { ldraw: LDRAW_CODE[r.id] } : {}),
  };
});
const opaque = (id) => id in colours;

const alias = await partAliases(cache, targets);
const seen = await partColourSets(cache, alias, opaque);
const elements = await elementKeys(cache, alias, opaque);

const names = {};
await eachRow(cache, 'parts', (r) => {
  if (targets.includes(r.part_num)) names[r.part_num] = r.name;
});

const parts = {};
const used = new Set();
for (const id of targets) {
  parts[id] = {};
  const codes = new Set([...(seen.get(id)?.keys() ?? []), ...[...elements].filter((k) => k.startsWith(`${id}/`)).map((k) => k.split('/')[1])]);
  for (const code of [...codes].sort((a, b) => Number(a) - Number(b))) {
    const e = seen.get(id)?.get(code);
    parts[id][code] = [e?.sets.size ?? 0, e?.last ?? 0, elements.has(`${id}/${code}`) ? 1 : 0];
    used.add(code);
  }
}
const usedColours = Object.fromEntries(Object.entries(colours).filter(([code]) => used.has(code)));

const source = {
  name: 'Rebrickable set inventories and colors (rebrickable.com/downloads)',
  fetched: fetchedDate(cache),
  rule: 'opaque colours; part incl. mould variants/alternates, excl. prints, non-spare, in ≥1 official set or with a LEGO element id',
  entry: '[sets, lastYear, hasElementId]',
};
writeFileSync(out, `${JSON.stringify({ source, surface: SURFACE, names, colours: usedColours, parts })}\n`);

console.log(`${out}: ${Object.keys(usedColours).length} colours`);
for (const id of targets) {
  const entries = Object.entries(parts[id]);
  const plain = entries.filter(([code]) => !colours[code].special);
  const common = plain.filter(([, [sets]]) => sets >= 10);
  console.log(`  ${id} ${names[id]}: ${entries.length} opaque, ${plain.length} plain, ${common.length} plain in ≥10 sets`);
}
