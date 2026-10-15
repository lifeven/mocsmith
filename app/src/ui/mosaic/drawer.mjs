import { t } from '../../i18n/index.mjs';

/** Drawer titles: the 3D page's group names, and the mosaic's own for 2.5D. */
const TITLES = { size: 'result.group.size', colour: 'result.group.colour', parts: 'result.group.parts', relief: 'mosaic.relief', export: 'result.group.export' };

/**
 * The mosaic page's toolbar and drawer, like the 3D result page's
 * (ui/result/drawer.mjs): one group of settings at a time (尺寸 / 颜色 / 零件 /
 * 立体 / 导出), on the right on wide screens and under the pictures on phones.
 * Closes with ×, Esc or a second tap on the same tool. Also the ⓘ beside the
 * name, which opens the detailed numbers under the name card (× , Esc, a click outside).
 *
 * @param {{ $: (id: string) => HTMLElement, busy: () => boolean }} hooks busy: Esc belongs to something else now (framing the photo)
 */
export function setupMosaicDrawer({ $, busy }) {
  const page = $('mosaic');
  const tools = $('mosaic-tools');
  const drawer = $('mosaic-drawer');
  let open = '';

  function sync() {
    drawer.hidden = !open;
    page.classList.toggle('drawer-open', Boolean(open));
    for (const g of drawer.querySelectorAll('.group[data-group]')) g.hidden = g.dataset.group !== open;
    for (const b of tools.querySelectorAll('button[data-group]')) b.setAttribute('aria-expanded', String(b.dataset.group === open));
    if (open) $('mosaic-drawer-title').textContent = t(TITLES[open]);
  }
  function close({ focusTool = false } = {}) {
    const was = open;
    if (!was) return;
    open = '';
    sync();
    if (focusTool) tools.querySelector(`button[data-group="${was}"]`)?.focus();
  }
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-group]');
    if (!b) return;
    open = open === b.dataset.group ? '' : b.dataset.group;
    sync();
  });
  $('mosaic-drawer-close').addEventListener('click', () => close({ focusTool: true }));

  const pop = $('mosaic-details-pop');
  const toggle = $('mosaic-details-toggle');
  function setDetails(show, { focus = false } = {}) {
    pop.hidden = !show;
    toggle.setAttribute('aria-expanded', String(show));
    if (focus) toggle.focus();
  }
  toggle.addEventListener('click', () => setDetails(pop.hidden));
  $('mosaic-details-close').addEventListener('click', () => setDetails(false, { focus: true }));
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !toggle.contains(e.target)) setDetails(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || page.hidden || e.defaultPrevented || busy() || document.querySelector('dialog[open]')) return;
    // The details card sits over the page, so it closes first.
    if (!pop.hidden) setDetails(false, { focus: true });
    else if (open) close({ focusTool: drawer.contains(document.activeElement) });
  });

  return {
    /** Re-title the open drawer (after the page language changes). */
    sync: () => open && sync(),
  };
}
