import * as THREE from 'three';
import { PLATE_H } from './shapes.mjs';

/**
 * Camera helpers that only look at the model's geometry: which parts touch,
 * where a group of parts is, and which way to look at it.
 */

/**
 * Parts clustered by touching boxes, each with a world-space box for the
 * camera, its top layer and part ids.
 *
 * @param {{ id: number, x: number, y: number, z: number, w: number, d: number, h: number }[]} parts
 * @returns {{ box: THREE.Box3, topLayer: number, ids: Set<number> }[]}
 */
export function partGroups(parts) {
  const parent = parts.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const touch = (a, b) =>
    a.x <= b.x + b.w && b.x <= a.x + a.w && a.z <= b.z + b.d && b.z <= a.z + a.d && a.y <= b.y + b.h && b.y <= a.y + a.h;
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) if (touch(parts[i], parts[j])) parent[find(i)] = find(j);
  const groups = new Map();
  parts.forEach((p, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { box: new THREE.Box3(), topLayer: 0, ids: new Set() });
    const g = groups.get(r);
    g.box.expandByPoint(new THREE.Vector3(p.x, p.y * PLATE_H, p.z));
    g.box.expandByPoint(new THREE.Vector3(p.x + p.w, (p.y + p.h) * PLATE_H, p.z + p.d));
    g.topLayer = Math.max(g.topLayer, p.y + p.h - 1);
    g.ids.add(p.id);
  });
  return [...groups.values()];
}

/**
 * The direction to look at a group from (spot → camera) that is least
 * blocked by the rest of the model: rays at 12 headings × 3 heights are
 * marched through the cells and the one crossing the fewest other parts'
 * cells wins; ties go to the heading closest to `preferred`.
 *
 * @param {{ grid: import('../core/grid.mjs').VoxelGrid, result: { owner: Int32Array } }} model
 * @param {{ box: THREE.Box3, ids: Set<number> }} group
 * @param {THREE.Vector3} preferred current viewing direction
 */
export function clearestView(model, group, preferred) {
  const { grid, result } = model;
  const from = group.box.getCenter(new THREE.Vector3());
  const reach = Math.hypot(grid.sx, grid.sy * PLATE_H, grid.sz);
  let best = null;
  for (const elevation of [20, 40, 65]) {
    for (let k = 0; k < 12; k++) {
      const az = (k / 12) * Math.PI * 2;
      const elev = THREE.MathUtils.degToRad(elevation);
      const dir = new THREE.Vector3(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az));
      let blocked = 0;
      let last = -1;
      for (let s = 0.5; s < reach; s += 0.5) {
        const x = Math.floor(from.x + dir.x * s);
        const y = Math.floor((from.y + dir.y * s) / PLATE_H);
        const z = Math.floor(from.z + dir.z * s);
        if (!grid.inBounds(x, y, z)) continue;
        const i = grid.index(x, y, z);
        if (i === last) continue;
        last = i;
        const o = result.owner[i];
        if (o >= 0 && !group.ids.has(o)) blocked++;
      }
      const score = blocked - 0.01 * dir.dot(preferred);
      if (!best || score < best.score) best = { score, dir };
    }
  }
  return best.dir;
}

/**
 * The grid step for an arrow key as the screen shows it: 'up' moves away
 * from the viewer, 'right' to the right, along whichever grid axis is
 * nearest (x on a tie). `away` is the screen's up direction laid on the
 * ground (x, z): the camera's view direction plus its up vector, so it also
 * works looking straight down.
 * @param {'up'|'down'|'left'|'right'} direction
 * @param {[number, number]} away
 * @returns {[number, number]} [dx, dz]
 */
export function gridStep(direction, [ax, az]) {
  const [vx, vz] = { up: [ax, az], down: [-ax, -az], right: [-az, ax], left: [az, -ax] }[direction];
  return Math.abs(vx) >= Math.abs(vz) ? [Math.sign(vx) || 1, 0] : [0, Math.sign(vz)];
}

/** Elevation of the step-view direction over its (0.9, 1.6) horizontal component. */
const STEP_LIFT = 1.8;

/**
 * The views a build step is shown from: from the
 * front-right (the page's default side) and the front-left, about 44° above
 * the ground, or as far below it for parts pushed on from below. The back
 * two and a near-top one (about 76°; near-bottom for parts from below) are
 * only borrowed for a step that neither front side shows (`pickView`).
 * Directions point from the step towards the camera.
 * @param {boolean} [below]
 * @returns {Record<'right' | 'left' | 'backRight' | 'backLeft' | 'top', THREE.Vector3>}
 */
