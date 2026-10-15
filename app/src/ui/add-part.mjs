import { isAvailable, shapeAvailable } from '../core/catalog.mjs';
import { PART_TYPES } from '../core/parts.mjs';
import { PALETTE } from '../core/palette.mjs';
import { canPlace, snapOnTop, snapUnder } from '../core/edit.mjs';
import { drawIcons } from '../render/icons.mjs';
import { colourCss, colourName, kindName } from './words.mjs';
import { t } from '../i18n/index.mjs';

const el = (id) => document.getElementById(id);
/** Kinds in the select: the square families, the slopes, then the round ones (`kind.roundBrick` …). */
const KINDS = ['brick', 'plate', 'tile', 'slope', 'inverted', 'roundBrick', 'roundPlate', 'roundTile'];
const isRound = (kind) => kind.startsWith('round');
/** The part-table kind behind a select kind: roundPlate → plate. */
const baseKind = (kind) => (isRound(kind) ? kind.slice(5).toLowerCase() : kind);
/** A slope's downhill direction for each press of 「转 90°」: towards the default camera first, then round. */
const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** The part-table records of a select kind, smallest first (narrow, then short). */
const typesOf = (kind) =>
  PART_TYPES.filter((p) => p.kind === baseKind(kind) && Boolean(p.round) === isRound(kind)).sort((a, b) => a.w - b.w || a.d - b.d);

/** Footprints [short, long] of a kind (slopes: [width, length]). */
const sizesOf = (kind) => typesOf(kind).map((p) => [p.w, p.d]);

/** The record of a kind at a size. */
const typeAt = (kind, [a, b]) => typesOf(kind).find((p) => p.w === a && p.d === b);

/** LDraw number to carry for a part that is not found by footprint alone (round parts, slopes); else undefined. */
const ldrawOf = (type) => (type.round || type.slope ? type.ldraw : undefined);

/** A press on a size tile that moves less than this is a tap (pick it), more is a drag onto the model. */
const DRAG_PX = 8;
/** Part types the box shows: every kind in KINDS. */
const inBox = (type) => KINDS.some((k) => baseKind(k) === type.kind && isRound(k) === Boolean(type.round));
/** The part a picture is drawn from (found by its LDraw number). */
const iconPart = (type) => ({ kind: type.kind, w: type.w, d: type.d, ldraw: type.ldraw });

/**
 * 「加一块零件」 in edit mode: pick kind, size, colour and turn; while
 * placing, the pointer over a part's top shows a see-through preview (green
 * where it fits, red with the reason where it does not) and a tap adds it.
 *
 * @param {{ stage: import('../render/stage.mjs').Stage, bricks: import('../render/bricks.mjs').BrickView,
 *           getModel: () => object, onPlace: (part: object) => void }} deps
 */
