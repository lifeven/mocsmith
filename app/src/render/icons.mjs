import * as THREE from 'three';
import { shapeOf } from './shapes.mjs';

/** The part box's one colour for every picture. */
const NEUTRAL = 0xc9a46a;

/**
 * Small pictures of part shapes for the part box, drawn once with a
 * throwaway renderer (a few dozen tiny renders, a few milliseconds each),
 * which then gives its WebGL context back. Each picture shows the part from
 * the front right and above, in one neutral colour, long side (or downhill)
 * along +x like the shapes themselves.
 *
 * @param {{ key: string, part: object, hex?: number }[]} items `part`: kind, w, d, h, and `ldraw` / `dir` where needed;
 *   `hex`: the part's colour (default a neutral tan, as in the part box)
 * @param {number} [size] CSS pixels; drawn at twice that
 * @returns {Map<string, string>} key → PNG data URL
 */
export function drawIcons(items, size = 56) {
  const px = size * 2;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(px, px, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(30, 60, 40);
  scene.add(sun);
  const material = new THREE.MeshStandardMaterial({ color: NEUTRAL, roughness: 0.4 });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const view = new THREE.Vector3(1.1, 1.2, 1.6).normalize();
  const out = new Map();
  for (const { key, part, hex } of items) {
    material.color.setHex(hex ?? NEUTRAL);
    const geometry = shapeOf(part);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    const sphere = geometry.boundingSphere;
    const r = sphere.radius * 1.02;
    camera.left = -r;
    camera.right = r;
    camera.top = r;
    camera.bottom = -r;
    camera.position.copy(sphere.center).addScaledVector(view, r * 4);
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    out.set(key, canvas.toDataURL('image/png'));
    scene.remove(mesh); // the geometry is the shared cached one: keep it
  }
  material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
