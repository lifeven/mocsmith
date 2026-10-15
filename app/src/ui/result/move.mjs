import { canPlace, dropPart, liftPart, quarterTurn, snapLifted, turnLifted } from '../../core/edit.mjs';
import { t } from '../../i18n/index.mjs';
import { el } from './texts.mjs';

/**
 * Moving and turning one part in 「编辑零件」, from the part card. 「移动」 picks
 * the part up: it is hidden, a preview follows the pointer (green where it
 * fits, red with the reason), and a tap puts it down; Esc or 「取消」 puts it
 * back. 「转 90°」 turns it where it stands. Either way the part keeps its
 * place in the part list and the change is one undo step (core/edit.mjs
 * liftPart, snapLifted, turnLifted, dropPart).
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupMove(page) {
  const { state, stage, bricks } = page;
  /** The part being moved (a lift from core/edit.mjs), or null. */
  let lift = null;
  /** Where the preview is, `{ part, ok, reason }`, or null. */
  let preview = null;

  el('part-move').addEventListener('click', () => {
    const { partId } = state.picking ?? {};
    if (!(partId >= 0)) return;
    page.closePalette();
    start(partId);
  });

  /** Pick a part up (the card's 「移动」, or a tap with the 移动 tool): hidden, a preview follows the pointer. */
  function start(partId) {
    page.adder.stop();
    lift = liftPart(state.model, partId);
    el('move-text').textContent = t('result.move.hint');
    el('move-bar').hidden = false;
    page.redraw();
  }

  el('part-turn').addEventListener('click', () => {
    const { partId } = state.picking ?? {};
    if (!(partId >= 0)) return;
    const lifted = liftPart(state.model, partId);
    const turn = turnLifted(lifted);
    if (!turn.ok) {
      el('part-turn-why').textContent = t('result.edit.cantTurn', { why: t(`result.add.why.${turn.reason}`) });
      el('part-turn-why').hidden = false;
      return;
    }
    const model = dropPart(state.model, lifted, turn.part);
    page.applyEdit(model, { what: 'turn', part: state.model.result.parts[partId] });
    page.openPalette(model.result.parts[partId].color, partId); // the card stays open to turn again
  });

  el('move-cancel').addEventListener('click', () => cancel());
  // Starting to add a part ends a move.
  el('add-start').addEventListener('click', () => cancel());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lift) {
      e.preventDefault(); // handled: the drawer stays open
      cancel();
    }
  });

  /** End the move without changing anything; `redraw` false when a new model is about to be shown anyway. */
  function cancel(redraw = true) {
    if (!lift) return;
    lift = null;
    preview = null;
    el('move-bar').hidden = true;
    bricks.setGhost(null);
    page.hideNudge?.();
    if (redraw) page.redraw();
  }

  /** Where the part would go for a pointer position, with whether it fits. */
  function candidate(clientX, clientY) {
    const ndc = stage.bricksNdc(clientX, clientY);
    const hit = ndc ? bricks.pickFace(ndc, stage.camera) : null;
    if (!hit) return { part: null, ok: false, reason: 'notFace' };
    return snapLifted(lift, hit);
  }

  function show({ part, ok, reason }) {
    preview = part ? { part, ok, reason } : null;
    bricks.setGhost(part, ok);
    el('move-text').textContent = ok ? t('result.add.ok') : t(`result.add.why.${reason}`);
  }

  /** The preview moved one stud along the grid, or turned a quarter, and checked again. */
  function adjust(change) {
    if (!lift || !preview?.part) return;
    const part = { ...preview.part, ...change(preview.part) };
    show({ part, ...canPlace(lift.without, part) });
  }

  /** Put the part down where the preview is, if it fits. @returns {boolean} put down */
  function commit() {
    if (!lift || !preview?.ok) return false;
    const model = dropPart(state.model, lift, preview.part);
    const part = state.model.result.parts[lift.id];
    cancel(false);
    page.applyEdit(model, { what: 'move', part });
    return true;
  }

  page.mover = {
    /** Pick a part up by id. */
    start,
    /** True while a part is being moved (taps put it down instead of selecting). */
    get active() {
      return Boolean(lift);
    },
    /** The id of the part being moved, hidden while it moves; -1 when none. */
    get id() {
      return lift ? lift.id : -1;
    },
    /** The previewed spot, `{ part, ok, reason }`, or null. */
    get preview() {
      return preview;
    },
    nudge: ([dx, dz]) => adjust((p) => ({ x: p.x + dx, z: p.z + dz })),
    turn: () => adjust((p) => quarterTurn(p)),
    commit,
    clear: () => cancel(),
    /** Put the part back where it was (also when another model is shown: a move belongs to its model). */
    cancel: () => cancel(false),
    /** Pointer moved over the model (mouse): update the preview. */
    move(clientX, clientY) {
      if (lift) show(candidate(clientX, clientY));
    },
    /** A tap while moving: put the part down if it fits, else show why not; with `preview` (a finger) only show it. */
    tap(clientX, clientY, { preview: onlyShow = false } = {}) {
      show(candidate(clientX, clientY));
      if (!onlyShow) commit();
    },
  };
}
