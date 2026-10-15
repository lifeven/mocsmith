/**
 * Build player: steps through a build plan. No DOM, no three.js, so the
 * result page, a build animation, the PDF or a sub-assembly viewport can all
 * drive one. Changes are reported through `onChange`;
 * `view` says which parts are shown, earlier and new at the current step.
 *
 * @typedef {{ index: number, count: number, step: import('./plan.mjs').BuildStep | null, steps: import('./plan.mjs').BuildStep[], stepOf: Int32Array }} PlayerView
 *   a part is shown when `stepOf[id] <= index`, earlier when `<`, new when `===`
 */

/**
 * The sub-assemblies that go on at step `i`: those whose steps come right
 * before it (`steps/subs.mjs` puts a block of `sub` steps just before the
 * main step where the finished piece is attached). Empty on a sub step.
 *
 * @param {import('./plan.mjs').BuildStep[]} steps
 * @param {number} i
 * @returns {number[]} sub numbers, in build order
 */
export function attachedAt(steps, i) {
  const subs = [];
  if (!steps[i] || steps[i].sub !== undefined) return subs;
  for (let k = i - 1; k >= 0 && steps[k].sub !== undefined; k--) if (!subs.includes(steps[k].sub)) subs.unshift(steps[k].sub);
  return subs;
}

/**
 * How a step looks, as the renderer's display state (`render/bricks.mjs`
 * refresh): later steps hidden, earlier steps faded, this step outlined.
 * On a sub-assembly step only that sub-assembly is shown (it is built on its
 * own); on the step where it goes on, its parts are outlined with the step's.
 *
 * @param {{ stepOf: Int32Array, index: number, steps?: import('./plan.mjs').BuildStep[] }} view
 * @returns {{ hidden: (id: number) => boolean, faded: (id: number) => boolean, outlined: (id: number) => boolean }}
 */
export function stepDisplay({ stepOf, index, steps = [] }) {
  const sub = steps[index]?.sub;
  if (sub !== undefined) {
    const shown = (id) => stepOf[id] <= index && steps[stepOf[id]].sub === sub;
    return {
      hidden: (id) => !shown(id),
      faded: (id) => shown(id) && stepOf[id] < index,
      outlined: (id) => stepOf[id] === index,
    };
  }
  const attached = new Set(attachedAt(steps, index));
  const isNew = (id) => stepOf[id] === index || (attached.size > 0 && attached.has(steps[stepOf[id]].sub));
  // The last step shows the finished model in its real colours; only its new parts stay outlined.
  const last = steps.length > 0 && index === steps.length - 1;
  return {
    hidden: (id) => stepOf[id] > index,
    faded: (id) => !last && stepOf[id] < index && !isNew(id),
    outlined: isNew,
  };
}

/**
 * @param {import('./plan.mjs').BuildPlan} plan
 * @param {{ onChange?: (index: number) => void, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (t: unknown) => void }} [options]
 *   the timer functions default to setTimeout / clearTimeout (tests pass fakes)
 */
export function createPlayer(plan, { onChange = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = plan;
  let index = 0;
  let timer = null;

  const count = () => current.steps.length;
  const clamp = (i) => Math.max(0, Math.min(count() - 1, i));

  /** Go to step `i` (clamped); returns the step shown. */
  function goTo(i) {
    const next = clamp(Math.round(i));
    if (next !== index) {
      index = next;
      onChange(index);
    }
    return index;
  }

  function stop() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  const player = {
    get index() {
      return index;
    },
    get count() {
      return count();
    },
    get plan() {
      return current;
    },
    get step() {
      return current.steps[index] ?? null;
    },
    get playing() {
      return timer !== null;
    },
    get atStart() {
      return index === 0;
    },
    get atEnd() {
      return index >= count() - 1;
    },
    goTo,
    next: () => goTo(index + 1),
    prev: () => goTo(index - 1),

    /**
     * A new plan (new model, or the same model rebuilt). `keepIndex` keeps
     * the current step, clamped to the new plan; otherwise back to step 1.
     * Stops playing either way. Does not call `onChange`: the caller is
     * already redrawing for the new model.
     */
    setPlan(plan, { keepIndex = false } = {}) {
      stop();
      current = plan;
      index = keepIndex ? clamp(index) : 0;
    },

    /**
     * Step forward every `intervalMs` until the last step (or around again
     * with `loop`). Starting at the last step starts over from step 1.
     */
    play({ intervalMs = 1200, loop = false } = {}) {
      stop();
      if (count() < 2) return;
      if (player.atEnd) goTo(0);
      const tick = () => {
        if (player.atEnd) {
          if (!loop) {
            timer = null;
            return;
          }
          goTo(0);
        } else goTo(index + 1);
        timer = setTimer(tick, intervalMs);
      };
      timer = setTimer(tick, intervalMs);
    },
    pause: stop,

    /** @returns {PlayerView} */
    view() {
      return { index, count: count(), step: player.step, steps: current.steps, stepOf: current.stepOf };
    },
  };
  return player;
}
