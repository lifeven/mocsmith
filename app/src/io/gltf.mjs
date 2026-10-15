import * as THREE from 'three';
import { colouredMesh } from '../core/mesh-data.mjs';

/**
 * Flatten a loaded glTF scene into one mesh in world space, as plain data
 * that can be posted to the pipeline Worker. Colour per surface point =
 * base-colour texture × material colour × vertex colour, whichever of these
 * the mesh has (see `core/mesh-data.mjs`). Skinned meshes are taken in
 * their current pose. Needs a DOM canvas only when a material has a texture.
 *
 * @param {THREE.Object3D} root e.g. `gltf.scene`
 * @returns {import('../core/mesh-data.mjs').MeshData}
 */
export function meshDataFromGltf(root) {
  root.updateMatrixWorld(true);
  const positions = [];
  const uvs = [];
  const vcols = [];
  const indices = [];
  const triMaterial = [];
  const materials = [];
  const materialIds = new Map();
  const v = new THREE.Vector3();

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.visible) return;
    const g = obj.geometry;
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const col = g.attributes.color;
    const base = positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (obj.isSkinnedMesh) obj.applyBoneTransform(i, v);
      v.applyMatrix4(obj.matrixWorld);
      positions.push(v.x, v.y, v.z);
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      if (col) vcols.push(linearToSrgb(col.getX(i)), linearToSrgb(col.getY(i)), linearToSrgb(col.getZ(i)));
      else vcols.push(1, 1, 1);
    }

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const ids = mats.map((m) => {
      if (!materialIds.has(m)) {
        materialIds.set(m, materials.length);
        materials.push(readMaterial(m));
      }
      return materialIds.get(m);
    });
    const idx = g.index;
    const count = idx ? idx.count : pos.count;
    const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const group of groups) {
      const mat = ids[group.materialIndex ?? 0] ?? ids[0];
      for (let k = group.start; k + 2 < group.start + group.count; k += 3) {
        for (let j = 0; j < 3; j++) indices.push(base + (idx ? idx.getX(k + j) : k + j));
        triMaterial.push(mat);
      }
    }
  });

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    uvs: new Float32Array(uvs),
    vcols: new Float32Array(vcols),
    triMaterial: new Uint32Array(triMaterial),
    materials,
  };
}

/**
 * The same mesh wrapped with its colour lookup, ready for `buildModel` on the
 * main thread (tests, fallback when there is no Worker).
 *
 * @param {THREE.Object3D} root
 */
export function colouredMeshFromGltf(root) {
  return colouredMesh(meshDataFromGltf(root));
}

/** Material colour as sRGB 0–1 plus base-colour texture pixels, if any. */
function readMaterial(m) {
  const hex = m.color ? m.color.getHex(THREE.SRGBColorSpace) : 0xffffff;
  const color = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const image = m.map?.image;
  if (!image || !image.width) return { color, pixels: null };
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // glTF textures are not flipped (flipY = false), so row 0 is v = 0.
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
  return { color, pixels: { data, width, height } };
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}
