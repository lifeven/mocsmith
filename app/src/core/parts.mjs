/**
 * The part table: every part the instant layer can place, one record each.
 * Everything else about a part is derived from its record here: the shape
 * lists layout and repair try (BRICKS, PLATES), tile and slope swaps, the
 * LDraw / Rebrickable number (`catalog.mjs`), the drawn shape
 * (`render/shapes.mjs`), `.ldr` export and import, and where a part has
 * studs for the editor. A new part of an existing family is one more record.
 *
 * Units: footprints in studs, short side first (slopes: width × length);
 * heights in plates (a brick is 3 plates, a plate or tile 1).
 *
 * Connections (`check.mjs`): two parts are joined when one owns the grid
 * cell directly above a cell of the other. A part owns its whole box, or for
 * a slope only its `cells`: the stud rows at full height, the sloped rows
 * their bottom plate (a slope) or their top plate (an inverted slope), so the
 * empty cells over a sloped face, or under an inverted one, join nothing.
 * `top` says whether the part's top layer carries studs: 'smooth' parts
 * (tiles) hold nothing up, and neither does a slope's sloped face. An
 * inverted slope has studs over its whole top.
 *
 * `ldraw` is the current LDraw file name (export, the colour table's key);
 * `rb` is Rebrickable's number when it differs (parts-list CSV, links,
 * `tools/availability.mjs`).
 *
 * Order matters: within a family, records are listed in the order layout,
 * repair and the slope pass try them (largest first; the plate order is
 * hand-tuned). Changing it changes the bricks every model gets.
 *
 * @typedef {{
 *   ldraw: string,
 *   rb?: string,
 *   kind: 'brick' | 'plate' | 'tile' | 'slope' | 'inverted',
 *   w: number, d: number, h: number,
 *   top: 'studs' | 'smooth',
 *   slope?: SlopeShape,
 *   round?: boolean,
 * }} PartType
 *
 * Slope shapes: `studs` rows at full height at the uphill end, then `slope`
 * rows sloping down; `width` studs across. Each is 3 plates tall. An inverted
 * slope is the same profile upside down: flat studded top, the underside
 * rising from the full-height rows to a thin front.
 * @typedef {{ key: string, ldraw: string, studs: number, slope: number, width: number, inverted?: boolean }} SlopeShape
 */

/** @typedef {{ kind: 'brick' | 'plate', w: number, d: number, h: number }} PartShape */

const box = (kind, h, top) => ([w, d, ldraw]) => ({ ldraw, kind, w, d, h, top });

const slope = ([key, ldraw, studs, slopeRows, width]) => ({
  ldraw,
  kind: 'slope',
  w: width,
  d: studs + slopeRows,
  h: 3,
  top: 'studs',
  slope: { key, ldraw, studs, slope: slopeRows, width },
});

const inverted = ([key, ldraw, rb, studs, slopeRows, width]) => ({
  ldraw,
  rb,
  kind: 'inverted',
  w: width,
  d: studs + slopeRows,
  h: 3,
  top: 'studs',
  slope: { key, ldraw, studs, slope: slopeRows, width, inverted: true },
});

/** @type {PartType[]} */
export const PART_TYPES = [
  ...[
    [2, 8, '3007'], [2, 6, '2456'], [1, 8, '3008'], [2, 4, '3001'], [1, 6, '3009'], [2, 3, '3002'],
    [1, 4, '3010'], [2, 2, '3003'], [1, 3, '3622'], [1, 2, '3004'], [1, 1, '3005'],
  ].map(box('brick', 3, 'studs')),
  ...[
    [2, 16, '4282'], [2, 12, '2445'], [2, 10, '3832'], [1, 12, '60479'], [2, 8, '3034'], [2, 6, '3795'],
    [1, 8, '3460'], [2, 4, '3020'], [1, 6, '3666'], [2, 3, '3021'], [1, 4, '3710'], [2, 2, '3022'],
    [1, 3, '3623'], [1, 2, '3023'], [1, 1, '3024'],
  ].map(box('plate', 1, 'studs')),
  // A plate with nothing on top and one of these footprints becomes a tile (`tiles.mjs`).
  ...[
    [2, 6, '69729'], [2, 4, '87079'], [1, 8, '4162'], [1, 6, '6636'], [2, 2, '3068b'], [1, 4, '2431'],
    [1, 3, '63864'], [1, 2, '3069b'], [1, 1, '3070b'],
  ].map(box('tile', 1, 'smooth')),
  // Largest filled profile first, like legolization's preserve pass.
  ...[
    ['slope_45_2x2', '3039', 1, 1, 2],
    ['slope_33_3x1', '4286', 1, 2, 1],
    ['slope_45_2x1', '3040b', 1, 1, 1],
  ].map(slope),
  // Under overhangs (`slopes.mjs` with `inverted`). LDraw 3660b / 3665b are the
  // current moulds (3660 / 3665 moved there); Rebrickable folds the moulds into 3660 / 3665.
  ...[
    ['inverted_45_2x2', '3660b', '3660', 1, 1, 2],
    ['inverted_33_3x1', '4287b', '4287b', 1, 2, 1],
    ['inverted_45_2x1', '3665b', '3665', 1, 1, 1],
  ].map(inverted),
  // Round parts: the footprint of a 1×1 or 2×2 square part, so they carry
  // `ldraw` when placed; the square part stays the one for that footprint.
  // LDraw file names are the current ones (4073 moved to 6141, 4032 to 4032a/b)
  // and are also Rebrickable's numbers.
  ...[
    ['brick', 1, '3062b'], ['brick', 2, '3941'],
    ['plate', 1, '6141'], ['plate', 2, '4032b'],
    ['tile', 1, '98138'], ['tile', 2, '14769'],
  ].map(([kind, n, ldraw]) => ({ ldraw, kind, w: n, d: n, h: kind === 'brick' ? 3 : 1, top: kind === 'tile' ? 'smooth' : 'studs', round: true })),
];

