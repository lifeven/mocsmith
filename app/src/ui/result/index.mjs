import { EMPTY_PLAN, planBuild } from '../../steps/plan.mjs';
import { createPlayer } from '../../steps/player.mjs';
import { NO_PAINT } from '../../core/paint.mjs';
import { createResultState } from '../../session/result-state.mjs';
import { detachedGroups } from '../marks.mjs';
import { t } from '../../i18n/index.mjs';
import { el, labelOf } from './texts.mjs';
import { setupSize } from './size.mjs';
import { setupView } from './view.mjs';
import { setupStepCamera } from './step-camera.mjs';
import { setupBuildBar } from './build-bar.mjs';
import { setupBanner } from './banner.mjs';
import { setupPalette } from './palette.mjs';
import { setupEdit } from './edit.mjs';
import { setupMove } from './move.mjs';
import { setupNudge } from './nudge.mjs';
import { setupUndo } from './undo.mjs';
import { setupPanel } from './panel.mjs';
import { setupDownloads } from './downloads.mjs';
import { setupBook } from './book.mjs';
import { setupOwn } from './own.mjs';
import { setupBuildScreen } from './screen.mjs';
import { setupDrawer } from './drawer.mjs';
import { setupEditTools } from './edit-tools.mjs';
import { setupPartFloat } from './part-float.mjs';
import { setupEditKeys } from './edit-keys.mjs';
import { setupEditHistory } from './edit-history.mjs';
import { bindHelp } from '../help.mjs';

export { importNote, partInfoHtml } from './texts.mjs';

/** Show "正在重新搭…" only when a build takes longer than this. */
const BUSY_DELAY_MS = 200;

/**
 * What the result page modules share: the state (session/result-state.mjs),
 * the stage and bricks, the build player, and each module's functions, put
 * on this object by its setup (size.mjs, view.mjs, … ) so the others can
 * call them.
 *
 * @typedef {{ state: ReturnType<typeof createResultState>, stage: import('../../render/stage.mjs').Stage,
 *   bricks: import('../../render/bricks.mjs').BrickView, builder: object, player: ReturnType<typeof createPlayer>,
 *   requestBuild: () => void, showModel: (model: object, info: object) => void, redraw: () => void,
 *   renderPanel: () => void, renderBanner: () => void, renderStep: (i: number, step: object) => void,
 *   renderTiers: () => void, syncSizeControls: () => void, renderColourCap: () => void, renderOwn: () => void, renderOwnStatus: () => void, syncModeButtons: () => void, syncSlider: () => void,
 *   syncUndo: () => void, setMode: (mode: string) => void, setCompare: (on: boolean) => void,
 *   setEditing: (on: boolean) => void, openPalette: (color: number, partId?: number) => void,
 *   closePalette: () => void, applyEdit: (model: object) => void, adder: object,
 *   openDrawer: (group: string) => void, closeDrawer: (o?: { focusTool?: boolean }) => void, syncDrawer: () => void,
 *   renderTools: () => void, drawerGroup: () => string, setTool: (tool: string) => void, syncTools: () => void }} ResultPage
 */

/**
 * Result page: the brick model with view modes, size tiers, parts list,
 * "not connected" banner with a fly-to button, and the toolbar and drawer
 * with the settings grouped by what they change (drawer.mjs).
 *
 *
 * @param {{ stage: import('../../render/stage.mjs').Stage, bricks: import('../../render/bricks.mjs').BrickView,
 *           builder: ReturnType<typeof import('../../runtime/client.mjs').createBuilder>,
 *           settings?: Partial<import('../../convert/build.mjs').BuildSettings> }} deps settings: overrides (URL configuration overrides)
 */
