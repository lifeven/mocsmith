import { buildSteps } from './layers.mjs';
import { planForward } from './forward.mjs';

/**
 * Build plans: the order a brick model is built in. Every consumer (build
 * mode on the result page, the build player, `.ldr` export and the PDF)
 * reads the same plan, so a new step-order algorithm is one more entry in
 * PLANNERS and nothing else changes.
 *
 * A plan is a flat list of steps. Planners may add fields to a step for the
 * consumers that know them; supported fields include `chapter`, `sub` (the
 * sub-assembly a step belongs to, its steps listed just before the step that
 * installs it), `fromBelow` and `camera`.
 *
 * @typedef {{ ids: number[], layer?: number, chapter?: number, sub?: number, fromBelow?: boolean }} BuildStep
 * @typedef {{ planner: string, options: object, steps: BuildStep[], stepOf: Int32Array }} BuildPlan
 *   `stepOf[partId]` is the index of the step that places the part
 * @typedef {{ result: { parts: { id: number, y: number }[] } }} PlannableModel
 *   any brick model: built, edited or read from a file
 */

/**
 * Step-order algorithms by name. Each takes a model and options and returns
 * the steps; it must place every part exactly once and give the same steps
 * for the same input (tests/steps-plan.test.mjs runs every entry).
 *
 * @type {Record<string, (model: PlannableModel, options: object) => BuildStep[]>}
 */
export const PLANNERS = {
  layers: (model) => buildSteps(model.result.parts),
  forward: (model, options = {}) => planForward(model, options),
};

export const DEFAULT_PLANNER = 'forward';

/** @type {BuildPlan} A plan with no steps, for a player before the first model. */
export const EMPTY_PLAN = Object.freeze({ planner: 'none', options: {}, steps: [], stepOf: new Int32Array(0) });

/** Plans per model object, by planner and options; a model is never changed in place. */
const cache = new WeakMap();

/**
 * The build plan for a model.
 *
 * @param {PlannableModel} model
 * @param {{ planner?: string } & object} [options]
 * @returns {BuildPlan}
 */
export function planBuild(model, { planner = DEFAULT_PLANNER, ...options } = {}) {
  const plan = PLANNERS[planner];
  if (!plan) throw new Error(`unknown planner ${planner}`);
  const key = JSON.stringify([planner, options]);
  let byKey = cache.get(model);
  if (!byKey) cache.set(model, (byKey = new Map()));
  if (!byKey.has(key)) {
    const steps = plan(model, options);
    const stepOf = new Int32Array(model.result.parts.length).fill(-1);
    steps.forEach((s, i) => {
      for (const id of s.ids) stepOf[id] = i;
    });
    byKey.set(key, { planner, options, steps, stepOf });
  }
  return byKey.get(key);
}

/**
 * The last step that places a part starting at or below `layer`: showing up
 * to it shows everything at those heights, e.g. to bring a group of parts into
 * view with what is around it. −1 when no part starts that low.
 *
 * @param {BuildPlan} plan
 * @param {{ id: number, y: number }[]} parts
 * @param {number} layer
 */
export function lastStepUpTo(plan, parts, layer) {
  let last = -1;
  for (const p of parts) if (p.y <= layer && plan.stepOf[p.id] > last) last = plan.stepOf[p.id];
  return last;
}

/**
 * What one step needs, grouped by colour, kind and footprint (short side
 * first), most numerous first; `ids` are the step's parts in each group.
 *
 * @param {{ kind: string, w: number, d: number, color: number }[]} parts
 * @param {number[]} ids
 * @returns {{ color: number, kind: string, w: number, d: number, count: number, ids: number[] }[]}
 */
export function stepNeeds(parts, ids) {
  const groups = new Map();
  for (const id of ids) {
    const p = parts[id];
    const [w, d] = p.w <= p.d ? [p.w, p.d] : [p.d, p.w];
    const key = `${p.color}/${p.kind}/${w}x${d}/${p.ldraw ?? ''}`;
    const g = groups.get(key) ?? { color: p.color, kind: p.kind, w, d, count: 0, ...(p.ldraw && { ldraw: p.ldraw }), ids: [] };
    g.count++;
    g.ids.push(id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.color - b.color || b.w * b.d - a.w * a.d);
}
