import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { partType, typeById } from '../core/parts.mjs';

/**
 * One complete geometry per part shape: the body and its own studs in a
 * single mesh, so every part is drawn (and can later be placed) as one piece.
 *
 * Local frame of every shape: footprint centred on the origin, long side (or,
 * for slopes, the downhill direction) along +x, bottom at y = 0, y up.
 * World units: 1 = one stud pitch (8 mm); a plate is 0.4 tall.
 * Bodies are shrunk by GAP on the outside only, so neighbouring parts show a
 * seam but a part never shows one inside itself.
 */

export const PLATE_H = 0.4;
export const STUD_R = 0.3;
export const STUD_H = 0.2;
/** Gap between neighbouring parts so seams stay visible. */
export const GAP = 0.04;
/** LDraw slopes run down to 4 LDU above the bottom of a 24 LDU brick: 1/6 of its height. */
const SLOPE_LIP = 1 / 6;

const cache = new Map();

/**
 * Geometry of a brick, plate or tile footprint `short` × `long` (studs) and
 * `h` plates tall, with studs unless its top is smooth (tiles).
 */
export function boxShape(kind, short, long, h, top = kind === 'tile' ? 'smooth' : 'studs') {
  const key = `${kind}:${short}x${long}`;
  if (!cache.has(key)) {
    const H = h * PLATE_H;
    const parts = [...hollowBox(long, short, H)];
    if (top === 'studs') parts.push(...studs(long, short, H, 0, long));
    cache.set(key, finish(mergeGeometries(parts)));
  }
  return cache.get(key);
}

/**
 * Wall thickness and top thickness of the hollow underside (real parts: about
 * 1.2 mm walls and a 1 mm top; one stud pitch = 8 mm). Simple on purpose: the
 * point is that a bottom reads as a bottom, not a smooth tile top.
 */
const WALL = 0.15;
const ROOF = 0.12;
/** Underside tube of a 2-wide part (outer 6.5 mm) and post of a 1-wide one (3.2 mm). */
const TUBE_R = 0.4;
const POST_R = 0.16;

/**
 * Body of a box part `long` × `short`, `H` tall, hollow underneath: a frame of
 * walls round the edge, a solid top above the hollow, and tubes between the
 * studs (2-wide) or posts down the middle (1-wide), so its underside can be
 * told from a smooth top at a glance.
 */
function hollowBox(long, short, H) {
  const L = long - GAP;
  const S = short - GAP;
  const y0 = GAP / 4;
  const y1 = H - GAP / 4;
  const depth = y1 - y0 - ROOF;
  const roof = new THREE.BoxGeometry(L, ROOF, S).translate(0, y1 - ROOF / 2, 0);
  const outer = new THREE.Shape([new THREE.Vector2(-L / 2, -S / 2), new THREE.Vector2(L / 2, -S / 2), new THREE.Vector2(L / 2, S / 2), new THREE.Vector2(-L / 2, S / 2)]);
  const iL = L / 2 - WALL;
  const iS = S / 2 - WALL;
  outer.holes.push(new THREE.Path([new THREE.Vector2(-iL, -iS), new THREE.Vector2(-iL, iS), new THREE.Vector2(iL, iS), new THREE.Vector2(iL, -iS)]));
  // Extruded along +z, then laid down: z becomes up, the shape's y becomes −z.
  const walls = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
  const out = [plain(roof), plain(walls)];
  // Open at the top, which is inside the roof; 8 sides for a tube, 6 for a post (they are small and underneath).
  const post = (r, x, z, sides) => {
    out.push(new THREE.CylinderGeometry(r, r, depth, sides, 1, true).translate(x, y0 + depth / 2, z).toNonIndexed());
    out.push(new THREE.CircleGeometry(r, sides).rotateX(Math.PI / 2).translate(x, y0, z).toNonIndexed());
  };
  if (short >= 2) {
    for (let i = 1; i < long; i++) for (let k = 1; k < short; k++) post(TUBE_R, i - long / 2, k - short / 2, 8);
  } else {
    for (let i = 1; i < long; i++) post(POST_R, i - long / 2, 0, 6);
  }
  return out;
}

/**
 * Geometry of a slope by its LDraw number: stud row full height at the uphill
 * end (local −x), face sloping down along +x to a low lip, `width` studs wide.
 * Profile from the LDraw part files 3039, 4286, 3040b.
 * An inverted slope (3660b, 4287b, 3665b) is the same profile upside down:
 * flat top with studs all along it, the underside rising to a thin front lip.
 */
export function slopeShape(ldraw) {
  const key = `slope:${ldraw}`;
  if (!cache.has(key)) {
    const s = typeById(ldraw)?.slope;
    if (!s) throw new Error(`unknown slope ${ldraw}`);
    const H = 3 * PLATE_H;
    const L = s.studs + s.slope;
    const g = GAP / 2;
    const y0 = GAP / 4;
    const y1 = H - GAP / 4;
    // Side profile in (x, y), x from the uphill back to the downhill front.
    const points = s.inverted
      ? [[g, y1], [g, y0], [s.studs, y0], [L - g, H * (1 - SLOPE_LIP)], [L - g, y1]]
      : [[g, y0], [L - g, y0], [L - g, H * SLOPE_LIP], [s.studs, y1], [g, y1]];
    const profile = new THREE.Shape(points.map(([px, py]) => new THREE.Vector2(px, py)));
    const body = new THREE.ExtrudeGeometry(profile, { depth: s.width - GAP, bevelEnabled: false })
      .translate(-L / 2, 0, -(s.width - GAP) / 2);
    const parts = [plain(body), ...studs(L, s.width, H, 0, s.inverted ? L : s.studs)];
    cache.set(key, finish(mergeGeometries(parts)));
  }
  return cache.get(key);
}

