import { buildMosaic } from '../../mosaic/mosaic.mjs';
import { artSetRows, badFit, mergeColourStocks, setsWithPart, STOCK_MODES, surfaceStock } from '../../mosaic/stock.mjs';
import { defaultBaseColour, planBases, partsList } from '../../mosaic/base.mjs';
import { mosaicLdr, mosaicPartsCsv } from '../../io/mosaic-ldr.mjs';
import { fileStem } from '../../io/file-name.mjs';
import { download } from '../download.mjs';
import { STUD_CM } from '../words.mjs';
import { locale, t } from '../../i18n/index.mjs';
import { drawMosaicCanvas, hexOf } from './draw.mjs';
import { bindFrame, cssScale, drawFrame, isWhole } from './frame.mjs';
import { mosaicColourName, mosaicSetName, mosaicSetTitle } from './names.mjs';
import { createSetPicker, setMark } from '../set-picker.mjs';
import { makeMosaicBook } from './pdf.mjs';
import { createRelief } from './relief.mjs';
import { setupMosaicDrawer } from './drawer.mjs';
import { bindHelp } from '../help.mjs';

/**
 * Mosaic page (/mosaic/): the visitor's photo beside the brick mosaic made
 * from it, with size, surface part, colour cap and dithering, or limited to the
 * parts of the sets the visitor has (LEGO Art sets ticked, any set added
 * by search, ui/set-picker.mjs); the visitor may frame a
 * part of the photo (frame.mjs), and stand the near parts up on plates
 * (2.5D, relief.mjs). Everything runs on this page; the photo is never
 * sent anywhere (2.5D downloads a depth model once, it uploads nothing).
 * The settings sit in a drawer opened from the toolbar under the pictures, one
 * group at a time, like the 3D result page (drawer.mjs).
 *
 * The photo arrives drawn into a canvas at most MAX_SIDE pixels long (photo.mjs, read by main.mjs
 * before this module loads, on the first visit to /mosaic/), and the
 * shrunk photo is cached per grid size and frame (buildMosaic `cache`, at most
 * CACHE_LIMIT of them), so changing the part, the colour cap or the dithering
 * only re-picks colours.
 */

/** Supported long-side mosaic sizes, in studs; each is a multiple of 16. */
export const MOSAIC_SIZES = [96, 128, 160];
/** What a photo opens with; the start-page previews are made with these too (tools/mosaic-thumbs.sh). */
export const MOSAIC_DEFAULTS = { studs: 128, part: 'roundTile' };
/** Colour caps offered; Infinity = no cap. */
export const COLOUR_CAPS = [Infinity, 24, 16, 12, 8, 4];
/** Surface parts in the order offered: LEGO Art's round tile first. */
export const MOSAIC_PARTS = ['roundTile', 'squareTile', 'roundPlate', 'squarePlate'];
const DITHERS = ['none', 'floyd', 'atkinson'];
/** Pixels per cell on the mosaic canvas (CSS scales it to fit). */
const CELL_PX = 12;
/** Shrunk photos kept per photo; dragging a frame makes a new one at every step. */
const CACHE_LIMIT = 8;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {{
 *   onBuilt?: (mosaic: ReturnType<typeof buildMosaic>, ms: number) => void,
 *   createDepthEstimator: Parameters<typeof createRelief>[0]['createEstimator'],
 * }} hooks createDepthEstimator: runtime/depth.mjs (passed in: ui does not reach the runtime layer)
 */
