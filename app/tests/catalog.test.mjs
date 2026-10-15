import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRICKS, PLATES, hasTile } from '../src/core/parts.mjs';
import { PART_IDS, ldrawId, shapeKey, availability, isAvailable, partAvailable } from '../src/core/catalog.mjs';
import { PALETTE } from '../src/core/palette.mjs';
import { buildModel } from '../src/convert/build.mjs';
import { boxesMesh } from './helpers.mjs';
import AVAILABILITY from '../src/data/availability.json' with { type: 'json' };

test('every brick, plate and tile footprint has a part number', () => {
  for (const s of [...BRICKS, ...PLATES]) assert.ok(ldrawId(s), shapeKey(s));
  for (const s of PLATES.filter((p) => hasTile(p.w, p.d))) assert.ok(ldrawId({ ...s, kind: 'tile' }));
});

test('shape key puts the short side first', () => {
  assert.equal(shapeKey({ kind: 'plate', w: 4, d: 2 }), 'plate:2x4');
  assert.equal(ldrawId({ kind: 'brick', w: 4, d: 2 }), '3001');
  assert.equal(ldrawId({ kind: 'slope', ldraw: '3039' }), '3039');
});

test('availability table covers every part and only palette colours', () => {
  const codes = new Set(PALETTE.map((c) => String(c.code)));
  for (const id of PART_IDS) {
    assert.ok(AVAILABILITY.parts[id], id);
    for (const code of Object.keys(AVAILABILITY.parts[id])) assert.ok(codes.has(code), `${id}/${code}`);
  }
});

test('known combinations', () => {
  assert.ok(isAvailable('3001', 15)); // white 2x4 brick: in thousands of sets
  assert.ok(availability('3001', 15).sets > 1000);
  assert.equal(isAvailable('3007', 322), false); // 2x8 brick never made in Medium Azure
  assert.equal(availability('3040b', 226), null);
});

test('1x1 brick and 1x1 plate exist in every palette colour, so layout can always fill a cell', () => {
  for (const c of PALETTE) {
    assert.ok(isAvailable('3005', c.code), `brick 1x1 / ${c.code}`);
    assert.ok(isAvailable('3024', c.code), `plate 1x1 / ${c.code}`);
  }
});

test('the whole instant layer only uses parts made in their colour', () => {
  // Long slabs in colours where the long plates / 2x8 brick were never made:
  // Bright Light Yellow (2x10, 2x16 plates, 2x3 brick), Dark Brown (2x8 brick and plate).
  const colours = [[255, 236, 108], [53, 33, 0], [0, 133, 43]];
  const boxes = colours.map((rgb, i) => [[0, i * 0.3, 0], [2, i * 0.3 + 0.3, 0.25], rgb]);
  for (const lengthStuds of [16, 24, 32]) {
    const model = buildModel(boxesMesh(boxes), { lengthStuds });
    const bad = model.result.parts.filter((p) => !partAvailable(p));
    assert.deepEqual(bad.map((p) => `${ldrawId(p)}/${PALETTE[p.color - 1].code}`), [], `${lengthStuds} stud`);
  }
});
