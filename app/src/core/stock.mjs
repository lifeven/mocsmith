/**
 * "Only use the parts I have" for 3D models. A stock is plain data, so it travels to the Web Worker in the build
 * settings unchanged:
 *
 *   { parts: { <LDraw part number>: { <LDraw colour code>: count } } }
 *
 * It comes from LEGO Classic boxes (data/stock-sets.json, made by
 * tools/stock-sets.mjs) or from a Rebrickable parts-list CSV ("Part,Color,
 * Quantity", the same format the page exports). Parts our part table does not
 * have, and colours outside the 3D palette, cannot be used and are counted as
 * skipped.
 */

import SETS from '../data/stock-sets.json' with { type: 'json' };
import { PALETTE } from './palette.mjs';
import { PART_TYPES } from './parts.mjs';

/** @typedef {{ parts: Record<string, Record<string, number>> }} Stock */

/**
 * The 1×1 brick and 1×1 plate are always allowed, owned or not, so every cell
 * can still be filled; the ones not in the stock end up on the to-buy list.
 */
export const ALWAYS_ALLOWED = new Set(['3005', '3024']);

/** The sample boxes: id, name, year, pieces in the box, pieces we can use. */
export const STOCK_SETS = SETS.sets.map(({ id, name, year, total, other }) => ({ id, name, year, total, usable: total - other }));

/** Add `n` of (ldraw, code) to a stock in place. */
function add(stock, ldraw, code, n) {
  const byColour = (stock.parts[ldraw] ??= {});
  byColour[code] = (byColour[code] ?? 0) + n;
}

/**
 * The parts of some sample boxes together.
 * @param {Iterable<string>} ids set ids such as '10698-1'
 * @returns {Stock | null} null when no id is a known box
 */
export function stockFromSets(ids) {
  const stock = { parts: {} };
  let any = false;
  for (const id of ids) {
    const set = SETS.sets.find((s) => s.id === id);
    if (!set) continue;
    any = true;
    for (const [ldraw, colours] of Object.entries(set.parts)) for (const [code, n] of Object.entries(colours)) add(stock, ldraw, code, n);
  }
  return any ? stock : null;
}

const LDRAW_OF_RB = new Map(PART_TYPES.flatMap((p) => [[p.ldraw, p.ldraw], [p.rb ?? p.ldraw, p.ldraw]]));
const CODE_OF_RB = new Map(PALETTE.map((c) => [String(c.rb), c.code]));

/**
 * A stock from a Rebrickable parts-list CSV: a header row naming Part, Color
 * and Quantity (any order, any case), then one row per part and colour.
 * Rebrickable colour ids are mapped to LDraw codes.
 *
 * @param {string} text
 * @returns {{ stock: Stock, rows: number, used: number, skipped: number }} rows read; pieces kept; pieces skipped
 *   (parts or colours we cannot use)
 * @throws {Error} 'csv-header' when the header is missing
 */
export function stockFromCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = (lines.shift() ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = (name) => head.indexOf(name);
  const [ip, ic, iq] = [col('part'), col('color'), col('quantity')];
  if (ip < 0 || ic < 0 || iq < 0) throw new Error('csv-header');
  const rows = lines.map((line) => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return { part: cells[ip], colour: cells[ic], quantity: Number(cells[iq]) };
  });
  return { ...stockFromRows(rows), rows: lines.length };
}

/**
 * A stock from rows in Rebrickable numbers (a parts-list CSV, or a set's
 * inventory from io/set-library.mjs). Parts our table does not have and
 * colours outside the 3D palette are counted as skipped.
 *
 * @param {Iterable<{ part: string, colour: string, quantity: number }>} rows
 * @returns {{ stock: Stock, used: number, skipped: number }} pieces kept; pieces skipped
 */
export function stockFromRows(rows) {
  const stock = { parts: {} };
  let used = 0;
  let skipped = 0;
  for (const { part, colour, quantity: n } of rows) {
    if (!Number.isFinite(n) || n <= 0) continue;
    const ldraw = LDRAW_OF_RB.get(part);
    const code = CODE_OF_RB.get(colour);
    if (!ldraw || code === undefined) {
      skipped += n;
      continue;
    }
    add(stock, ldraw, String(code), n);
    used += n;
  }
  return { stock, used, skipped };
}

/**
 * A stock with every count multiplied by `copies` (the same set twice).
 * @param {Stock} stock
 * @param {number} copies whole number ≥ 1
 * @returns {Stock}
 */
export function scaleStock(stock, copies) {
  if (copies === 1) return stock;
  const out = { parts: {} };
  for (const [ldraw, colours] of Object.entries(stock.parts)) for (const [code, n] of Object.entries(colours)) add(out, ldraw, code, n * copies);
  return out;
}

/**
 * Several stocks together (sample boxes and an imported list).
 * @param {(Stock | null | undefined)[]} stocks
 * @returns {Stock | null} null when all are empty
 */
export function mergeStocks(stocks) {
  const out = { parts: {} };
  for (const s of stocks) {
    if (!s) continue;
    for (const [ldraw, colours] of Object.entries(s.parts)) for (const [code, n] of Object.entries(colours)) add(out, ldraw, code, n);
  }
  return Object.keys(out.parts).length ? out : null;
}

/** How many of (ldraw, colour code) the stock holds. */
export function owned(stock, ldraw, code) {
  return stock.parts[ldraw]?.[code] ?? 0;
}

/** LDraw colour codes the stock has any part in. */
export function ownedColours(stock) {
  const codes = new Set();
  for (const colours of Object.values(stock.parts)) for (const [code, n] of Object.entries(colours)) if (n > 0) codes.add(Number(code));
  return codes;
}

/** Pieces in the stock. */
export function stockSize(stock) {
  let n = 0;
  for (const colours of Object.values(stock.parts)) for (const c of Object.values(colours)) n += c;
  return n;
}

/**
 * What a part list takes from the stock and what is left to buy.
 *
 * @param {Stock} stock
 * @param {{ ldraw: string, code: number }[]} pieces one entry per placed part
 * @returns {{ have: number, buy: number, toBuy: [string, number, number][] }} toBuy: [ldraw, code, count], most first
 */
export function shortfall(stock, pieces) {
  const need = new Map();
  for (const { ldraw, code } of pieces) {
    const key = `${ldraw}|${code}`;
    need.set(key, (need.get(key) ?? 0) + 1);
  }
  let have = 0;
  let buy = 0;
  const toBuy = [];
  for (const [key, n] of need) {
    const [ldraw, code] = key.split('|');
    const take = Math.min(n, owned(stock, ldraw, code));
    have += take;
    if (n > take) {
      buy += n - take;
      toBuy.push([ldraw, Number(code), n - take]);
    }
  }
  toBuy.sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return { have, buy, toBuy };
}