export function createMosaicPage({ onBuilt, createDepthEstimator }) {
  const $ = (id) => document.getElementById(id);
  /**
   * sets: the visitor's sets, ticked LEGO Art ones and any added by search: id → { name, year, image?, copies, rows }
   * (rows: the set's inventory in Rebrickable numbers). Kept when the part changes; only the current part counts.
   */
  const settings = { ...MOSAIC_DEFAULTS, maxColours: Infinity, dither: 'none', base: 'panels', sets: new Map(), stockMode: 'fewest' };
  /** region: the framed part in photo-canvas pixels, null = the whole photo. */
  /** @type {{ name: string, canvas: HTMLCanvasElement, pixels: ImageData, cache: Map<string, Float32Array>, region: import('./frame.mjs').Rect | null } | null} */
  let photo = null;
  /** Framing on: the left pane shows the whole photo with the frame to drag. */
  let framing = false;
  let queued = 0;
  let mosaic = null;
  let ms = 0;
  /** Mean colour difference of the same mosaic with any colour, when limited to the visitor's sets (to warn of a bad fit). */
  let freeError = 0;
  const relief = createRelief({ $, createEstimator: createDepthEstimator, onChange: () => photo && mosaic && render() });
  // While framing, Esc ends the framing (frame.mjs), not the drawer.
  const drawer = setupMosaicDrawer({ $, busy: () => framing });
  bindHelp($('mosaic-drawer'));
  /** 2.5D plates under the mosaic shown now, or null. */
  const raised = () => relief.of(mosaic, photo, plan().side);

  // Colour cap and dithering: segmented choices (disabled while the visitor's sets fix the colours).
  $('mosaic-colours').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cap]:not(:disabled)');
    if (!b) return;
    settings.maxColours = Number(b.dataset.cap);
    rebuild();
  });
  $('mosaic-dither').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-dither]:not(:disabled)');
    if (!b) return;
    settings.dither = b.dataset.dither;
    rebuild();
  });
  // 「盒里的颜色不合适时」: buy fewest / a middle way / the picture closest to the photo (STOCK_MODES).
  $('mosaic-stock-modes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === settings.stockMode) return;
    settings.stockMode = b.dataset.mode;
    rebuild();
  });
  $('mosaic-sizes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-studs]');
    if (!b) return;
    settings.studs = Number(b.dataset.studs);
    rebuild();
  });
  $('mosaic-parts').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-part]');
    if (!b) return;
    settings.part = b.dataset.part;
    rebuild();
  });
  $('mosaic-sets').addEventListener('change', (e) => {
    const box = e.target.closest('input[data-set]');
    if (!box) return;
    const id = box.dataset.set;
    if (box.checked) {
      const s = setsWithPart(settings.part).find((x) => x.id === id);
      settings.sets.set(id, { name: mosaicSetTitle(s), en: s.name, year: s.year, copies: 1, rows: artSetRows(id), ticked: true });
    } else settings.sets.delete(id);
    rebuild();
  });
  $('mosaic-bases').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-base]:not(:disabled)');
    if (!b || !mosaic) return;
    settings.base = b.dataset.base;
    render(); // the picture does not change, only what it sits on
  });
  $('mosaic-csv').addEventListener('click', () => {
    if (mosaic) download(`${fileName()}.csv`, mosaicPartsCsv(partsList(mosaic, plan(), { raise: raised()?.counts })), 'text/csv');
  });
  $('mosaic-ldr').addEventListener('click', () => {
    if (mosaic) download(`${fileName()}.ldr`, mosaicLdr(mosaic, plan(), { name: fileName(), relief: raised() }), 'text/plain');
  });
  $('mosaic-pdf').addEventListener('click', () => {
    if (mosaic) makeMosaicBook(mosaic, plan(), { title: photo.name, fileName: fileName(), button: $('mosaic-pdf'), status: $('mosaic-pdf-status'), relief: raised() });
  });
  $('mosaic-frame').addEventListener('click', () => {
    framing = !framing;
    render();
    if (framing) $('mosaic-source').focus();
  });
  $('mosaic-whole').addEventListener('click', () => {
    photo.region = null;
    rebuild();
  });
  bindFrame($('mosaic-source'), {
    active: () => framing && photo !== null,
    size: () => ({ w: photo.canvas.width, h: photo.canvas.height }),
    current: () => frame(),
    onFrame: (r) => setRegion(r),
    onEscape: () => {
      framing = false;
      render();
      $('mosaic-frame').focus();
    },
  });
  $('mosaic-buy-csv').addEventListener('click', () => {
    if (mosaic?.short) download(`${t('mosaic.buyFile', { name: fileName() })}.csv`, mosaicPartsCsv(mosaic.buy.map((b) => ({ part: mosaic.partId, colour: b.code, quantity: b.count }))), 'text/csv');
  });
  document.addEventListener('localechange', () => {
    // LEGO Art sets have page-language names; other sets only have their English name.
    for (const [id, s] of settings.sets) if (s.en) s.name = mosaicSetTitle({ id, name: s.en });
    drawer.sync();
    if (photo && mosaic && !$('mosaic').hidden) render();
  });

  /** The visitor's sets, current surface part only: colour → count, or null (not limited). */
  const ownStock = () => mergeColourStocks([...settings.sets.values()].map((s) => surfaceStock(settings.part, s.rows, s.copies)));
  /** The current part's name for running text ('圆形光面片', 'round tile'). */
  const partWord = () => {
    const part = t(`mosaic.part.${settings.part}`);
    return locale() === 'en' ? part.toLowerCase() : part;
  };
  const picker = createSetPicker({
    root: $('mosaic-own'),
    ids: { search: 'mosaic-own-search', results: 'mosaic-own-results', status: 'mosaic-own-search-status', added: 'mosaic-own-added' },
    sets: () => settings.sets,
    fromInventory: (rows) => ({ rows }),
    rowLine: (id, s) => {
      let n = 0;
      for (const c of surfaceStock(settings.part, s.rows, s.copies)?.values() ?? []) n += c;
      return n ? t('mosaic.own.setLine', { year: s.year, n, part: partWord() }) : t('mosaic.own.setNone', { year: s.year, part: partWord() });
    },
    onChange: () => rebuild(),
  });

  /** The chosen base if it fits this size, else LEGO Art panels (they fit every size). */
  function plan() {
    const plans = planBases(mosaic.width, mosaic.height);
    return plans.find((p) => p.key === settings.base && p.fits) ?? plans.find((p) => p.key === 'panels');
  }
  const fileName = () => fileStem(t('mosaic.fileName', { name: photo.name, w: mosaic.width, h: mosaic.height }));

  function rebuild() {
    if (!photo) return;
    const t0 = performance.now();
    const stock = ownStock();
    const opts = { ...settings, cache: photo.cache, ...(photo.region && { crop: photo.region }) };
    mosaic = buildMosaic(photo.pixels, { ...opts, ...(stock && { stock }) });
    ms = performance.now() - t0;
    // Limited to the visitor's sets: the same picture with any colour, only for its colour difference (the shrunk photo is cached, a few ms).
    freeError = stock ? buildMosaic(photo.pixels, opts).error : 0;
    while (photo.cache.size > CACHE_LIMIT) photo.cache.delete(photo.cache.keys().next().value);
    render();
    onBuilt?.(mosaic, ms);
  }

  function render() {
    // The controls are re-drawn below; keep keyboard focus on the same one.
    const focused = document.activeElement?.closest?.('#mosaic [data-studs], #mosaic [data-part], #mosaic [data-base], #mosaic [data-set], #mosaic [data-cap], #mosaic [data-dither], #mosaic [data-mode]');
    const again = focused && ['studs', 'part', 'base', 'set', 'cap', 'dither', 'mode'].find((k) => k in focused.dataset);
    renderControls();
    relief.render();
    drawSource();
    drawMosaic();
    const n = mosaic.width * mosaic.height;
    const lift = raised();
    $('mosaic-title').textContent = t(lift ? 'mosaic.titleRelief' : 'mosaic.title', { name: photo.name });
    // Under the name: the counts as tags, the numbers in bold ("128 × 80 格 · 约 102 × 64 厘米 · 10240 块 · 23 种颜色"),
    // plus the raise plates when 2.5D is on.
    const bold = (s) => esc(s).replace(/\d[\d,.]*/g, '<b>$&</b>');
    $('mosaic-summary').innerHTML = [
      t('mosaic.stat.grid', { w: mosaic.width, h: mosaic.height }),
      t('mosaic.stat.cm', { w: Math.round(mosaic.width * STUD_CM), h: Math.round(mosaic.height * STUD_CM) }),
      t('mosaic.count', { n }),
      ...(lift ? [t('mosaic.stat.raise', { n: lift.plates.length })] : []),
      t('result.colours', { n: mosaic.colours.length }),
    ].map((s) => `<span class="stat">${bold(s)}</span>`).join('');
    $('mosaic-colour-total').textContent = t('result.colourTotal', { colours: t('result.colours', { n: mosaic.colours.length }), parts: t('mosaic.count', { n }) });
    const toBuy = new Map((mosaic.buy ?? []).map((b) => [b.code, b.count]));
    $('mosaic-legend').innerHTML = mosaic.colours
      .map((c) => {
        const count = toBuy.has(c.code) ? t('mosaic.countBuy', { n: c.count, buy: toBuy.get(c.code) }) : t('mosaic.count', { n: c.count });
        return `<li class="colour-row plain"><span class="swatch" style="background:${hexOf(c.code)}"></span>
        <span>${esc(mosaicColourName(c.code))}</span><span class="count">${esc(count)}</span></li>`;
      })
      .join('');
    renderOwn();
    const rows = [
      [t('mosaic.d.ms'), t('mosaic.d.msValue', { ms: Math.round(ms) })],
      [t('mosaic.d.error'), mosaic.error.toFixed(1)],
      [t('mosaic.d.lines'), t('mosaic.d.cells', { n: mosaic.lineCells })],
    ];
    if (lift) rows.push([t('mosaic.d.relief'), t('mosaic.d.reliefValue', { plates: lift.plates.length, s: (lift.depthMs / 1000).toFixed(1) })]);
    $('mosaic-details').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    renderBase();
    document.title = `${$('mosaic-title').textContent} · ${t('brand.name')}`;
    if (again) $('mosaic').querySelector(`[data-${again}="${CSS.escape(focused.dataset[again])}"]`)?.focus();
  }

  /** Base buttons (a base that does not fit this size is shown but disabled, with why), its note and its rows in the list. */
  function renderBase() {
    const chosen = plan();
    const bases = planBases(mosaic.width, mosaic.height);
    $('mosaic-bases').innerHTML = bases
      .map((p) => {
        const small = p.fits ? `× ${p.count}` : t('mosaic.base.notFit', { side: p.side });
        return `<button type="button" data-base="${p.key}" aria-pressed="${p.key === chosen.key}"${p.fits ? '' : ' disabled'}>${esc(t(`mosaic.base.${p.key}`))}<small>${esc(small)}</small></button>`;
      })
      .join('');
    const note =
      chosen.key === 'panels'
        ? t('mosaic.base.panelsNote', { count: chosen.count, pins: chosen.pins })
        : chosen.count === 1
          ? t('mosaic.base.oneNote')
          : t('mosaic.base.manyNote', { count: chosen.count });
    // A greyed-out baseplate: say what the picture measures now and how to make it fit.
    const blocked = bases.some((p) => !p.fits);
    $('mosaic-base-note').textContent = blocked ? note + t('mosaic.base.fitHint', { w: mosaic.width, h: mosaic.height }) : note;
    const partName = (r) => (r.role === 'raise' ? t('mosaic.partName.raise', { w: r.size[0], d: r.size[1] }) : t(`mosaic.partName.${r.part}`));
    $('mosaic-base-parts').innerHTML = partsList(mosaic, chosen, { raise: raised()?.counts })
      .filter((r) => r.role !== 'surface')
      .map(
        (r) => `<li class="colour-row plain"><span class="swatch" style="background:${hexOf(r.colour)}"></span>
        <span>${esc(t('mosaic.partRow', { part: partName(r), colour: mosaicColourName(r.colour) }))}</span><span class="count">${esc(t('mosaic.count', { n: r.quantity }))}</span></li>`,
      )
      .join('');
  }

  /**
   * 「只用我有的套装」: the summary line, whether the stock is enough, and the
   * controls a stock turns off (colour cap, dithering: both change how many of each colour).
   */
  function renderOwn() {
    const limited = mosaic.stocked !== undefined;
    const boxes = [...settings.sets.values()].reduce((a, s) => a + s.copies, 0);
    $('mosaic-own-summary').textContent = limited
      ? t('mosaic.own.chosen', { n: boxes, parts: mosaic.stocked })
      : boxes
        ? t('mosaic.own.nonePart', { n: boxes, part: partWord() })
        : t('mosaic.own.none');
    const status = $('mosaic-own-status');
    status.hidden = !limited;
    // The three ways to use the boxes, each with what it leaves to buy, so the visitor weighs the cost.
    $('mosaic-stock-mode-row').hidden = !limited;
    if (limited) {
      $('mosaic-stock-modes').innerHTML = Object.keys(STOCK_MODES)
        .map((m) => {
          const buy = mosaic.shortBy[m];
          const small = buy ? t('mosaic.stockMode.buy', { n: buy }) : t('mosaic.stockMode.none');
          const name = t(`mosaic.stockMode.${m}`);
          return `<button type="button" data-mode="${m}" aria-pressed="${m === settings.stockMode}" aria-label="${esc(`${name}: ${small}`)}">${esc(name)}<small>${esc(small)}</small></button>`;
        })
        .join('');
    }
    if (limited) {
      const n = mosaic.width * mosaic.height;
      status.textContent = mosaic.short
        ? t('mosaic.own.short', { have: mosaic.stocked, part: partWord(), n, used: n - mosaic.short, buy: mosaic.short })
        : t('mosaic.own.enough', { have: mosaic.stocked, part: partWord(), n });

    }
    // The boxes' colours fit this photo badly: say so on its own line, or the result looks like a broken page.
    const warn = $('mosaic-own-warn');
    warn.hidden = !(limited && badFit(mosaic.error, freeError));
    if (!warn.hidden) warn.textContent = t('mosaic.own.badFit', { e: mosaic.error.toFixed(0), free: freeError.toFixed(0) });
    $('mosaic-colour-locked').hidden = !limited;
    $('mosaic-buy-csv').hidden = !mosaic.short;
  }

  function renderControls() {
    $('mosaic-sizes').innerHTML = MOSAIC_SIZES.map(
      (s) => `<button type="button" data-studs="${s}" aria-pressed="${s === settings.studs}">${s}<small>${esc(t('mosaic.sizeCm', { n: Math.round(s * STUD_CM) }))}</small></button>`,
    ).join('');
    $('mosaic-parts').innerHTML = MOSAIC_PARTS
      .map((p) => `<button type="button" data-part="${p}" aria-pressed="${p === settings.part}">${esc(t(`mosaic.part.${p}`))}</button>`)
      .join('');
    const limited = mosaic.stocked !== undefined;
    const off = limited ? ' disabled' : '';
    // The tracks are narrow: short labels, the full wording for screen readers.
    $('mosaic-colours').innerHTML = COLOUR_CAPS.map((n) => {
      const label = n === Infinity ? t('result.tune.colours.all') : String(n);
      const aria = n === Infinity ? t('mosaic.colours.all') : t('mosaic.colours.n', { n });
      return `<button type="button" data-cap="${n}" aria-pressed="${n === settings.maxColours}" aria-label="${esc(aria)}"${off}>${esc(label)}</button>`;
    }).join('');
    $('mosaic-dither').innerHTML = DITHERS.map(
      (d) => `<button type="button" data-dither="${d}" aria-pressed="${d === settings.dither}" aria-label="${esc(t(`mosaic.dither.${d}`))}"${off}>${esc(t(`mosaic.dither.short.${d}`))}</button>`,
    ).join('');
    const sets = setsWithPart(settings.part);
    // The LEGO Art sets with this part, identified by number and name; the list scrolls inside a fixed height
    // (the box stays put when the rows are redrawn, so its scroll position does too).
    const list = $('mosaic-sets');
    list.classList.toggle('art-list', sets.length > 0);
    list.innerHTML = sets.length
      ? sets
          .map(
            (s) => `<label class="check art-set"><input type="checkbox" data-set="${s.id}"${settings.sets.has(s.id) ? ' checked' : ''}>${setMark()}
            <span>${esc(mosaicSetName(s))}<small>${esc(t('mosaic.own.count', { n: s.count, year: s.year }))}</small></span></label>`,
          )
          .join('')
      : `<p class="note">${esc(t('mosaic.own.noSets', { part: t(`mosaic.part.${settings.part}`) }))}</p>`;
    $('mosaic-sets-label').hidden = sets.length === 0;
    picker.render();
  }

  /** The part of the photo the mosaic used, at the mosaic's aspect; while framing, the whole photo with the frame. */
  function drawSource() {
    const out = $('mosaic-source');
    renderFraming();
    if (framing) {
      drawFrame(out, photo.canvas, frame(), { cssScale: cssScale(out) });
      return;
    }
    const { x, y, w, h } = mosaic.crop;
    const scale = Math.min(1, 768 / Math.max(w, h));
    out.width = Math.round(w * scale);
    out.height = Math.round(h * scale);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo.canvas, x, y, w, h, 0, 0, out.width, out.height);
  }

  /** The frame now: the visitor's, or the whole photo. */
  const frame = () => photo.region ?? { x: 0, y: 0, w: photo.canvas.width, h: photo.canvas.height };

  /** Framing controls, the left pane's caption and what the canvas is to assistive tech. */
  function renderFraming() {
    const out = $('mosaic-source');
    const button = $('mosaic-frame');
    $('mosaic-frame-label').textContent = t(framing ? 'mosaic.frame.done' : 'mosaic.frame');
    button.setAttribute('aria-pressed', String(framing));
    $('mosaic-whole').hidden = !photo.region;
    $('mosaic-frame-note').hidden = !framing;
    $('mosaic-source-caption').textContent = t(framing ? 'mosaic.frame.caption' : 'mosaic.original');
    $('mosaic').querySelector('.mosaic-view').classList.toggle('framing', framing);
    if (framing) {
      const r = frame();
      const pc = (v, of) => Math.round((100 * v) / of);
      out.removeAttribute('aria-hidden');
      out.tabIndex = 0;
      out.setAttribute('role', 'group');
      out.setAttribute('aria-describedby', 'mosaic-frame-note');
      out.setAttribute('aria-label', t('mosaic.frame.aria', { x: pc(r.x, photo.canvas.width), y: pc(r.y, photo.canvas.height), w: pc(r.w, photo.canvas.width), h: pc(r.h, photo.canvas.height) }));
    } else {
      for (const a of ['role', 'aria-describedby', 'aria-label', 'tabindex']) out.removeAttribute(a);
      out.setAttribute('aria-hidden', 'true');
    }
  }

  /** A new frame: redraw it now, rebuild the mosaic once per animation frame. */
  function setRegion(r) {
    photo.region = isWhole(r, photo.canvas.width, photo.canvas.height) ? null : r;
    drawSource();
    if (!queued) queued = requestAnimationFrame(() => ((queued = 0), rebuild()));
  }

  /** One circle or square per cell on the base colour, with a faint line between 16 × 16 panels (draw.mjs). */
  function drawMosaic() {
    const out = $('mosaic-canvas');
    out.setAttribute('aria-label', t('mosaic.canvas.aria', { w: mosaic.width, h: mosaic.height }));
    drawMosaicCanvas(out, mosaic, { cellPx: CELL_PX, base: defaultBaseColour(plan().part), heights: raised()?.heights, markRaised: relief.mark });
  }

  return {
    /** Show a photo read by readPhoto, with the current settings. */
    show(source) {
      const { canvas, pixels } = source;
      if (!photo || photo.pixels !== pixels) {
        // The name is read through the caller's object: an example's name follows the page language.
        photo = { get name() { return source.name; }, canvas, pixels, cache: new Map(), region: null };
        framing = false;
        relief.setPhoto(photo);
      }
      rebuild();
    },
    hasPhoto: () => photo !== null,
    /** Re-run with the last photo (after returning to the page). */
    redraw: () => photo && rebuild(),
  };
}
