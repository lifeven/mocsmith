import * as THREE from 'three';
import { PALETTE } from '../core/palette.mjs';
import { partType } from '../core/parts.mjs';
import { BrickView, PLATE_H } from '../render/bricks.mjs';
import { viewCamera } from '../render/camera.mjs';
import { drawIcons } from '../render/icons.mjs';
import { IdBuffer } from '../render/visibility.mjs';
import { stepNeeds } from '../steps/plan.mjs';
import { iconKey } from './layout.mjs';
import { StepShots } from './shots.mjs';

/** Page colour behind the pictures. */
const PAPER = 0xffffff;
/** The outline drawn around the new parts of a step: colour and width in pixels. */
const OUTLINE = [214, 40, 40];
const OUTLINE_PX = 3;
/**
 * How much of the model so far a step picture shows: the new parts' own
 * framing (as build mode) or this share of the built part's radius, whichever
 * is larger, so a small step still shows where it goes.
 */
const CONTEXT = 0.8;

/**
 * Pictures for the instruction book: one
 * picture per build step, seen from the view build mode would turn to
 * (`StepShots`), with every part in its own colour and a red outline around
 * the new ones; the finished model for the cover; and a small picture of
 * each part in each colour for the parts boxes. Its own off-screen renderer,
 * so the page's view is untouched.
 */
