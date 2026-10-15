/**
 * Export a 2D mosaic as an LDraw `.ldr` file and a Rebrickable parts-list CSV.
 *
 * Layout (LDraw part files 65803, 2780, 3811, 4186, 98138, 3070b, 6141, 3024
 * from library.ldraw.org, 2026-10-09):
 * - The mosaic lies flat, studs up. Picture column c → x = 20(c + ½), row r →
 *   z = −20(r + ½), so seen from above with the front (−Z) at the bottom the
 *   top row is at the back and the picture reads upright (same z flip as the
 *   3D export, io/ldr.mjs).
 * - Base parts have their origin at the centre of their top face (y = 0);
 *   a 65803 panel is 32 LDU tall, a baseplate 4.
 * - The 1 × 1 surface parts are 8 LDU tall with the origin on their top, so
 *   they sit at y = −8.
 * - 65803 has 11 pin holes along each side, 20 LDU apart, 18 LDU below its
 *   top (s/65803s01–s03). A 2780 pin is 40 LDU long along its own X, centred
 *   on its origin, so a joining pin sits on the shared edge, half in each
 *   panel. We use the holes at −100, 0 and +100 LDU from the edge's middle
 *   (LEGO's sets use 3 per edge, mosaic/base.mjs; which holes is our choice).
 * - 2.5D (mosaic/relief.mjs): a raise plate of layer z is a black LDraw plate
 *   (3035 4 × 8 … 3024 1 × 1, origin on its top, 8 LDU tall, long side along
 *   X as in io/ldr.mjs, turned 90° when it is longer down the picture), its
 *   top at y = −8(z + 1); a surface part on a cell raised k plates sits at
 *   y = −8 − 8k.
 * Steps: the base first, then per 16 × 16 block, row by row, its raise plates
 * (when there are any, a plate in the block of its top-left cell) and then its
 * surface parts.
 */

import { ldrawCode } from '../mosaic/palette.mjs';
import { defaultBaseColour } from '../mosaic/base.mjs';
import { RAISE_COLOUR } from '../mosaic/relief.mjs';
import { fileStem } from './file-name.mjs';
import { t } from '../i18n/index.mjs';

const STUD = 20;
const PLATE = 8;
const SURFACE_Y = -PLATE;
const PIN_Y = 18;
const PIN_OFFSETS = [-100, 0, 100];
const BLOCK = 16;

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** 90° about Y: the pin's own X axis turns to world Z. */
const QUARTER = [0, 0, 1, 0, 1, 0, -1, 0, 0];

const n = (v) => (Object.is(v, -0) ? 0 : v);
const line = (colour, [x, y, z], rot, part) => `1 ${colour} ${[x, y, z].map(n).join(' ')} ${rot.map(n).join(' ')} ${part}.dat`;

/**
 * Type-1 lines for the base: the base parts, then the pins joining panels.
 * @param {import('../mosaic/base.mjs').BasePlan} plan
 * @param {number} baseColour  Rebrickable colour id
 * @param {number} pinColour  Rebrickable colour id
 */
export function baseLines(plan, baseColour, pinColour) {
  const s = plan.side * STUD;
  const lines = [];
  for (let j = 0; j < plan.rows; j++) {
    for (let i = 0; i < plan.cols; i++) lines.push(line(ldrawCode(baseColour), [(i + 0.5) * s, 0, -(j + 0.5) * s], IDENTITY, plan.part));
  }
  if (!plan.pins) return lines;
  const pin = ldrawCode(pinColour);
  for (let j = 0; j < plan.rows; j++) {
    for (let i = 0; i < plan.cols; i++) {
      const cx = (i + 0.5) * s;
      const cz = -(j + 0.5) * s;
      // Edge to the right (+x): pin along X.
      if (i + 1 < plan.cols) for (const o of PIN_OFFSETS) lines.push(line(pin, [(i + 1) * s, PIN_Y, cz + o], IDENTITY, plan.pin));
      // Edge to the next row (−z): pin along Z.
      if (j + 1 < plan.rows) for (const o of PIN_OFFSETS) lines.push(line(pin, [cx + o, PIN_Y, -(j + 1) * s], QUARTER, plan.pin));
    }
  }
  return lines;
}

/**
 * The mosaic as `.ldr` text.
 * @param {{ width: number, height: number, partId: string, cells: ArrayLike<number>, palette: { code: number }[] }} mosaic  buildMosaic() result
 * @param {import('../mosaic/base.mjs').BasePlan} plan  a fitting plan (planBases)
 * @param {{ name: string, baseColour?: number, pinColour?: number, relief?: { plates: { x: number, y: number, w: number, h: number, z: number, part: string }[], heights: ArrayLike<number> } | null }} opts
 *   relief: raisePlates() for this mosaic and base (2.5D), or none
 */
export function mosaicLdr(mosaic, plan, { name, baseColour = defaultBaseColour(plan.part), pinColour = plan.pin ? defaultBaseColour(plan.pin) : 0, relief = null }) {
  if (!plan.fits || plan.cols * plan.side !== mosaic.width || plan.rows * plan.side !== mosaic.height) throw new Error(`${plan.key} does not match a ${mosaic.width} × ${mosaic.height} mosaic`);
  const file = `${fileStem(name)}.ldr`;
  const lines = [`0 ${name}`, `0 Name: ${file}`, `0 Author: ${t('brand.name')}`, `0 // ${t('legal.trademark')}`, ''];
  lines.push(...baseLines(plan, baseColour, pinColour), '0 STEP');
  const colours = mosaic.palette.map((c) => ldrawCode(c.code));
  const lift = (i) => (relief ? relief.heights[i] * PLATE : 0);
  /** Raise plates by the 16 × 16 block of their top-left cell, lower layers first. */
  const platesIn = new Map();
  for (const p of relief?.plates ?? []) {
    const key = `${Math.floor(p.x / BLOCK)},${Math.floor(p.y / BLOCK)}`;
    if (!platesIn.has(key)) platesIn.set(key, []);
    platesIn.get(key).push(p);
  }
  const raise = ldrawCode(RAISE_COLOUR);
  for (let by = 0; by < mosaic.height; by += BLOCK) {
    for (let bx = 0; bx < mosaic.width; bx += BLOCK) {
      const plates = (platesIn.get(`${bx / BLOCK},${by / BLOCK}`) ?? []).sort((a, b) => a.z - b.z);
      if (plates.length) {
        for (const p of plates) {
          const pos = [(p.x + p.w / 2) * STUD, -PLATE * (p.z + 1), -(p.y + p.h / 2) * STUD];
          lines.push(line(raise, pos, p.w >= p.h ? IDENTITY : QUARTER, p.part));
        }
        lines.push('0 STEP');
      }
      for (let r = by; r < Math.min(by + BLOCK, mosaic.height); r++) {
        for (let c = bx; c < Math.min(bx + BLOCK, mosaic.width); c++) {
          const i = r * mosaic.width + c;
          lines.push(line(colours[mosaic.cells[i]], [(c + 0.5) * STUD, SURFACE_Y - lift(i), -(r + 0.5) * STUD], IDENTITY, mosaic.partId));
        }
      }
      lines.push('0 STEP');
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Rebrickable parts-list CSV (Part, Color, Quantity; Rebrickable part numbers
 * and colour ids), in the order of the list.
 * @param {import('../mosaic/base.mjs').PartRow[]} rows  partsList()
 */
export function mosaicPartsCsv(rows) {
  return `Part,Color,Quantity\n${rows.map((r) => `${r.part},${r.colour},${r.quantity}`).join('\n')}\n`;
}
