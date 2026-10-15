import { cm, colourCss, colourName, sizeShort } from '../words.mjs';
import { cellValue } from '../../core/palette.mjs';
import { locale, t } from '../../i18n/index.mjs';
import { el, esc, importNote, labelOf } from './texts.mjs';
import { detailsHtml } from './details.mjs';

/**
 * The side panel: title, summary line, parts by colour (each a button that
 * opens the palette), the notes under it, and the detailed numbers.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupPanel(page) {
  const { state } = page;

  // 「详细数字」: a small card under the name, opened from the ⓘ; closes with ×, Esc or a click outside.
  const pop = el('details-pop');
  const toggle = el('details-toggle');
  function setDetails(open, { focus = false } = {}) {
    pop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (focus) toggle.focus();
  }
  toggle.addEventListener('click', () => setDetails(pop.hidden));
  el('details-close').addEventListener('click', () => setDetails(false, { focus: true }));
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !toggle.contains(e.target)) setDetails(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || pop.hidden) return;
    e.preventDefault(); // handled: the drawer stays open
    setDetails(false, { focus: true });
  });

  function renderPanel() {
    const { model, info, source } = state;
    const { result } = model;
    const imported = Boolean(source.imported);
    const label = labelOf(source);
    el('model-title').textContent = label;
    if (!el('result').hidden) document.title = t('result.docTitle', { name: label, brand: t('brand.name') });

    const byColour = new Map();
    for (const p of result.parts) byColour.set(p.color, (byColour.get(p.color) ?? 0) + 1);
    const colours = [...byColour].sort((a, b) => b[1] - a[1]);
    const total = result.parts.length;
    // Under the name: the counts as tags, the number in bold ("210 块 · 3 种颜色 · 19 × 3 × 10 厘米").
    const bold = (text, n) => esc(text).replace(String(n), `<b>${n}</b>`);
    el('summary').innerHTML = [
      bold(t('result.count', { n: total }), total),
      bold(t('result.colours', { n: colours.length }), colours.length),
      `${esc(sizeShort(model.grid, result.parts))}<span class="visually-hidden">${esc(t('size.model.axes'))}</span>`,
    ].map((s) => `<span class="stat">${s}</span>`).join('');
    el('colour-total').textContent = t('result.colourTotal', { colours: t('result.colours', { n: colours.length }), parts: t('result.count', { n: total }) });
    // The colour bar: one segment per colour, as wide as its share of the parts.
    el('parts-bar').innerHTML = colours.map(([c, n]) => `<i style="flex-grow:${n};background:${colourCss(c)}"></i>`).join('');
    const share = (n) => (n * 100 < total ? '<1%' : `${Math.round((n * 100) / total)}%`);
    el('parts-list').innerHTML = colours
      .map(([c, n]) => {
        const inner = `<span class="swatch" style="background:${colourCss(c)}"></span>${colourName(c)}<span class="count">${t('result.count', { n })}</span><span class="share" aria-hidden="true">${share(n)}</span>`;
        // An imported model is shown as it is, so its colours are a plain list.
        return imported
          ? `<li class="colour-row">${inner}</li>`
          : `<li><button type="button" class="colour-row" data-color="${c}" aria-expanded="false" aria-label="${esc(t('result.colourRow.aria', { colour: colourName(c), n }))}">${inner}</button></li>`;
      })
      .join('');
    if (state.picking) page.closePalette();
    const dropped = model.painted?.cellsDropped;
    el('paint-note').hidden = !dropped;
    if (dropped) el('paint-note').textContent = t('result.paintNote', { cm: cm(state.paint.cells.lengthStuds) });
    el('import-note').hidden = !imported;
    if (imported) el('import-note').textContent = importNote(source.imported.skipped);
    const edits = model.edits ?? 0;
    el('edit-note').hidden = !edits || imported;
    if (edits) el('edit-note').textContent = t('result.edit.note', { n: edits });
    // What the colour cap merged: "中蓝 → 沙蓝、亮浅蓝", one entry per colour that went.
    const merged = imported ? [] : (model.merged ?? []);
    el('colour-note').hidden = merged.length === 0;
    if (merged.length) {
      const into = new Map();
      for (const [from, to] of merged) into.set(from, [...new Set([...(into.get(from) ?? []), to])]);
      const name = (code) => colourName(cellValue(code));
      const list = [...into].map(([from, tos]) => `${name(from)} → ${new Intl.ListFormat(locale()).format(tos.map(name))}`);
      el('colour-note').textContent = t('result.colourNote', { n: into.size, list: list.join(t('result.colourNote.sep')) });
    }

    el('details').innerHTML = detailsHtml(model, info, imported);
    page.renderOwnStatus?.();
    page.renderTools?.();
  }

  Object.assign(page, { renderPanel });
}
