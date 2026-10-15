/**
 * Layer steps: one step per plate layer in which at least one part starts,
 * bottom to top. A brick spans three layers but is placed in the step of its
 * bottom layer, so a part's supports below it are always in earlier steps.
 * A hanging part (nothing below, held by the part above) does come before the
 * part holding it, so such a step leaves it floating for a while
 *. This is the `layers` planner in `plan.mjs`.
 */

/**
 * @param {{ id: number, y: number }[]} parts
 * @returns {{ layer: number, ids: number[] }[]}
 */
export function buildSteps(parts) {
  const byLayer = new Map();
  for (const p of parts) {
    if (!byLayer.has(p.y)) byLayer.set(p.y, []);
    byLayer.get(p.y).push(p.id);
  }
  return [...byLayer.keys()].sort((a, b) => a - b).map((layer) => ({ layer, ids: byLayer.get(layer) }));
}
