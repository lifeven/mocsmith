import { stepNeeds } from '../../steps/plan.mjs';
import { attachedAt } from '../../steps/player.mjs';
import { PALETTE } from '../../core/palette.mjs';
import { partType } from '../../core/parts.mjs';
import { drawIcons } from '../../render/icons.mjs';
import { colourCss, kindName, shownKind } from '../words.mjs';
import { locale, t } from '../../i18n/index.mjs';
import { el, esc } from './texts.mjs';

/**
 * Build mode card: step number, the parts this
 * step needs as pictures with counts, previous / next, notes as tags, the
 * progress slider; ← and → step too. The build player (page.player) is the
 * source of truth; the slider follows it.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupBuildBar(page) {
  const { state, player } = page;

  el('layer').addEventListener('input', () => player.goTo(Number(el('layer').value)));
  el('step-prev').addEventListener('click', () => player.prev());
  el('step-next').addEventListener('click', () => player.next());
  // ← / → step while building, unless a text field, slider or menu has the keys.
  document.addEventListener('keydown', (e) => {
    if (state.mode !== 'layers' || el('layer-bar').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], dialog[open]')) return;
    e.preventDefault();
    if (e.key === 'ArrowLeft') player.prev();
    else player.next();
  });
  // Tapping a kind of part in the list shows only those parts of the step (the rest fade); again to undo.
  el('step-needs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-key]');
    if (!b) return;
    const same = state.stepFocus?.step === player.index && state.stepFocus.key === b.dataset.key;
    state.stepFocus = same ? null : { step: player.index, key: b.dataset.key, ids: new Set(b.dataset.ids.split(',').map(Number)) };
    page.redraw();
  });

  /** A new plan for a new or rebuilt model: the slider's range and position. */
  function syncSlider() {
    const layer = el('layer');
    layer.max = String(player.count - 1);
    layer.value = String(player.index);
  }

  function renderStep(i, step) {
    const n = player.count;
    el('layer-label').textContent = t('result.step', { i: i + 1, total: n, n: step.ids.length });
    el('step-num').textContent = String(i + 1);
    el('step-total').textContent = `/ ${n}`;
    el('step-prev').disabled = i === 0;
    el('step-next').disabled = i === n - 1;
    // Chapter (when the plan has more than one), sub-assembly being built or
    // going on, and the parts-go-on-from-below note, as tags under the card.
    const { steps } = player.plan;
    const chapters = steps.at(-1)?.chapter ?? 0;
    const subs = steps.reduce((m, s) => Math.max(m, s.sub ?? -1), -1) + 1;
    const attached = attachedAt(steps, i).map((k) => t('result.step.subName', { i: k + 1 }));
    // Each tag has a short form for narrow phones; the full text stays as its tooltip and for screen readers.
    const chip = (key, vars, strong = false) => {
      const long = t(key, vars);
      const short = strong ? t(`${key}.short`, vars) : long;
      return `<span class="chip${strong ? ' strong' : ''}" title="${esc(long)}"><span class="long">${esc(long)}</span><span class="short" aria-hidden="true">${esc(short)}</span></span>`;
    };
    const list = new Intl.ListFormat(locale()).format(attached);
    const note = [
      chapters > 0 ? chip('result.step.chapter', { i: (step.chapter ?? 0) + 1, total: chapters + 1 }) : '',
      step.sub !== undefined ? chip('result.step.sub', { i: step.sub + 1, total: subs }, true) : '',
      attached.length ? chip('result.step.attach', { list }, true) : '',
      // Attaching a sub-assembly already says "from below": then only that the step's own parts go that way too.
      step.fromBelow ? chip(attached.length ? 'result.step.fromBelowToo' : 'result.step.fromBelow', {}, true) : '',
    ].filter(Boolean);
    el('step-note').innerHTML = note.join('');
    el('step-note').hidden = !note.length;
    if (state.stepFocus && state.stepFocus.step !== i) state.stepFocus = null;
    const tip = t('result.step.needsShow');
    const { parts } = state.model.result;
    el('step-needs').innerHTML = stepNeeds(parts, step.ids)
      .map((g) => {
        const key = needKey(g);
        const pressed = state.stepFocus?.key === key;
        const kind = kindName(shownKind(g));
        const name = `${g.w}×${g.d} ${kind} × ${g.count}`;
        const picture = icons.get(key);
        const look = picture ? `<img src="${picture}" alt="">` : `<span class="swatch" style="background:${colourCss(g.color)}"></span>`;
        return `<li><button type="button" data-key="${esc(key)}" data-ids="${g.ids.join(',')}" aria-pressed="${pressed}" aria-label="${esc(name)}" title="${esc(`${name} · ${tip}`)}">${look}<span aria-hidden="true">${g.count}×</span><small aria-hidden="true">${esc(kind)} ${g.w}×${g.d}</small></button></li>`;
      })
      .join('');
  }

  /**
   * Part pictures for the parts box, in the parts' own colours (`drawIcons`),
   * for every kind of part in the plan at once: one throwaway renderer per
   * plan instead of one per step. Until they are drawn a colour swatch stands in.
   */
  const icons = new Map();
  let iconsFor = null;
  function drawPlanIcons() {
    const { plan } = player;
    if (!state.model || iconsFor === plan || !plan.steps.length) return;
    iconsFor = plan;
    icons.clear();
    const { parts } = state.model.result;
    const items = new Map();
    for (const s of plan.steps) {
      for (const g of stepNeeds(parts, s.ids)) {
        const key = needKey(g);
        if (items.has(key)) continue;
        const type = partType(parts[g.ids[0]]);
        items.set(key, { key, part: { kind: type.kind, w: type.w, d: type.d, ldraw: type.ldraw }, hex: PALETTE[g.color - 1].hex });
      }
    }
    for (const [key, url] of drawIcons([...items.values()], 40)) icons.set(key, url);
  }

  Object.assign(page, { syncSlider, renderStep, drawPlanIcons });
}

/** One kind of part in a step: colour, kind, size and part number. */
const needKey = (g) => `${g.color}/${g.kind}/${g.w}x${g.d}/${g.ldraw ?? ''}`;
