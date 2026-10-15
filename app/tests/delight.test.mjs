import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colouredMesh } from '../src/core/mesh-data.mjs';
import { delight } from '../src/convert/delight.mjs';
import { nearestCell, cellValue } from '../src/core/palette.mjs';

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const LIGHT = [0.4, 1, 0.3].map((v, _, a) => v / Math.hypot(...a));

/**
 * A UV sphere in one material colour (sRGB 0–1). With `k`, Lambert shading
 * (ambient 1 − k) is baked into the vertex colours, as an image-to-3D texture
 * would carry it.
 */
function sphere(color, k = 0) {
  const rows = 16;
  const cols = 32;
  const positions = [];
  const vcols = [];
  for (let i = 0; i <= rows; i++) {
    const th = (Math.PI * i) / rows;
    for (let j = 0; j <= cols; j++) {
      const ph = (2 * Math.PI * j) / cols;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      positions.push(...n);
      const s = 1 - k + k * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      const g = srgb(s); // shading in sRGB, multiplied with the material colour by colourAt
      vcols.push(g, g, g);
    }
  }
  const indices = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b); // outward (counter-clockwise seen from outside)
    }
  }
  const data = {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    uvs: new Float32Array((positions.length / 3) * 2),
    vcols: new Float32Array(vcols),
    triMaterial: new Uint32Array(indices.length / 3),
    materials: [{ color, pixels: null }],
  };
  return colouredMesh(data);
}

/** Share of triangles whose centre colour snaps to `cell`. */
function share(mesh, cell) {
  let n = 0;
  for (let t = 0; t < mesh.triangles; t++) if (nearestCell(...mesh.colourAt(t, 1 / 3, 1 / 3)) === cell) n++;
  return n / mesh.triangles;
}

// LDraw Orange (25), #D67923.
const ORANGE = [0xd6 / 255, 0x79 / 255, 0x23 / 255];

test('baked shading on a one-colour sphere is taken out', () => {
  const orange = cellValue(25);
  const baked = sphere(ORANGE, 0.5);
  const before = share(baked, orange);
  const after = share(delight(baked), orange);
  assert.ok(before < 0.6, `shaded sphere snaps mostly elsewhere (${before})`);
  assert.ok(after > 0.95, `after delighting ${after}`);
  assert.ok(delight(baked).delit.darkest < 0.8);
});

test('an evenly lit sphere is left as it is', () => {
  const plain = sphere(ORANGE);
  const out = delight(plain);
  assert.equal(share(out, cellValue(25)), 1);
  assert.ok(out.delit.darkest > 0.99, `darkest ${out.delit.darkest}`);
});

test('the fit is cached per mesh', () => {
  const baked = sphere(ORANGE, 0.5);
  assert.equal(delight(baked), delight(baked));
});
