// Small builders and invariants shared by the pipeline tests.
import assert from 'node:assert/strict';
import { VoxelGrid } from '../src/core/grid.mjs';

/**
 * Grid from per-layer ASCII rows, bottom layer first. Each layer is an array
 * of z rows, each row a string along x; '.' is empty, a digit is a cell value.
 * @param {string[][]} layers
 */
export function gridFrom(layers) {
  const sy = layers.length;
  const sz = layers[0].length;
  const sx = layers[0][0].length;
  const grid = new VoxelGrid(sx, sy, sz);
  layers.forEach((rows, y) =>
    rows.forEach((row, z) =>
      [...row].forEach((ch, x) => {
        if (ch !== '.') grid.set(x, y, z, Number(ch));
      }),
    ),
  );
  return grid;
}

/** Fill a box of cells [x0, x1) × [y0, y1) × [z0, z1) with `value`. */
export function fillBox(grid, [x0, y0, z0], [x1, y1, z1], value) {
  for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) grid.set(x, y, z, value);
}

/** Layout-style result from hand-placed parts: ids and owner filled in. */
export function resultFrom(grid, parts) {
  const owner = new Int32Array(grid.cells.length).fill(-1);
  const placed = parts.map((p, id) => ({ kind: 'plate', h: 1, color: 1, ...p, id }));
  for (const p of placed) {
    for (let y = p.y; y < p.y + p.h; y++)
      for (let z = p.z; z < p.z + p.d; z++) for (let x = p.x; x < p.x + p.w; x++) owner[grid.index(x, y, z)] = p.id;
  }
  return { parts: placed, owner };
}

/**
 * Every filled cell belongs to exactly one part, no empty cell does, part ids
 * match their index, and each part owns at least one cell.
 */
export function assertTiling(grid, { parts, owner }) {
  const owned = new Int32Array(parts.length);
  for (let i = 0; i < grid.cells.length; i++) {
    const filled = grid.cells[i] !== 0;
    const o = owner[i];
    assert.equal(o >= 0, filled, `cell ${i}: filled=${filled} owner=${o}`);
    if (o >= 0) owned[o]++;
  }
  parts.forEach((p, i) => {
    assert.equal(p.id, i, 'part id equals its index');
    assert.ok(owned[i] > 0, `part ${i} (${p.kind}) owns no cell`);
  });
}

/**
 * Closed axis-aligned box as a ColouredMesh with one sRGB colour.
 * @param {[number, number, number]} min
 * @param {[number, number, number]} max
 * @param {[number, number, number]} rgb
 */
export function boxMesh(min, max, rgb) {
  return meshFrom([boxTriangles(min, max)], [rgb]);
}

/** Several boxes, each with its own colour, as one ColouredMesh. */
export function boxesMesh(boxes) {
  return meshFrom(
    boxes.map(([min, max]) => boxTriangles(min, max)),
    boxes.map(([, , rgb]) => rgb),
  );
}

function boxTriangles([x0, y0, z0], [x1, y1, z1]) {
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const quads = [
    [0, 3, 2, 1], [4, 5, 6, 7], // z faces
    [0, 1, 5, 4], [3, 7, 6, 2], // y faces
    [0, 4, 7, 3], [1, 2, 6, 5], // x faces
  ];
  const tris = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
  return { v, tris };
}

function meshFrom(shapes, colours) {
  const positions = [];
  const indices = [];
  const triColour = [];
  shapes.forEach(({ v, tris }, s) => {
    const base = positions.length / 3;
    for (const p of v) positions.push(...p);
    for (const t of tris) {
      indices.push(base + t[0], base + t[1], base + t[2]);
      triColour.push(colours[s]);
    }
  });
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    colourAt: (tri) => triColour[tri],
  };
}
