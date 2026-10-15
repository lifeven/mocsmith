import { stepDisplay } from '../../steps/player.mjs';
import { planBuild } from '../../steps/plan.mjs';
import { marksOf } from '../marks.mjs';
import { t } from '../../i18n/index.mjs';
import { el } from './texts.mjs';

/**
 * The 3D view: the three mode buttons (build, compare, edit), and drawing the
 * bricks in the current display state (step, marks, spotlight, selection).
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupView(page) {
  const { state, stage, bricks, player } = page;

  // The three buttons work like one choice that can also be none: build, compare or edit, never two
  // at once. Pressing the one that is on goes back to the plain model.
  el('result').querySelector('.modes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    const want = b.dataset.mode;
    const on = want === 'compare' ? state.compare : want === 'edit' ? state.editing : state.mode === 'layers';
    if (want !== 'layers' && state.mode === 'layers') setMode('orbit');
    if (want !== 'compare' && state.compare) setCompare(false);
    if (want !== 'edit' && state.editing) page.setEditing(false);
    if (want === 'compare') setCompare(!on);
    else if (want === 'edit') page.setEditing(!on);
    else setMode(on ? 'orbit' : 'layers');
  });
  // Turning the model ends the 「在哪」 spotlight.
  stage.controls.addEventListener('start', () => {
    if (!state.spotlight) return;
    state.spotlight = false;
    redraw();
  });
  // On a tall screen the compare halves start below the buttons and banner.
  stage.topInset = () => {
    const top = stage.canvas.getBoundingClientRect().top;
    const covers = [el('result').querySelector('.modes'), el('issue-banner')].filter((n) => !n.hidden);
    return Math.max(0, ...covers.map((n) => n.getBoundingClientRect().bottom - top + 6));
  };

  // When the three buttons don't fit on one line with their full labels, they
  // take short ones (build mode keeps them in one row, so a long label would
  // push a button off screen). The full text stays the accessible name.
  const modes = el('result').querySelector('.modes');
  new ResizeObserver(() => syncModeButtons()).observe(modes.parentElement);
  function label(button, key, short) {
    const full = t(key);
    const text = short ? t(`${key}Short`) : full;
    if (button.textContent !== text) button.textContent = text;
    if (text === full) button.removeAttribute('aria-label');
    else button.setAttribute('aria-label', full);
  }
  function fitsOnOneLine() {
    const shown = [...modes.children].map((b) => b.getBoundingClientRect().width).filter((w) => w > 0);
    const gap = parseFloat(getComputedStyle(modes).columnGap) || 0;
    const width = shown.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, shown.length - 1);
    return width <= modes.parentElement.clientWidth + 0.5;
  }

  /** Build and compare buttons say what pressing them will do. */
  function syncModeButtons() {
    const keys = [
      [el('mode-build'), state.mode === 'layers' ? 'result.build.exit' : 'result.build.enter'],
      [el('mode-compare'), state.compare ? 'result.compare.exit' : 'result.compare.enter'],
      [el('mode-edit'), state.editing ? 'result.edit.exit' : 'result.edit.enter'],
    ];
    for (const [b, key] of keys) label(b, key, false);
    if (!fitsOnOneLine()) for (const [b, key] of keys) label(b, key, true);
  }

  /**
   * The model can always be turned. Build mode shows one step at a time,
   * starting from step 1; 'orbit' is the whole model. Compare (setCompare)
   * is separate and works in both.
   */
  function setMode(mode) {
    const entering = mode !== state.mode;
    state.mode = mode;
    el('mode-build').setAttribute('aria-pressed', String(mode === 'layers'));
    syncModeButtons();
    el('layer-bar').hidden = mode !== 'layers';
    el('book-quick').hidden = mode !== 'layers';
    el('result').classList.toggle('building', mode === 'layers');
    if (mode === 'layers' && entering && state.model) {
      page.resetStepCamera?.();
      player.setPlan(planBuild(state.model));
      page.syncSlider();
      player.goTo(0);
    }
    redraw();
  }

  /** Source model and bricks side by side (left / right, or top / bottom on a tall screen). */
  function setCompare(on) {
    state.compare = on;
    state.spotlight = false; // "在哪" greying is for one look at the bricks; start the comparison clean
    el('mode-compare').setAttribute('aria-pressed', String(on));
    syncModeButtons();
    el('result').classList.toggle('comparing', on);
    stage.setCompare(on);
    redraw();
  }

  function redraw() {
    const { model } = state;
    if (!model) return;
    const stepMode = state.mode === 'layers';
    const view = player.view();
    let step = stepMode ? stepDisplay(view) : {};
    // One kind of part picked in the step's list: only those stay bright and outlined.
    const focus = stepMode && state.stepFocus?.step === view.index ? state.stepFocus.ids : null;
    if (focus) {
      const { hidden, faded, outlined } = step;
      step = { hidden, faded: (id) => faded(id) || (outlined(id) && !focus.has(id)), outlined: (id) => focus.has(id) };
    }
    // The part being moved is hidden; its preview follows the pointer instead.
    const moving = page.mover?.id ?? -1;
    const hidden = moving < 0 ? step.hidden : (id) => id === moving || Boolean(step.hidden?.(id));
    bricks.refresh({
      ...step,
      ...(hidden && { hidden }),
      // Thumbnails (?shot) show the model as it would be built, without marks.
      mark: marksOf(model, {
        detached: !document.body.classList.contains('shot'),
        hanging: el('show-hanging').checked,
        recoloured: el('show-recoloured').checked,
      }),
      muted: state.spotlight,
      selected: state.picking?.partId ?? -1,
      turn: stepMode ? (page.stepTurn?.(view) ?? null) : null,
    });
    if (stepMode && view.step) {
      page.drawPlanIcons?.();
      page.renderStep(view.index, view.step);
      page.frameStep?.(view.index);
    }
    page.renderBanner();
  }

  Object.assign(page, { syncModeButtons, setMode, setCompare, redraw });
}
