/**
 * What a 2D mosaic is built on, and the full parts list. Pure, no DOM.
 *
 * Three bases:
 *   panels      — LEGO Art's way: 65803 16 × 16 panels joined by Technic pins
 *                 2780 through the holes in their sides. Fits any size in
 *                 steps of 16 and holds together as one piece.
 *   baseplate48 — 4186 48 × 48 baseplates (Mosaic Maker 40179 uses one).
 *   baseplate32 — 3811 32 × 32 baseplates.
 * Baseplates only fit sizes that are whole multiples of their side, and
 * several of them do not clip together: they need a board or frame behind.
 *
 * Pins: 3 per edge two panels share. LEGO's sets give 3 × the shared edges
 * plus the pins for the two wall-mount panels — 31197 and 31198 (3 × 3
 * panels, 12 shared edges): 40 = 36 + 4; 31203 World Map (8 × 5, 67 edges):
 * 206 = 201 + 5 (Rebrickable inventories, 2026-10-08).
 */

import table from '../data/mosaic-colours.json' with { type: 'json' };
import { RAISE_COLOUR, RAISE_PLATES } from './relief.mjs';

/** Pins per edge two panels share. */
export const PINS_PER_EDGE = 3;

/** @typedef {'panels'|'baseplate48'|'baseplate32'} BaseKey */

/** Base kinds: the base part, its side in studs, the pin part (panels only). */
export const BASES = {
  panels: { part: '65803', side: 16, pin: '2780' },
  baseplate48: { part: '4186', side: 48 },
  baseplate32: { part: '3811', side: 32 },
};

/** Colours tried first for a base part: dark or neutral, quiet in the gaps between round tiles. */
const PREFERRED = ['0', '72', '71'];

/**
 * Colours LEGO made a base part in (in a set, or with a LEGO element id), most sets first.
 * @param {string} part
 * @returns {{ code: number, name: string, sets: number }[]}
 */
export function baseColours(part) {
  const made = table.parts[part];
  if (!made) throw new Error(`unknown base part ${part}`);
  return Object.entries(made)
    .filter(([, [sets, , element]]) => sets > 0 || element)
    .map(([code, [sets]]) => ({ code: Number(code), name: table.colours[code].name, sets }))
    .sort((a, b) => b.sets - a.sets || a.code - b.code);
}

/**
 * The default colour for a base part: the first of black, dark bluish grey,
 * light bluish grey that is in ≥ 10 sets, else the colour in most sets.
 * @param {string} part
 */
export function defaultBaseColour(part) {
  const list = baseColours(part);
  const pick = PREFERRED.map(Number).find((code) => list.some((c) => c.code === code && c.sets >= 10));
  return pick ?? list[0].code;
}

/**
 * @typedef {{ key: BaseKey, part: string, side: number, cols: number, rows: number, count: number,
 *   pins: number, pin?: string, joined: boolean, fits: boolean }} BasePlan
 */

/**
 * Every base for a width × height mosaic (studs), panels first. `fits` says
 * whether the size is a whole number of that base; `joined` whether the
 * pieces hold together by themselves.
 * @param {number} width
 * @param {number} height
 * @returns {BasePlan[]}
 */
export function planBases(width, height) {
  return /** @type {BaseKey[]} */ (Object.keys(BASES)).map((key) => {
    const { part, side, pin } = BASES[key];
    const fits = width % side === 0 && height % side === 0 && width > 0 && height > 0;
    const cols = fits ? width / side : 0;
    const rows = fits ? height / side : 0;
    const count = cols * rows;
    const edges = fits ? (cols - 1) * rows + cols * (rows - 1) : 0;
    const pins = pin ? PINS_PER_EDGE * edges : 0;
    return { key, part, side, cols, rows, count, pins, ...(pin ? { pin } : {}), joined: fits && (key === 'panels' || count === 1), fits };
  });
}

/**
 * @typedef {{ part: string, colour: number, quantity: number, role: 'surface'|'base'|'pin'|'raise', name: string, size?: [number, number] }} PartRow
 *   colour is a Rebrickable colour id; size: studs across × along, raise plates only
 */

/**
 * The parts to buy: one surface part per cell by colour (most first), then
 * the base pieces and the pins, then (2.5D) the black raise plates, largest first.
 * @param {{ partId: string, cells: ArrayLike<number>, palette: { code: number }[] }} mosaic  buildMosaic() result
 * @param {BasePlan} plan  a fitting plan from planBases
 * @param {{ baseColour?: number, pinColour?: number, raise?: Map<string, number> | null }} [opts] raise: raisePlates() counts
 * @returns {PartRow[]}
 */
export function partsList(mosaic, plan, { baseColour = defaultBaseColour(plan.part), pinColour, raise = null } = {}) {
  if (!plan.fits) throw new Error(`${plan.key} does not fit this size`);
  const counts = new Map();
  for (const p of Array.from(mosaic.cells)) {
    const code = mosaic.palette[p].code;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const name = (part) => table.names[part];
  const rows = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([colour, quantity]) => ({ part: mosaic.partId, colour, quantity, role: /** @type {const} */ ('surface'), name: name(mosaic.partId) }));
  rows.push({ part: plan.part, colour: baseColour, quantity: plan.count, role: 'base', name: name(plan.part) });
  if (plan.pins) rows.push({ part: plan.pin, colour: pinColour ?? defaultBaseColour(plan.pin), quantity: plan.pins, role: 'pin', name: name(plan.pin) });
  for (const [w, d, part, plateName] of RAISE_PLATES) {
    const quantity = raise?.get(part);
    if (quantity) rows.push({ part, colour: RAISE_COLOUR, quantity, role: 'raise', name: plateName, size: [w, d] });
  }
  return rows;
}
