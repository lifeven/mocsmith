import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../src/data/mosaic-colours.json', import.meta.url), 'utf8'));

test('mosaic colour table: every listed colour is defined, opaque and has an RGB', () => {
  for (const [part, byColour] of Object.entries(data.parts)) {
    for (const [code, [sets, last, element]] of Object.entries(byColour)) {
      const c = data.colours[code];
      assert.ok(c, `${part} colour ${code} has no definition`);
      assert.match(c.rgb, /^[0-9a-f]{6}$/);
      assert.ok(sets > 0 || element === 1, `${part}/${code} is in no set and has no element id`);
      assert.ok(sets === 0 || last >= 1949, `${part}/${code} last year ${last}`);
    }
  }
  assert.ok(!Object.values(data.colours).some((c) => /trans/i.test(c.name)), 'no transparent colours');
});

test('mosaic colour table: the four surface parts come in plenty of common plain colours', () => {
  assert.deepEqual(Object.keys(data.surface).sort(), ['3024', '3070b', '6141', '98138']);
  for (const part of Object.keys(data.surface)) {
    const common = Object.entries(data.parts[part]).filter(([code, [sets]]) => !data.colours[code].special && sets >= 10);
    assert.ok(common.length >= 30, `${part}: only ${common.length} common plain colours`);
    for (const code of ['0', '15', '4', '1', '14', '71', '72']) assert.ok(data.parts[part][code], `${part} missing colour ${code}`);
  }
});

test('mosaic colour table: the LEGO Art panel only comes in a few colours', () => {
  const panel = Object.keys(data.parts['65803']);
  assert.ok(panel.length > 0 && panel.length <= 8, `65803 in ${panel.length} colours`);
  assert.ok(data.parts['65803']['0'], '65803 in black');
});
