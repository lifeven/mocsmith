import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/session/history.mjs';
import { createResultState } from '../src/session/result-state.mjs';
import { DEFAULT_SETTINGS } from '../src/convert/config.mjs';

test('history: record, undo, redo, a new edit drops redo, clear', () => {
  const h = createHistory();
  assert.equal(h.undo('a'), undefined);
  assert.equal(h.canUndo, false);
  h.record('a'); // a → b
  h.record('b'); // b → c
  assert.equal(h.undo('c'), 'b');
  assert.equal(h.undo('b'), 'a');
  assert.equal(h.undo('a'), undefined);
  assert.equal(h.canRedo, true);
  assert.equal(h.redo('a'), 'b');
  h.record('b'); // b → d: the old redo (c) is gone
  assert.equal(h.canRedo, false);
  assert.equal(h.undo('d'), 'b');
  h.clear();
  assert.equal(h.canUndo || h.canRedo, false);
});

test('history: steps lists every value in order, jump goes there and keeps the rest', () => {
  const h = createHistory();
  h.record('a'); // a → b
  h.record('b'); // b → c
  h.record('c'); // c → d
  assert.deepEqual(h.steps('d'), { list: ['a', 'b', 'c', 'd'], at: 3 });
  // Back to the second value: the two after it stay on the redo side.
  const now = h.jump('d', 1);
  assert.equal(now, 'b');
  assert.deepEqual(h.steps(now), { list: ['a', 'b', 'c', 'd'], at: 1 });
  // Ahead to the last one again, then back to the start.
  assert.equal(h.jump(now, 3), 'd');
  assert.equal(h.jump('d', 0), 'a');
  assert.deepEqual(h.steps('a'), { list: ['a', 'b', 'c', 'd'], at: 0 });
  // A jump to where it already is changes nothing; past the end it stops at the last value.
  assert.equal(h.jump('a', 0), 'a');
  assert.equal(h.jump('a', 9), 'd');
});

test('result state: defaults plus overrides, separate histories', () => {
  const s = createResultState({ slopeTolerance: false });
  assert.equal(s.settings.slopeTolerance, false);
  assert.equal(s.settings.lengthStuds, DEFAULT_SETTINGS.lengthStuds);
  assert.notEqual(s.paintHistory, s.editHistory);
  assert.equal(createResultState().settings.slopeTolerance, DEFAULT_SETTINGS.slopeTolerance);
});
