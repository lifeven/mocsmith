import * as THREE from 'three';
import { IdBuffer } from '../render/visibility.mjs';
import { turnOver } from '../render/shapes.mjs';
import { EXTRA_VIEWS, framesSphere, pickSide, pickView, stepFraming, stepViews, viewCamera } from '../render/camera.mjs';
import { stepDisplay } from '../steps/player.mjs';

/** A camera that already shows a step's worst new part at least this well may stay, if the best view is not HOLD_SLACK better. */
const HOLD_SEEN = 0.35;
const HOLD_SLACK = 0.2;

/**
 * Where each build step is looked at from , shared
 * by build mode on the result page and the instruction book: what the step
 * shows (earlier parts, the new ones outlined, a sub-assembly upside down on
 * its own), the centre and size of its new parts, and the view that shows
 * them best. Visibility is counted in an ID buffer on the given renderer and
 * cached per step, so it is counted once per plan.
 */
export class StepShots {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    /** @type {IdBuffer | null} */
    this.ids = null;
    this.model = null;
    this.plan = null;
    /** Side scores per step index. */
    this.scores = new Map();
    /** Turn-over matrix per sub-assembly. */
    this.turns = new Map();
  }

  /** The model and plan the next calls are about (caches are cleared when either changes). */
  use(model, plan) {
    if (model === this.model && plan === this.plan) return;
    this.model = model;
    this.plan = plan;
    this.scores = new Map();
    this.turns = new Map();
  }

  /**
   * A sub-assembly is drawn upside down on the ground while it is built
   * (`turnOver` of all its parts, so it does not move while it grows); null otherwise.
   * @param {number} index
   */
  turnAt(index) {
    const sub = this.plan.steps[index]?.sub;
    if (sub === undefined) return null;
    if (!this.turns.has(sub)) {
      const { parts } = this.model.result;
      const ids = this.plan.steps.filter((s) => s.sub === sub).flatMap((s) => s.ids);
      this.turns.set(sub, turnOver(ids.map((id) => parts[id])));
    }
    return this.turns.get(sub);
  }

  /**
   * What step `index` shows and where its new parts are.
   * @param {number} index
   * @returns {{ display: ReturnType<typeof stepDisplay>, fresh: number[], target: import('three').Vector3,
   *   radius: number, turn: import('three').Matrix4 | null, views: ReturnType<typeof stepViews> } | null}
   */
  step(index) {
    const { plan, model } = this;
    const step = plan.steps[index];
    if (!step) return null;
    const { parts } = model.result;
    const display = stepDisplay({ stepOf: plan.stepOf, index, steps: plan.steps });
    const fresh = parts.filter((p) => display.outlined(p.id)).map((p) => p.id);
    if (!fresh.length) return null;
    const { target, radius, tight } = stepFraming(parts, fresh, (id) => !display.hidden(id));
    const turn = this.turnAt(index);
    if (turn) target.applyMatrix4(turn);
    return { display, fresh, target, radius, tight, turn, views: stepViews(Boolean(step.fromBelow)) };
  }

  /**
   * The view for step `index` when the camera is on `side` (null = no side yet):
   * the front side by `pickSide`, then a back or top view borrowed for this
   * step only by `pickView`.
   * @param {number} index
   * @param {'left' | 'right' | null} side
   */
  pick(index, side) {
    const shot = this.step(index);
    if (!shot) return null;
    if (!this.scores.has(index)) this.scores.set(index, {});
    const s = this.scores.get(index);
    const { display, fresh, target, radius, turn, views } = shot;
    const score = (k) => {
      if (s[k]) return;
      this.ids ??= new IdBuffer(this.renderer);
      this.ids.setParts(this.model.result.parts);
      const share = [...this.ids.shares((id) => !display.hidden(id), fresh, viewCamera(target, views[k], radius), turn).values()];
      s[k] = { min: Math.min(...share), mean: share.reduce((a, b) => a + b, 0) / share.length };
    };
    score('left');
    score('right');
    const front = pickSide(s, side);
    // The back and top views are only scored when the front side shows the step badly.
    if (s[front].min < 0.35) EXTRA_VIEWS.forEach(score);
    const view = pickView(s, front);
    return { ...shot, side: front, view, dir: views[view], back: view === 'backLeft' || view === 'backRight' };
  }

  /**
   * Whether a camera already at `position` looking at `look` can stay put for
   * step `index` instead of turning to the view `pick` chose (`shot`): the step
   * draws the model the same way up as step `previous` (no sub-assembly turned
   * over or back), its new parts are framed (`framesSphere`), and its worst-seen
   * new part shows nearly as well from here as from `shot`'s view
   *. `lens.borrowed`: the camera is on a back
   * or top view, which it only keeps while the front shows the step no better.
   *
   * @param {number} index
   * @param {number} previous the step the camera was aimed at
   * @param {import('three').Vector3} position
   * @param {import('three').Vector3} look
   * @param {ReturnType<StepShots['pick']>} shot
   * @param {{ fov: number, aspect: number, ideal: number, top?: number, bottom?: number, borrowed?: boolean }} lens
   */
  holds(index, previous, position, look, shot, lens) {
    if (!shot || this.turnAt(index) !== this.turnAt(previous)) return false;
    if (!framesSphere(position, look, shot.target, shot.tight, lens)) return false;
    const camera = new THREE.PerspectiveCamera(lens.fov, 1, 0.1, 2000);
    camera.position.copy(position);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return this.#seenWell(index, shot, camera, Boolean(lens.borrowed));
  }

  /**
   * Whether step `index` can keep the camera's current direction `dir` (re-aimed
   * at its new parts, so the camera slides and zooms but does not turn) instead
   * of turning to `shot`'s view: same test on the worst-seen new part as `holds`.
   *
   * @param {number} index
   * @param {number} previous
   * @param {import('three').Vector3} dir unit, from the parts towards the camera
   * @param {ReturnType<StepShots['pick']>} shot
   * @param {boolean} [borrowed] the camera is on a back or top view
   */
  keeps(index, previous, dir, shot, borrowed = false) {
    if (!shot || this.turnAt(index) !== this.turnAt(previous)) return false;
    return this.#seenWell(index, shot, viewCamera(shot.target, dir, shot.radius), borrowed);
  }

  /**
   * The step's worst new part shows from `camera` at least HOLD_SEEN and nearly
   * as well as from `shot`'s view; from a borrowed back or top view, no worse.
   */
  #seenWell(index, shot, camera, borrowed) {
    this.ids ??= new IdBuffer(this.renderer);
    this.ids.setParts(this.model.result.parts);
    const seen = Math.min(...this.ids.shares((id) => !shot.display.hidden(id), shot.fresh, camera, shot.turn).values());
    const best = this.scores.get(index)[shot.view].min;
    /** Visible share of the worst-seen new part for the most recent camera query. */
    this.lastSeen = seen;
    if (borrowed && !EXTRA_VIEWS.includes(shot.view)) return seen > best;
    return seen >= HOLD_SEEN ? seen >= best - HOLD_SLACK : seen >= best - 0.05;
  }

  dispose() {
    this.ids?.dispose();
    this.ids = null;
  }
}
