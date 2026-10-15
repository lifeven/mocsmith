import { FLAG_DETACHED, FLAG_HANGING } from '../core/check.mjs';
import { partGroups } from '../render/camera.mjs';

/**
 * What the result page marks on the bricks and in which colour. The renderer
 * only draws a colour per part (`render/bricks.mjs` refresh `mark`); deciding
 * that "not joined" is red and "hanging" is orange happens here.
 */

/** Signal colours (sRGB hex). */
export const MARK_COLOURS = {
  detached: 0xe03131,
  hanging: 0xf59f00,
  recoloured: 0x7048e8,
};

/**
 * Per-part signal colour, 0 for none. Not joined to the main body beats
 * hanging, which beats recoloured by repair.
 *
 * @param {{ stats: { flags: Uint8Array } }} model
 * @param {{ detached?: boolean, hanging?: boolean, recoloured?: boolean }} show
 * @returns {(part: { id: number, recoloured?: number }) => number}
 */
export function marksOf(model, { detached = true, hanging = false, recoloured = false } = {}) {
  const { flags } = model.stats;
  return (p) => {
    const flag = flags[p.id];
    if (detached && flag & FLAG_DETACHED) return MARK_COLOURS.detached;
    if (hanging && flag & FLAG_HANGING) return MARK_COLOURS.hanging;
    if (recoloured && p.recoloured) return MARK_COLOURS.recoloured;
    return 0;
  };
}

/**
 * Parts that are not joined to the main body, clustered by touching boxes,
 * each with a world-space box for the camera, its top layer and part ids.
 * @param {import('../convert/build.mjs').BuiltModel} model
 */
export function detachedGroups(model) {
  return partGroups(model.result.parts.filter((p) => model.stats.flags[p.id] & FLAG_DETACHED));
}
