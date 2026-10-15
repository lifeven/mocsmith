import * as THREE from 'three';
import { partMatrix, shapeKeyOf, shapeOf } from './shapes.mjs';

/**
 * How much of each new part a camera would see:
 * a small off-screen render where every part is drawn in a flat colour that
 * encodes its id (id + 1 as 24-bit RGB, 0 = nothing), read back and counted.
 * A part's share is its pixels with everything shown so far drawn, over its
 * pixels with only the new parts drawn.
 *
 * One render target and one instanced mesh per part shape, reused for every
 * call; a call costs two renders and two read-backs at `size` × `size`.
 */
export class IdBuffer {
  /**
   * @param {THREE.WebGLRenderer} renderer the page's renderer (its state is restored)
   * @param {number} [size] buffer width in pixels
   * @param {number} [height] buffer height (default square)
   */
  constructor(renderer, size = 256, height = size) {
    this.renderer = renderer;
    this.size = size;
    this.height = height;
    this.target = new THREE.WebGLRenderTarget(size, height, { depthBuffer: true });
    this.scene = new THREE.Scene();
    this.material = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.pixels = new Uint8Array(size * height * 4);
    /** @type {Map<string, THREE.InstancedMesh>} */
    this.meshes = new Map();
    this.parts = null;
  }

  /** The parts to draw from (a model's `result.parts`); meshes sized for all of them. */
  setParts(parts) {
    if (parts === this.parts) return;
    this.dispose();
    this.parts = parts;
    const counts = new Map();
    const sample = new Map();
    for (const p of parts) {
      const key = shapeKeyOf(p);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!sample.has(key)) sample.set(key, p);
    }
    for (const [key, n] of counts) {
      const mesh = new THREE.InstancedMesh(shapeOf(sample.get(key)), this.material, n);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      mesh.frustumCulled = false;
      this.meshes.set(key, mesh);
      this.scene.add(mesh);
    }
  }

  dispose() {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();
    this.parts = null;
  }

  /**
   * Pixels per part id seen from `camera` with only the parts `drawn(id)` drawn.
   * @param {(id: number) => boolean} drawn
   * @param {THREE.Camera} camera
   * @param {THREE.Matrix4 | null} [turn] applied after each part's placement, as `BrickView.refresh`
   * @returns {Map<number, number>}
   */
  count(drawn, camera, turn = null) {
    const seen = new Map();
    const px = this.render(drawn, camera, turn);
    for (let k = 0; k < px.length; k += 4) {
      const code = (px[k] << 16) | (px[k + 1] << 8) | px[k + 2];
      if (code) seen.set(code - 1, (seen.get(code - 1) ?? 0) + 1);
    }
    return seen;
  }

  /**
   * Draw the parts `drawn(id)` from `camera` and read the buffer back: RGBA
   * rows from the bottom up, each pixel the id + 1 of the part seen there as
   * 24-bit RGB (0 = nothing). The array is reused by the next call.
   * @param {(id: number) => boolean} drawn
   * @param {THREE.Camera} camera
   * @param {THREE.Matrix4 | null} [turn]
   * @returns {Uint8Array}
   */
  render(drawn, camera, turn = null) {
    const used = new Map([...this.meshes.keys()].map((k) => [k, 0]));
    const m = new THREE.Matrix4();
    for (const p of this.parts) {
      if (!drawn(p.id)) continue;
      const key = shapeKeyOf(p);
      const mesh = this.meshes.get(key);
      const i = used.get(key);
      partMatrix(p, m);
      if (turn) m.premultiply(turn);
      mesh.setMatrixAt(i, m);
      const code = p.id + 1;
      mesh.instanceColor.setXYZ(i, ((code >> 16) & 255) / 255, ((code >> 8) & 255) / 255, (code & 255) / 255);
      used.set(key, i + 1);
    }
    for (const [key, mesh] of this.meshes) {
      mesh.count = used.get(key);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }

    const { renderer } = this;
    const before = { target: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, camera);
    renderer.readRenderTargetPixels(this.target, 0, 0, this.size, this.height, this.pixels);
    renderer.setRenderTarget(before.target);
    renderer.setClearColor(before.clear, before.alpha);
    return this.pixels;
  }

  /**
   * Share of each new part that shows (0–1) when the parts `shown(id)` are on
   * the model; a new part out of view counts 0.
   * @param {(id: number) => boolean} shown everything on the model at this step, new parts included
   * @param {number[]} newIds
   * @param {THREE.Camera} camera
   * @param {THREE.Matrix4 | null} [turn]
   * @returns {Map<number, number>}
   */
  shares(shown, newIds, camera, turn = null) {
    const fresh = new Set(newIds);
    const alone = this.count((id) => fresh.has(id), camera, turn);
    const all = this.count(shown, camera, turn);
    return new Map(newIds.map((id) => [id, alone.get(id) ? (all.get(id) ?? 0) / alone.get(id) : 0]));
  }
}
