/**
 * Export a built model as an LDraw `.ldr` file (opens in Studio, LeoCAD,
 * LDView) and as a Rebrickable parts-list CSV.
 *
 * LDraw conventions used (checked against the part files 3001, 3010, 3024,
 * 3069b, 3039, 4286, 3040b from library.ldraw.org, 2026-10-08):
 * - 1 stud = 20 LDU, 1 plate = 8 LDU; −Y is up.
 * - A brick, plate or tile has its origin at the centre of its top face (stud
 *   bottoms) and extends downward (+Y); its long side lies along X.
 * - A slope has its origin at the centre of the top of its stud row; it
 *   slopes down toward −Z and its width lies along X. An inverted slope
 *   (3660b, 4287b, 3665b) is placed the same way: origin at the top of its
 *   full-height row, its thin front toward −Z.
 *
 * Our grid (x right, y up, z) maps to LDraw as (20x, −8y, −20z): flipping
 * both y and z is a rotation, so the model is not mirrored.
 */

import { ldrawId, rebrickableId } from '../core/catalog.mjs';
import { PART_TYPES, partType } from '../core/parts.mjs';
import { PALETTE } from '../core/palette.mjs';
import { planBuild } from '../steps/plan.mjs';
import { fileStem } from './file-name.mjs';
import { t } from '../i18n/index.mjs';

const STUD = 20;
const PLATE = 8;

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Long side along world Z instead of X: 90° about Y. */
const QUARTER = [0, 0, 1, 0, 1, 0, -1, 0, 0];

/** Rotation about Y with sin, cos given; maps local +Z to (sin, 0, cos). */
const aboutY = (s, c) => [c, 0, s, 0, 1, 0, -s, 0, c];

/**
 * Position (LDU) and rotation of one part as an LDraw type-1 line's numbers.
 * @returns {{ pos: number[], rot: number[] }}
 */
export function placement(p) {
  if (partType(p).slope) {
    const [dx, dz] = p.dir;
    const along = dx !== 0;
    const length = along ? p.w : p.d;
    const slopeLen = length - p.studs;
    // The stud row sits at the uphill end (render/shapes.mjs slopeShape).
    const start = (dx || dz) > 0 ? 0 : slopeLen;
    const cx = along ? p.x + start + p.studs / 2 : p.x + p.w / 2;
    const cz = along ? p.z + p.d / 2 : p.z + start + p.studs / 2;
    // Downhill in LDraw is (dx, 0, −dz); local downhill is −Z, so local +Z → (−dx, 0, dz).
    return { pos: [cx * STUD, -(p.y + p.h) * PLATE, -cz * STUD], rot: aboutY(-dx, dz) };
  }
  const cx = p.x + p.w / 2;
  const cz = p.z + p.d / 2;
  return { pos: [cx * STUD, -(p.y + p.h) * PLATE, -cz * STUD], rot: p.w >= p.d ? IDENTITY : QUARTER };
}

/** One LDraw type-1 line for a placed part. */
export function partLine(p) {
  const { pos, rot } = placement(p);
  const n = (v) => (Object.is(v, -0) ? 0 : v);
  return `1 ${PALETTE[p.color - 1].code} ${pos.map(n).join(' ')} ${rot.map(n).join(' ')} ${ldrawId(p)}.dat`;
}

/**
 * The model as `.ldr` text: a header, then the parts of each building step
 * followed by `0 STEP`.
 *
 * @param {import('../convert/build.mjs').BuiltModel} model
 * @param {string} name model name for the header
 * @param {import('../steps/plan.mjs').BuildPlan} [plan] the steps to write; the default plan when left out
 */
export function exportLdr(model, name, plan = planBuild(model)) {
  const parts = model.result.parts;
  const file = `${fileStem(name)}.ldr`;
  const lines = [`0 ${name}`, `0 Name: ${file}`, `0 Author: ${t('brand.name')}`, `0 // ${t('legal.trademark')}`, ''];
  for (const step of plan.steps) {
    for (const id of step.ids) lines.push(partLine(parts[id]));
    lines.push('0 STEP');
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Rebrickable parts-list CSV (columns Part, Color, Quantity; Rebrickable's
 * part numbers, `rebrickableId`; colours use the Rebrickable
 * id, `rb` in palette.mjs, which differs from the LDraw code for a few newer
 * colours). Rows sorted by quantity.
 */
export function exportPartsCsv(model) {
  const counts = new Map();
  for (const p of model.result.parts) {
    const key = `${rebrickableId(p)},${PALETTE[p.color - 1].rb}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return `Part,Color,Quantity\n${rows.map(([k, n]) => `${k},${n}`).join('\n')}\n`;
}

/**
 * The pieces still to buy with "only use the parts I have"
 * (`model.stocked.toBuy`, core/stock.mjs shortfall) in the same Rebrickable
 * CSV format as the parts list.
 * @param {[string, number, number][]} toBuy [LDraw part, LDraw colour code, count]
 */
export function exportToBuyCsv(toBuy) {
  const rbPart = (ldraw) => PART_TYPES.find((p) => p.ldraw === ldraw)?.rb ?? ldraw;
  const rbColour = (code) => PALETTE.find((c) => c.code === code)?.rb ?? code;
  return `Part,Color,Quantity\n${toBuy.map(([ldraw, code, n]) => `${rbPart(ldraw)},${rbColour(code)},${n}`).join('\n')}\n`;
}

/** A file name stem without characters file systems reject (io/file-name.mjs, re-exported for the result page). */
export { fileStem };
