/**
 * Taking light and shadow out of a mesh's colours before they are matched to
 * LEGO colours.
 *
 * Textures made by image-to-3D models carry the lighting of the photo: one
 * orange surface comes out orange on top and dark orange / reddish brown on
 * the shaded side, and every shaded cell picks a darker LEGO colour.
 *
 * Assumption: the baked shading depends only on which way the surface faces,
 * and is the same for the whole model. Its logarithm is fitted as a
 * second-order spherical-harmonic function of the normal (9 terms; irradiance
 * from any distant lighting is close to this, Ramamoorthi & Hanrahan 2001).
 * The evidence is pairs of triangles that share an edge, face different ways
 * and have about the same chromaticity, and whose UVs, vertex colours and
 * material are continuous across the edge: if they differ in brightness, the
 * fit should explain it by their normals. Pairs that disagree (a real colour
 * change) are down-weighted (Huber). The shading is then divided out of
 * `colourAt`, taking the brightest direction present as fully lit.
 *
 * It cannot tell a designed colour change that lines up with orientation
 * (dark roofs on light walls) from shading, so it is off by default and meant
 * for models with baked light.
 */

/** Second-order real spherical harmonics without the constant term. */
const basis = (x, y, z) => [y, z, x, x * y, y * z, 3 * z * z - 1, x * z, x * x - y * y];
const TERMS = 8;
/** Pairs closer than this in rg-chromaticity count as "the same colour, lit differently". */
const MAX_CHROMA = 0.03;
/** Normals must differ by more than this for a pair to say anything about shading. */
const MIN_ANGLE_COS = Math.cos((10 * Math.PI) / 180);
/** Huber threshold on the log-luminance residual. */
const HUBER = 0.1;
const MIN_PAIRS = 16;

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const cache = new WeakMap();

/**
 * The mesh with its baked shading divided out (cached per mesh). `delit`
 * reports how many pairs the fit used and how dark the darkest direction was
 * found to be (1 = no shading found).
 *
 * @template {import('./voxelize.mjs').ColouredMesh & { triangles: number, data: import('../core/mesh-data.mjs').MeshData }} M
 * @param {M} mesh
 * @returns {M & { delit: { pairs: number, darkest: number } }}
 */
export function delight(mesh) {
  if (!cache.has(mesh)) cache.set(mesh, build(mesh));
  return cache.get(mesh);
}

function build(mesh) {
  const { positions: P, indices: I, triangles: T } = mesh;
  const normal = new Float64Array(T * 3);
  const area = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    const a = I[t * 3] * 3;
    const b = I[t * 3 + 1] * 3;
    const c = I[t * 3 + 2] * 3;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    area[t] = len / 2;
    normal[t * 3] = n[0] / len;
    normal[t * 3 + 1] = n[1] / len;
    normal[t * 3 + 2] = n[2] / len;
  }
  const rows = foldPairs(mesh, normal, area);
  const unchanged = { ...mesh, delit: { pairs: rows.length, darkest: 1 } };
  if (rows.length < MIN_PAIRS) return unchanged;
  const coef = fit(rows);

  // Shading per triangle; the brightest direction present (by area) is fully lit.
  const shade = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    const b = basis(normal[t * 3], normal[t * 3 + 1], normal[t * 3 + 2]);
    let s = 0;
    for (let k = 0; k < TERMS; k++) s += b[k] * coef[k];
    shade[t] = Math.exp(s);
  }
  const order = [...shade.keys()].sort((a, b) => shade[a] - shade[b]);
  const total = area.reduce((a, v) => a + v, 0);
  let acc = 0;
  let lit = shade[order[order.length - 1]];
  for (const t of order) {
    acc += area[t];
    if (acc >= 0.999 * total) {
      lit = shade[t];
      break;
    }
  }
  let darkest = 1;
  for (let t = 0; t < T; t++) darkest = Math.min(darkest, shade[t] / lit);
  return {
    ...mesh,
    delit: { pairs: rows.length, darkest },
    colourAt(t, u, w) {
      const gain = lit / shade[t];
      return mesh.colourAt(t, u, w).map((c) => 255 * srgb(Math.min(1, lin(c / 255) * gain)));
    },
  };
}

/**
 * Least-squares rows from pairs of edge-adjacent triangles: the difference of
 * their basis vectors, the log of their luminance ratio, and a weight.
 */