/** Shape key `<kind>:<short>x<long>` of a footprint, either orientation. */
export function footprintKey(kind, w, d) {
  const [a, b] = w <= d ? [w, d] : [d, w];
  return `${kind}:${a}x${b}`;
}

const BY_ID = new Map(PART_TYPES.map((t) => [t.ldraw, t]));
/** The plain part of each brick / plate / tile footprint; parts with another number (slopes, round parts) carry `ldraw`. */
const BY_FOOTPRINT = new Map(PART_TYPES.filter((t) => !t.slope && !t.round).map((t) => [footprintKey(t.kind, t.w, t.d), t]));

/** The record of an LDraw part number, or undefined. */
export const typeById = (ldraw) => BY_ID.get(ldraw);

/** The record of a placed (or planned) part: by its `ldraw` when it has one, else by kind and footprint. */
export function partType(part) {
  return part.ldraw ? BY_ID.get(part.ldraw) : BY_FOOTPRINT.get(footprintKey(part.kind, part.w, part.d));
}

/** The record of a brick, plate or tile footprint, or undefined when there is no such part. */
export const typeOfFootprint = (kind, w, d) => BY_FOOTPRINT.get(footprintKey(kind, w, d));

/**
 * True when the part's cell at height `cy` has studs on top: the part's top
 * is studded and `cy` is its top layer (a slope owns its top layer only in
 * the stud rows, so this also excludes the sloped face).
 */
export function studsOnTop(part, cy) {
  return partType(part).top === 'studs' && cy === part.y + part.h - 1;
}

/** Height in plates of the bricks, plates and tiles. */
export const KIND_HEIGHT = { brick: 3, plate: 1, tile: 1 };

/** The square parts of a kind, in table order (round parts are not tried by layout). */
const squareOf = (kind) => PART_TYPES.filter((t) => t.kind === kind && !t.round);
const shapesOf = (kind) => squareOf(kind).map(({ kind: k, w, d, h }) => ({ kind: k, w, d, h }));

/** @type {PartShape[]} Brick footprints in the order layout tries them. */
export const BRICKS = shapesOf('brick');

/** @type {PartShape[]} Plate footprints in the order layout tries them. */
export const PLATES = shapesOf('plate');

const TILES = squareOf('tile');

/** @type {PartType[]} The round parts (`round: true`), 1×1 and 2×2 of each kind. */
export const ROUND_PARTS = PART_TYPES.filter((t) => t.round);

/** True when a w × d footprint (either orientation) exists as a tile. */
export function hasTile(w, d) {
  return BY_FOOTPRINT.has(footprintKey('tile', w, d));
}

/** Lengths of the tiles that are `width` studs wide. */
export function tileShapes(width) {
  return TILES.filter((t) => t.w === width).map((t) => t.d);
}

/** @type {SlopeShape[]} The slopes the slope pass places, in the order it tries them. */
export const SLOPES = PART_TYPES.filter((t) => t.kind === 'slope').map((t) => t.slope);

/** @type {SlopeShape[]} The inverted slopes, in the order the inverted pass tries them. */
export const INVERTED_SLOPES = PART_TYPES.filter((t) => t.kind === 'inverted').map((t) => t.slope);

/** Plates per brick height. */
export const PLATES_PER_BRICK = 3;

/** Stud pitch / plate height = 8 mm / 3.2 mm. Used to stretch meshes vertically. */
export const STUD_TO_PLATE = 2.5;

/**
 * Filled cells of a slope placed by its stud-row geometry alone: the stud
 * rows at full height, the sloped rows their bottom plate, or their top plate
 * for an inverted slope (`.ldr` import; the slope pass also lets a slope own
 * a filled middle cell, `slopes.mjs`).
 */
export function slopeCells(p) {
  const keep = partType(p).slope.inverted ? 2 : 0;
  const [dx, dz] = p.dir;
  const along = dx !== 0;
  const length = along ? p.w : p.d;
  const studStart = (dx || dz) > 0 ? 0 : length - p.studs;
  const cells = [];
  for (let dzz = 0; dzz < p.d; dzz++) {
    for (let dxx = 0; dxx < p.w; dxx++) {
      const s = along ? dxx : dzz;
      const isStud = s >= studStart && s < studStart + p.studs;
      for (let dy = 0; dy < 3; dy++) if (isStud || dy === keep) cells.push([p.x + dxx, p.y + dy, p.z + dzz]);
    }
  }
  return cells;
}
