import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { framesSphere, moveMs, orbitOffset } from '../src/render/camera.mjs';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

test('orbitOffset: swings around the target at a steady distance instead of cutting through', () => {
  const a = v(10, 0, 0);
  const b = v(0, 0, 10);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(Math.abs(orbitOffset(a, b, t).length() - 10) < 1e-9, `distance at t=${t}`);
  }
  assert.ok(orbitOffset(a, b, 0).distanceTo(a) < 1e-9);
  assert.ok(orbitOffset(a, b, 1).distanceTo(b) < 1e-9);
  // Halfway is halfway round (45°), where a straight line would be at 7.07.
  const mid = orbitOffset(a, b, 0.5);
  assert.ok(Math.abs(mid.angleTo(a) - Math.PI / 4) < 1e-9);
  // Distance changes geometrically: 10 -> 40 is 20 halfway.
  assert.ok(Math.abs(orbitOffset(a, v(0, 0, 40), 0.5).length() - 20) < 1e-9);
  // Opposite directions still give a finite path of the right length.
  const across = orbitOffset(a, v(-10, 0, 0), 0.5);
  assert.ok(Number.isFinite(across.x) && Math.abs(across.length() - 10) < 1e-9);
  assert.ok(orbitOffset(v(0, 10, 0), v(0, -10, 0), 0.5).length() > 9);
});

test('moveMs: 0.7 s for a small move, longer for a bigger swing, never over 1.4 s', () => {
  assert.equal(moveMs(0, 0, 0), 700);
  assert.ok(moveMs(Math.PI / 4, 0.1, 0) > moveMs(0.05, 0.1, 0));
  assert.ok(moveMs(Math.PI, 2, 2) <= 1400);
  assert.equal(moveMs((2 * Math.PI) / 3, 0, 0), 1200);
});

test('framesSphere: stays while the parts are in the free part of the picture and not too far away', () => {
  const position = v(0, 0, 20);
  const look = v(0, 0, 0);
  const lens = { fov: 35, aspect: 1.5, ideal: 20 };
  assert.ok(framesSphere(position, look, v(0, 0, 0), 2, lens));
  assert.ok(!framesSphere(position, look, v(9, 0, 0), 2, lens), 'off to the side');
  assert.ok(!framesSphere(position, look, v(0, 0, 0), 7, lens), 'too big to fit');
  assert.ok(!framesSphere(v(0, 0, 40), look, v(0, 0, 0), 2, lens), 'more than 1.6x the distance it would move to');
  assert.ok(!framesSphere(position, look, v(0, 0, 30), 2, lens), 'behind the camera');
  // A step bar over the lower 40% of the picture: parts low in the picture no longer count as framed.
  assert.ok(framesSphere(position, look, v(0, -3, 0), 1, lens));
  assert.ok(!framesSphere(position, look, v(0, -3, 0), 1, { ...lens, bottom: 0.4 }));
  assert.ok(framesSphere(position, look, v(0, 1.5, 0), 1, { ...lens, bottom: 0.4 }));
});
