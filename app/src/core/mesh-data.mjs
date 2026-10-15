/**
 * Coloured meshes as plain data, so a mesh can be sent to a Web Worker
 * (functions cannot be posted; typed arrays and plain objects can).
 *
 * @typedef {object} MeshData
 * @property {Float32Array} positions world-space xyz
 * @property {Uint32Array} indices triangle list
 * @property {Float32Array} uvs 2 per vertex
 * @property {Float32Array} vcols vertex colour, 3 per vertex, sRGB 0–1 (1 when none)
 * @property {Uint32Array} triMaterial material index per triangle
 * @property {{ color: number[], pixels: { data: Uint8ClampedArray, width: number, height: number } | null }[]} materials
 *   sRGB 0–1 colour and base-colour texture pixels (RGBA, row 0 is v = 0)
 */

/**
 * Wrap mesh data with the colour lookup the voxelizer uses: base-colour
 * texture × material colour × vertex colour at a point on a triangle.
 *
 * @param {MeshData} data
 * @returns {import('../convert/voxelize.mjs').ColouredMesh & { triangles: number }}
 */
export function colouredMesh(data) {
  const { positions, indices: tri, uvs, vcols, triMaterial, materials } = data;
  return {
    positions,
    indices: tri,
    triangles: tri.length / 3,
    /** The plain data behind this mesh (delighting reads UVs and materials). */
    data,
    colourAt(t, u, w) {
      const m = materials[triMaterial[t]];
      const a = tri[t * 3];
      const b = tri[t * 3 + 1];
      const c = tri[t * 3 + 2];
      const wa = 1 - u - w;
      const rgb = [m.color[0], m.color[1], m.color[2]];
      if (m.pixels) {
        const tu = wa * uvs[a * 2] + u * uvs[b * 2] + w * uvs[c * 2];
        const tv = wa * uvs[a * 2 + 1] + u * uvs[b * 2 + 1] + w * uvs[c * 2 + 1];
        const { data: px, width, height } = m.pixels;
        const x = Math.min(width - 1, Math.floor(wrap(tu) * width));
        const y = Math.min(height - 1, Math.floor(wrap(tv) * height));
        const o = (y * width + x) * 4;
        rgb[0] *= px[o] / 255;
        rgb[1] *= px[o + 1] / 255;
        rgb[2] *= px[o + 2] / 255;
      }
      for (let ch = 0; ch < 3; ch++) {
        rgb[ch] *= wa * vcols[a * 3 + ch] + u * vcols[b * 3 + ch] + w * vcols[c * 3 + ch];
      }
      return [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255];
    },
  };
}

function wrap(x) {
  return x - Math.floor(x);
}
