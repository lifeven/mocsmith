import { el } from './texts.mjs';

/** Mac keyboards say ⌘ where others say Ctrl. */
const MAC = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '');
/** The key that turns each edit tool on. */
const TOOL_KEYS = { select: 'V', add: 'A', paint: 'B', move: 'M', delete: 'Del', history: 'H' };

/**
 * Keyboard shortcuts of 「编辑零件」, each also shown as a small label on its
 * tool button: V 选择, A 加零件, B 上色, M 移动, H 记录; Delete or Backspace removes
 * the picked part (with nothing picked it turns 删除 on); R turns the picked
 * part; Esc lets go of it. ⌘Z / Ctrl+Z undoes and ⇧⌘Z / Ctrl+Shift+Z /
 * Ctrl+Y redoes, also outside editing (recolours). While a part is being
 * placed or moved, the arrows, R and Enter belong to it (nudge.mjs) and Esc
 * stops it (add-part.mjs, move.mjs). Keys typed into a field are left alone.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupEditKeys(page) {
  const { state } = page;
  const placing = () => page.mover.active || page.adder.placing;

  // The labels on the buttons, the shortcut in their tooltips and for screen readers.
  const undoKey = MAC ? '⌘Z' : 'Ctrl+Z';
  const redoKey = MAC ? '⇧⌘Z' : 'Ctrl+Y';
  function labelKeys() {
    for (const b of el('edit-tools').querySelectorAll('button[data-tool]')) mark(b, TOOL_KEYS[b.dataset.tool], TOOL_KEYS[b.dataset.tool] === 'Del' ? 'Delete' : TOOL_KEYS[b.dataset.tool]);
    mark(el('edit-undo'), undoKey, MAC ? 'Meta+Z' : 'Control+Z');
    mark(el('edit-redo'), redoKey, MAC ? 'Meta+Shift+Z' : 'Control+Y');
  }
  function mark(button, label, aria) {
    let kbd = button.querySelector('kbd');
    if (!kbd) {
      kbd = document.createElement('kbd');
      kbd.className = 'tool-key';
      kbd.setAttribute('aria-hidden', 'true');
      button.append(kbd);
    }
    kbd.textContent = label;
    button.setAttribute('aria-keyshortcuts', aria);
    // The full name stays the accessible name when a narrow screen shows the short one.
    const name = button.querySelector('.tool-name').textContent;
    button.setAttribute('aria-label', name);
    button.title = `${name} (${label})`;
  }
  labelKeys();
  document.addEventListener('localechange', labelKeys);

  document.addEventListener('keydown', (e) => {
    if (el('result').hidden || e.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    const key = e.key.toLowerCase();
    const mod = MAC ? e.metaKey : e.ctrlKey;

    // Undo / redo: part edits while editing, recolours otherwise (undo.mjs picks the history).
    if (mod && !e.altKey && (key === 'z' || (key === 'y' && !MAC))) {
      const redo = key === 'y' || e.shiftKey;
      const button = state.editing ? el(redo ? 'edit-redo' : 'edit-undo') : el(redo ? 'redo' : 'undo');
      e.preventDefault();
      if (!button.disabled) button.click();
      return;
    }
    if (!state.editing || e.metaKey || e.ctrlKey || e.altKey) return;

    const tool = Object.keys(TOOL_KEYS).find((t) => TOOL_KEYS[t].toLowerCase() === key);
    if (tool && tool !== 'delete') {
      e.preventDefault();
      page.setTool(tool);
      page.openDrawer('edit');
      return;
    }
    const picked = state.picking?.partId ?? -1;
    if (key === 'delete' || key === 'backspace') {
      if (placing()) return;
      e.preventDefault();
      // A picked part goes (if nothing sits on it; the card says so otherwise); with none picked, 删除 turns on.
      if (picked >= 0) {
        if (!el('part-actions').hidden) el('part-delete').click();
      } else {
        page.setTool('delete');
        page.openDrawer('edit');
      }
      return;
    }
    if (key === 'r' && picked >= 0 && !placing()) {
      e.preventDefault();
      if (!el('part-actions').hidden && !el('part-turn').disabled) el('part-turn').click();
      return;
    }
    if (key === 'escape' && picked >= 0 && !placing()) {
      e.preventDefault(); // handled: the panel stays as it is
      page.closePalette();
    }
  });
}
