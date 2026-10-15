/**
 * Any LEGO set's usable parts ,
 * for "only the parts I have" on the 3D page and the mosaic page. The data is
 * made by tools/set-index.mjs into public/data and fetched only when a
 * visitor searches (the list, 0.18 MB gzipped) or adds a set (the one parts
 * file of 16 that holds it, about 55 KB gzipped); each file is fetched once
 * per page load.
 *
 * Parts are in Rebrickable numbers (part and colour), the same as a
 * Rebrickable parts-list CSV, so the pages turn them into a stock the same way.
 */

/** @typedef {[id: string, name: string, year: number, usable: number, image?: string]} SetRow  usable: pieces of our part types, any colour; image: file name on Rebrickable when it is not `<id>.jpg` */
/** @typedef {{ part: string, colour: string, quantity: number }} InventoryRow  Rebrickable part number and colour id */

/** Number of inventory shards. A set lookup fetches only its assigned shard. */
export const SHARDS = 16;

/** Which parts file a set is in: FNV-1a of the set number, mod SHARDS. */
export function shardOf(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % SHARDS;
}

/** File name of a parts shard: sets-parts-00.json … sets-parts-15.json. */
export const shardFile = (k) => `sets-parts-${String(k).padStart(2, '0')}.json`;

const files = new Map();
/** Fetch a JSON file once; a failed fetch is forgotten so it can be tried again. */
function once(name, fetcher) {
  if (!files.has(name)) {
    const p = fetcher(`/data/${name}`).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => files.delete(name));
    files.set(name, p);
  }
  return files.get(name);
}

/** @returns {Promise<SetRow[]>} every set with at least one usable piece, by set number */
export const loadSetIndex = (fetcher = fetch) => once('sets-index.json', fetcher).then((d) => d.sets);
/**
 * The parts file holding set `id` (one of SHARDS; each fetched once).
 * @returns {Promise<{ parts: string[], sets: Record<string, number[]> }>}
 */
export const loadSetParts = (id, fetcher = fetch) => once(shardFile(shardOf(id)), fetcher);

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/**
 * Sets matching what a visitor typed: a set number (with or without "-1") or
 * words of the name. A number lists the exact set first, then sets whose
 * number starts with it; words must all appear in the name, bigger sets first.
 * @param {SetRow[]} index
 * @param {string} query
 * @param {number} [limit]
 * @returns {SetRow[]}
 */
export function searchSets(index, query, limit = 12) {
  const q = norm(query.trim());
  if (!q) return [];
  if (/^\d[\da-z-]*$/.test(q)) {
    // Set numbers, any case ('102a' finds 102A-1).
    const exact = q.includes('-') ? q : `${q}-1`;
    const id = (s) => s[0].toLowerCase();
    const hits = index.filter((s) => id(s) === exact || id(s).startsWith(q));
    return hits.sort((a, b) => (id(b) === exact) - (id(a) === exact) || a[0].length - b[0].length || a[0].localeCompare(b[0], 'en', { numeric: true })).slice(0, limit);
  }
  const words = q.split(/\s+/);
  return index
    .filter((s) => {
      const name = norm(s[1]);
      return words.every((w) => name.includes(w));
    })
    .sort((a, b) => b[3] - a[3] || b[2] - a[2])
    .slice(0, limit);
}

/**
 * One set's usable parts, times how many of that set the visitor has.
 * @param {{ parts: string[], sets: Record<string, number[]> }} data loadSetParts()
 * @param {string} id set number such as '10698-1'
 * @param {number} [copies]
 * @returns {InventoryRow[]}
 */
export function inventoryOf(data, id, copies = 1) {
  const flat = data.sets[id] ?? [];
  const rows = [];
  for (let i = 0; i < flat.length; i += 3) rows.push({ part: data.parts[flat[i]], colour: String(flat[i + 1]), quantity: flat[i + 2] * copies });
  return rows;
}