/**
 * Geometry of a round part by its LDraw number (3062b, 3941, 6141, 4032b,
 * 98138, 14769): a cylinder as wide as its square footprint, with the same
 * studs as the square part (1 on a 1×1, a 2×2 group on a 2×2; LDraw
 * `stug10-2x2`), none on a round tile. Hollow underneath like the box parts; no axle holes.
 */
export function roundShape(ldraw) {
  const key = `round:${ldraw}`;
  if (!cache.has(key)) {
    const type = typeById(ldraw);
    if (!type?.round) throw new Error(`unknown round part ${ldraw}`);
    const H = type.h * PLATE_H;
    const parts = [...hollowRound(type.w, H)];
    if (type.top === 'studs') parts.push(...studs(type.w, type.d, H, 0, type.w));
    cache.set(key, finish(mergeGeometries(parts)));
  }
  return cache.get(key);
}

/** Body of a round part `w` studs across, `H` tall: a ring wall under a solid top, a tube in the middle of a 2×2. */
function hollowRound(w, H) {
  const r = (w - GAP) / 2;
  const segments = 12 * w;
  const y0 = GAP / 4;
  const y1 = H - GAP / 4;
  const depth = y1 - y0 - ROOF;
  const roof = new THREE.CylinderGeometry(r, r, ROOF, segments).translate(0, y1 - ROOF / 2, 0);
  const ring = new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false);
  ring.holes.push(new THREE.Path().absarc(0, 0, r - WALL, 0, Math.PI * 2, true));
  const wall = new THREE.ExtrudeGeometry(ring, { depth, bevelEnabled: false, curveSegments: segments }).rotateX(-Math.PI / 2).translate(0, y0, 0);
  const out = [plain(roof), plain(wall)];
  if (w >= 2) {
    out.push(new THREE.CylinderGeometry(TUBE_R, TUBE_R, depth, 8, 1, true).translate(0, y0 + depth / 2, 0).toNonIndexed());
    out.push(new THREE.CircleGeometry(TUBE_R, 8).rotateX(Math.PI / 2).translate(0, y0, 0).toNonIndexed());
  }
  return out;
}

/**
 * Stud cylinders on top of a footprint `long` × `short` centred at the origin, for stud columns [from, to).
 * Side and top only: the bottom cap sits inside the part and is never seen.
 */
function studs(long, short, H, from, to) {
  const out = [];
  for (let i = from; i < to; i++) {
    for (let k = 0; k < short; k++) {
      const x = i + 0.5 - long / 2;
      const z = k + 0.5 - short / 2;
      out.push(
        new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 16, 1, true).translate(x, H + STUD_H / 2, z).toNonIndexed(),
        new THREE.CircleGeometry(STUD_R, 16).rotateX(-Math.PI / 2).translate(x, H + STUD_H, z).toNonIndexed(),
      );
    }
  }
  return out;
}

/** Non-indexed copy (mergeGeometries needs all parts alike; extrusions already are). */
const plain = (g) => (g.index ? g.toNonIndexed() : g);

/** Keep only what the material needs, so every merged geometry has the same attributes. */
function finish(geometry) {
  geometry.deleteAttribute('uv');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Instance matrix placing a part's shape: centre of its footprint at the
 * part's position, rotated about y so the shape's +x runs along the part's
 * long side (bricks, plates, tiles) or downhill (slopes, `dir`).
 */
export function partMatrix(p, m = new THREE.Matrix4()) {
  let angle = 0;
  if (partType(p).slope) {
    const [dx, dz] = p.dir;
    // +x → (dx, dz): rotating by θ about y maps +x to (cos θ, −sin θ).
    angle = Math.atan2(-dz, dx);
  } else if (p.w < p.d) {
    angle = -Math.PI / 2; // +x → +z
  }
  const q = new THREE.Quaternion().setFromAxisAngle(UP, angle);
  return m.compose(new THREE.Vector3(p.x + p.w / 2, p.y * PLATE_H, p.z + p.d / 2), q, new THREE.Vector3(1, 1, 1));
}

/**
 * Turns a group of parts upside down where it stands and sets it on the
 * ground (y = 0): half a turn about the x axis through the group's box
 * centre, then down to the ground. For a sub-assembly built upside down on
 * the table. Applied after `partMatrix`.
 * @param {{ x: number, y: number, z: number, w: number, d: number, h: number }[]} parts
 * @returns {THREE.Matrix4}
 */
export function turnOver(parts) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    min.min(new THREE.Vector3(p.x, p.y * PLATE_H, p.z));
    max.max(new THREE.Vector3(p.x + p.w, (p.y + p.h) * PLATE_H, p.z + p.d));
  }
  const c = min.clone().add(max).multiplyScalar(0.5);
  return new THREE.Matrix4()
    .makeTranslation(c.x, c.y - min.y, c.z)
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
}

/** The shape geometry for a placed part, from its record in the part table. */
export function shapeOf(p) {
  const type = partType(p);
  if (type.slope) return slopeShape(type.ldraw);
  if (type.round) return roundShape(type.ldraw);
  return boxShape(type.kind, type.w, type.d, type.h, type.top);
}

/** Cache key of a part's shape (one instanced mesh per key). */
export function shapeKeyOf(p) {
  const type = partType(p);
  if (type.slope) return `slope:${type.ldraw}`;
  if (type.round) return `round:${type.ldraw}`;
  return `${type.kind}:${type.w}x${type.d}`;
}
