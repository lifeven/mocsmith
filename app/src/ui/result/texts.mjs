import { SKIP_REASONS } from '../../io/ldr-import.mjs';
import { AVAILABILITY_SOURCE } from '../../core/catalog.mjs';
import { partInfo } from '../words.mjs';
import { t } from '../../i18n/index.mjs';

/** Texts and small DOM helpers shared by the result page modules. */

export const el = (id) => document.getElementById(id);

/** Escape text for innerHTML. */
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** What a source is called, in the current language for built-in samples. */
export const labelOf = (source) => (source.labelKey ? t(source.labelKey) : source.label);

/** One line about an imported model: shown as it is, and what was left out. */
export function importNote(skipped) {
  const lines = SKIP_REASONS.filter((k) => skipped[k] > 0);
  const total = lines.reduce((s, k) => s + skipped[k], 0);
  const note = t('import.note');
  if (!total) return note;
  const list = lines.map((k) => `${t(`skip.${k}`)} ${skipped[k]}`).join(t('list.sep'));
  return t('import.skipped', { note, n: total, list });
}

/** The part info card's rows (a <dl> body) for one placed part. */
export function partInfoHtml(part) {
  const info = partInfo(part);
  const rows = [
    [t('info.number'), esc(info.rbId === info.id ? t('info.numberValue', { id: info.id }) : t('info.numberTwo', { id: info.id, rb: info.rbId }))],
    [t('info.name'), esc(info.name || '—')],
    [t('info.sizeLabel'), esc(info.size)],
    [t('info.colourLabel'), esc(info.colour)],
    [t('info.madeLabel'), esc(info.made)],
    [t('info.more'), `<a href="${esc(info.url)}" target="_blank" rel="noopener">${esc(t('info.link'))}</a>`],
  ];
  return rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')
    + `<dt></dt><dd class="muted">${esc(t('info.source', { date: AVAILABILITY_SOURCE.fetched }))}</dd>`;
}
