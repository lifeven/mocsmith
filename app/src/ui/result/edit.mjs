import { addPart, canDelete, deletePart } from '../../core/edit.mjs';
import { createAddPart } from '../add-part.mjs';
import { el } from './texts.mjs';

/** A pointer that moved less than this between down and up is a tap, not a turn. */
const TAP_PX = 6;

/**
 * 「编辑零件」: the part list is frozen and changed one part at a time (delete,
 * recolour one part, add a part on top). Also owns taps on the 3D view, which
 * open the palette for a brick or place the part being added.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupEdit(page) {
  const { state, stage, bricks } = page;
  const canvas = stage.renderer.domElement;

  // 「加一块零件」: preview under the mouse, a tap adds the part.
  const adder = createAddPart({
    stage,
    bricks,
    getModel: () => state.model,
    onPlace: (part, { keep }) => {
      const model = addPart(state.model, part);
      applyEdit(model, { what: 'add', part: model.result.parts.at(-1) });
      if (keep) return;
      // One part at a time: back to 选择 with the new part picked, its bar beside it (Shift or 「接着放」 keeps adding).
      page.setTool('select');
      const parts = state.model.result.parts;
      page.openPalette(parts[parts.length - 1].color, parts.length - 1);
    },
    onStop: () => page.hideNudge?.(),
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.editing || e.pointerType !== 'mouse' || e.buttons) return;
    if (page.mover.active) page.mover.move(e.clientX, e.clientY);
    else adder.move(e.clientX, e.clientY);
  });
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    // A tap, not the end of a drag that turned the model.
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_PX || !state.model) return;
    down = null;
    // A finger only shows where the part goes; the bar under the model lines it up and puts it down.
    const touch = e.pointerType !== 'mouse';
    const placer = state.editing && (page.mover.active ? page.mover : adder.placing ? adder : null);
    if (placer) {
      placer.tap(e.clientX, e.clientY, { preview: touch, shift: e.shiftKey });
      if (touch && placer.preview?.part) page.showNudge();
      else page.hideNudge();
      return;
    }
    const ndc = stage.bricksNdc(e.clientX, e.clientY);
    const id = ndc ? bricks.pick(ndc, stage.camera) : -1;
    if (state.source?.imported && !state.editing) return; // imported models are only edited part by part
    if (id >= 0) {
      // 上色 / 移动 / 删除 act on the tapped part straight away (edit-tools.mjs).
      if (state.editing && page.tapPart(id)) return;
      // A part tapped with another tool on (加零件 stopped with Esc): pick it with 选择.
      if (state.editing && state.tool !== 'select') page.setTool('select');
      page.openPalette(state.model.result.parts[id].color, id);
    } else if (state.picking) page.closePalette();
    else if (!state.editing) page.closeDrawer(); // a tap on empty space puts the drawer away
  });
  el('part-delete').addEventListener('click', () => {
    const { partId } = state.picking ?? {};
    if (!(partId >= 0) || !canDelete(state.model, partId).ok) return;
    const before = state.model;
    page.closePalette();
    applyEdit(deletePart(before, partId), { what: 'delete', part: before.result.parts[partId] });
  });

  /**
   * Show an edited model, keeping the one before it for undo. `label` says
   * what the edit was, for the edit history (edit-history.mjs):
   * `{ what: 'add' | 'delete' | 'move' | 'turn' | 'recolour', part, to? }`.
   */
  function applyEdit(model, label) {
    state.editHistory.record(state.model);
    page.showModel({ ...model, lastEdit: label }, state.info);
    page.syncUndo();
  }

  /** 「编辑零件」 on or off. Off keeps the edited model; the next re-lay (size, colour, settings) replaces it. */
  function setEditing(on) {
    if (state.picking) page.closePalette();
    if (!on) {
      adder.stop();
      page.mover.cancel();
    }
    state.editing = on;
    el('mode-edit').setAttribute('aria-pressed', String(on));
    el('result').classList.toggle('editing', on);
    // Editing swaps the settings toolbar for the edit tools (edit-tools.mjs); it starts on 选择 with its panel open.
    if (on) {
      page.setTool('select');
      page.openDrawer('edit');
    } else page.closeDrawer();
    page.syncTools();
    page.syncDrawer();
    page.syncModeButtons();
    page.syncUndo();
    if (state.model) page.renderPanel();
  }

  Object.assign(page, { adder, applyEdit, setEditing });
}
