import * as THREE from 'three';
import { PLATE_H } from '../../render/bricks.mjs';
import { el } from './texts.mjs';

/** Gap between the top of the picked part on screen and the bar (CSS px). */
const LIFT_PX = 14;
/** The bar keeps this far from the edges of the 3D view (CSS px). */
const EDGE_PX = 8;

/**
 * 编辑零件 → 选择: a small bar that floats just above the picked part, with
 * 移动, 转 90°, 换颜色 and 删掉这块, so the commonest changes need no trip to
 * the panel. Each button does what the same button on the part card does
 * (move.mjs, edit.mjs); 换颜色 opens the panel at the card's colours. The bar
 * follows the part while the view turns, zooms or flies (one projection per
 * frame, only while it shows) and flips below the part near the top edge.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupPartFloat(page) {
  const { state, stage } = page;
  const bar = el('part-float');
  const top = new THREE.Vector3();
  let frame = 0;

  el('float-move').addEventListener('click', () => el('part-move').click());
  el('float-turn').addEventListener('click', () => el('part-turn').click());
  el('float-delete').addEventListener('click', () => el('part-delete').click());
  el('float-paint').addEventListener('click', () => {
    page.openDrawer('edit');
    const grid = el('palette-grid');
    grid.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    grid.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
  });

  /** Show or hide the bar for the current pick, and the buttons that apply to it. */
  function syncFloat() {
    const id = state.picking?.partId ?? -1;
    const show = state.editing && state.tool === 'select' && id >= 0 && !page.mover?.active && Boolean(state.model);
    bar.hidden = !show;
    cancelAnimationFrame(frame);
    if (!show) return;
    // Same rules as the card: a part with others on top can be recoloured, not moved or removed.
    const covered = el('part-actions').hidden;
    el('float-move').disabled = covered;
    el('float-delete').disabled = covered;
    el('float-turn').disabled = covered || el('part-turn').disabled;
    for (const b of bar.querySelectorAll('button')) b.title = b.getAttribute('aria-label');
    place();
  }

  /** Put the bar above the part's top centre (below it near the top edge), inside the view. */
  function place() {
    const part = state.model?.result.parts[state.picking?.partId ?? -1];
    if (!part || bar.hidden) return;
    top.set(part.x + part.w / 2, (part.y + part.h) * PLATE_H, part.z + part.d / 2).project(stage.camera);
    const view = stage.canvas.getBoundingClientRect();
    const host = bar.offsetParent?.getBoundingClientRect() ?? view;
    const behind = top.z > 1;
    const x = view.left - host.left + ((top.x + 1) / 2) * view.width;
    const y = view.top - host.top + ((1 - top.y) / 2) * view.height;
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    const left = Math.min(Math.max(x - w / 2, EDGE_PX), view.width - w - EDGE_PX);
    const above = y - LIFT_PX - h;
    const t = above >= EDGE_PX ? above : Math.min(y + LIFT_PX, view.height - h - EDGE_PX);
    bar.style.transform = `translate(${Math.round(left)}px, ${Math.round(t)}px)`;
    bar.style.visibility = behind ? 'hidden' : '';
    frame = requestAnimationFrame(place);
  }

  Object.assign(page, { syncFloat });
}
