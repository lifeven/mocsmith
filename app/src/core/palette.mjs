/**
 * Solid-colour 3D palette from availability.json. LDraw supplies colour codes
 * and RGB values; Rebrickable inventories supply part availability.
 * The first 20 entries form a stable base palette because grid cells store
 * palette index + 1. Additional colours follow in availability order.
 */

import AVAILABILITY from '../data/availability.json' with { type: 'json' };

/**
 * `code` is the LDraw colour code, `rb` the Rebrickable colour id (they differ
 * for a few newer colours; the parts-list CSV needs `rb`); `name` is the
 * LDraw colour name; names shown on the page come from the locale files
 * (`colour.<code>`).
 * @typedef {{ code: number, rb: number, name: string, hex: number }} PaletteColour
 */

/** @type {PaletteColour[]} */
export const PALETTE = AVAILABILITY.colours.map(([code, rb, name, hex]) => ({ code, rb, name, hex }));

/** Number of entries in the stable base palette. */
export const BASE_PALETTE_SIZE = 20;

/** Grid value (palette index + 1) for an LDraw colour code. */
export function cellValue(code) {
  const i = PALETTE.findIndex((c) => c.code === code);
  if (i < 0) throw new Error(`colour ${code} not in palette`);
  return i + 1;
}

const LAB = PALETTE.map((c) => srgbToLab((c.hex >> 16) & 255, (c.hex >> 8) & 255, c.hex & 255));

/** Grid value of the palette colour nearest to an sRGB colour (0–255), by CIE76 ΔE in Lab. */
export function nearestCell(r, g, b) {
  return nearestIn(LAB.length, r, g, b);
}

/** Match a colour against only the first `n` entries of the palette. */
export const nearestCellOf = (n) => (r, g, b) => nearestIn(Math.min(n, LAB.length), r, g, b);

function nearestIn(n, r, g, b) {
  const [l, a, bb] = srgbToLab(r, g, b);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (LAB[i][0] - l) ** 2 + (LAB[i][1] - a) ** 2 + (LAB[i][2] - bb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best + 1;
}

/** sRGB (0–255) → CIE Lab, D65. */
export function srgbToLab(r, g, b) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
