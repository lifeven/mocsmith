import table from '../data/mosaic-colours.json' with { type: 'json' };
import { linToLab, toLinear } from './colour.mjs';

/**
 * The parts and colours a mosaic can use (data/mosaic-colours.json): only
 * colours LEGO really made each surface part in.
 */

/** Surface part ids by kind: roundTile 98138, squareTile 3070b, roundPlate 6141, squarePlate 3024. */
export const SURFACE_PARTS = Object.fromEntries(Object.entries(table.surface).map(([id, kind]) => [kind, id]));

/**
 * @typedef {{ code: number, ldraw: number|string, name: string, rgb: [number, number, number], lab: [number, number, number], sets: number }} MosaicColour  code = Rebrickable colour id, ldraw = LDraw colour code (ldrawCode)
 * @typedef {{ width: number, height: number, data: ArrayLike<number> }} Pixels  RGBA, row-major, like ImageData
 */

/**
 * Colours a surface part was made in.
 * @param {string} kind  key of SURFACE_PARTS
 * @param {{ minSets?: number, special?: boolean }} [opts]  minSets: made in at least this many sets (default 10); special: allow pearl, metallic … (default false)
 * @returns {MosaicColour[]}
 */
export function mosaicPalette(kind, { minSets = 10, special = false } = {}) {
  const part = SURFACE_PARTS[kind];
  if (!part) throw new Error(`unknown mosaic part ${kind}`);
  const out = [];
  for (const [code, [sets, , element]] of Object.entries(table.parts[part])) {
    const c = table.colours[code];
    if (c.special && !special) continue;
    if (sets < minSets && !(minSets === 0 && element)) continue;
    const hex = parseInt(c.rgb, 16);
    const rgb = /** @type {[number, number, number]} */ ([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
    out.push({ code: Number(code), ldraw: ldrawCode(code), name: c.name, rgb, lab: linToLab(...rgb.map(toLinear)), sets });
  }
  return out;
}

/** Rebrickable colours with no LDraw code (tools/mosaic-colours.mjs). */
const NO_LDRAW = new Set(['1051']);

/**
 * LDraw colour code for a Rebrickable colour id (they differ for a few newer
 * colours, tools/mosaic-colours.mjs LDRAW_CODE). An id LDraw has no code for
 * comes back as a direct colour `0x2RRGGBB`, which the LDraw format allows.
 * @param {number|string} code  Rebrickable colour id
 * @returns {number|string}
 */
export function ldrawCode(code) {
  const c = table.colours[code];
  if (!c) throw new Error(`unknown colour ${code}`);
  if (c.ldraw) return c.ldraw;
  return NO_LDRAW.has(String(code)) ? `0x2${c.rgb.toUpperCase()}` : Number(code);
}