export function createAddPart({ stage, bricks, getModel, onPlace, onStop }) {
  const state = { kind: 'plate', size: [2, 4], turn: 0, color: 1, placing: false };
  /** The part previewed on screen, `{ part, ok, reason }`, or null. */
  let preview = null;
  /** Pictures of the parts, LDraw number → data URL; drawn when the box is first on screen. */
  let icons = null;

  el('add-kinds').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kind]');
    if (!b) return;
    state.kind = b.dataset.kind;
    if (!sizesOf(state.kind).some(([a, c]) => a === state.size[0] && c === state.size[1])) state.size = sizesOf(state.kind)[0];
    render();
  });
  el('add-colours').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-color]');
    if (!b || b.disabled) return;
    state.color = Number(b.dataset.color);
    render();
  });
  // A size tile: a tap picks it and starts placing; a drag carries the part onto the model and drops it there.
  let drag = null;
  el('add-sizes').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button[data-size]');
    if (!b) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tile: b, moved: false };
    // On the box itself: picking a size re-renders the tiles, which would drop a capture held by the tile.
    el('add-sizes').setPointerCapture(e.pointerId);
  });
  el('add-sizes').addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      pick(drag.tile);
      if (!state.placing) setPlacing(true);
    }
    if (overCanvas(e.clientX, e.clientY)) show(candidate(e.clientX, e.clientY));
    else clear();
  });
  const endDrag = (e, dropped) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, tile } = drag;
    drag = null;
    if (!moved) {
      // A tap: pick this size and start placing (tap the model next).
      pick(tile);
      if (!state.placing) setPlacing(true);
      return;
    }
    if (dropped && overCanvas(e.clientX, e.clientY) && commit(e.shiftKey)) return;
    clear();
  };
  el('add-sizes').addEventListener('pointerup', (e) => endDrag(e, true));
  el('add-sizes').addEventListener('pointercancel', (e) => endDrag(e, false));

  /** Choose the size on a tile (keeps the kind; the colour moves to one made in that size). */
  function pick(tile) {
    state.size = tile.dataset.size.split('x').map(Number);
    render();
  }

  /** True when a screen point is over the 3D view. */
  function overCanvas(x, y) {
    const r = stage.canvas.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  // Four presses come back round: a slope faces each way once, a rectangle swaps sides each press.
  el('add-rotate').addEventListener('click', () => turn());
  el('add-start').addEventListener('click', () => setPlacing(!state.placing));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.placing) {
      e.preventDefault(); // handled: the drawer stays open
      setPlacing(false);
    }
  });

  /**
   * The shape as placed: footprint along x × z after the turn, with its
   * height; a round part or slope also its LDraw number, a slope its
   * profile and downhill direction.
   */
  function shape() {
    const type = typeAt(state.kind, state.size);
    const base = { kind: type.kind, h: type.h, color: state.color, ...(ldrawOf(type) && { ldraw: type.ldraw }) };
    if (type.slope) {
      const dir = DIRS[state.turn];
      const along = dir[0] !== 0; // the slope's length runs along x
      return { ...base, slope: type.slope.key, studs: type.slope.studs, dir, w: along ? type.d : type.w, d: along ? type.w : type.d };
    }
    const [w, d] = state.turn % 2 ? [type.w, type.d] : [type.d, type.w];
    return { ...base, w, d };
  }

  /** Where the new part would go for a pointer position, with whether it fits. */
  function candidate(clientX, clientY) {
    const model = getModel();
    const ndc = stage.bricksNdc(clientX, clientY);
    const hit = model && ndc ? bricks.pickFace(ndc, stage.camera) : null;
    if (!hit) return { part: null, reason: 'notFace' };
    return (hit.side === 'top' ? snapOnTop : snapUnder)(model, hit.id, hit.stud, shape());
  }

  function show({ part, ok, reason }) {
    preview = part ? { part, ok, reason } : null;
    bricks.setGhost(part, ok);
    el('add-status').textContent = ok ? t('result.add.ok') : t(`result.add.why.${reason}`);
  }

  /** Drop the preview (the visitor is still placing). */
  function clear() {
    preview = null;
    bricks.setGhost(null);
  }

  /** The preview moved one stud along the grid (arrow keys, the on-screen arrows); same layer, checked again. */
  function nudge([dx, dz]) {
    if (!preview?.part) return;
    const part = { ...preview.part, x: preview.part.x + dx, z: preview.part.z + dz };
    show({ part, ...canPlace(getModel(), part) });
  }

  /** 「转 90°」, R: the next turn; a preview on screen turns where it is. */
  function turn() {
    state.turn = (state.turn + 1) % 4;
    if (!preview?.part) return;
    const { w, d, dir } = shape();
    const part = { ...preview.part, w, d, ...(dir && { dir }) };
    show({ part, ...canPlace(getModel(), part) });
  }

  /**
   * Put the previewed part down if it fits (a tap, Enter, 「放下」, a drop).
   * `shift` (Shift held) keeps placing like the 「接着放」 switch does.
   * @returns {boolean} placed
   */
  function commit(shift = false) {
    if (!preview?.ok) return false;
    const { part } = preview;
    clear();
    el('add-status').textContent = t('result.add.hint');
    onPlace(part, { keep: shift || el('add-keep').checked });
    return true;
  }

  function setPlacing(on) {
    state.placing = on;
    el('add-start').setAttribute('aria-pressed', String(on));
    el('add-start').textContent = t(on ? 'result.add.stop' : 'result.add.start');
    el('add-status').textContent = on ? t('result.add.hint') : '';
    if (!on) {
      clear();
      onStop?.();
    }
  }

  /**
   * Fill the part box for the current language and choice: kind chips, size
   * tiles (picture + size), colour swatches; colours never made in this part
   * are disabled. Pictures are drawn the first time the box is on screen.
   */
  function render() {
    if (!icons && el('add-part').offsetParent) icons = drawIcons(PART_TYPES.filter(inBox).map((type) => ({ key: type.ldraw, part: iconPart(type) })));
    const img = (type) => (icons ? `<img src="${icons.get(type.ldraw)}" alt="">` : '');
    el('add-kinds').innerHTML = KINDS.map((k) => {
      const first = typesOf(k)[Math.min(1, typesOf(k).length - 1)];
      const count = t('result.add.sizeCount', { n: typesOf(k).length });
      return `<button type="button" data-kind="${k}" aria-pressed="${k === state.kind}">${img(first)}<span class="k-name">${kindName(k)}</span><span class="k-count">${count}</span></button>`;
    }).join('');
    el('add-sizes').innerHTML = typesOf(state.kind)
      .map((type) => {
        const on = type.w === state.size[0] && type.d === state.size[1];
        // Slopes are named length × width with their angle, as LEGO names them (45° 2 × 1).
        const label = type.slope
          ? t('result.add.size.slope', { angle: type.slope.key.split('_')[1], w: type.w, d: type.d })
          : t('result.add.size.value', { w: type.w, d: type.d });
        return `<button type="button" data-size="${type.w}x${type.d}" aria-pressed="${on}" title="${t('result.add.drag')}">${img(type)}<span>${label}</span></button>`;
      })
      .join('');
    const [a, b] = state.size;
    const ldraw = ldrawOf(typeAt(state.kind, state.size));
    const made = (value) => (ldraw ? isAvailable(ldraw, PALETTE[value - 1].code) : shapeAvailable(baseKind(state.kind), a, b, value));
    if (!made(state.color)) state.color = PALETTE.findIndex((_, i) => made(i + 1)) + 1;
    el('add-colours').innerHTML = PALETTE.map((_, i) => {
      const value = i + 1;
      const name = colourName(value);
      const why = made(value) ? name : `${name}：${t('result.edit.notMade')}`;
      return `<button type="button" data-color="${value}" aria-pressed="${value === state.color}" aria-label="${why}" title="${why}" style="background:${colourCss(value)}"${made(value) ? '' : ' disabled'}></button>`;
    }).join('');
    el('add-colour-name').textContent = colourName(state.color);
    el('add-start').textContent = t(state.placing ? 'result.add.stop' : 'result.add.start');
    clear();
  }

  render();
  return {
    /** True while the visitor is placing a part (taps place instead of selecting). */
    get placing() {
      return state.placing;
    },
    stop: () => setPlacing(false),
    /** Start placing the part picked in the box (the 加零件 tool turning on). */
    start: () => setPlacing(true),
    render,
    /** The part previewed on screen, `{ part, ok, reason }`, or null. */
    get preview() {
      return preview;
    },
    nudge,
    turn,
    commit,
    clear,
    /** Pointer moved over the model (mouse): update the preview. */
    move(clientX, clientY) {
      if (state.placing) show(candidate(clientX, clientY));
    },
    /**
     * A tap while placing: add the part if it fits, else show why not. With
     * `preview` (a finger) it only shows where the part would go, to be
     * nudged and put down from the bar under the model. `shift` keeps placing.
     */
    tap(clientX, clientY, { preview: onlyShow = false, shift = false } = {}) {
      show(candidate(clientX, clientY));
      if (!onlyShow) commit(shift);
    },
  };
}
