import { StepShots } from '../../book/shots.mjs';
import { EXTRA_VIEWS } from '../../render/camera.mjs';
import { el } from './texts.mjs';

/**
 * Build mode turns the camera to each step: the
 * view comes from `StepShots` (front-right or front-left, whichever shows the
 * worst-seen new part better, kept unless the other is clearly better; back
 * or top borrowed for a step the front shows badly), and the new parts go in
 * the middle of what the buttons above and the step bar below leave free.
 * The camera moves as little as it can: it stays put while it still shows
 * the step's new parts well, else slides over in the same direction, and only
 * turns when that direction does not show them; moves swing around the model
 * (`Stage.moveTo`). A sub-assembly is drawn upside down while it is built
 * (`stepTurn`). Once the visitor turns or zooms the model it stops, until
 * they press 「镜头重新跟着每一步」, enter build mode again or a new model comes.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupStepCamera(page) {
  const { state, stage, player } = page;
  const shots = new StepShots(stage.renderer);
  let framed = -1;
  /** @type {'left' | 'right' | null} */
  let side = null;
  /** The view the camera is on now (`stepViews` key), or null before the first step. */
  let view = null;
  let turned = false;
  let interacting = false;

  // Only a visitor's own drag or zoom counts; the camera's own moves fire 'change' outside start/end.
  stage.controls.addEventListener('start', () => (interacting = true));
  stage.controls.addEventListener('end', () => (interacting = false));
  stage.controls.addEventListener('change', () => {
    if (!interacting || turned) return;
    turned = true;
    el('step-follow').hidden = state.mode !== 'layers';
    el('step-view').hidden = true;
  });
  // The visitor can hand the camera back: turn to the step shown now, and follow again.
  el('step-follow').addEventListener('click', () => {
    resetStepCamera();
    frameStep(player.index);
  });

  /** The plan the shots are about: the player's, for the current model. */
  function usePlan() {
    if (shots.plan !== player.plan || shots.model !== state.model) {
      shots.use(state.model, player.plan);
      framed = -1;
    }
  }

  /**
   * On a sub-assembly step the sub-assembly is drawn upside down on the ground; else null.
   * @param {import('../../steps/player.mjs').PlayerView} view
   */
  function stepTurn(view) {
    if (!state.model || !view.step) return null;
    usePlan();
    return shots.turnAt(view.index);
  }

  /** Follow the steps again from the next one shown (entering build mode, a new model). */
  function resetStepCamera() {
    turned = false;
    el('step-follow').hidden = true;
    el('step-view').hidden = true;
    framed = -1;
    side = null;
    view = null;
  }

  /** How much of the canvas the overlays cover: the buttons and banner on top, the step bar at the bottom. */
  function insets() {
    const canvas = stage.canvas.getBoundingClientRect();
    const bar = el('layer-bar');
    const bottom = bar.hidden ? 0 : Math.max(0, canvas.bottom - bar.getBoundingClientRect().top);
    return { top: stage.topInset?.() ?? 0, bottom, height: canvas.height };
  }

  /** Turn to step `index` of the current plan, unless the visitor has taken the camera. */
  function frameStep(index) {
    if (!state.model || turned || state.compare || state.mode !== 'layers') {
      if (state.compare) el('step-view').hidden = true;
      return;
    }
    usePlan();
    if (index === framed) return;
    const shot = shots.pick(index, side);
    if (!shot) return;
    const { dir: picked, target, radius } = shot;

    // The free part of the canvas is smaller than the canvas: back off to fit it, and aim
    // below the parts by as much as the free part's middle sits above the canvas's middle.
    const { top, bottom, height } = insets();
    const free = Math.max(height * 0.4, height - top - bottom);
    const distance = stage.fitDistance(radius) * (height / free);

    // A camera that still shows this step's new parts well stays where it is; if not, one whose
    // direction still does slides over without turning; only otherwise does it turn.
    const now = stage.aim();
    const borrowed = EXTRA_VIEWS.includes(view);
    const lens = { fov: stage.camera.fov, aspect: stage.camera.aspect, ideal: distance, top: top / height, bottom: bottom / height, borrowed };
    if (framed >= 0 && shots.holds(index, framed, now.position, now.target, shot, lens)) {
      framed = index;
      return;
    }
    let dir = picked;
    const current = now.position.clone().sub(now.target).normalize();
    if (framed >= 0 && shots.keeps(index, framed, current, shot, borrowed)) dir = current;
    else {
      side = shot.side;
      view = shot.view;
    }
    framed = index;
    el('step-view').hidden = view !== 'backLeft' && view !== 'backRight';
    const up = dir.clone().multiplyScalar(-dir.y).setY(1 - dir.y * dir.y).normalize();
    const viewHeight = 2 * distance * Math.tan((stage.camera.fov * Math.PI) / 360);
    const aim = target.clone().addScaledVector(up, (-(bottom - top) / 2 / height) * viewHeight);
    stage.moveTo(aim.clone().addScaledVector(dir, distance), aim, true);
  }

  Object.assign(page, { frameStep, resetStepCamera, stepTurn });
}
