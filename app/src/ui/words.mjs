import { PALETTE } from '../core/palette.mjs';
import { availability, ldrawId, partName, rebrickableId } from '../core/catalog.mjs';
import { partType } from '../core/parts.mjs';
import { t } from '../i18n/index.mjs';

/**
 * Words and units shown to people: centimetres,
 * not studs; 砖 / 薄板 / 光面板 / 斜面砖; no voxel or grid talk. The text
 * itself lives in the locale files (`src/i18n/`).
 */

/** One stud pitch and one plate height, in centimetres. */
export const STUD_CM = 0.8;
export const PLATE_CM = 0.32;

/** "约 19 厘米" for a length in studs. */
export const cm = (studs) => t('unit.cm', { n: Math.round(studs * STUD_CM) });

/**
 * Outer size of a built model: "约 19 × 10 × 13 厘米（长 × 宽 × 高）".
 * Pass the parts to measure what is actually filled (a voxel grid can have an
 * empty margin); without them the grid's own size is used.
 */
export function sizeText(grid, parts) {
  return t('size.model', sizeDims(grid, parts));
}

/** The same size without "约" and the axes: "19 × 10 × 13 厘米", for the tag under the model's name. */
export const sizeShort = (grid, parts) => t('size.model.short', sizeDims(grid, parts));

/** Length, width and height in whole centimetres (length is the longer side on the ground). */
function sizeDims(grid, parts) {
  let [sx, sy, sz] = [grid.sx, grid.sy, grid.sz];
  if (parts?.length) {
    const span = (lo, ext) => Math.max(...parts.map((p) => p[lo] + p[ext])) - Math.min(...parts.map((p) => p[lo]));
    [sx, sy, sz] = [span('x', 'w'), span('y', 'h'), span('z', 'd')];
  }
  return {
    a: Math.round(Math.max(sx, sz) * STUD_CM),
    b: Math.round(Math.min(sx, sz) * STUD_CM),
    h: Math.round(sy * PLATE_CM),
  };
}

/** Colour name for a palette value, in the current language. */
export const colourName = (value) => t(`colour.${PALETTE[value - 1].code}`);

/** CSS colour for a palette value. */
export const colourCss = (value) => `#${PALETTE[value - 1].hex.toString(16).padStart(6, '0')}`;

/** Name of a part kind: brick, plate, tile, slope, inverted slope, or a round brick / plate / tile. */
export const kindName = (kind) => t(`kind.${kind}`);

/** The kind a placed part is shown as: its `kind`, or roundBrick / roundPlate / roundTile for round parts. */
export function shownKind(part) {
  return partType(part)?.round ? `round${part.kind[0].toUpperCase()}${part.kind.slice(1)}` : part.kind;
}

/**
 * What the part info card says about one placed part: its LDraw number and
 * Rebrickable number (the same for most parts; inverted slopes 3660b / 3665b
 * are 3660 / 3665 on Rebrickable), English name, size,
 * colour, whether LEGO really made it in that colour, and a Rebrickable link.
 *
 * @returns {{ id: string, rbId: string, name: string, size: string, colour: string, made: string, url: string }}
 */
export function partInfo(part) {
  const id = ldrawId(part);
  const rbId = rebrickableId(part);
  const { code, name: ldrawName } = PALETTE[part.color - 1];
  const [a, b] = part.w <= part.d ? [part.w, part.d] : [part.d, part.w];
  const found = availability(id, code);
  let made = t('info.none');
  if (found?.sets) made = t('info.sets', { n: found.sets, year: found.lastYear });
  else if (found?.element) made = t('info.element');
  return {
    id,
    rbId,
    name: partName(id),
    size: t('info.size', {
      a, b, h: part.h, ca: fmtCm(a * STUD_CM), cb: fmtCm(b * STUD_CM), ch: fmtCm(part.h * PLATE_CM),
    }),
    colour: t('info.colour', { name: colourName(part.color), ldrawName, code }),
    made,
    url: `https://rebrickable.com/parts/${encodeURIComponent(rbId)}/`,
  };
}

/** Centimetres with one decimal, no trailing ".0". */
const fmtCm = (v) => String(Math.round(v * 10) / 10);
