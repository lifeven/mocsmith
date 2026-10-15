import { t } from '../../i18n/index.mjs';
import { el } from './texts.mjs';

/**
 * Build mode is used with the model propped up next to a pile of bricks, so:
 *
 * - **Keep the screen on** (Screen Wake Lock API) while build mode is on and
 *   the page is visible; the browser drops the lock when the tab is hidden, so
 *   it is asked for again on return. Browsers without the API, or that refuse
 *   (battery saver), just let the screen sleep as usual.
 * - **Full screen** button in the build card, only where the page can go full
 *   screen (not on iPhone Safari, which allows it for video only). The whole
 *   page goes full screen, so the layout is the same, only the browser's bars go.
 *
 * Both follow the `building` class on #result, so they need no hooks in the
 * mode code.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupBuildScreen(page) {
  const result = el('result');
  const building = () => result.classList.contains('building') && !result.hidden;

  // Keep the screen on.
  let lock = null;
  let asking = false;
  async function syncWake() {
    if (!('wakeLock' in navigator)) return;
    if (building() && document.visibilityState === 'visible') {
      if (lock || asking) return;
      asking = true;
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => (lock = null));
      } catch {
        lock = null; // refused: the screen sleeps as usual
      } finally {
        asking = false;
      }
      if (!building()) syncWake(); // build mode ended while asking
    } else if (lock) {
      const held = lock;
      lock = null;
      held.release().catch(() => {});
    }
  }

  // Full screen.
  const root = document.documentElement;
  const canFull = Boolean(document.fullscreenEnabled && root.requestFullscreen);
  const full = el('step-full');
  function syncFull() {
    full.hidden = !canFull || !building();
    const on = Boolean(document.fullscreenElement);
    full.querySelector('span').textContent = t(on ? 'result.step.fullExit' : 'result.step.full');
    full.setAttribute('aria-pressed', String(on));
  }
  full.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', syncFull);
  document.addEventListener('localechange', syncFull);

  function sync() {
    syncWake();
    syncFull();
    // Leaving build mode leaves full screen too.
    if (!building() && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  new MutationObserver(sync).observe(result, { attributes: true, attributeFilter: ['class', 'hidden'] });
  document.addEventListener('visibilitychange', syncWake);
  sync();
  Object.assign(page, { syncBuildScreen: sync });
}
