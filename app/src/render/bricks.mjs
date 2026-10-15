import * as THREE from 'three';
import { PALETTE } from '../core/palette.mjs';
import { cellsOfPart } from '../core/model.mjs';
import { partType } from '../core/parts.mjs';
import { GAP, PLATE_H, partMatrix, shapeKeyOf, shapeOf } from './shapes.mjs';
import { fadedHex } from './fade.mjs';

export { PLATE_H } from './shapes.mjs';

/** Every part's colour when the model is drawn muted (the 「在哪」 spotlight on a loose part). */
const MUTED_HEX = 0xd0d4d9;
/** A tapped part is lightened a little toward this, and edged (`setSelection`), so it reads as selected but keeps its colour. */
const COLOR_SELECTED = new THREE.Color(0xffffff);
/** Edges of the selected part: dark ink on a light part, white on a dark one. */
const selectDark = new THREE.LineBasicMaterial({ color: 0x1f1d1a });
const selectLight = new THREE.LineBasicMaterial({ color: 0xffffff });
/** Default for the display-state predicates: nothing hidden, faded, outlined or marked. */
const NONE = () => false;
const raycaster = new THREE.Raycaster();
/** Outline of the current step's parts: the page accent colour. */
const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xc8321e });
/** The 12 edges of a unit box as 24 corner flags (x, y, z each 0 = min, 1 = max). */
const BOX_EDGES = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  [0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 1],
  [0, 0, 0], [0, 0, 1], [1, 0, 0], [1, 0, 1], [0, 1, 0], [0, 1, 1], [1, 1, 0], [1, 1, 1],
];

const material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 });
/** Preview of a part about to be added: see-through green where it fits, red where it does not. */
const ghostOk = new THREE.MeshStandardMaterial({ color: 0x2f9e44, transparent: true, opacity: 0.55, depthWrite: false });
const ghostBad = new THREE.MeshStandardMaterial({ color: 0xe03131, transparent: true, opacity: 0.55, depthWrite: false });
/** A hit this close to a part's top or bottom face (scene units; a plate is 0.4) still counts as on that face. */
const FACE_EPS = 0.05;
/** An upright face this far inside a part's outline is in its hollow underside (outer walls are at GAP / 2). */
const INSIDE = 0.08;

/** How far a point (model units) is inside a part's outline: to the nearest side, or for a round part to its rim. */
function insideBy(p, { x, z }) {
  if (partType(p)?.round) return p.w / 2 - Math.hypot(x - (p.x + p.w / 2), z - (p.z + p.d / 2));
  return Math.min(x - p.x, p.x + p.w - x, z - p.z, p.z + p.d - z);
}

/**
 * Draws one built model. Every part is one complete shape (body and its own
 * studs, `shapes.mjs`); all parts of the same shape share one instanced mesh,
 * so a model costs one draw call per part shape in it (a few dozen) and
 * recolouring, marking and picking work per part.
 */
export class BrickView {
  /** @param {THREE.Object3D} root where the meshes go (Stage.bricks) */
  constructor(root) {
    this.root = root;
    this.model = null;
    /** @type {Map<string, { mesh: THREE.InstancedMesh, ids: Int32Array }> | null} */
    this.meshes = null;
    this.visible = true;
    /** Preview of a part about to be added (setGhost). */
    this.ghost = null;
  }

