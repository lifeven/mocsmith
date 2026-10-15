import { el } from './texts.mjs';

/**
 * Undo / redo buttons. In 「编辑零件」 they step through part edits (whole
 * models) and always show; otherwise they step through recolours (paints,
 * laid out again) and show only once there is something to undo or redo.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupUndo(page) {
  const { state } = page;

  el('undo').addEventListener('click', () => step('undo'));
  el('redo').addEventListener('click', () => step('redo'));
  // The same pair on the edit toolbar (edit-tools.mjs).
  el('edit-undo').addEventListener('click', () => step('undo'));
  el('edit-redo').addEventListener('click', () => step('redo'));

  function step(direction) {
    if (state.editing) {
      const history = state.editHistory;
      if (!(direction === 'undo' ? history.canUndo : history.canRedo)) return;
      if (state.picking) page.closePalette();
      // The models are kept whole, so this just swaps them.
      page.showModel(history[direction](state.model), state.info);
      syncUndo();
      return;
    }
    const paint = state.paintHistory[direction](state.paint);
    if (paint === undefined) return;
    state.paint = paint;
    syncUndo();
    page.requestBuild();
  }

  function syncUndo() {
    const history = state.editing ? state.editHistory : state.paintHistory;
    el('undo').disabled = !history.canUndo;
    el('redo').disabled = !history.canRedo;
    el('edit-undo').disabled = !state.editHistory.canUndo;
    el('edit-redo').disabled = !state.editHistory.canRedo;
    page.renderHistory?.();
    // Out of 「编辑零件」 the pair only shows once a recolour can be undone or redone.
    el('edit-bar').hidden = !state.editing && !history.canUndo && !history.canRedo;
  }

  Object.assign(page, { syncUndo });
}
