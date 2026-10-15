import { SAMPLES, CATEGORIES, FEATURED, inCategory } from '../../data/samples.mjs';
import { t } from '../../i18n/index.mjs';

/**
 * The sample cards on the start page (FEATURED) and the sample library
 * dialog behind "see all" (every sample by category). A card is the brick
 * thumbnail and the name, nothing else. Redrawn when the language changes.
 */
export function setupSamples() {
  renderSamples();
  setupLibrary();
  document.addEventListener('localechange', renderSamples);
}

function renderSamples() {
  document.getElementById('sample-cards').innerHTML = FEATURED.map(sampleCard).join('');
  document.getElementById('see-all-label').textContent = t('start.more', { n: Object.keys(SAMPLES).length });
  document.getElementById('library-body').innerHTML = CATEGORIES.map(
    (c) => `<h3>${t(`category.${c}`)}</h3><ul class="cards">${inCategory(c).map(sampleCard).join('')}</ul>`,
  ).join('');
}

/** One sample card: the brick thumbnail and the name. */
function sampleCard(key) {
  const name = t(`sample.${key}.label`);
  return `<li><a class="card" href="/models/${key}/">
    <img src="${SAMPLES[key].thumb}" alt="${t('start.thumbAlt', { name })}" loading="lazy" width="320" height="240">
    <span class="card-title">${name}</span></a></li>`;
}

/**
 * The sample library dialog. Native <dialog> + showModal gives Esc, a focus
 * trap and returning focus to the "see all" button; a click on the backdrop
 * lands on the dialog element itself, so that closes it too; picking a sample
 * closes it before the page changes.
 */
function setupLibrary() {
  const dialog = document.getElementById('library');
  document.getElementById('open-library').addEventListener('click', () => dialog.showModal());
  document.getElementById('library-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('a.card')) dialog.close();
  });
  addEventListener('appnavigate', () => dialog.open && dialog.close());
}
