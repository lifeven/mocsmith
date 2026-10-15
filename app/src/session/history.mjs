/**
 * Undo / redo over whole values (a paint, a model): `record` the value about
 * to be replaced, `undo` / `redo` hand back the value to show and keep the
 * current one for the way back. Values are never changed in place, so
 * keeping them whole is cheap and exact.
 *
 * @template T
 */
export function createHistory() {
  /** @type {T[]} */
  const back = [];
  /** @type {T[]} */
  const ahead = [];
  return {
    /** Remember `current` before a new value replaces it; a new edit drops the redo side. */
    record(current) {
      back.push(current);
      ahead.length = 0;
    },
    /** The value before `current`, or undefined when there is none. */
    undo(current) {
      if (!back.length) return undefined;
      ahead.push(current);
      return back.pop();
    },
    /** The value after `current`, or undefined when there is none. */
    redo(current) {
      if (!ahead.length) return undefined;
      back.push(current);
      return ahead.pop();
    },
    get canUndo() {
      return back.length > 0;
    },
    get canRedo() {
      return ahead.length > 0;
    },
    /**
     * Every value in order, oldest first, with `current` among them at
     * `at`: the undo side, then `current`, then the redo side (next first).
     */
    steps(current) {
      return { list: [...back, current, ...ahead.slice().reverse()], at: back.length };
    },
    /**
     * Step back or ahead to index `to` of `steps()` in one go, as that many
     * undos or redos; the steps on the other side stay for redo / undo.
     * @returns {T} the value now current (`current` when `to` is where it already is)
     */
    jump(current, to) {
      let value = current;
      while (back.length > to) value = this.undo(value);
      while (back.length < to && ahead.length) value = this.redo(value);
      return value;
    },
    clear() {
      back.length = 0;
      ahead.length = 0;
    },
  };
}
