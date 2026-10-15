import { VoxelGrid } from '../core/grid.mjs';
import { STUD_TO_PLATE } from '../core/parts.mjs';
import { paintPatches } from './shades.mjs';

/** Axis-aligned bounds of one or more meshes with `positions` arrays. */
export function meshBounds(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of parts) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], positions[i + a]);
        max[a] = Math.max(max[a], positions[i + a]);
      }
    }
  }
  return { min, max };
}

/** Small offset keeps rays off shared triangle edges, which would double-count hits. */
export const RAY_JITTER_X = 0.5 + 1.37e-4;
export const RAY_JITTER_Z = 0.5 + 2.91e-4;

/**
 * @typedef {object} ColouredMesh
 * @property {Float32Array} positions world-space xyz
 * @property {Uint32Array} indices triangle list
 * @property {(tri: number, u: number, w: number) => [number, number, number]} colourAt
 *   sRGB 0–255 at barycentric (u, w) of triangle `tri` (index into the triangle list)
 */

/**
 * Voxelize one textured or vertex-coloured mesh, e.g. from an image-to-3D
 * service, into palette colours. Real meshes are often not watertight, so a
 * cell is inside when rays along at least two of the three axes say so; every
 * cell the surface passes through is filled too. Each surface cell takes the
 * colour of the ray hit nearest to its centre; interior cells copy the
 * nearest coloured cell (they are hidden anyway, and matching colours lets
 * layout use bigger parts).
 *
 * @param {ColouredMesh} mesh
 * @param {number} lengthStuds longest horizontal extent in studs
 * @param {(r: number, g: number, b: number) => number} toCell sRGB → grid value
 * @param {{ step?: number, span?: number }} [shades] patches of one paint map to one colour (`shades.mjs`); off by default
 * @returns {VoxelGrid}
 */
export function voxelizeColoured(mesh, lengthStuds, toCell, shades = {}) {
  const bounds = meshBounds([mesh]);
  const scale = lengthStuds / Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
  const k = [scale, scale * STUD_TO_PLATE, scale];
  const dims = [0, 1, 2].map((a) => Math.ceil((bounds.max[a] - bounds.min[a]) * k[a]) + 1);
  const grid = new VoxelGrid(dims[0], dims[1], dims[2]);
  const n = grid.cells.length;

  const v = new Float32Array(mesh.positions.length);
  for (let i = 0; i < v.length; i++) v[i] = (mesh.positions[i] - bounds.min[i % 3]) * k[i % 3];

  const votes = new Uint8Array(n);
  const hitTri = new Int32Array(n).fill(-1);
  const hitU = new Float32Array(n);
  const hitW = new Float32Array(n);
  const hitDist = new Float32Array(n).fill(Infinity);
  const cellIndex = (c) => grid.index(c[0], c[1], c[2]);

  for (let axis = 0; axis < 3; axis++) {
    const p = (axis + 1) % 3;
    const q = (axis + 2) % 3;
    const bins = binTriangles(v, mesh.indices, p, q, dims[p]);
    const cell = [0, 0, 0];
    const hits = [];
    for (const [key, tris] of bins) {
      const cp = key % dims[p];
      const cq = (key - cp) / dims[p];
      if (cq >= dims[q]) continue;
      const rp = cp + RAY_JITTER_X;
      const rq = cq + RAY_JITTER_Z;
      hits.length = 0;
      for (const t of tris) {
        const h = rayHit(v, mesh.indices, t, axis, p, q, rp, rq);
        if (h) hits.push(h);
      }
      if (!hits.length) continue;
      hits.sort((x, y) => x.d - y.d);
      cell[p] = cp;
      cell[q] = cq;

      // Surface colour: every hit offers its colour to the cell it lands in.
      for (const h of hits) {
        const ca = Math.min(dims[axis] - 1, Math.max(0, Math.floor(h.d)));
        cell[axis] = ca;
        const i = cellIndex(cell);
        const dist = Math.abs(h.d - (ca + 0.5));
        if (dist < hitDist[i]) {
          hitDist[i] = dist;
          hitTri[i] = h.t;
          hitU[i] = h.u;
          hitW[i] = h.w;
        }
      }
      // Inside vote: parity between consecutive hits.
      for (let j = 0; j + 1 < hits.length; j += 2) {
        const a0 = Math.max(0, Math.ceil(hits[j].d - 0.5));
        const a1 = Math.min(dims[axis] - 1, Math.floor(hits[j + 1].d - 0.5));
        for (let a = a0; a <= a1; a++) {
          cell[axis] = a;
          votes[cellIndex(cell)]++;
        }
      }
    }
  }

  // Fill, colour surface cells, then spread colour inward breadth-first.
  // A cell the surface passes through is always filled, so parts thinner
  // than one cell (legs, ears, tails) survive.
  const queue = [];
  for (let i = 0; i < n; i++) {
    if (votes[i] < 2 && hitTri[i] < 0) continue;
    if (hitTri[i] >= 0) queue.push(i);
    else grid.cells[i] = 255; // filled, colour pending
  }
  // Surface colours, mapped one patch of paint at a time (shades.mjs).
  const rgb = new Float64Array(queue.length * 3);
  queue.forEach((i, k) => rgb.set(mesh.colourAt(hitTri[i], hitU[i], hitW[i]), k * 3));
  const values = paintPatches(grid, queue, rgb, toCell, shades);
  queue.forEach((i, k) => {
    grid.cells[i] = values[k];
  });
  const { sx, sz } = grid;
  const steps = [1, -1, sx, -sx, sx * sz, -sx * sz];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (const s of steps) {
      const j = i + s;
      if (j < 0 || j >= n || grid.cells[j] !== 255) continue;
      // Reject wrap-around along x and z.
      if ((s === 1 || s === -1) && Math.floor(j / sx) !== Math.floor(i / sx)) continue;
      if ((s === sx || s === -sx) && Math.floor(j / (sx * sz)) !== Math.floor(i / (sx * sz))) continue;
      grid.cells[j] = grid.cells[i];
      queue.push(j);
    }
  }
  for (let i = 0; i < n; i++) if (grid.cells[i] === 255) grid.cells[i] = 0;
  return grid;
}

