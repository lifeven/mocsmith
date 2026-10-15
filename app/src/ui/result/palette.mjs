import { PALETTE } from '../../core/palette.mjs';
import { paintColour, paintCells } from '../../core/paint.mjs';
import { cellsOfPart } from '../../core/model.mjs';
import { canDelete, canRecolour, canTurn, recolourPart } from '../../core/edit.mjs';
import { colourCss, colourName, kindName, shownKind } from '../words.mjs';
import { t } from '../../i18n/index.mjs';
import { el, esc, partInfoHtml } from './texts.mjs';

/**
 * Recolour palette. A colour row in the parts list opens it for that whole
 * colour, a tapped brick for just that brick; either becomes a paint that is
 * laid out again (core/paint.mjs). In 「编辑零件」 the palette is the edit card for
 * the tapped part: delete it, or give that one part another colour it was made in.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupPalette(page) {
  const { state } = page;

  el('parts-list').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-color]');
    // Recolouring a whole colour lays the bricks out again, so not while editing parts.
    if (b && !state.editing) openPalette(Number(b.dataset.color));
  });
  el('palette-grid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-color]');
    if (!b) return;
    const { color: from, partId } = state.picking;
    closePalette();
    const to = Number(b.dataset.color);
    if (to === from) return;
    if (state.editing && partId >= 0) {
      // Frozen part list: this one part takes the colour (only colours it was made in are enabled).
      if (!canRecolour(state.model, partId, to)) return;
      page.applyEdit(recolourPart(state.model, partId, to), { what: 'recolour', part: state.model.result.parts[partId], to });
      openPalette(to, partId); // the part stays picked, to turn, move or recolour it again
      return;
    }
    const code = PALETTE[to - 1].code;
    if (partId >= 0) {
      const part = state.model.result.parts[partId];
      setPaint(paintCells(state.paint, cellsOfPart(part), code, state.model.settings.lengthStuds));
    } else {
      setPaint(paintColour(state.paint, state.model.sourceCodes, PALETTE[from - 1].code, code));
    }
  });
  el('palette-close').addEventListener('click', closePalette);
  el('part-info-toggle').addEventListener('click', (e) => {
    const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
    e.currentTarget.setAttribute('aria-expanded', String(open));
    el('part-info').hidden = !open;
  });
  el('palette-pop').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault(); // handled: the drawer stays open
      closePalette();
    }
  });

  function openPalette(color, partId = -1) {
    // The card sits under the colour list, or in the 选择 panel while editing parts.
    page.openDrawer(state.editing ? 'edit' : 'colour');
    el(state.editing ? 'edit-card-slot' : 'colour-card-slot').append(el('palette-pop'));
    state.picking = { color, partId };
    const part = partId >= 0 ? state.model.result.parts[partId] : null;
    const editingPart = Boolean(part && state.editing);
    el('palette-title').textContent = editingPart
      ? t('result.edit.title', { kind: kindName(shownKind(part)), colour: colourName(color) })
      : part
        ? t('result.palette.part', { kind: kindName(shownKind(part)), colour: colourName(color) })
        : t('result.palette.colour', { colour: colourName(color) });
    // 「编辑零件」: move, turn or remove the part if nothing rests on it, else say what is in the way.
    el('part-edit').hidden = !editingPart;
    if (editingPart) {
      const { ok, onTop } = canDelete(state.model, partId);
      el('part-actions').hidden = !ok;
      el('part-turn').disabled = !canTurn(part);
      el('part-turn-why').hidden = true;
      el('part-covered').hidden = ok;
      if (!ok) el('part-covered').textContent = t('result.edit.covered', { n: onTop.length });
    }
    // (?) beside a single part: number, name, size, colour, sets, link.
    el('part-info-toggle').hidden = !part;
    el('part-info-toggle').setAttribute('aria-expanded', 'false');
    el('part-info').hidden = true;
    el('part-info').innerHTML = part ? partInfoHtml(part) : '';
    el('palette-grid').innerHTML = PALETTE.map((_, i) => {
      const value = i + 1;
      // Editing a frozen part list: grey out colours this part was never made in.
      const notMade = editingPart && value !== color && !canRecolour(state.model, partId, value);
      const extra = notMade ? ` disabled title="${esc(t('result.edit.notMade'))}"` : '';
      return `<button type="button" data-color="${value}" aria-current="${value === color}"${extra}><span class="swatch" style="background:${colourCss(value)}"></span>${colourName(value)}</button>`;
    }).join('');
    el('palette-pop').hidden = false;
    page.syncTools(); // the 选择 hint gives way to the card; the bar beside the part reads the card's rules
    for (const b of el('parts-list').querySelectorAll('button[data-color]')) {
      b.setAttribute('aria-expanded', String(!part && Number(b.dataset.color) === color));
    }
    page.redraw(); // highlight the tapped brick
    el('palette-pop').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (editingPart) el(el('part-actions').hidden ? 'palette-close' : 'part-move').focus({ preventScroll: true });
    else el('palette-grid').querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
  }

  function closePalette() {
    const picked = state.picking;
    state.picking = null;
    el('palette-pop').hidden = true;
    page.syncTools();
    for (const b of el('parts-list').querySelectorAll('button[data-color]')) b.setAttribute('aria-expanded', 'false');
    if (picked?.partId >= 0) page.redraw();
    else if (picked) el('parts-list').querySelector(`button[data-color="${picked.color}"]`)?.focus();
  }

  /** New paint from a visitor edit: remember the old one for undo. */
  function setPaint(paint) {
    state.paintHistory.record(state.paint);
    state.paint = paint;
    page.syncUndo();
    page.requestBuild();
  }

  Object.assign(page, { openPalette, closePalette });
}