export class BookRenderer {
  /** @param {{ width?: number, height?: number }} [size] picture size in pixels */
  constructor({ width = 960, height = 720 } = {}) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAPER);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(30, 60, 40);
    this.scene.add(sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.bricks = new BrickView(this.root);
    this.shots = new StepShots(this.renderer);
    /** Which pixels show a new part (for the outline). */
    this.ids = new IdBuffer(this.renderer, width, height);
    /** The finished picture: the render plus the outline. */
    this.picture = document.createElement('canvas');
    this.picture.width = width;
    this.picture.height = height;
    this.ctx = this.picture.getContext('2d', { willReadFrequently: true });
    /** @type {'left' | 'right' | null} */
    this.side = null;
    this.model = null;
    this.plan = null;
  }

  /** The model and plan to draw; steps are then drawn in order, as the side carries from one to the next. */
  setModel(model, plan) {
    this.model = model;
    this.plan = plan;
    this.bricks.setModel(model);
    this.ids.setParts(model.result.parts);
    this.shots.use(model, plan);
    this.side = null;
  }

  /**
   * Draw step `index` into `this.picture` (valid until the next draw).
   * @returns {{ back: boolean, view: string } | null} null for a step with nothing new
   */
  drawStep(index) {
    const shot = this.shots.pick(index, this.side);
    if (!shot) return null;
    this.side = shot.side;
    const { display, turn } = shot;
    const shown = (id) => !display.hidden(id);
    this.bricks.refresh({ hidden: display.hidden, turn });
    const radius = Math.max(shot.radius, CONTEXT * builtRadius(this.model.result.parts, shown, shot.target, turn));
    const camera = viewCamera(shot.target, shot.dir, radius, { aspect: this.width / this.height });
    this.renderer.render(this.scene, camera);
    this.outline(shown, display.outlined, camera, turn);
    return { back: shot.back, view: shot.view };
  }

  /** Draw the finished model from the front-right and a little above (the cover), as large as fits. */
  drawModel() {
    this.drawUpTo(Infinity);
  }

  /**
   * Draw the model as it stands after step `index` (all of it for Infinity), from the
   * front-right and a little above, as large as fits, with nothing outlined (chapter openers).
   */
  drawUpTo(index) {
    const { parts } = this.model.result;
    const { stepOf } = this.plan;
    const hidden = (id) => stepOf[id] > index;
    this.bricks.refresh({ hidden });
    const box = new THREE.Box3();
    for (const p of parts) {
      if (hidden(p.id)) continue;
      box.expandByPoint(new THREE.Vector3(p.x, p.y * PLATE_H, p.z));
      box.expandByPoint(new THREE.Vector3(p.x + p.w, (p.y + p.h) * PLATE_H, p.z + p.d));
    }
    const camera = fitCamera(box, new THREE.Vector3(0.9, 0.9, 1.6).normalize(), this.width / this.height);
    this.renderer.render(this.scene, camera);
    this.ctx.drawImage(this.canvas, 0, 0);
  }

  /** Copy the render to the picture and draw a band of OUTLINE_PX around the pixels where a new part shows. */
  outline(shown, isNew, camera, turn) {
    const { width: W, height: H } = this;
    const px = this.ids.render(shown, camera, turn);
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const row = (H - 1 - y) * W; // read back bottom-up
      for (let x = 0; x < W; x++) {
        const k = (row + x) * 4;
        const code = (px[k] << 16) | (px[k + 1] << 8) | px[k + 2];
        if (code && isNew(code - 1)) mask[y * W + x] = 1;
      }
    }
    const grown = dilate(dilate(mask, W, H, 1, OUTLINE_PX), W, H, W, OUTLINE_PX);
    this.ctx.drawImage(this.canvas, 0, 0);
    const image = this.ctx.getImageData(0, 0, W, H);
    const d = image.data;
    for (let i = 0; i < mask.length; i++) {
      if (!grown[i] || mask[i]) continue;
      d[i * 4] = OUTLINE[0];
      d[i * 4 + 1] = OUTLINE[1];
      d[i * 4 + 2] = OUTLINE[2];
    }
    this.ctx.putImageData(image, 0, 0);
  }

  /**
   * A copy of the current picture cut down to what is drawn on it (plus `pad`
   * pixels of paper), so a page can draw the model as large as its box allows.
   * @param {number} [pad]
   * @returns {HTMLCanvasElement}
   */
  snapshot(pad = 12) {
    const { width: W, height: H } = this;
    const d = this.ctx.getImageData(0, 0, W, H).data;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        if (d[k] > 248 && d[k + 1] > 248 && d[k + 2] > 248) continue; // paper
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) [x0, y0, x1, y1] = [0, 0, W - 1, H - 1];
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad);
    y1 = Math.min(H - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(this.picture, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  /**
   * Small pictures of the parts a list of steps needs, one per part and colour.
   * @param {number[][]} stepIds the part ids of each step
   * @param {number} [size] CSS pixels (drawn at twice that)
   * @returns {Map<string, string>} `iconKey` → PNG data URL
   */
  partIcons(stepIds, size = 48) {
    const { parts } = this.model.result;
    const items = new Map();
    for (const ids of stepIds) {
      for (const g of stepNeeds(parts, ids)) {
        const key = iconKey(parts[g.ids[0]]);
        if (items.has(key)) continue;
        const type = partType(parts[g.ids[0]]);
        items.set(key, { key, part: { kind: type.kind, w: type.w, d: type.d, ldraw: type.ldraw }, hex: PALETTE[g.color - 1].hex });
      }
    }
    return drawIcons([...items.values()], size);
  }

  dispose() {
    this.shots.dispose();
    this.ids.dispose();
    this.ids.target.dispose();
    this.bricks.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/**
 * A camera looking at `box` along `dir` (from the box towards the camera),
 * just far enough that all eight corners are in view, with a 6% margin.
 * @param {THREE.Box3} box
 * @param {THREE.Vector3} dir unit
 * @param {number} aspect
 * @param {number} [fov] vertical, degrees
 */
export function fitCamera(box, dir, aspect, fov = 35) {
  const centre = box.getCenter(new THREE.Vector3());
  const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  const up = dir.clone().cross(right);
  const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const th = tv * aspect;
  let distance = 0;
  const c = new THREE.Vector3();
  for (let k = 0; k < 8; k++) {
    c.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).sub(centre);
    const z = c.dot(dir);
    distance = Math.max(distance, Math.abs(c.dot(right)) / th + z, Math.abs(c.dot(up)) / tv + z);
  }
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 4000);
  camera.position.copy(centre).addScaledVector(dir, distance * 1.06);
  camera.lookAt(centre);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** Radius around `centre` that holds every part shown so far (after `turn`). */
function builtRadius(parts, shown, centre, turn) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of parts) {
    if (!shown(p.id)) continue;
    for (const [x, y, z] of [[p.x, p.y, p.z], [p.x + p.w, p.y + p.h, p.z + p.d]]) {
      v.set(x, y * PLATE_H, z);
      if (turn) v.applyMatrix4(turn);
      box.expandByPoint(v);
    }
  }
  return box.isEmpty() ? 0 : box.getBoundingSphere(new THREE.Sphere()).radius + box.getCenter(v).distanceTo(centre) * 0.5;
}

/**
 * Grow a 0/1 mask by `r` pixels along one axis (`stride` 1 = rows, W = columns),
 * with a running count, so it costs one pass whatever `r` is.
 */
function dilate(mask, W, H, stride, r) {
  const out = new Uint8Array(mask.length);
  const [lines, len, step] = stride === 1 ? [H, W, W] : [W, H, 1];
  for (let a = 0; a < lines; a++) {
    const base = a * step;
    let count = 0;
    for (let i = 0; i < Math.min(r, len); i++) count += mask[base + i * stride];
    for (let i = 0; i < len; i++) {
      if (i + r < len) count += mask[base + (i + r) * stride];
      if (i - r - 1 >= 0) count -= mask[base + (i - r - 1) * stride];
      out[base + i * stride] = count > 0 ? 1 : 0;
    }
  }
  return out;
}
