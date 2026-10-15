import { OPTIONAL_PARTS, SIZE_TIERS } from '../../convert/config.mjs';
import { STUD_CM, cm } from '../words.mjs';
import { t } from '../../i18n/index.mjs';
import { el } from './texts.mjs';

/**
 * Size tiers, the size slider and the build switches in the drawer groups. Changing any of
 * them lays the bricks out again (page.requestBuild); the mark switches only
 * redraw.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupSize(page) {
  const { state } = page;

  function renderTiers() {
    el('tiers').innerHTML = SIZE_TIERS.map(
      (tier) =>
        `<button type="button" data-studs="${tier.lengthStuds}" aria-pressed="false">${t(`tier.${tier.key}`)}<small>${t('result.tier.length', { n: Math.round(tier.lengthStuds * STUD_CM) })}</small></button>`,
    ).join('');
  }

  function setSize(studs) {
    state.settings.lengthStuds = studs;
    syncSizeControls();
    page.requestBuild();
  }

  function syncSizeControls() {
    const studs = state.settings.lengthStuds;
    el('size').value = String(studs);
    el('size-label').textContent = t('result.size.label', { studs, cm: cm(studs) });
    for (const b of el('tiers').querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.studs) === studs));
    }
    page.renderTools?.();
  }

  renderTiers();
  el('tiers').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-studs]');
    if (b) setSize(Number(b.dataset.studs));
  });
  el('size').addEventListener('input', () => setSize(Number(el('size').value)));

  // Build switches and marks.
  for (const id of ['repair', 'delight', 'thicken']) {
    el(id).checked = Boolean(state.settings[id]);
    el(id).addEventListener('change', () => {
      state.settings[id] = el(id).checked;
      page.requestBuild();
    });
  }
  // 「用哪些零件」: one checkbox per optional kind of part (`OPTIONAL_PARTS`).
  for (const key of OPTIONAL_PARTS) {
    const box = document.querySelector(`input[data-part="${key}"]`);
    box.checked = state.settings.parts[key];
    box.addEventListener('change', () => {
      state.settings.parts = { ...state.settings.parts, [key]: box.checked };
      page.requestBuild();
    });
  }
  for (const id of ['show-hanging', 'show-recoloured']) el(id).addEventListener('change', () => page.redraw());

  // 「最多用几种颜色」 (convert/colours.mjs): a segmented choice, null = no cap.
  function renderColourCap() {
    const cap = state.settings.maxColours ?? null;
    el('max-colours').innerHTML = COLOUR_CAPS.map((n) => {
      // The track is narrow: numbers alone, the full wording for screen readers.
      const label = n === null ? t('result.tune.colours.all') : String(n);
      const aria = n === null ? '' : ` aria-label="${t('result.tune.colours.n', { n })}"`;
      return `<button type="button" data-cap="${n ?? ''}" aria-pressed="${n === cap}"${aria}>${label}</button>`;
    }).join('');
  }
  renderColourCap();
  el('max-colours').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cap]');
    if (!b || b.getAttribute('aria-pressed') === 'true') return;
    state.settings.maxColours = b.dataset.cap === '' ? null : Number(b.dataset.cap);
    renderColourCap();
    el('max-colours').querySelector(`button[data-cap="${b.dataset.cap}"]`)?.focus();
    page.requestBuild();
  });

  Object.assign(page, { renderTiers, syncSizeControls, renderColourCap });
}

/** Choices for the colour cap, loosest first; null = no cap. */
const COLOUR_CAPS = [null, 12, 10, 8, 6, 4];