export function stepViews(below = false) {
  const y = below ? -STEP_LIFT : STEP_LIFT;
  const v = (x, vy, z) => new THREE.Vector3(x, vy, z).normalize();
  return {
    right: v(0.9, y, 1.6),
    left: v(-0.9, y, 1.6),
    backRight: v(0.9, y, -1.6),
    backLeft: v(-0.9, y, -1.6),
    top: v(0.25, below ? -4 : 4, 0.6),
  };
}

/** The views a step may borrow when neither front side shows its new parts well (`pickView`). */
export const EXTRA_VIEWS = ['backLeft', 'backRight', 'top'];

/**
 * Where to look for a step: the centre of its new parts, from far enough to
 * see them with some of the model around them (their own size, and at least
 * 0.6 of the radius of what is built so far).
 *
 * @param {{ id: number, x: number, y: number, z: number, w: number, d: number, h: number }[]} parts
 * @param {number[]} newIds
 * @param {(id: number) => boolean} shown parts on the model at this step
 * @returns {{ target: THREE.Vector3, radius: number, tight: number }} `tight`: radius of the new parts' own bounding sphere
 */
export function stepFraming(parts, newIds, shown) {
  const box = (list) => {
    const b = new THREE.Box3();
    for (const p of list) {
      b.expandByPoint(new THREE.Vector3(p.x, p.y * PLATE_H, p.z));
      b.expandByPoint(new THREE.Vector3(p.x + p.w, (p.y + p.h) * PLATE_H, p.z + p.d));
    }
    return b;
  };
  const fresh = box(newIds.map((id) => parts[id]));
  const built = box(parts.filter((p) => shown(p.id)));
  const size = (b) => b.getSize(new THREE.Vector3()).length();
  const radius = Math.max(size(fresh), 0.6 * 0.5 * size(built), 2);
  return { target: fresh.getCenter(new THREE.Vector3()), radius, tight: size(fresh) / 2 };
}

/**
 * Which side to show a step from, given how much of its new parts each side
 * shows (`min` = the worst-seen new part, `mean`): the side whose worst part
 * shows more, then the higher mean; but stay on the `current` side unless the
 * other one shows the worst part at least `margin` better, so the view does
 * not swing back and forth between steps.
 *
 * @param {{ left: { min: number, mean: number }, right: { min: number, mean: number } }} scores
 * @param {'left' | 'right' | null} current
 * @param {number} [margin]
 * @returns {'left' | 'right'}
 */
export function pickSide(scores, current, margin = 0.15) {
  if (current) {
    const other = current === 'left' ? 'right' : 'left';
    // A side that shows nothing of the worst part gives way to one that shows some.
    if (scores[current].min < SEEN && scores[other].min >= SEEN) return other;
    return scores[other].min > scores[current].min + margin ? other : current;
  }
  const { left, right } = scores;
  if (left.min !== right.min) return left.min > right.min ? 'left' : 'right';
  return left.mean > right.mean ? 'left' : 'right';
}

/** Below this share a part counts as not seen at all. */
const SEEN = 0.01;

/**
 * The view for one step, after `pickSide` chose the front side: when that side
 * shows the worst new part less than `low`, the best back or top view is used
 * for this step only if it shows that part at least `gain` better (or shows it
 * at all, when the front shows nothing).
 *
 * @param {Partial<Record<'left' | 'right' | 'backLeft' | 'backRight' | 'top', { min: number, mean: number }>>} scores
 * @param {'left' | 'right'} side
 * @param {{ low?: number, gain?: number }} [opts]
 * @returns {'left' | 'right' | 'backLeft' | 'backRight' | 'top'}
 */
export function pickView(scores, side, { low = 0.35, gain = 0.3 } = {}) {
  const front = scores[side].min;
  if (front >= low) return side;
  let best = null;
  for (const k of EXTRA_VIEWS) {
    const s = scores[k];
    if (s && (!best || s.min > scores[best].min || (s.min === scores[best].min && s.mean > scores[best].mean))) best = k;
  }
  if (!best) return side;
  const other = scores[best].min;
  return (front < SEEN && other >= SEEN) || other >= front + gain ? best : side;
}

