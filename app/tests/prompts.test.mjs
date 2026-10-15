import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUGGESTED_PROMPT } from '../src/services/prompts.mjs';

test('the suggested prompt keeps the rules that make a picture brick-friendly', () => {
  const p = SUGGESTED_PROMPT;
  assert.match(p, /\[what you want to build/); // the one part people replace
  for (const rule of [/standard LEGO bricks, plates, slopes and tiles/, /at most 6 solid colors/, /no floating pieces/, /no baseplate/, /One object only/, /Plain light gray background/, /Matte/, /No text/]) {
    assert.match(p, rule);
  }
  assert.ok(p.length < 2000, 'short enough to paste anywhere');
});
