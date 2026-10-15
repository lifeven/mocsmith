import { inventoryOf, loadSetIndex, loadSetParts, searchSets } from '../io/set-library.mjs';
import { t } from '../i18n/index.mjs';

/**
 * "Add a set" for both 「只用我有的…」 blocks (3D result page, mosaic page): a
 * search box over every set (io/set-library.mjs), results with set numbers
 * and names, and added sets with − copies + and ×. The page owns
 * the Map of added sets and decides what an entry holds and how it becomes a
 * stock; the picker only adds, counts and removes entries and draws them.
 *
 * Entry: { name, year, copies,...whatever `fromInventory` returns }.
 */

/** Search results shown at once. */
export const RESULTS = 8;
/** Most copies of one set. */
export const MAX_COPIES = 99;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** '10698-1' → '10698'; other editions keep their suffix ('10698-2'). */
export const setNumber = (id) => id.replace(/-1$/, '');

/** A local box symbol identifies a set without requesting a product photo. */
export const setMark = () =>
  '<span class="own-pic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"/></svg></span>';

/**
 * @param {{
 *   root: HTMLElement,
 *   ids: { search: string, results: string, status: string, added: string },
 *   sets: () => Map<string, { name: string, year: number|string, copies: number, ticked?: boolean }>,
 *   fromInventory: (rows: import('../io/set-library.mjs').InventoryRow[], id: string) => object,
 *   rowLine: (id: string, entry: any) => string,
 *   onChange: () => void,
 * }} options sets: the page's Map (a getter: the page may replace it); rowLine: the small line under a set's name;
 *   onChange: a set was added, counted or removed (the page rebuilds and calls render)
 */
export function createSetPicker({ root, ids, sets, fromInventory, rowLine, onChange }) {
  const el = (id) => document.getElementById(id);
  const search = /** @type {HTMLInputElement} */ (el(ids.search));
  const results = el(ids.results);
  const status = el(ids.status);
  const added = el(ids.added);
  /** Results on show, for Enter. */
  let shown = [];
  /** "Downloading…", "nothing found" or a failure, under the box. */
  let note = '';
  let asked = 0;

  function renderResults() {
    results.innerHTML = shown
      .map(
        (s) => `<li><button type="button" class="own-hit" data-add="${esc(s[0])}">${setMark()}<span>${esc(setNumber(s[0]))} ${esc(s[1])}<small>${esc(t('sets.hit', { year: s[2], usable: s[3] }))}</small></span></button></li>`,
      )
      .join('');
    results.hidden = !shown.length;
    status.hidden = !note;
    status.textContent = note;
  }

  function render() {
    search.placeholder = t('sets.placeholder');
    // A set ticked in a list of its own (the mosaic page's LEGO Art list) shows there, not again here,
    // unless more boxes of it were added from the search.
    const rows = [...sets()].filter(([, s]) => !(s.ticked && s.copies <= 1));
    added.innerHTML = rows
      .map(([id, s]) => {
        const label = `${setNumber(id)} ${s.name}`;
        return `<li class="own-row set" data-row="${esc(id)}">
          ${setMark()}
          <span class="own-name">${esc(label)}<small>${esc(rowLine(id, s))}</small></span>
          <span class="own-copies">
            <button type="button" class="icon-button" data-less="${esc(id)}" aria-label="${esc(t('sets.less', { name: label }))}"${s.copies <= 1 ? ' disabled' : ''}>−</button>
            <span aria-live="polite">${esc(t('sets.copies', { n: s.copies }))}</span>
            <button type="button" class="icon-button" data-more="${esc(id)}" aria-label="${esc(t('sets.more', { name: label }))}"${s.copies >= MAX_COPIES ? ' disabled' : ''}>+</button>
          </span>
          <button type="button" class="icon-button" data-drop="${esc(id)}" aria-label="${esc(t('sets.drop', { name: label }))}">×</button>
        </li>`;
      })
      .join('');
    added.hidden = !rows.length;
    renderResults();
  }

  /** Look up what was typed; the set list is fetched on the first search. */
  async function lookUp() {
    const query = search.value;
    const mine = ++asked;
    if (!query.trim()) {
      shown = [];
      note = '';
      renderResults();
      return;
    }
    const slow = setTimeout(() => {
      if (mine !== asked) return;
      note = t('sets.loadingList');
      renderResults();
    }, 150);
    let index;
    try {
      index = await loadSetIndex();
    } catch (err) {
      if (mine === asked) {
        shown = [];
        note = t('sets.listFailed', { why: err.message });
        renderResults();
      }
      return;
    } finally {
      clearTimeout(slow);
    }
    if (mine !== asked) return;
    shown = searchSets(index, query, RESULTS);
    note = shown.length ? '' : t('sets.noHit');
    renderResults();
  }

  /** Add one copy of a set (or one more, if it is there already). */
  async function add(id) {
    const have = sets().get(id);
    if (have) {
      have.copies = Math.min(MAX_COPIES, have.copies + 1);
    } else {
      const row = shown.find((s) => s[0] === id);
      note = t('sets.loadingParts');
      renderResults();
      let data;
      try {
        data = await loadSetParts(id);
      } catch (err) {
        note = t('sets.partsFailed', { why: err.message });
        renderResults();
        return;
      }
      sets().set(id, { name: row?.[1] ?? id, year: row?.[2] ?? '', copies: 1, ...fromInventory(inventoryOf(data, id), id) });
    }
    search.value = '';
    shown = [];
    note = '';
    onChange();
    added.querySelector(`[data-row="${CSS.escape(id)}"] [data-more]`)?.focus();
  }

  search.addEventListener('input', lookUp);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && shown.length) {
      e.preventDefault();
      add(shown[0][0]);
    } else if (e.key === 'Escape' && search.value) {
      e.preventDefault();
      search.value = '';
      lookUp();
    }
  });
  results.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-add]');
    if (b) add(b.dataset.add);
  });
  added.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.less ?? b.dataset.more ?? b.dataset.drop;
    const s = sets().get(id);
    if (!s) return;
    if (b.dataset.drop) sets().delete(id);
    else s.copies = Math.max(1, Math.min(MAX_COPIES, s.copies + (b.dataset.more ? 1 : -1)));
    const which = b.dataset.drop ? null : b.dataset.more ? 'more' : 'less';
    onChange();
    const row = added.querySelector(`[data-row="${CSS.escape(id)}"]`);
    const target = (which && row?.querySelector(`[data-${which}]:not(:disabled)`)) || row?.querySelector('button:not(:disabled)') || search;
    target.focus();
  });

  return { render };
}
