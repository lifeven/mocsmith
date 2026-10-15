import { canDelete, canRecolour, deletePart, recolourPart } from '../../core/edit.mjs';
import { PALETTE } from '../../core/palette.mjs';
import { colourCss, colourName, kindName, shownKind } from '../words.mjs';
import { t } from '../../i18n/index.mjs';
import { el, esc } from './texts.mjs';

/**
 * The toolbar of 「编辑零件」: it takes the place of the settings toolbar while
 * editing. Each tool has a panel in the drawer's edit group, and decides what
 * a tap on a part of the model does:
 * - 选择: the part's card (move, turn, recolour, delete; ui/result/palette.mjs,
 *   move.mjs); before a part is picked, a short hint.
 * - 加零件: the part box (ui/add-part.mjs); turning the tool on starts placing.
 * - 上色: every tapped part takes the colour picked on the board, if LEGO made
 *   that part in it.
 * - 移动: a tapped part is picked up (move.mjs) and put down with the next tap.
 * - 删除: a tapped part is removed, if nothing sits on it.
 * Each change is one undo step; undo / redo on the bar step through them (undo.mjs).
 *
 * A tap on a tool turns it on and shows its panel; another tap on the tool
 * that is on puts the panel away and leaves the tool on, so the model gets
 * the whole width and the panel comes back with one tap.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupEditTools(page) {
  const { state } = page;
  const bar = el('edit-tools');
  state.tool = 'select';
  /** The colour 上色 paints with (a PALETTE value, 1-based). */
  let paintColour = 1;

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tool]');
    if (!b) return;
    const tool = b.dataset.tool;
    if (tool === state.tool && page.drawerGroup() === 'edit') {
      page.closeDrawer();
      return;
    }
    setTool(tool);
    page.openDrawer('edit');
  });
  el('paint-colours').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-color]');
    if (!b) return;
    paintColour = Number(b.dataset.color);
    renderPaint();
  });

  /** Turn one tool on: its panel in the drawer, what a tap on the model does. */
  function setTool(tool) {
    const was = state.tool;
    const picked = state.picking?.partId ?? -1;
    state.tool = tool;
    if (was === 'add' && tool !== 'add') page.adder.stop();
    if (tool !== 'select' && state.picking) page.closePalette();
    if (tool !== was && page.mover.active) page.mover.cancel();
    say('');
    syncTools();
    if (tool === 'add') {
      page.adder.render(); // the box is on screen now: draw its pictures the first time
      if (!page.adder.placing) page.adder.start();
    }
    // 移动 with a part already picked picks that part up, as the card's 「移动」 does.
    if (tool === 'move' && was !== 'move' && picked >= 0) tapPart(picked);
  }

  function syncTools() {
    bar.hidden = !state.editing;
    for (const b of bar.querySelectorAll('button[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === state.tool));
    for (const p of el('drawer').querySelectorAll('[data-tool-panel]')) p.hidden = p.dataset.toolPanel !== state.tool;
    // 选择 with nothing picked shows the hint; with a part picked, its card.
    el('select-empty').hidden = Boolean(state.picking && state.picking.partId >= 0);
    page.syncFloat?.();
  }

  /** The line under the panel: what the last tap did, or why it did nothing. */
  function say(text) {
    el('tool-status').textContent = text;
    el('tool-status').hidden = !text;
  }

  /**
   * A tap on part `id` of the model with 上色, 移动 or 删除 on.
   * @returns {boolean} true when the tool took the tap (选择 and 加零件 leave it to edit.mjs)
   */
  function tapPart(id) {
    const { model } = state;
    const part = model.result.parts[id];
    const kind = kindName(shownKind(part));
    if (state.tool === 'paint') {
      const colour = colourName(paintColour);
      if (part.color === paintColour) say(t('result.paint.same', { colour }));
      else if (!canRecolour(model, id, paintColour)) say(t('result.paint.notMade', { kind, colour }));
      else {
        page.applyEdit(recolourPart(model, id, paintColour), { what: 'recolour', part, to: paintColour });
        say(t('result.paint.done', { kind, colour }));
      }
      return true;
    }
    if (state.tool === 'move' || state.tool === 'delete') {
      const { ok, onTop } = canDelete(model, id);
      if (!ok) say(t('result.edit.covered', { n: onTop.length }));
      else if (state.tool === 'move') {
        say('');
        page.mover.start(id);
      } else {
        page.applyEdit(deletePart(model, id), { what: 'delete', part });
        say(t('result.delete.done', { kind }));
      }
      return true;
    }
    return false;
  }

  /** The 上色 board: every colour, the picked one outlined, its name under the board. */
  function renderPaint() {
    el('paint-colours').innerHTML = PALETTE.map((_, i) => {
      const value = i + 1;
      const name = esc(colourName(value));
      return `<button type="button" data-color="${value}" aria-pressed="${value === paintColour}" aria-label="${name}" title="${name}" style="background:${colourCss(value)}"></button>`;
    }).join('');
    el('paint-current').textContent = colourName(paintColour);
  }
  renderPaint();
  document.addEventListener('localechange', () => {
    renderPaint();
    say('');
  });

  Object.assign(page, { setTool, syncTools, tapPart });
}