/** Bin triangles by the (p, q) grid columns their bounding box covers. */
function binTriangles(v, indices, p, q, dimP) {
  const bins = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const p0 = Math.floor(Math.min(v[a + p], v[b + p], v[c + p]));
    const p1 = Math.floor(Math.max(v[a + p], v[b + p], v[c + p]));
    const q0 = Math.floor(Math.min(v[a + q], v[b + q], v[c + q]));
    const q1 = Math.floor(Math.max(v[a + q], v[b + q], v[c + q]));
    for (let cp = Math.max(0, p0); cp <= p1 && cp < dimP; cp++) {
      for (let cq = Math.max(0, q0); cq <= q1; cq++) {
        const key = cq * dimP + cp;
        let list = bins.get(key);
        if (!list) bins.set(key, (list = []));
        list.push(t / 3);
      }
    }
  }
  return bins;
}

/** Where the line along `axis` through (rp, rq) crosses triangle `t`, with barycentrics. */
function rayHit(v, indices, t, axis, p, q, rp, rq) {
  const a = indices[t * 3] * 3;
  const b = indices[t * 3 + 1] * 3;
  const c = indices[t * 3 + 2] * 3;
  const e1p = v[b + p] - v[a + p], e1q = v[b + q] - v[a + q];
  const e2p = v[c + p] - v[a + p], e2q = v[c + q] - v[a + q];
  const det = e1p * e2q - e2p * e1q;
  if (Math.abs(det) < 1e-12) return null;
  const dp = rp - v[a + p], dq = rq - v[a + q];
  const u = (dp * e2q - e2p * dq) / det;
  const w = (e1p * dq - dp * e1q) / det;
  if (u < 0 || w < 0 || u + w > 1) return null;
  const d = v[a + axis] + u * (v[b + axis] - v[a + axis]) + w * (v[c + axis] - v[a + axis]);
  return { d, t, u, w };
}
