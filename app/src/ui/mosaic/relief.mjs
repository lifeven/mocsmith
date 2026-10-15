import { depthForGrid } from '../../mosaic/depth.mjs';
import { depthLevels, raisePlates, smoothLevels } from '../../mosaic/relief.mjs';
import { t } from '../../i18n/index.mjs';

/** Level counts offered: 2 = raise only the nearest part, 3 = one or two plates. */
export const RELIEF_LEVELS = [2, 3];
const MB = 1e6;

/**
 * 「按远近垫高（2.5D）」 on the mosaic page.
 * Off by default: the first use downloads the depth model (27 MB from
 * Hugging Face) and the runtime (3.7 MB gzipped), about 30 MB in all, so the
 * note next to the switch says so. Depth is worked out once per photo, in a
 * Worker, and kept on the photo object; the levels and the plates are
 * recomputed for every mosaic (crop, size, base).
 *
 * @param {{
 *   $: (id: string) => HTMLElement,
 *   createEstimator: () => { estimate: (image: ImageData, onProgress?: (loaded: number, total: number) => void) => Promise<{ data: Float32Array, w: number, h: number, ms: number }>, cancel: () => void },
 *   onChange: () => void,
 * }} options onChange: depth arrived or the switch changed, so redraw
 */
export function createRelief({ $, createEstimator, onChange }) {
  const box = /** @type {HTMLInputElement} */ ($('mosaic-relief'));
  /** 「分几级」: a segmented choice, greyed while 2.5D is off. */
  const levelsSeg = $('mosaic-relief-levels');
  const markBox = /** @type {HTMLInputElement} */ ($('mosaic-relief-mark'));
  const busy = $('mosaic-relief-busy');
  const bar = /** @type {HTMLProgressElement} */ ($('mosaic-relief-progress'));
  const busyText = $('mosaic-relief-busy-text');
  const status = $('mosaic-relief-status');
  let on = false;
  let levels = 3;
  /** Tint the raised cells on the preview (the step shadows alone are faint at 128 studs across a narrow pane). */
  let mark = false;
  let estimator = null;
  /** The photo whose depth is being worked out. */
  let pending = null;
  /** The photo shown now. */
  let current = null;
  /** Last result, reused while nothing it depends on changed (e.g. a base colour or locale redraw). */
  let memo = null;
  /** Message for the status line after a stop or a failure; cleared when switched on again. */
  let message = '';

  box.addEventListener('change', () => {
    on = box.checked;
    message = '';
    if (on) need(current);
    else stop();
    onChange();
  });
  levelsSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-levels]:not(:disabled)');
    if (!b) return;
    levels = Number(b.dataset.levels);
    onChange();
  });
  markBox.addEventListener('change', () => {
    mark = markBox.checked;
    onChange();
  });
  $('mosaic-relief-stop').addEventListener('click', () => {
    stop();
    off(t('mosaic.relief.stopped'));
    box.focus();
  });

  function off(why) {
    on = false;
    box.checked = false;
    message = why;
    onChange();
  }

  function stop() {
    if (!pending) return;
    estimator?.cancel();
    pending = null;
  }

  /** Start working out the depth of `photo` if the switch is on and it has none yet. */
  function need(photo) {
    if (!on || !photo || photo.depth || pending === photo) return;
    estimator ??= createEstimator();
    pending = photo;
    progress(0, 0);
    estimator.estimate(photo.pixels, progress).then(
      (depth) => {
        photo.depth = depth;
        if (pending === photo) pending = null;
        if (photo === current) onChange();
      },
      (err) => {
        if (pending === photo) pending = null;
        if (err.message === 'cancelled' || photo !== current) return;
        off(t('mosaic.relief.failed', { why: err.message }));
      },
    );
    render();
  }

  /** Model download progress; total 0 = not downloading (the model is in already, or not started). */
  function progress(loaded, total) {
    if (!pending) return;
    const downloading = total > 0 && loaded < total;
    if (downloading) {
      bar.max = total;
      bar.value = loaded;
      busyText.textContent = t('mosaic.relief.downloading', { loaded: (loaded / MB).toFixed(1), total: Math.round(total / MB) });
    } else {
      bar.removeAttribute('value');
      busyText.textContent = t('mosaic.relief.working');
    }
  }

  function render() {
    box.checked = on;
    const focused = levelsSeg.contains(document.activeElement) ? document.activeElement.dataset.levels : null;
    levelsSeg.innerHTML = RELIEF_LEVELS.map(
      (n) => `<button type="button" data-levels="${n}" aria-pressed="${n === levels}" aria-label="${t(`mosaic.relief.levels.${n}`)}"${on ? '' : ' disabled'}>${t('mosaic.relief.levelN', { n })}<small>${t(`mosaic.relief.raise.${n}`)}</small></button>`,
    ).join('');
    if (focused) levelsSeg.querySelector(`[data-levels="${focused}"]`)?.focus();
    markBox.checked = mark;
    markBox.disabled = !on;
    busy.hidden = !(on && pending);
    if (on && pending && !busyText.textContent) progress(0, 0);
    status.hidden = !message;
    status.textContent = message;
  }

  return {
    /** A new photo is on the page. */
    setPhoto(photo) {
      if (pending && pending !== photo) stop();
      current = photo;
      need(photo);
    },
    /**
     * The plates under this mosaic, or null when off or the depth is not in yet.
     * @param {{ width: number, height: number, crop: { x: number, y: number, w: number, h: number } }} mosaic
     * @param {{ canvas: HTMLCanvasElement, depth?: { data: Float32Array, w: number, h: number, ms: number } }} photo
     * @param {number} side base side in cells: plates never cross a base seam
     */
    of(mosaic, photo, side) {
      if (!on || !photo.depth) return null;
      if (memo && memo.mosaic === mosaic && memo.depth === photo.depth && memo.side === side && memo.levels === levels) return memo.value;
      const { width: gw, height: gh } = mosaic;
      const depth = depthForGrid(photo.depth, mosaic.crop, photo.canvas.width, photo.canvas.height, gw, gh);
      const level = smoothLevels(depthLevels(depth, levels), gw, gh);
      const value = { ...raisePlates(level, gw, gh, side), levels, depthMs: photo.depth.ms };
      memo = { mosaic, depth: photo.depth, side, levels, value };
      return value;
    },
    render,
    /** Whether the preview tints the raised cells. */
    get mark() {
      return mark;
    },
  };
}
