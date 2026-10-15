import { colourName, kindName, shownKind } from '../words.mjs';
import { t } from '../../i18n/index.mjs';
import { el, esc } from './texts.mjs';

/**
 * 编辑零件 → 记录: every part edit since the bricks were last laid out, oldest
 * first, from the edit history (session/history.mjs `steps`). Each edited
 * model carries the `lastEdit` label it was made with (edit.mjs applyEdit);
 * the first row is the model before any edit. A click on a row brings the
 * model back to just after that step (`jump`): the steps after it stay, shown
 * fainter, for redo or another click.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupEditHistory(page) {
  const { state } = page;
  const list = el('edit-history');

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-step]');
    if (!b) return;
    const to = Number(b.dataset.step);
    const { at } = state.editHistory.steps(state.model);
    if (to === at) return;
    if (state.picking) page.closePalette();
    page.showModel(state.editHistory.jump(state.model, to), state.info);
    page.syncUndo();
    list.querySelector(`button[data-step="${to}"]`)?.focus();
  });

  /** The name of a part in a row: kind and size ("薄板 2 × 4"). */
  const partName = (p) => `${kindName(shownKind(p))} ${Math.min(p.w, p.d)} × ${Math.max(p.w, p.d)}`;

  function rowText(model, i) {
    if (i === 0) return t(state.source?.imported ? 'result.hist.imported' : 'result.hist.base');
    const edit = model.lastEdit;
    if (!edit) return t('result.hist.unknown');
    const part = partName(edit.part);
    const colour = colourName(edit.part.color);
    if (edit.what === 'recolour') return t('result.hist.recolour', { part, from: colour, to: colourName(edit.to) });
    return t(`result.hist.${edit.what}`, { part, colour });
  }

  function renderHistory() {
    if (!state.model) return;
    const { list: steps, at } = state.editHistory.steps(state.model);
    list.innerHTML = steps
      .map((model, i) => {
        const where = i === at ? ' aria-current="step"' : i > at ? ' class="ahead"' : '';
        return `<li><button type="button" data-step="${i}"${where}><span class="hist-n">${i}</span>${esc(rowText(model, i))}</button></li>`;
      })
      .join('');
    el('edit-history-empty').hidden = steps.length > 1;
  }

  document.addEventListener('localechange', renderHistory);
  Object.assign(page, { renderHistory });
}