  /** @param {import('../convert/build.mjs').BuiltModel} model */
  setModel(model) {
    this.dispose();
    const counts = new Map();
    const sample = new Map();
    for (const p of model.result.parts) {
      const key = shapeKeyOf(p);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!sample.has(key)) sample.set(key, p);
    }
    this.meshes = new Map();
    for (const [key, n] of counts) {
      const mesh = new THREE.InstancedMesh(shapeOf(sample.get(key)), material, n);
      mesh.setColorAt(0, new THREE.Color()); // allocate instance colours
      this.meshes.set(key, { mesh, ids: new Int32Array(n) });
      this.root.add(mesh);
    }
    this.model = model;
    this.setVisible(this.visible);
  }

  dispose() {
    this.setOutline([]);
    this.setGhost(null);
    if (!this.meshes) return;
    for (const { mesh } of this.meshes.values()) {
      this.root.remove(mesh);
      mesh.dispose(); // shape geometries are shared and cached; only instance buffers go
    }
    this.meshes = null;
  }

  /** Hide or show the bricks. */
  setVisible(visible) {
    this.visible = visible;
    if (this.meshes) for (const { mesh } of this.meshes.values()) mesh.visible = visible;
    if (this.outline) this.outline.visible = visible;
    if (this.selection) this.selection.visible = visible;
  }

  /**
   * The part under a screen point, or -1.
   * @param {THREE.Vector2} ndc pointer in normalized device coordinates (−1…1)
   * @param {THREE.Camera} camera
   */
  pick(ndc, camera) {
    if (!this.meshes || !this.visible) return -1;
    raycaster.setFromCamera(ndc, camera);
    const entries = [...this.meshes.values()];
    const hit = raycaster.intersectObjects(entries.map((e) => e.mesh), false)[0];
    if (!hit || hit.instanceId === undefined) return -1;
    return entries.find((e) => e.mesh === hit.object).ids[hit.instanceId];
  }

  /**
   * The part and the stud column under a screen point when the point is on
   * that part's top (its top face or a stud) or on its bottom face in that
   * column, else null (a side). Used to push a new part on top or hang it
   * underneath: stud = the grid column (x, z) the pointer is over.
   * @returns {{ id: number, stud: [number, number], side: 'top' | 'bottom' } | null}
   */
  pickFace(ndc, camera) {
    if (!this.meshes || !this.visible) return null;
    raycaster.setFromCamera(ndc, camera);
    const entries = [...this.meshes.values()];
    const hit = raycaster.intersectObjects(entries.map((e) => e.mesh), false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    const id = entries.find((e) => e.mesh === hit.object).ids[hit.instanceId];
    const local = this.root.worldToLocal(hit.point.clone());
    const stud = [Math.floor(local.x), Math.floor(local.z)];
    const column = cellsOfPart(this.model.result.parts[id])
      .filter(([x, , z]) => x === stud[0] && z === stud[1])
      .map(([, y]) => y);
    if (!column.length) return null;
    if (local.y >= (Math.max(...column) + 1) * PLATE_H - FACE_EPS) return { id, stud, side: 'top' };
    // Parts turn only about y, so the geometry's normal says whether the face points down:
    // the hollow's ceiling, the rim and the tube ends all count as the underside, and so does
    // an upright face well inside the outline (the hollow's inner walls, the tubes).
    const down = hit.face.normal.y < -0.5;
    const upright = Math.abs(hit.face.normal.y) < 0.5;
    if (down || (upright && insideBy(this.model.result.parts[id], local) > INSIDE) || local.y <= Math.min(...column) * PLATE_H + FACE_EPS) {
      return { id, stud, side: 'bottom' };
    }
    return null;
  }

  /**
   * A see-through preview of a part about to be added: green when it can go
   * there, red when not. Pass null to hide it.
   */
  setGhost(part, ok = true) {
    if (this.ghost) {
      this.root.remove(this.ghost);
      this.ghost = null;
    }
    if (!part) return;
    this.ghost = new THREE.Mesh(shapeOf(part), ok ? ghostOk : ghostBad);
    partMatrix(part, this.ghost.matrix);
    this.ghost.matrixAutoUpdate = false;
    this.ghost.renderOrder = 2;
    this.root.add(this.ghost);
  }

  /**
   * Draw the model in a display state. The renderer does not know why a part
   * looks the way it does: the caller says which parts are hidden, faded or
   * outlined, which carry a signal colour, and whether the rest is muted.
   * Colour per part: its `mark` colour, else grey when `muted`, else its own;
   * then the selected part is lightened, or a faded part paled keeping its hue (`fade.mjs`).
   *
   * @param {{ hidden?: (id: number) => boolean, faded?: (id: number) => boolean, outlined?: (id: number) => boolean,
   *   mark?: (part: object) => number, muted?: boolean, selected?: number, turn?: THREE.Matrix4 | null }} [view]
   *   `mark`: sRGB hex or 0 for none; `selected`: part id drawn lightened; `turn`: applied to every
   *   part drawn after its own placement (a sub-assembly shown upside down, `turnOver`)
   * @returns {number} parts shown
   */
  refresh({ hidden = NONE, faded = NONE, outlined = NONE, mark = NONE, muted = false, selected = -1, turn = null } = {}) {
    const { result } = this.model;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    const used = new Map([...this.meshes.keys()].map((k) => [k, 0]));
    let shown = 0;
    /** Outlined parts, so they show whatever their colour. */
    const outline = [];
    let picked = null;

    for (const p of result.parts) {
      if (hidden(p.id)) continue;
      shown++;
      let hex = mark(p) || (muted ? MUTED_HEX : PALETTE[p.color - 1].hex);
      if (p.id !== selected && faded(p.id)) hex = fadedHex(hex);
      color.setHex(hex);
      if (p.id === selected) {
        picked = { part: p, hex };
        color.lerp(COLOR_SELECTED, 0.15);
      }
      if (outlined(p.id)) outline.push(p);

      const key = shapeKeyOf(p);
      const entry = this.meshes.get(key);
      const i = used.get(key);
      partMatrix(p, m);
      if (turn) m.premultiply(turn);
      entry.mesh.setMatrixAt(i, m);
      entry.mesh.setColorAt(i, color);
      entry.ids[i] = p.id;
      used.set(key, i + 1);
    }
    for (const [key, { mesh }] of this.meshes) {
      mesh.count = used.get(key);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Raycasting caches bounds; instances moved, so let three recompute them.
      mesh.boundingSphere = null;
      mesh.boundingBox = null;
    }
    this.setOutline(outline, turn);
    this.setSelection(picked?.part, picked?.hex, turn);
    return shown;
  }

  /** Edge outline around the given parts (their boxes, then `turn` if given; replaces any previous one). */
  setOutline(list, turn = null) {
    this.outline = this.replaceLines(this.outline, list, turn, outlineMaterial);
  }

  /**
   * The selected part's box edges, dark on a light part and white on a dark
   * one, so the part keeps its own colour and still reads as selected.
   */
  setSelection(part, hex, turn = null) {
    const light = part && new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l > 0.45;
    this.selection = this.replaceLines(this.selection, part ? [part] : [], turn, light ? selectDark : selectLight);
  }

  /** Swap `old` (or nothing) for box edges around `list`; returns the new lines, or null for an empty list. */
  replaceLines(old, list, turn, mat) {
    if (old) {
      this.root.remove(old);
      old.geometry.dispose();
    }
    if (!list.length) return null;
    const pts = new Float32Array(list.length * BOX_EDGES.length * 3);
    let k = 0;
    for (const p of list) {
      const x0 = p.x + GAP / 2;
      const x1 = p.x + p.w - GAP / 2;
      const y0 = p.y * PLATE_H;
      const y1 = (p.y + p.h) * PLATE_H;
      const z0 = p.z + GAP / 2;
      const z1 = p.z + p.d - GAP / 2;
      for (const [cx, cy, cz] of BOX_EDGES) {
        pts[k++] = cx ? x1 : x0;
        pts[k++] = cy ? y1 : y0;
        pts[k++] = cz ? z1 : z0;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    if (turn) geo.applyMatrix4(turn);
    const lines = new THREE.LineSegments(geo, mat);
    lines.visible = this.visible;
    this.root.add(lines);
    return lines;
  }
}
