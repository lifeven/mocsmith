import { gridStep } from '../../render/camera.mjs';
import { el } from './texts.mjs';

/**
 * Fine-tuning a preview, for adding a part and for moving one. Keyboard:
 * the arrow keys move the preview one stud the way the screen shows it
 * (`gridStep`), R turns it, Enter puts it down. On a phone or tablet a tap
 * only shows the preview, and the bar under the model has the same four
 * arrows, 「转」, 「放下」 and 「取消」, so a part can be lined up before it is
 * put down.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupNudge(page) {
  const { stage } = page;
  /** Whatever is being placed now: a part being moved, else the part being added. */
  const active = () => (page.mover.active ? page.mover : page.adder.placing ? page.adder : null);
  const step = (direction) => gridStep(direction, stage.groundAway());

  for (const b of el('nudge-bar').querySelectorAll('button[data-nudge]')) {
    b.addEventListener('click', () => active()?.nudge(step(b.dataset.nudge)));
  }
  el('nudge-turn').addEventListener('click', () => active()?.turn());
  el('nudge-place').addEventListener('click', () => {
    if (active()?.commit()) hide();
  });
  el('nudge-cancel').addEventListener('click', () => {
    active()?.clear();
    hide();
  });

  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const c = active();
    if (!c) return;
    if (KEYS[e.key] && c.preview?.part) {
      e.preventDefault(); // the page would scroll
      c.nudge(step(KEYS[e.key]));
    } else if (e.key === 'r' || e.key === 'R') {
      c.turn();
    } else if (e.key === 'Enter' && c.preview?.part) {
      e.preventDefault();
      if (c.commit(e.shiftKey)) hide();
    }
  });

  function show() {
    el('nudge-bar').hidden = false;
  }
  function hide() {
    el('nudge-bar').hidden = true;
  }

  Object.assign(page, { showNudge: show, hideNudge: hide });
}
