import { lastStepUpTo } from '../../steps/plan.mjs';
import { clearestView } from '../../render/camera.mjs';
import { t } from '../../i18n/index.mjs';
import { el } from './texts.mjs';

/**
 * The "not joined" banner and its 「在哪」 button, which flies the camera to
 * each loose group in turn and greys out the rest until the model is turned.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupBanner(page) {
  const { state, stage, player } = page;

  el('issue-where').addEventListener('click', flyToNextGroup);
  el('structure-where').addEventListener('click', flyToNextGroup);

  function renderBanner() {
    const n = state.model.stats.detachedParts;
    el('issue-banner').hidden = n === 0;
    // The same news at the top of the 结构 group, with its own 「在哪」.
    el('structure-status').classList.toggle('bad', n > 0);
    el('structure-text').textContent = n ? t('result.issue', { n }) : t('result.allJoined.long');
    el('structure-where').hidden = n === 0;
    if (!n) return;
    el('issue-text').textContent = t('result.issue', { n });
    el('issue-short').textContent = t('result.issueShort', { n });
    const g = state.groups.length;
    el('issue-where').textContent = g > 1 && state.groupIndex >= 0 ? t('result.whereOf', { i: state.groupIndex + 1, n: g }) : t('result.where');
    el('structure-where').textContent = el('issue-where').textContent;
  }

  function flyToNextGroup() {
    if (!state.groups.length) return;
    state.groupIndex = (state.groupIndex + 1) % state.groups.length;
    const group = state.groups[state.groupIndex];
    if (state.mode === 'layers') {
      // Show at least up to the step that places the parts at the group's top height.
      const need = lastStepUpTo(player.plan, state.model.result.parts, group.topLayer);
      if (player.index < need) player.goTo(need);
    }
    const preferred = stage.camera.position.clone().sub(stage.controls.target).normalize();
    stage.focus(group.box, state.model.grid, clearestView(state.model, group, preferred));
    // Grey out the rest so the red part stands out, until the visitor turns the model.
    state.spotlight = true;
    page.redraw();
  }

  Object.assign(page, { renderBanner });
}