/**
 * A camera looking at `target` along `dir` from where a sphere of `radius`
 * just fits the narrower field of view.
 * @param {THREE.Vector3} target
 * @param {THREE.Vector3} dir unit, from target towards the camera
 * @param {number} radius
 * @param {{ fov?: number, aspect?: number }} [lens]
 */
export function viewCamera(target, dir, radius, { fov = 35, aspect = 1 } = {}) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 2000);
  const vfov = THREE.MathUtils.degToRad(fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const distance = radius / Math.sin(Math.min(vfov, hfov) / 2);
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * Whether a camera at `position` looking at `look` can stay where it is for a
 * step whose new parts sit in a sphere (`center`, `radius`): the whole sphere
 * inside the part of the picture the overlays leave free (`top` and `bottom`
 * are the shares of the height the buttons and the step bar cover), with
 * `margin` of that space to spare, and no farther than `far` times `ideal`
 * (the distance build mode would move to), so the parts do not show small.
 *
 *
 * @param {THREE.Vector3} position
 * @param {THREE.Vector3} look
 * @param {THREE.Vector3} center
 * @param {number} radius
 * @param {{ fov?: number, aspect?: number, ideal: number, top?: number, bottom?: number, margin?: number, far?: number }} lens
 */
export function framesSphere(position, look, center, radius, { fov = 35, aspect = 1, ideal, top = 0, bottom = 0, margin = 0.85, far = 1.6 }) {
  const forward = look.clone().sub(position);
  if (forward.lengthSq() === 0) return false;
  forward.normalize();
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-9) right.set(1, 0, 0);
  right.normalize();
  const up = right.clone().cross(forward);
  const c = center.clone().sub(position);
  const z = c.dot(forward);
  if (z <= radius || c.length() > far * ideal) return false;
  // Everything in "tangent" units on a screen one unit in front of the camera.
  const x = c.dot(right) / z;
  const y = c.dot(up) / z;
  const s = radius / Math.sqrt(z * z - radius * radius);
  const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const lo = (-1 + 2 * bottom) * tv;
  const hi = (1 - 2 * top) * tv;
  return Math.abs(x) + s <= tv * aspect * margin && Math.abs(y - (lo + hi) / 2) + s <= ((hi - lo) / 2) * margin;
}

/**
 * The camera's offset from its target at `t` (0–1) of a move from offset `a`
 * to offset `b`: the direction turns along the sphere around the target
 * (slerp) and the length changes geometrically, so a move to the other side
 * swings around the model instead of cutting through it and zooming in on
 * the way.
 *
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {number} t
 * @returns {THREE.Vector3}
 */
export function orbitOffset(a, b, t) {
  const la = a.length();
  const lb = b.length();
  const length = la * (lb / la) ** t;
  const ua = a.clone().divideScalar(la);
  const ub = b.clone().divideScalar(lb);
  const angle = ua.angleTo(ub);
  if (angle < 1e-4) return ua.lerp(ub, t).normalize().multiplyScalar(length);
  const s = Math.sin(angle);
  if (s < 1e-3) {
    // Opposite directions: go round over the top, through the up axis (or sideways if they are vertical).
    const up = new THREE.Vector3(0, 1, 0).projectOnPlane(ua);
    if (up.lengthSq() < 1e-6) up.set(1, 0, 0);
    const mid = up.normalize().multiplyScalar(Math.sqrt(la * lb));
    return t < 0.5 ? orbitOffset(a, mid, t * 2) : orbitOffset(mid, b, t * 2 - 1);
  }
  const wa = Math.sin((1 - t) * angle) / s;
  const wb = Math.sin(t * angle) / s;
  return ua.multiplyScalar(wa).addScaledVector(ub, wb).normalize().multiplyScalar(length);
}

/**
 * How long a camera move takes, in ms: 0.7 s for a small move, up to 1.4 s
 * for a turn of 120° or more with a long slide or zoom on top, so a big swing
 * is slow enough to follow.
 *
 * @param {number} angle turn of the view direction, radians
 * @param {number} shift how far the target slides, as a share of the camera's distance
 * @param {number} zoom |ln| of the distance change
 */
export function moveMs(angle, shift, zoom) {
  const turn = Math.min(1, angle / ((2 * Math.PI) / 3));
  const slide = Math.min(1, shift + zoom);
  return Math.round(Math.min(1400, 700 + 500 * turn + 200 * slide));
}
