import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boxShape, slopeShape, roundShape, partMatrix, shapeOf, shapeKeyOf, turnOver, PLATE_H, STUD_H, GAP } from '../src/render/shapes.mjs';
import { typeById } from '../src/core/parts.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

/** World-space bounding box of a part's shape placed by its instance matrix. */
function worldBox(p) {
  return shapeOf(p).boundingBox.clone().applyMatrix4(partMatrix(p));
}

test('a brick is one geometry: body plus its studs, gap only on the outside', () => {
  const g = boxShape('brick', 2, 4, 3);
  const b = g.boundingBox;
  near(b.min.x, -2 + GAP / 2, 'x min');
  near(b.max.z, 1 - GAP / 2, 'z max');
  near(b.max.y, 3 * PLATE_H + STUD_H, 'top of studs');
  assert.equal(boxShape('brick', 2, 4, 3), g, 'shapes are cached');
});

test('tiles have no studs', () => {
  near(boxShape('tile', 1, 2, 1).boundingBox.max.y, PLATE_H - GAP / 4, 'tile top');
});

test('round parts: a cylinder inside the square footprint, studs like the square part', () => {
  // Stud i of an n-wide top spans [i + 0.2, i + 0.8] − n/2, so floor(x + n/2) names it.
  const studsOf = (g, height, n) => {
    const pos = g.getAttribute('position');
    const tops = new Set();
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > height + 1e-6) tops.add(`${Math.floor(pos.getX(i) + n / 2)},${Math.floor(pos.getZ(i) + n / 2)}`);
    }
    return tops.size;
  };
  for (const [ldraw, n, h, studded] of [['3062b', 1, 3, true], ['3941', 2, 3, true], ['6141', 1, 1, true], ['4032b', 2, 1, true], ['98138', 1, 1, false], ['14769', 2, 1, false]]) {
    const g = roundShape(ldraw);
    const b = g.boundingBox;
    near(b.max.x, (n - GAP) / 2, `${ldraw} radius`);
    near(b.min.z, -(n - GAP) / 2, `${ldraw} radius z`);
    near(b.min.y, GAP / 4, `${ldraw} bottom`);
    near(b.max.y, h * PLATE_H + (studded ? STUD_H : -GAP / 4), `${ldraw} top`);
    assert.equal(studsOf(g, h * PLATE_H, n), studded ? n * n : 0, `${ldraw} studs`);
    const p = { kind: typeById(ldraw).kind, ldraw, x: 3, y: 2, z: 5, w: n, d: n, h };
    assert.equal(shapeOf(p), g);
    assert.equal(shapeKeyOf(p), `round:${ldraw}`);
    const w = worldBox(p);
    near(w.min.x, 3 + GAP / 2, `${ldraw} placed x`);
    near(w.max.z, 5 + n - GAP / 2, `${ldraw} placed z`);
  }
  assert.equal(shapeKeyOf({ kind: 'brick', x: 0, y: 0, z: 0, w: 1, d: 1, h: 3 }), 'brick:1x1', 'square 1×1 unchanged');
});

test('a slope is one prism: studs only on the uphill row, face down to a low lip', () => {
  const g = slopeShape('4286'); // 33° 3x1: one stud row, two studs of slope
  const pos = g.getAttribute('position');
  let studMinX = Infinity;
  let studMaxX = -Infinity;
  let frontTop = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const [x, y] = [pos.getX(i), pos.getY(i)];
    if (y > 3 * PLATE_H) [studMinX, studMaxX] = [Math.min(studMinX, x), Math.max(studMaxX, x)];
    if (x > 1.5 - GAP) frontTop = Math.max(frontTop, y);
  }
  assert.ok(studMinX >= -1.5 && studMaxX <= -0.5 + 1e-6, `studs over the back row: ${studMinX}..${studMaxX}`);
  near(frontTop, (3 * PLATE_H) / 6, 'front lip height (4 of 24 LDU)');
});

test('instance matrices put each shape on its grid box, in every orientation', () => {
  const grid = (p) => [p.x + GAP / 2, p.x + p.w - GAP / 2, p.z + GAP / 2, p.z + p.d - GAP / 2];
  for (const p of [
    { kind: 'brick', x: 3, y: 6, z: 1, w: 4, d: 2, h: 3 },
    { kind: 'brick', x: 3, y: 6, z: 1, w: 2, d: 4, h: 3 },
    { kind: 'plate', x: 0, y: 0, z: 5, w: 1, d: 6, h: 1 },
  ]) {
    const b = worldBox(p);
    const [x0, x1, z0, z1] = grid(p);
    near(b.min.x, x0, `${shapeKeyOf(p)} x0`);
    near(b.max.x, x1, `${shapeKeyOf(p)} x1`);
    near(b.min.z, z0, `${shapeKeyOf(p)} z0`);
    near(b.max.z, z1, `${shapeKeyOf(p)} z1`);
    near(b.min.y, p.y * PLATE_H + GAP / 4, 'bottom');
  }
});

test('slopes turn to face downhill: the stud row is at the uphill end', () => {
  const base = { kind: 'slope', ldraw: '4286', studs: 1, y: 0, h: 3 };
  const cases = [
    [{ dir: [1, 0], x: 0, z: 0, w: 3, d: 1 }, (v) => v.x < 1],
    [{ dir: [-1, 0], x: 0, z: 0, w: 3, d: 1 }, (v) => v.x > 2],
    [{ dir: [0, 1], x: 0, z: 0, w: 1, d: 3 }, (v) => v.z < 1],
    [{ dir: [0, -1], x: 0, z: 0, w: 1, d: 3 }, (v) => v.z > 2],
  ];
  for (const [shape, onUphillRow] of cases) {
    const p = { ...base, ...shape };
    const m = partMatrix(p);
    const pos = shapeOf(p).getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.y > 3 * PLATE_H + 1e-6) assert.ok(onUphillRow(v), `dir ${p.dir}: stud at ${v.x.toFixed(2)},${v.z.toFixed(2)}`);
    }
  }
});

test('turnOver: a hanging column stands upside down on the ground, its top part now at the bottom', () => {
  // Two 1×2 plates hanging high up: the upper one (y 9) was attached to the model, the lower one (y 8) hangs from it.
  const upper = { x: 3, y: 9, z: 1, w: 2, d: 1, h: 1, kind: 'plate' };
  const lower = { x: 3, y: 8, z: 1, w: 2, d: 1, h: 1, kind: 'plate' };
  const turn = turnOver([upper, lower]);
  const place = (p) => new THREE.Vector3().setFromMatrixPosition(partMatrix(p).premultiply(turn));
  // partMatrix puts the shape origin at the part's bottom face; turned over that face is on top.
  assert.ok(Math.abs(place(upper).y - PLATE_H) < 1e-9); // upper's bottom face is now at one plate up: its body fills 0..1 plate
  assert.ok(Math.abs(place(lower).y - 2 * PLATE_H) < 1e-9);
  // Footprint stays where it was (x, z centre unchanged), and the studs now point down.
  assert.ok(Math.abs(place(upper).x - 4) < 1e-9 && Math.abs(place(upper).z - 1.5) < 1e-9);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(partMatrix(upper).premultiply(turn));
  assert.ok(up.y < -0.999);
});
