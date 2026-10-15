/** Shared conversion defaults consumed by the pipeline and interface. */

/**
 * Size tiers by length in studs: about 13 / 19 / 26 cm.
 * Names are in the locale files (`tier.<key>`).
 */
export const SIZE_TIERS = [
  { key: 'palm', lengthStuds: 16 },
  { key: 'shelf', lengthStuds: 24 },
  { key: 'desk', lengthStuds: 32 },
];

/** Score bonus per extra part a new part sits on in layout; this staggers seams. */
export const BRIDGE_WEIGHT = 3;
/**
 * Penalise equal-footprint vertical stacks to favour staggered seams.
 * This trades a small increase in part count for more overlapping joints.
 */
export const STACK_PENALTY = 6;

/** Upper bound on re-tiles one repair run may make. */
export const MAX_MERGES = 500;

/**
 * Maximum donor cells outside a slope profile that may be refilled with
 * plates. The bound follows legolization's slope replacement rule; see NOTICE.
 */
export const MAX_REMAINDER = 4;

/**
 * The optional kinds of part the visitor can leave out (the 「零件」 drawer → 「用哪些零件」).
 * Bricks and plates are always used: every model is laid out from them.
 * Each key switches the stage that puts that kind of part in (`build.mjs`).
 */
export const OPTIONAL_PARTS = ['tiles', 'slopes', 'inverted', 'round'];

/** Settings for one conversion pipeline run. */
export const DEFAULT_SETTINGS = {
  lengthStuds: 24,
  repair: true,
  // Which optional kinds of part to use; all of them by default.
  parts: Object.fromEntries(OPTIONAL_PARTS.map((k) => [k, true])),
  // Allow slope replacement at two-plate ledges.
  slopeTolerance: true,
  // Take baked light and shadow out of textures (`delight.mjs`); for image-to-3D models, off by default.
  delight: false,
  // Maximum neighbouring-cell colour difference within one paint patch; 0 disables grouping.
  shadeStep: 2,
  // At most this many colours (`colours.mjs`); null = no cap.
  maxColours: null,
  // Grow 1-stud-wide details to 2 studs (`thicken.mjs`); changes the shape, off by default.
  thicken: false,
  // Only use these parts (core/stock.mjs); null = any part LEGO made.
  stock: null,
};

/**
 * Settings with the defaults filled in. `parts` merges key by key, so
 * `{ parts: { inverted: false } }` leaves the other kinds on.
 *
 * @param {object} [settings]
 */
export function withDefaults(settings = {}) {
  return { ...DEFAULT_SETTINGS, ...settings, parts: { ...DEFAULT_SETTINGS.parts, ...settings.parts } };
}
