/**
 * 2.5D mosaic: the near parts of the picture stand up on plates
 *. Pure functions: depth
 * per cell (mosaic/depth.mjs `depthForGrid`, 0 far … 1 near) → a height level
 * per cell → the plates that lift each level, laid per base so no plate
 * crosses a base seam.
 *
 * Level k means k plates under the surface part. Layer z holds the cells with
 * level > z, so every plate stands on the base (z = 0) or on plates of the
 * layer below. The plates are hidden under the surface; only the step sides
 * show, so they are black like the base.
 */

/** Raise plates, largest first: [w, d, Rebrickable / LDraw part number, name]. All made in black. */
export const RAISE_PLATES = [
  [4, 8, '3035', 'Plate 4 x 8'],
  [4, 6, '3032', 'Plate 4 x 6'],
  [4, 4, '3031', 'Plate 4 x 4'],
  [2, 8, '3034', 'Plate 2 x 8'],
  [2, 6, '3795', 'Plate 2 x 6'],
  [2, 4, '3020', 'Plate 2 x 4'],
  [2, 3, '3021', 'Plate 2 x 3'],
  [2, 2, '3022', 'Plate 2 x 2'],
  [1, 8, '3460', 'Plate 1 x 8'],
  [1, 6, '3666', 'Plate 1 x 6'],
  [1, 4, '3710', 'Plate 1 x 4'],
  [1, 3, '3623', 'Plate 1 x 3'],
  [1, 2, '3023', 'Plate 1 x 2'],
  [1, 1, '3024', 'Plate 1 x 1'],
];
/** Rebrickable colour id (= LDraw code) of the raise plates: Black. */
export const RAISE_COLOUR = 0;

/**
 * Depth 0…1 per cell → level 0…levels-1 per cell: 1D k-means with `levels`
 * centres (started evenly), so a picture with a near subject on a far
 * background splits where its depths split, not at fixed fractions.
 *
 * @param {Float32Array} depth gw × gh
 * @param {number} levels 2…4
 * @returns {Uint8Array}
 */
export function depthLevels(depth, levels = 3) {
  const k = Math.max(1, Math.min(8, Math.round(levels)));
  const centres = Array.from({ length: k }, (_, i) => (i + 0.5) / k);
  const nearest = (v) => {
    let best = 0;
    for (let i = 1; i < k; i++) if (Math.abs(v - centres[i]) < Math.abs(v - centres[best])) best = i;
    return best;
  };
  for (let iter = 0; iter < 20; iter++) {
    const sum = new Float64Array(k);
    const n = new Float64Array(k);
    for (const v of depth) {
      const c = nearest(v);
      sum[c] += v;
      n[c]++;
    }
    let moved = 0;
    for (let i = 0; i < k; i++) {
      if (!n[i]) continue;
      const c = sum[i] / n[i];
      moved = Math.max(moved, Math.abs(c - centres[i]));
      centres[i] = c;
    }
    centres.sort((a, b) => a - b);
    if (moved < 1e-4) break;
  }
  const out = new Uint8Array(depth.length);
  for (let i = 0; i < depth.length; i++) out[i] = nearest(depth[i]);
  return out;
}

/**
 * Remove specks: each cell takes the most common level in its 3 × 3
 * neighbourhood when that level holds at least 5 of the 9 (edge cells count
 * what they have). Repeated `passes` times.
 *
 * @param {Uint8Array} levels gw × gh
 * @returns {Uint8Array} a new array
 */
export function smoothLevels(levels, gw, gh, passes = 2) {
  let cur = levels;
  for (let p = 0; p < passes; p++) {
    const next = cur.slice();
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const count = new Map();
        let total = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
            const v = cur[yy * gw + xx];
            count.set(v, (count.get(v) ?? 0) + 1);
            total++;
          }
        }
        let best = cur[y * gw + x];
        for (const [v, n] of count) if (n > (count.get(best) ?? 0)) best = v;
        if ((count.get(best) ?? 0) * 9 >= 5 * total) next[y * gw + x] = best;
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * The plates that lift each level: layer z covers the cells with level > z,
 * one base block (`side` × `side`) at a time, greedily from the top-left,
 * largest plate that fits first. Odd layers try plates turned the other way
 * first, so seams of stacked layers cross.
 *
 * @param {Uint8Array} levels gw × gh
 * @param {number} gw
 * @param {number} gh
 * @param {number} side base side in cells (16 for LEGO Art panels)
 * @returns {{ plates: { x: number, y: number, w: number, h: number, z: number, part: string }[], heights: Uint8Array, counts: Map<string, number> }}
 *   x, y: top-left cell; w, h: cells across and down; z: layer (0 = on the base); heights: plates under each cell
 */
export function raisePlates(levels, gw, gh, side = 16) {
  const plates = [];
  const counts = new Map();
  let top = 0;
  for (const v of levels) top = Math.max(top, v);
  for (let z = 0; z < top; z++) {
    const covered = new Uint8Array(gw * gh);
    const want = (x, y) => levels[y * gw + x] > z && !covered[y * gw + x];
    for (let by = 0; by < gh; by += side) {
      for (let bx = 0; bx < gw; bx += side) {
        const ex = Math.min(gw, bx + side);
        const ey = Math.min(gh, by + side);
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            if (!want(x, y)) continue;
            let pick = null;
            for (const [a, b, part] of RAISE_PLATES) {
              const turns = a === b ? [[a, b]] : z % 2 ? [[b, a], [a, b]] : [[a, b], [b, a]];
              for (const [w, h] of turns) {
                if (x + w > ex || y + h > ey) continue;
                let ok = true;
                for (let yy = y; yy < y + h && ok; yy++) for (let xx = x; xx < x + w && ok; xx++) ok = want(xx, yy);
                if (ok) {
                  pick = { x, y, w, h, z, part };
                  break;
                }
              }
              if (pick) break;
            }
            for (let yy = pick.y; yy < pick.y + pick.h; yy++) for (let xx = pick.x; xx < pick.x + pick.w; xx++) covered[yy * gw + xx] = 1;
            plates.push(pick);
            counts.set(pick.part, (counts.get(pick.part) ?? 0) + 1);
          }
        }
      }
    }
  }
  return { plates, heights: levels.slice(), counts };
}
