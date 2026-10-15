import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLATE_H } from './bricks.mjs';
import { moveMs, orbitOffset } from './camera.mjs';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The 3D stage: renderer, lights, ground, orbit camera, and camera moves
 * (frame the whole model, fly to a spot). World units: 1 = one stud (8 mm).
 */
export class Stage {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf4f1ea);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(30, 60, 40);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.9 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.01;
    this.scene.add(this.ground);

    /** The brick model (BrickView adds its meshes here). */
    this.bricks = new THREE.Group();
    this.scene.add(this.bricks);

    /** The source model, placed to overlap the bricks exactly. */
    this.original = new THREE.Group();
    this.original.visible = false;
    this.scene.add(this.original);

    /** Side by side: source model and bricks in two halves, one shared camera. */
    this.compare = false;
    /** Optional () => px: how far the page's overlays reach into the canvas from the top. */
    this.topInset = null;
    this.grid = null;

    this.tween = null;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    const before = this.fitDistance(1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.viewAspect();
    this.camera.updateProjectionMatrix();
    // The settings drawer opening, or a phone turning, changes how wide the view is. Keep what
    // was in view: move back (or in) by as much as the narrower field of view changed.
    // Skipped during a camera move, which already knows where it is going.
    const after = this.fitDistance(1);
    if (this.sized && !this.tween && Math.abs(after / before - 1) > 0.01) {
      const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(after / before);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
    }
    this.sized = true;
  }

  /**
   * The halves in compare mode, in CSS pixels from the canvas's top-left:
   * left / right when the canvas is wider than tall, top / bottom otherwise.
   * The source model is drawn in the first, the bricks in the second.
   * @returns {{ x: number, y: number, w: number, h: number }[]}
   */
  halves() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w >= h) return [{ x: 0, y: 0, w: w / 2, h }, { x: w / 2, y: 0, w: w / 2, h }];
    // Top/bottom: the page's buttons and banner sit over the top of the canvas,
    // so the top half starts below them.
    const top = Math.min(h / 3, this.topInset?.() ?? 0);
    const half = (h - top) / 2;
    return [{ x: 0, y: top, w, h: half }, { x: 0, y: top + half, w, h: half }];
  }

  /** Aspect ratio of what one render covers: the whole canvas, or one half. */
  viewAspect() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!this.compare) return w / h;
    const half = this.halves()[0];
    return half.w / half.h;
  }

  /**
   * Turn side-by-side compare on or off. The view direction is kept and the
   * distance refitted, since each half is narrower than the whole canvas.
   */
  setCompare(on) {
    this.compare = on;
    this.resize();
    if (!this.grid) return;
    const { center, radius } = gridSphere(this.grid);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.moveTo(center.clone().addScaledVector(dir, this.fitDistance(radius) * 0.85), center, false);
  }

  /**
   * Tell the page where the halves are (CSS variables on the canvas's parent:
   * --half-top, --split), so the divider and labels follow the real split.
   */
  publishSplit(halves) {
    const key = `${halves[0].y}/${halves[1].y}`;
    if (key === this.splitKey) return;
    this.splitKey = key;
    const style = this.canvas.parentElement.style;
    style.setProperty('--half-top', `${halves[0].y}px`);
    style.setProperty('--split', `${halves[1].y}px`);
  }

  /** Pointer position → normalized device coordinates in the bricks view (null outside it). */
  bricksNdc(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    let x = clientX - r.left;
    let y = clientY - r.top;
    let w = r.width;
    let h = r.height;
    if (this.compare) {
      const b = this.halves()[1];
      if (x < b.x || y < b.y) return null;
      [x, y, w, h] = [x - b.x, y - b.y, b.w, b.h];
    }
    return new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);
  }

  /**
   * The screen's up direction laid on the ground, [x, z] (not normalised):
   * where the camera looks, or, looking almost straight down or up, the
   * camera's own up. For the arrow-key nudge (`gridStep`).
   * @returns {[number, number]}
   */
  groundAway() {
    const look = this.camera.getWorldDirection(new THREE.Vector3());
    if (Math.hypot(look.x, look.z) > 0.2) return [look.x, look.z];
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    return [up.x * Math.sign(-look.y || 1), up.z * Math.sign(-look.y || 1)];
  }

  tick(t) {
    if (this.tween) {
      const { from, to, a, b, start, ms } = this.tween;
      const k = Math.min(1, (t - start) / ms);
      // Ease in and out (cubic); the target slides straight, the camera swings around it.
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      this.controls.target.lerpVectors(from.target, to.target, e);
      this.camera.position.copy(this.controls.target).add(orbitOffset(a, b, e));
      if (k === 1) this.tween = null;
    }
    this.controls.update();
    if (!this.compare) {
      this.original.visible = false;
      this.bricks.visible = true;
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // Two passes with the same camera: source model in the first half, bricks in the second.
    const H = this.canvas.clientHeight;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.canvas.clientWidth, H);
    this.renderer.clear(); // the strip above the halves (under the page's buttons)
    this.renderer.setScissorTest(true);
    const halves = this.halves();
    this.publishSplit(halves);
    halves.forEach((v, i) => {
      // WebGL viewports count from the bottom-left.
      this.renderer.setViewport(v.x, H - v.y - v.h, v.w, v.h);
      this.renderer.setScissor(v.x, H - v.y - v.h, v.w, v.h);
      this.original.visible = i === 0;
      this.bricks.visible = i === 1;
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Ground and camera for a model grid (studs × plates × studs). */
  setGrid(grid, { reframe }) {
    this.grid = grid;
    this.ground.scale.set(grid.sx + 6, grid.sz + 6, 1);
    this.ground.position.set(grid.sx / 2, -0.01, grid.sz / 2);
    if (reframe) this.frame(grid);
  }

  /** Camera distance at which a sphere of radius r just fits the narrower field of view. */
  fitDistance(r) {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    return r / Math.sin(Math.min(vfov, hfov) / 2);
  }

  /** Whole model in view, from the front-right and a little above, as large as fits. */
  frame(grid) {
    const { center, radius } = gridSphere(grid);
    // A sphere fit leaves the corners of a long, flat model empty; 0.85 still keeps it all in view.
    const distance = this.fitDistance(radius) * 0.85;
    const dir = new THREE.Vector3(0.9, 0.7, 1.6).normalize();
    this.moveTo(center.clone().addScaledVector(dir, distance), center, false);
  }

  /**
   * Fly to a spot on the model (a box in world units), looking at it along
   * `dir` (from the spot towards the camera), with part of the model around
   * it so the spot is easy to place.
   * @param {THREE.Box3} box
   * @param {import('../core/grid.mjs').VoxelGrid} grid
   * @param {THREE.Vector3} dir unit vector
   */
  focus(box, grid, dir) {
    const target = box.getCenter(new THREE.Vector3());
    const model = gridSphere(grid);
    const r = Math.max(box.getSize(new THREE.Vector3()).length() * 2, model.radius * 0.6);
    this.moveTo(target.clone().addScaledVector(dir, this.fitDistance(r)), target, true);
  }

  moveTo(position, target, animate) {
    if (!animate || reducedMotion()) {
      this.tween = null;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      return;
    }
    const from = { position: this.camera.position.clone(), target: this.controls.target.clone() };
    const a = from.position.clone().sub(from.target);
    const b = position.clone().sub(target);
    if (a.lengthSq() < 1e-9 || b.lengthSq() < 1e-9) return this.moveTo(position, target, false);
    const shift = from.target.distanceTo(target) / b.length();
    this.tween = {
      from,
      to: { position: position.clone(), target: target.clone() },
      a,
      b,
      start: performance.now(),
      ms: moveMs(a.angleTo(b), shift, Math.abs(Math.log(b.length() / a.length()))),
    };
  }

  /** Where the camera is going: the end of the move in progress, or where it is now. */
  aim() {
    const to = this.tween?.to;
    return { position: (to?.position ?? this.camera.position).clone(), target: (to?.target ?? this.controls.target).clone() };
  }

  /**
   * Show the source model where the voxelizer put it: world = (p − min) × scale
   * on every axis (a plate is 0.4 world units and 2.5 plates make a stud, so
   * the stretch in voxelize cancels out).
   * @param {THREE.Object3D | null} root
   * @param {{ min: number[], scale: number } | null} placement
   */
  setOriginal(root, placement) {
    this.original.clear();
    if (!root || !placement) return;
    const s = placement.scale;
    this.original.scale.setScalar(s);
    this.original.position.set(-placement.min[0] * s, -placement.min[1] * s, -placement.min[2] * s);
    this.original.add(root);
  }
}

/** Centre and bounding-sphere radius of a model grid, in world units. */
function gridSphere(grid) {
  const h = grid.sy * PLATE_H;
  return {
    center: new THREE.Vector3(grid.sx / 2, h / 2, grid.sz / 2),
    radius: 0.5 * Math.hypot(grid.sx, h, grid.sz),
  };
}
