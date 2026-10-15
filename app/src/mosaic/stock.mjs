import { DEFAULT_METRIC, METRICS } from './colour.mjs';
import { SURFACE_PARTS } from './palette.mjs';
import sets from '../data/mosaic-sets.json' with { type: 'json' };

/**
 * LEGO Art sets that have this surface part (data/mosaic-sets.json, made by
 * tools/mosaic-sets.mjs), in set-number order.
 * @param {string} kind key of SURFACE_PARTS
 * @returns {{ id: string, name: string, year: number, count: number }[]} count: parts of this kind in the box
 */
export function setsWithPart(kind) {
  const part = SURFACE_PARTS[kind];
  return sets.sets
    .filter((s) => s.parts[part])
    .map((s) => ({ id: s.id, name: s.name, year: s.year, count: Object.values(s.parts[part]).reduce((a, b) => a + b, 0) }));
}

/**
 * A LEGO Art set's surface parts as inventory rows in Rebrickable numbers,
 * the same shape as io/set-library.mjs `inventoryOf`.
 * @param {string} id set id such as '31197-1'
 * @returns {{ part: string, colour: string, quantity: number }[]}
 */
export function artSetRows(id) {
  const set = sets.sets.find((s) => s.id === id);
  if (!set) return [];
  return Object.entries(set.parts).flatMap(([part, colours]) => Object.entries(colours).map(([colour, quantity]) => ({ part, colour, quantity })));
}

/**
 * One surface part's colours in some inventory rows, times `copies`:
 * Rebrickable colour id → count; null when the rows have none of it.
 * @param {string} kind key of SURFACE_PARTS
 * @param {Iterable<{ part: string, colour: string, quantity: number }>} rows
 * @param {number} [copies]
 * @returns {Map<number, number> | null}
 */
export function surfaceStock(kind, rows, copies = 1) {
  const part = SURFACE_PARTS[kind];
  const stock = new Map();
  for (const r of rows) if (r.part === part) stock.set(Number(r.colour), (stock.get(Number(r.colour)) ?? 0) + r.quantity * copies);
  return stock.size ? stock : null;
}

/**
 * A stock-limited mosaic fits the photo badly when its mean colour difference
 * is both 1.5 × and 6 more than with any colour (labrador + 31203 World Map:
 * 30 against 12; any single portrait set: about 17 against 12, not flagged).
 */
export const badFit = (limited, free) => free > 0 && limited > free * 1.5 && limited - free > 6;

/**
 * Colour stocks added up; null when all are empty.
 * @param {(Map<number, number> | null)[]} stocks
 */
export function mergeColourStocks(stocks) {
  const out = new Map();
  for (const s of stocks) if (s) for (const [code, n] of s) out.set(code, (out.get(code) ?? 0) + n);
  return out.size ? out : null;
}

/**
 * Parts in hand from some LEGO Art sets, for one surface part: Rebrickable
 * colour id → count, summed over the sets. Sets without this part add nothing;
 * null when none of them has it (then the mosaic is not limited).
 * @param {string} kind key of SURFACE_PARTS
 * @param {Iterable<string>} ids set ids such as '31197-1'
 * @returns {Map<number, number> | null}
 */
export function stockFromSets(kind, ids) {
  const part = SURFACE_PARTS[kind];
  const stock = new Map();
  for (const id of ids) {
    const colours = sets.sets.find((s) => s.id === id)?.parts[part] ?? {};
    for (const [code, n] of Object.entries(colours)) stock.set(Number(code), (stock.get(Number(code)) ?? 0) + n);
  }
  return stock.size ? stock : null;
}

/**
 * How far a box colour may be from a cell's best colour before the cell is
 * bought in its best colour instead (CIE76 / the metric's units), per choice of
 * 「只用我有的套装」: fewest parts to buy (every box part is used), a middle way,
 * or the picture closest to the photo.
 */
export const STOCK_MODES = { fewest: Infinity, balanced: 20, closest: 6 };

