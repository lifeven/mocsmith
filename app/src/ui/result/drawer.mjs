import { t } from '../../i18n/index.mjs';
import { el } from './texts.mjs';

/**
 * The toolbar under the model and the drawer it opens. The settings are grouped
 * by what they change (尺寸 / 颜色 / 零件 / 结构 / 导出); one group shows at a
 * time, on the right on wide screens and under the model on phones. The tools
 * carry only their names (the name card shows the counts); 结构 gets a red dot
 * while parts are not joined.
 * 「编辑零件」 puts its own tools in place of these (edit-tools.mjs) and opens
 * the edit group; build mode hides both.
 *
 * Closes with ×, Esc, a second tap on the same tool, or a tap on empty space
 * in the model view (ui/result/edit.mjs).
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupDrawer(page) {
  const { state } = page;
  const tools = el('tools');
  let open = '';

  function openDrawer(group) {
    if (open === group) return;
    // The card lives in the colour group, or in the edit group while editing parts.
    if (state.picking && group !== (state.editing ? 'edit' : 'colour')) page.closePalette();
    open = group;
    syncDrawer();
  }

  function closeDrawer({ focusTool = false } = {}) {
    const was = open;
    if (!was) return;
    // While editing, a picked part stays picked with the panel away (its bar floats beside it, part-float.mjs).
    if (state.picking && !state.editing) page.closePalette();
    open = '';
    syncDrawer();
    if (focusTool) tools.querySelector(`button[data-group="${was}"]`)?.focus();
  }

  function syncDrawer() {
    el('drawer').hidden = !open;
    el('result').classList.toggle('drawer-open', Boolean(open));
    for (const g of el('drawer').querySelectorAll('.group[data-group]')) g.hidden = g.dataset.group !== open;
    for (const b of tools.querySelectorAll('button[data-group]')) b.setAttribute('aria-expanded', String(b.dataset.group === open));
    if (open) el('drawer-title').textContent = t(open === 'edit' ? 'result.mode.editTitle' : `result.group.${open}`);
  }

  /** The red dot on 结构 while parts are not joined (its label says so to screen readers too). */
  function renderTools() {
    const loose = state.model?.stats.detachedParts ?? 0;
    const tool = tools.querySelector('[data-group="structure"]');
    tool.classList.toggle('warn', loose > 0);
    tool.setAttribute('aria-label', loose ? `${t('result.group.structure')}: ${t('result.issueShort', { n: loose })}` : t('result.group.structure'));
  }

  tools.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-group]');
    if (!b) return;
    if (open === b.dataset.group) closeDrawer();
    else openDrawer(b.dataset.group);
  });
  el('drawer-close').addEventListener('click', () => closeDrawer({ focusTool: true }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open || el('result').hidden || e.defaultPrevented) return;
    // Esc first closes what sits inside the drawer or over the page: the colour palette, a dialog, a part being placed.
    if (state.picking || document.querySelector('dialog[open]') || page.mover?.active || page.adder?.placing) return;
    closeDrawer({ focusTool: el('drawer').contains(document.activeElement) });
  });

  Object.assign(page, { openDrawer, closeDrawer, syncDrawer, renderTools, drawerGroup: () => open });
}
