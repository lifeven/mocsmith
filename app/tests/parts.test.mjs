import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PART_TYPES, BRICKS, PLATES, SLOPES, ROUND_PARTS, hasTile, tileShapes, partType, typeById, typeOfFootprint, studsOnTop, slopeCells,
} from '../src/core/parts.mjs';
import { LDRAW_IDS, SLOPE_IDS } from '../src/core/catalog.mjs';

// The part table (`core/parts.mjs`) replaced hand-written lists. These pin the
// derived lists to what they were, in order: layout, repair and the slope pass
// try shapes in this order, so a change here changes every model.

test('the derived shape lists keep their order', () => {
  const sizes = (list) => list.map((s) => `${s.w}x${s.d}`).join(' ');
  assert.equal(sizes(BRICKS), '2x8 2x6 1x8 2x4 1x6 2x3 1x4 2x2 1x3 1x2 1x1');
  assert.equal(sizes(PLATES), '2x16 2x12 2x10 1x12 2x8 2x6 1x8 2x4 1x6 2x3 1x4 2x2 1x3 1x2 1x1');
  assert.deepEqual(BRICKS[0], { kind: 'brick', w: 2, d: 8, h: 3 });
  assert.deepEqual(PLATES[0], { kind: 'plate', w: 2, d: 16, h: 1 });
  assert.deepEqual(tileShapes(1), [8, 6, 4, 3, 2, 1]);
  assert.deepEqual(tileShapes(2), [6, 4, 2]);
  assert.ok(hasTile(4, 2) && !hasTile(2, 3));
  assert.deepEqual(SLOPES, [
    { key: 'slope_45_2x2', ldraw: '3039', studs: 1, slope: 1, width: 2 },
    { key: 'slope_33_3x1', ldraw: '4286', studs: 1, slope: 2, width: 1 },
    { key: 'slope_45_2x1', ldraw: '3040b', studs: 1, slope: 1, width: 1 },
  ]);
});

test('part numbers come from the table, in size order', () => {
  assert.equal(Object.keys(LDRAW_IDS).join(' '), [
    'brick:1x1 brick:1x2 brick:1x3 brick:1x4 brick:1x6 brick:1x8 brick:2x2 brick:2x3 brick:2x4 brick:2x6 brick:2x8',
    'plate:1x1 plate:1x2 plate:1x3 plate:1x4 plate:1x6 plate:1x8 plate:1x12 plate:2x2 plate:2x3 plate:2x4 plate:2x6',
    'plate:2x8 plate:2x10 plate:2x12 plate:2x16',
    'tile:1x1 tile:1x2 tile:1x3 tile:1x4 tile:1x6 tile:1x8 tile:2x2 tile:2x4 tile:2x6',
  ].join(' '));
  assert.equal(LDRAW_IDS['plate:1x12'], '60479');
  assert.equal(LDRAW_IDS['tile:2x2'], '3068b');
  assert.deepEqual(SLOPE_IDS, ['3039', '4286', '3040b']);
});

test('every record has a unique part number and a sane shape', () => {
  const ids = PART_TYPES.map((t) => t.ldraw);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of PART_TYPES) {
    assert.ok(t.w <= t.d || t.slope, `${t.ldraw}: short side first`);
    assert.equal(t.h, t.kind === 'brick' || t.slope ? 3 : 1, t.ldraw);
    assert.equal(t.top, t.kind === 'tile' ? 'smooth' : 'studs', t.ldraw);
    assert.equal(typeById(t.ldraw), t);
  }
});

test('a part finds its record by number, else by kind and footprint', () => {
  assert.equal(partType({ kind: 'brick', w: 4, d: 2 }).ldraw, '3001');
  assert.equal(partType({ kind: 'tile', w: 1, d: 2 }).ldraw, '3069b');
  assert.equal(partType({ kind: 'slope', ldraw: '4286', w: 3, d: 1 }).slope.key, 'slope_33_3x1');
  assert.equal(partType({ kind: 'plate', w: 3, d: 3 }), undefined);
  assert.equal(typeOfFootprint('plate', 12, 1).ldraw, '60479');
});

test('round parts are found by number only; the square part keeps its footprint', () => {
  assert.deepEqual(ROUND_PARTS.map((t) => `${t.ldraw} ${t.kind} ${t.w}x${t.d} ${t.top}`), [
    '3062b brick 1x1 studs', '3941 brick 2x2 studs',
    '6141 plate 1x1 studs', '4032b plate 2x2 studs',
    '98138 tile 1x1 smooth', '14769 tile 2x2 smooth',
  ]);
  assert.equal(partType({ kind: 'brick', w: 1, d: 1 }).ldraw, '3005', 'a plain 1×1 brick is still square');
  assert.equal(partType({ kind: 'brick', ldraw: '3062b', w: 1, d: 1 }).round, true);
  assert.equal(typeOfFootprint('tile', 2, 2).ldraw, '3068b');
  assert.equal(LDRAW_IDS['plate:1x1'], '3024');
  assert.ok(studsOnTop({ kind: 'plate', ldraw: '6141', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, 0));
  assert.ok(!studsOnTop({ kind: 'tile', ldraw: '98138', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, 0));
});

test('studs on top: top layer only, never on a tile or a sloped face', () => {
  const brick = { kind: 'brick', x: 0, y: 3, z: 0, w: 2, d: 2, h: 3 };
  assert.ok(studsOnTop(brick, 5));
  assert.ok(!studsOnTop(brick, 4));
  assert.ok(!studsOnTop({ kind: 'tile', x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, 0));
  const slope = { kind: 'slope', ldraw: '3040b', dir: [1, 0], studs: 1, x: 0, y: 0, z: 0, w: 2, d: 1, h: 3 };
  const cells = slopeCells(slope);
  // Stud row (x = 0) full height, the sloped row (x = 1) only its bottom plate.
  assert.deepEqual(cells, [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 0, 0]]);
  assert.ok(studsOnTop(slope, 2));
  assert.ok(!studsOnTop(slope, 0)); // the cell under the sloped face
});