/**
 * "Only the parts I have": put a mosaic's cells onto a limited stock of
 * colours. Every cell has a best colour in the whole palette; giving it a box
 * colour instead costs a regret (its distance minus the best one's). Box parts
 * go out lowest regret first (a cell whose best colour is in the box costs
 * nothing; among equal regrets the closer cell first), one per cell, until the
 * box is empty or the regret passes `tolerance`. Every cell left takes its best
 * colour and is counted as a part to buy.
 *
 * Handing parts out cheapest-first keeps a box colour off cells it suits badly
 * while it is still in the box, so leftovers do not end up as stray dots, and
 * with tolerance Infinity it buys exactly as many parts as the stock is short.
 * Fixed-stock matching follows the idea in lego-art-remix (see NOTICE).
 * Assignment order and distance tolerance are implemented here.
 *
 * @param {Float32Array} lab 3 floats per cell (after the brightness/contrast adjustment)
 * @param {import('./palette.mjs').MosaicColour[]} palette
 * @param {Map<number, number>} stock Rebrickable colour id → parts in hand
 * @param {{ metric?: string, tolerance?: number }} [opts]
 * @returns {{ cells: Uint8Array, buy: Map<number, number>, short: number, shortBy: Record<keyof STOCK_MODES, number> }}
 *   cells: palette index per cell; buy: palette index → parts to buy; short: cells bought;
 *   shortBy: how many would be bought with each of STOCK_MODES (same pass)
 */
export function limitToStock(lab, palette, stock, { metric = DEFAULT_METRIC, tolerance = Infinity } = {}) {
  const M = METRICS[metric];
  const n = lab.length / 3;
  const P = palette.length;
  const pal = palette.map((c) => M.space(c.lab));
  const left = palette.map((c) => stock.get(c.code) ?? 0);
  const inStock = [...left.keys()].filter((p) => left[p] > 0);
  const S = inStock.length;
  let remaining = left.reduce((a, b) => a + b, 0);

  const dist = new Float32Array(n * P);
  const best = new Uint8Array(n);
  for (let c = 0; c < n; c++) {
    const s = M.space([lab[c * 3], lab[c * 3 + 1], lab[c * 3 + 2]]);
    let b = 0;
    for (let p = 0; p < P; p++) {
      const d = M.d(s, pal[p]);
      dist[c * P + p] = d;
      if (d < dist[c * P + b]) b = p;
    }
    best[c] = b;
  }

  // Every (cell, box colour) pair, cheapest first.
  const regret = new Float32Array(n * S);
  const own = new Float32Array(n * S);
  for (let c = 0; c < n; c++) {
    const base = dist[c * P + best[c]];
    for (let k = 0; k < S; k++) {
      own[c * S + k] = dist[c * P + inStock[k]];
      regret[c * S + k] = own[c * S + k] - base;
    }
  }
  const order = new Uint32Array(n * S).map((_, i) => i);
  order.sort((a, b) => regret[a] - regret[b] || own[a] - own[b] || a - b);

  const marks = Object.entries(STOCK_MODES).sort((a, b) => a[1] - b[1]);
  const shortBy = /** @type {Record<string, number>} */ ({});
  let mark = 0;
  const cells = new Uint8Array(n);
  const done = new Uint8Array(n);
  let given = 0;
  /** The assignment when the regret first passes `tolerance` (the rest of the pass only counts). */
  let chosen = null;
  for (const i of order) {
    if (remaining === 0 || given === n) break;
    const r = regret[i];
    while (mark < marks.length && r > marks[mark][1]) shortBy[marks[mark++][0]] = n - given;
    if (!chosen && r > tolerance) chosen = { cells: cells.slice(), done: done.slice() };
    const c = Math.floor(i / S);
    const p = inStock[i % S];
    if (done[c] || left[p] === 0) continue;
    cells[c] = p;
    done[c] = 1;
    left[p]--;
    remaining--;
    given++;
  }
  while (mark < marks.length) shortBy[marks[mark++][0]] = n - given;
  const out = chosen ?? { cells, done };

  const buy = new Map();
  let short = 0;
  for (let c = 0; c < n; c++) {
    if (out.done[c]) continue;
    out.cells[c] = best[c];
    buy.set(best[c], (buy.get(best[c]) ?? 0) + 1);
    short++;
  }
  return { cells: out.cells, buy, short, shortBy: /** @type {any} */ (shortBy) };
}
