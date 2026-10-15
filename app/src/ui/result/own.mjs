import { mergeStocks, scaleStock, stockFromCsv, stockFromRows, stockSize } from '../../core/stock.mjs';
import { cellValue } from '../../core/palette.mjs';
import { exportToBuyCsv, fileStem } from '../../io/ldr.mjs';
import { colourName, cm } from '../words.mjs';
import { download } from '../download.mjs';
import { createSetPicker } from '../set-picker.mjs';
import { locale, t } from '../../i18n/index.mjs';
import { el, esc, labelOf } from './texts.mjs';

/**
 * Everything the visitor has, as one stock: every added set times its
 * copies, plus every imported list. Null when nothing is added.
 * @param {{ sets: Map<string, { copies: number, stock: import('../../core/stock.mjs').Stock }>, files: { stock: import('../../core/stock.mjs').Stock }[] }} own
 */
export const ownStock = (own) => mergeStocks([...[...own.sets.values()].map((s) => scaleStock(s.stock, s.copies)), ...own.files.map((f) => f.stock)]);

/**
 * 「只用我有的零件」 for 3D models: add any LEGO sets (ui/set-picker.mjs: search by number or name, the
 * same set more than once) and/or import Rebrickable parts-list CSVs; all of
 * it is added up. The build then uses only
 * colours in them and prefers their pieces. The line under it says how many
 * pieces come from them and how many to buy, and 「导出」 gets the to-buy list.
 * Changing it builds again.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupOwn(page) {
  const { state } = page;
  /** sets: id → { name, year, image?, copies, stock, used, skipped }; files: imported lists in the order read. */
  state.own ??= { sets: new Map(), files: [] };
  let fileNote = '';

  function apply() {
    state.settings.stock = ownStock(state.own);
    renderOwn();
    page.requestBuild();
  }

  const picker = createSetPicker({
    root: el('own'),
    ids: { search: 'own-search', results: 'own-results', status: 'own-search-status', added: 'own-added' },
    sets: () => state.own.sets,
    fromInventory: (rows) => stockFromRows(rows),
    rowLine: (id, s) =>
      t(s.skipped ? 'result.own.setLineSkipped' : 'result.own.setLine', { year: s.year, used: s.used * s.copies, skipped: s.skipped * s.copies, total: (s.used + s.skipped) * s.copies }),
    onChange: apply,
  });

  function renderOwn() {
    const { sets, files } = state.own;
    picker.render();
    el('own-files').innerHTML = files
      .map(
        (f, i) => `<li class="own-row"><span class="own-name">${esc(f.name)}<small>${esc(t('result.own.read', { used: f.used, skipped: f.skipped }))}</small></span>
        <button type="button" class="icon-button" data-file="${i}" aria-label="${esc(t('sets.drop', { name: f.name }))}">×</button></li>`,
      )
      .join('');
    el('own-files').hidden = !files.length;
    const stock = state.settings.stock;
    const what = [];
    if (sets.size) what.push(t('result.own.nSets', { n: [...sets.values()].reduce((a, s) => a + s.copies, 0) }));
    if (files.length) what.push(t('result.own.nFiles', { n: files.length }));
    el('own-summary').textContent = stock ? t('result.own.chosen', { what: new Intl.ListFormat(locale()).format(what), n: stockSize(stock) }) : t('result.own.none');
    el('own-clear').hidden = !stock;
    el('own-csv-status').hidden = !fileNote;
    el('own-csv-status').textContent = fileNote;
  }

  /** The line under the block and the to-buy download, for the model on show. */
  function renderOwnStatus() {
    const stocked = state.model?.stocked;
    el('own-status').hidden = !stocked;
    el('download-buy').hidden = !stocked?.buy;
    if (!stocked) return;
    const parts = [t('result.own.use', { have: stocked.have, buy: stocked.buy })];
    if (stocked.recoloured.length) {
      const name = (code) => colourName(cellValue(code));
      const list = new Intl.ListFormat(locale()).format(stocked.recoloured.map(([from, to]) => `${name(from)} → ${name(to)}`));
      parts.push(t('result.own.recoloured', { list }));
    }
    el('own-status').textContent = parts.join(' ');
  }

  el('own-files').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-file]');
    if (!b) return;
    state.own.files.splice(Number(b.dataset.file), 1);
    fileNote = '';
    apply();
    el('own-csv').focus();
  });
  const input = /** @type {HTMLInputElement} */ (el('own-csv'));
  input.addEventListener('change', async () => {
    const chosen = [...input.files];
    input.value = '';
    const bad = [];
    for (const file of chosen) {
      try {
        const { stock, used, skipped } = stockFromCsv(await file.text());
        state.own.files.push({ name: file.name, stock, used, skipped });
      } catch (err) {
        bad.push(t(err.message === 'csv-header' ? 'result.own.badHeader' : 'result.own.badFile', { name: file.name }));
      }
    }
    fileNote = bad.join(' ');
    if (bad.length < chosen.length) apply();
    else renderOwn();
  });
  el('own-clear').addEventListener('click', () => {
    state.own = { sets: new Map(), files: [] };
    fileNote = '';
    apply();
    el('own-summary').focus();
  });
  el('download-buy').addEventListener('click', () => {
    const stocked = state.model?.stocked;
    if (!stocked?.buy) return;
    const name = t('result.file.buy', { name: `${labelOf(state.source)} ${cm(state.model.settings.lengthStuds)}` });
    download(`${fileStem(name)}.csv`, exportToBuyCsv(stocked.toBuy), 'text/csv');
  });

  renderOwn();
  Object.assign(page, { renderOwn, renderOwnStatus });
}