export function createResultPage({ stage, bricks, builder, settings = {} }) {
  /** @type {ResultPage} */
  const page = { state: createResultState(settings), stage, bricks, builder };
  const { state } = page;
  // Build mode steps through the current model's build plan (steps/plan.mjs); the step slider follows it.
  page.player = createPlayer(EMPTY_PLAN, {
    onChange(i) {
      el('layer').value = String(i);
      page.redraw();
    },
  });
  const { player } = page;

  setupSize(page);
  setupView(page);
  setupStepCamera(page);
  setupBuildBar(page);
  setupBanner(page);
  setupPalette(page);
  setupEdit(page);
  setupMove(page);
  setupEditTools(page);
  setupPartFloat(page);
  setupEditHistory(page);
  setupNudge(page);
  setupUndo(page);
  setupPanel(page);
  setupDownloads(page);
  setupBook(page);
  setupOwn(page);
  setupBuildScreen(page);
  setupDrawer(page);
  setupEditKeys(page);
  bindHelp(el('drawer'));
  page.renderTools();

  function requestBuild() {
    if (!state.source) return;
    clearTimeout(state.busyTimer);
    state.busyTimer = setTimeout(() => (el('busy').hidden = false), BUSY_DELAY_MS);
    builder.build({ ...state.settings, paint: state.paint });
  }

  /** A model came back from the pipeline or was read from a file: earlier part edits no longer apply. */
  function onBuilt(model, info) {
    state.editHistory.clear();
    showModel(model, info);
    page.syncUndo();
  }

  /**
   * Show a model: a fresh one from the pipeline, or an edit of the current
   * one (same source and size, so the camera stays where it is).
   */
  function showModel(model, info) {
    clearTimeout(state.busyTimer);
    el('busy').hidden = true;
    page.mover?.cancel(); // a move belongs to the model it was lifted from
    state.model = model;
    state.info = info;
    bricks.setModel(model);

    const frameKey = `${state.source.id}:${model.settings.lengthStuds}`;
    const reframe = frameKey !== state.framedFor;
    state.framedFor = frameKey;
    if (reframe) page.resetStepCamera();
    stage.setGrid(model.grid, { reframe });
    stage.setOriginal(state.source.scene, model.placement);

    // Steps are worked out only in build mode (forward steps take up to ~30 ms on a big model).
    // A new model starts at step 1; a rebuild of the same one (recolour, edit) keeps the step.
    player.setPlan(state.mode === 'layers' ? planBuild(model) : EMPTY_PLAN, { keepIndex: !reframe });
    page.syncSlider();

    state.groups = detachedGroups(model);
    state.groupIndex = -1;
    state.spotlight = false;
    page.redraw();
    page.renderPanel();
  }

  Object.assign(page, { requestBuild, showModel });

  // A new language: redraw every text this page wrote, keeping the model, mode and open palette.
  document.addEventListener('localechange', () => {
    page.renderTiers();
    page.syncSizeControls();
    page.renderColourCap();
    page.renderOwn();
    page.syncModeButtons();
    page.adder.render();
    page.renderTools();
    page.syncDrawer();
    if (!state.source) return;
    if (!state.model) {
      el('model-title').textContent = labelOf(state.source);
      if (!state.failed) el('summary').textContent = t('result.converting');
      return;
    }
    const picking = state.picking;
    const infoOpen = el('part-info-toggle').getAttribute('aria-expanded') === 'true';
    page.redraw();
    page.renderPanel();
    if (picking) page.openPalette(picking.color, picking.partId);
    if (picking && infoOpen) el('part-info-toggle').click();
  });

  return {
    /**
     * Show a new source model.
     * @param {{ id: string, label: string, scene: import('three').Object3D, data: object }} source
     */
    show(source) {
      state.source = source;
      state.model = null;
      state.framedFor = '';
      state.paint = NO_PAINT;
      state.paintHistory.clear();
      page.syncUndo();
      if (state.picking) page.closePalette();
      if (state.editing) page.setEditing(false);
      state.failed = false;
      el('model-title').textContent = labelOf(source);
      el('summary').textContent = t('result.converting');
      el('parts-list').innerHTML = '';
      el('parts-bar').innerHTML = '';
      el('details').innerHTML = '';
      el('issue-banner').hidden = true;
      bricks.dispose();
      stage.setOriginal(null, null);
      page.syncSizeControls();
      page.setMode(state.mode);
      if (state.compare && !source.scene && !source.loading) page.setCompare(false); // nothing to compare with
      el('result').classList.toggle('imported', Boolean(source.imported));
      if (source.imported) {
        // Read from an.ldr file: shown as it is, no pipeline run.
        onBuilt(source.imported.model, { latency: 0, inWorker: false });
        return;
      }
      if (!source.data) return; // still loading the file
      builder.setMesh(source.data);
      requestBuild();
    },
    onBuilt,
    onError(message) {
      clearTimeout(state.busyTimer);
      el('busy').hidden = true;
      state.failed = true;
      el('summary').textContent = t('result.failed', { message });
    },
  };
}