function foldPairs(mesh, normal, area) {
  const { positions: P, indices: I, triangles: T, data } = mesh;
  // Low-poly meshes split vertices per face, so edges are matched by position.
  let min = Infinity;
  let max = -Infinity;
  for (const v of P) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const step = (max - min) * 1e-6 || 1e-6;
  const ids = new Map();
  const canon = new Int32Array(P.length / 3);
  for (let i = 0; i < canon.length; i++) {
    const key = `${Math.round(P[i * 3] / step)},${Math.round(P[i * 3 + 1] / step)},${Math.round(P[i * 3 + 2] / step)}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    canon[i] = ids.get(key);
  }
  const nv = ids.size;
  const edges = new Map();
  for (let t = 0; t < T; t++) {
    for (let e = 0; e < 3; e++) {
      const ia = I[t * 3 + e];
      const ib = I[t * 3 + ((e + 1) % 3)];
      const a = canon[ia];
      const b = canon[ib];
      if (a === b) continue;
      const key = a < b ? a * nv + b : b * nv + a;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(a < b ? [t, ia, ib] : [t, ib, ia]);
    }
  }
  const sameVertex = (i, j) =>
    Math.abs(data.uvs[i * 2] - data.uvs[j * 2]) < 1e-4 &&
    Math.abs(data.uvs[i * 2 + 1] - data.uvs[j * 2 + 1]) < 1e-4 &&
    Math.abs(data.vcols[i * 3] - data.vcols[j * 3]) < 1e-3 &&
    Math.abs(data.vcols[i * 3 + 1] - data.vcols[j * 3 + 1]) < 1e-3 &&
    Math.abs(data.vcols[i * 3 + 2] - data.vcols[j * 3 + 2]) < 1e-3;

  // Luminance and chromaticity at each triangle's centre.
  const lum = new Float64Array(T);
  const chroma = new Float64Array(T * 2);
  for (let t = 0; t < T; t++) {
    const [r, g, b] = mesh.colourAt(t, 1 / 3, 1 / 3).map((c) => lin(c / 255));
    const sum = r + g + b;
    lum[t] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    chroma[t * 2] = sum > 1e-4 ? r / sum : 1 / 3;
    chroma[t * 2 + 1] = sum > 1e-4 ? g / sum : 1 / 3;
  }

  const rows = [];
  for (const side of edges.values()) {
    if (side.length !== 2) continue;
    const [[i, a1, b1], [j, a2, b2]] = side;
    if (data.triMaterial[i] !== data.triMaterial[j] || !sameVertex(a1, a2) || !sameVertex(b1, b2)) continue;
    if (lum[i] < 0.01 || lum[j] < 0.01) continue;
    const dot = normal[i * 3] * normal[j * 3] + normal[i * 3 + 1] * normal[j * 3 + 1] + normal[i * 3 + 2] * normal[j * 3 + 2];
    if (dot > MIN_ANGLE_COS) continue;
    if (Math.hypot(chroma[i * 2] - chroma[j * 2], chroma[i * 2 + 1] - chroma[j * 2 + 1]) > MAX_CHROMA) continue;
    const bi = basis(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
    const bj = basis(normal[j * 3], normal[j * 3 + 1], normal[j * 3 + 2]);
    rows.push({ x: bi.map((v, k) => v - bj[k]), d: Math.log(lum[i] / lum[j]), w: Math.sqrt(Math.min(area[i], area[j])) });
  }
  return rows;
}

/** Robust least squares (Huber, iteratively reweighted) with a little ridge. */
function fit(rows) {
  let coef = new Array(TERMS).fill(0);
  for (let iter = 0; iter < 6; iter++) {
    const A = Array.from({ length: TERMS }, () => new Array(TERMS + 1).fill(0));
    let wsum = 0;
    for (const { x, d, w: base } of rows) {
      let r = d;
      for (let k = 0; k < TERMS; k++) r -= x[k] * coef[k];
      const w = base * (iter === 0 || Math.abs(r) < HUBER ? 1 : HUBER / Math.abs(r));
      wsum += w;
      for (let p = 0; p < TERMS; p++) {
        A[p][TERMS] += w * x[p] * d;
        for (let q = 0; q < TERMS; q++) A[p][q] += w * x[p] * x[q];
      }
    }
    for (let p = 0; p < TERMS; p++) A[p][p] += 1e-3 * wsum;
    coef = solve(A);
  }
  return coef;
}

/** Gaussian elimination with partial pivoting on an augmented n × (n + 1) matrix. */
function solve(M) {
  const n = M.length;
  for (let p = 0; p < n; p++) {
    let piv = p;
    for (let q = p + 1; q < n; q++) if (Math.abs(M[q][p]) > Math.abs(M[piv][p])) piv = q;
    [M[p], M[piv]] = [M[piv], M[p]];
    for (let q = p + 1; q < n; q++) {
      const f = M[q][p] / M[p][p];
      for (let k = p; k <= n; k++) M[q][k] -= f * M[p][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let p = n - 1; p >= 0; p--) {
    let s = M[p][n];
    for (let k = p + 1; k < n; k++) s -= M[p][k] * x[k];
    x[p] = s / M[p][p];
  }
  return x;
}
