/**
 * Read Rebrickable's gzipped CSV downloads (https://rebrickable.com/downloads/),
 * cached outside the repo. Fetch them first:
 *
 *   mkdir -p ~/.cache/mocsmith/rebrickable && cd $_
 *   for f in colors elements parts part_relationships inventories inventory_parts sets; do
 *     curl -sSL -o $f.csv.gz https://cdn.rebrickable.com/media/downloads/$f.csv.gz; done
 *
 * Shared by tools/availability.mjs and tools/mosaic-colours.mjs.
 */

import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_CACHE = join(homedir(), '.cache/mocsmith/rebrickable');

/** Minimal CSV line split (handles quoted fields with commas). */
export function splitCsv(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

/** Call fn(row) for every data row of `<cache>/<name>.csv.gz`, rows as {header: value}. */
export async function eachRow(cache, name, fn) {
  const rl = createInterface({ input: createReadStream(join(cache, `${name}.csv.gz`)).pipe(createGunzip()) });
  let header = null;
  for await (const line of rl) {
    const cells = splitCsv(line);
    if (!header) { header = cells; continue; }
    fn(Object.fromEntries(header.map((h, i) => [h, cells[i]])));
  }
}

/**
 * Rebrickable part number -> one of `targets`, including mould variants and
 * alternates (part_relationships rel_type M / A, e.g. 3069 for 3069b): they fit
 * the same way. Printed and patterned versions (P / T) do not count.
 */
export async function partAliases(cache, targets) {
  const alias = new Map(targets.map((id) => [id, id]));
  await eachRow(cache, 'part_relationships', (r) => {
    if (r.rel_type !== 'M' && r.rel_type !== 'A') return;
    for (const [a, b] of [[r.child_part_num, r.parent_part_num], [r.parent_part_num, r.child_part_num]]) {
      if (alias.get(b) === b && targets.includes(b) && !alias.has(a)) alias.set(a, b);
    }
  });
  return alias;
}

/**
 * part -> colour id -> { sets: Set<set_num>, last: year } for the given parts,
 * from set inventories (spare parts ignored). `keepColour(id)` filters colours.
 */
export async function partColourSets(cache, alias, keepColour = () => true) {
  const setYear = new Map();
  await eachRow(cache, 'sets', (r) => setYear.set(r.set_num, Number(r.year)));
  const inventorySet = new Map();
  await eachRow(cache, 'inventories', (r) => inventorySet.set(r.id, r.set_num));
  const seen = new Map();
  await eachRow(cache, 'inventory_parts', (r) => {
    const part = alias.get(r.part_num);
    if (!part || !keepColour(r.color_id) || r.is_spare === 'True') return;
    const set = inventorySet.get(r.inventory_id);
    if (!set) return;
    const byColour = seen.get(part) ?? new Map();
    seen.set(part, byColour);
    const e = byColour.get(r.color_id) ?? { sets: new Set(), last: 0 };
    byColour.set(r.color_id, e);
    e.sets.add(set);
    e.last = Math.max(e.last, setYear.get(set) ?? 0);
  });
  return seen;
}

/**
 * "part/colour" keys for LEGO element ids: a part + colour LEGO made and
 * numbered, even if no set inventory lists it (bulk packs, Pick a Brick).
 */
export async function elementKeys(cache, alias, keepColour = () => true) {
  const keys = new Set();
  await eachRow(cache, 'elements', (r) => {
    const part = alias.get(r.part_num);
    if (part && keepColour(r.color_id)) keys.add(`${part}/${r.color_id}`);
  });
  return keys;
}

/** Download date of the cache in local time (toISOString would give the UTC date). */
export function fetchedDate(cache) {
  const mtime = statSync(join(cache, 'inventory_parts.csv.gz')).mtime;
  return [mtime.getFullYear(), mtime.getMonth() + 1, mtime.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

/** Pearl, metallic, chrome, glitter, speckle, satin, glow-in-the-dark… colours: shown only on request. */
export const SPECIAL = /pearl|metallic|chrome|glitter|speckle|satin|glow|opal|silver|gold|copper|bronze/i;

/**
 * Rebrickable colour id → LDraw colour code, where the two differ. Matched in
 * LDraw's LDConfig.ldr (library.ldraw.org, 2026-10-09) by its `LEGOID` comment
 * (LEGO's own colour name) and, where noted, an identical RGB value. Every
 * other colour we use has the same number in both. Rebrickable 1051 Pastel
 * Blue has no clear LDraw match and is left out (the mosaic export then
 * writes the colour directly as RGB).
 */
export const LDRAW_CODE = {
  158: 326, // Yellowish Green = LEGOID 326 Spring Yellowish Green (LDraw 158 is a transparent colour)
  326: 330, // Olive Green = LEGOID 330 Olive Green (LDraw 326 is Yellowish Green)
  1000: 329, // Glow in Dark White = LEGOID 329 White Glow
  1050: 353, // Coral = LEGOID 353 Vibrant Coral
  1062: 368, // Vibrant Yellow = LEGOID 368 Vibrant Yellow
  1089: 371, // Warm Tan = LEGOID 371 Warm Tan, same RGB
  1091: 225, // Warm Yellowish Orange = LEGOID 225
  1103: 316, // Pearl Titanium = LEGOID 316 Titanium Metallic, same RGB
  1136: 402, // Reddish Orange = LEGOID 402, same RGB
  1146: 430, // Warm Pink = LEGOID 430
  1147: 431, // Blue Violet = LEGOID 431 Blue Violet (RGB values differ)
};

/** LDraw colour code for a Rebrickable colour id. */
export const ldrawCodeOf = (rbId) => LDRAW_CODE[rbId] ?? Number(rbId);

export const DEFAULT_LDCONFIG = join(homedir(), '.cache/mocsmith/ldraw/LDConfig.ldr');

/**
 * Colours in LDraw's LDConfig.ldr (cached; fetch with
 * `curl -o ~/.cache/mocsmith/ldraw/LDConfig.ldr https://library.ldraw.org/library/official/LDConfig.ldr`):
 * code → { name (underscores as spaces), hex }.
 */
export function readLdconfig(path = DEFAULT_LDCONFIG) {
  const out = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/!COLOUR\s+(\S+)\s+CODE\s+(\d+)\s+VALUE\s+#([0-9A-Fa-f]{6})/);
    if (m) out.set(Number(m[2]), { name: m[1].replace(/_/g, ' '), hex: parseInt(m[3], 16) });
  }
  return out;
}
