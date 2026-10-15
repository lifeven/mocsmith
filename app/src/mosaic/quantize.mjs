import { DEFAULT_METRIC, METRICS, deltaE2000 } from './colour.mjs';

/**
 * Lab cells → palette indices: nearest colour, the colour cap (drop the
 * colour whose loss costs least), optional error-diffusion dithering, and
 * putting back 1-cell lines and dots.
 *
 * @typedef {import('./palette.mjs').MosaicColour} MosaicColour
 */

/** A colour on fewer than this share of cells … */
export const SMALL_SHARE = 0.02;
/** … whose cells would move by more than this mean ΔE2000 counts as a detail. */
export const DETAIL_DE = 20;

/**
 * Nearest palette colour for every cell, then drop colours until at most
 * `maxColours` are used. Each round removes the colour whose cells would gain
 * the least total ΔE by moving to their next-best kept colour; a small patch
 * that would change a lot (SMALL_SHARE, DETAIL_DE) is kept while another
 * big colour can go, so an eye outlasts a big area.
 * @param {Float32Array} lab  3 floats per cell
 * @param {MosaicColour[]} palette
 * @param {{ maxColours?: number, dither?: 'none' | 'floyd' | 'atkinson', width?: number, metric?: keyof METRICS }} [opts]  width: grid width, needed for dithering
 * @returns {{ cells: Uint8Array, used: number[], error: number }}  cells: palette index per cell; used: palette indices in use; error: mean ΔE2000 per cell
 */
export function quantize(lab, palette, { maxColours = Infinity, dither = 'none', width = 0, metric = DEFAULT_METRIC } = {}) {
  const M = METRICS[metric];
  if (!M) throw new Error(`unknown metric ${metric}`);
  const n = lab.length / 3;
  const P = palette.length;
  const pal = palette.map((c) => M.space(c.lab));
  // Distances are computed once per distinct cell colour: shrunk photos repeat a lot.
  const keyOf = new Map();
  const uniq = [];
  const cellUniq = new Uint32Array(n);
  for (let c = 0; c < n; c++) {
    const key = `${lab[c * 3].toFixed(2)},${lab[c * 3 + 1].toFixed(2)},${lab[c * 3 + 2].toFixed(2)}`;
    let u = keyOf.get(key);
    if (u === undefined) {
      u = uniq.length;
      keyOf.set(key, u);
      uniq.push(c);
    }
    cellUniq[c] = u;
  }
  const U = uniq.length;
  const dist = new Float32Array(U * P);
  const weight = new Uint32Array(U);
  const labOf = (u) => [lab[uniq[u] * 3], lab[uniq[u] * 3 + 1], lab[uniq[u] * 3 + 2]];
  for (let c = 0; c < n; c++) weight[cellUniq[c]]++;
  for (let u = 0; u < U; u++) {
    const cs = M.space(labOf(u));
    for (let p = 0; p < P; p++) dist[u * P + p] = M.d(cs, pal[p]);
  }

  const kept = new Uint8Array(P).fill(1);
  const best = new Uint16Array(U);
  const assign = () => {
    let total = 0;
    for (let u = 0; u < U; u++) {
      let b = -1;
      let bd = Infinity;
      for (let p = 0; p < P; p++) {
        if (kept[p] && dist[u * P + p] < bd) {
          bd = dist[u * P + p];
          b = p;
        }
      }
      best[u] = b;
      total += bd * weight[u];
    }
    return total;
  };
  let total = assign();
  const usedSet = () => new Set(Array.from(best));
  let used = usedSet();
  // Colours nobody picks don't count against the cap; only consider used ones.
  for (let p = 0; p < P; p++) if (!used.has(p)) kept[p] = 0;

  while (used.size > maxColours && used.size > 1) {
    // Cost of dropping p: total distance its cells gain by moving to their
    // next-best kept colour; `moved` is the same move measured in ΔE2000, so
    // the detail test below keeps one meaning whatever the metric.
    const cost = new Map();
    const count = new Map();
    const moved = new Map();
    for (const p of used) {
      let sum = 0;
      let cells = 0;
      let de = 0;
      for (let u = 0; u < U; u++) {
        if (best[u] !== p) continue;
        let alt = Infinity;
        let altQ = -1;
        for (let q = 0; q < P; q++) {
          if (q !== p && kept[q] && dist[u * P + q] < alt) {
            alt = dist[u * P + q];
            altQ = q;
          }
        }
        sum += (alt - dist[u * P + p]) * weight[u];
        cells += weight[u];
        de += deltaE2000(labOf(u), palette[altQ].lab) * weight[u];
      }
      cost.set(p, sum);
      count.set(p, cells);
      moved.set(p, de / cells);
    }
    // A small patch that would turn into a clearly different colour (an eye, a
    // nose) costs little total error but is what makes the picture readable:
    // keep it while another non-detail colour can go (< 2 % of cells,
    // ΔE > 20). The last big colour is never dropped to save a detail.
    const isDetail = (p) => count.get(p) < SMALL_SHARE * n && moved.get(p) > DETAIL_DE;
    const candidates = [...used].filter((p) => !isDetail(p));
    const pool = candidates.length >= 2 ? candidates : [...used];
    let drop = pool[0];
    for (const p of pool) if (cost.get(p) < cost.get(drop)) drop = p;
    kept[drop] = 0;
    total = assign();
    used = usedSet();
  }

  const cells = new Uint8Array(n);
  for (let c = 0; c < n; c++) cells[c] = best[cellUniq[c]];
  const keptList = [...used].sort((a, b) => a - b);
  if (dither && dither !== 'none') {
    if (!width) throw new Error('dithering needs the grid width');
    diffuse(lab, width, palette, keptList, KERNELS[dither], cells, M, pal);
  }
  // Reported error is always mean ΔE2000, so metrics can be compared.
  let error = 0;
  for (let c = 0; c < n; c++) error += deltaE2000(labOf(cellUniq[c]), palette[cells[c]].lab);
  return { cells, used: keptList, error: error / n };
}

/** Error-diffusion kernels: [dx, dy, weight], weights already divided. */
export const KERNELS = {
  // Floyd & Steinberg 1976: 7 3 5 1 / 16, all error passed on.
  floyd: [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]],
  // Atkinson (Apple, 1980s): 1/8 to six neighbours, 2/8 of the error dropped -> crisper, more contrast.
  atkinson: [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]],
};

/**
 * Error diffusion in Lab over the kept colours, serpentine (left-to-right on
 * even rows, right-to-left on odd rows, kernel mirrored) to avoid the drift
 * patterns of plain raster order. Writes palette indices into `cells`.
 */
function diffuse(lab, width, palette, kept, kernel, cells, M, pal) {
  if (!kernel) throw new Error('unknown dither');
  const n = lab.length / 3;
  const height = n / width;
  const work = Float32Array.from(lab);
  const cur = [0, 0, 0];
  // Only error the kept colours can actually work off is passed on: clamp the
  // target into their Lab bounding box first. Otherwise a region lighter than
  // the lightest kept colour sends a steady excess sideways along every row
  // and lightens the far end of the picture.
  const lo = [0, 1, 2].map((k) => Math.min(...kept.map((p) => palette[p].lab[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...kept.map((p) => palette[p].lab[k])));
  for (let y = 0; y < height; y++) {
    const ltr = y % 2 === 0;
    for (let i = 0; i < width; i++) {
      const x = ltr ? i : width - 1 - i;
      const c = y * width + x;
      for (let k = 0; k < 3; k++) cur[k] = Math.min(hi[k], Math.max(lo[k], work[c * 3 + k]));
      const cs = M.space(cur);
      let b = kept[0];
      let bd = Infinity;
      for (const p of kept) {
        const d = M.d(cs, pal[p]);
        if (d < bd) {
          bd = d;
          b = p;
        }
      }
      cells[c] = b;
      const e0 = cur[0] - palette[b].lab[0];
      const e1 = cur[1] - palette[b].lab[1];
      const e2 = cur[2] - palette[b].lab[2];
      for (const [dx, dy, w] of kernel) {
        const nx = x + (ltr ? dx : -dx);
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const k = (ny * width + nx) * 3;
        work[k] += e0 * w;
        work[k + 1] += e1 * w;
        work[k + 2] += e2 * w;
      }
    }
  }
}


/** A cell this much ΔE2000 darker or lighter than both neighbours on one axis is a line or dot … */
export const RIDGE_DE = 5;
/** … if those two neighbours are this close to each other (a line across a plain area, not texture). */
export const FLAT_DE = 5;
/** The colour it gets must stand out from the neighbours' colour by at least this much. */
export const SHOW_DE = 10;

/**
 * Put back lines and dots one cell wide that the colour matching erased.
 * Shrinking averages a thin line into a cell that is only a little darker or
 * lighter than its surroundings, so the nearest colour is the background's
 * and the line disappears. For each cell that
 * is a ridge in the source — darker (or lighter) than both neighbours along a
 * row or a column, those neighbours alike — and whose result equals both
 * neighbours' result, choose the kept colour on the ridge's side (darker for a
 * dark line) that differs visibly from the neighbours and is nearest the source.
 * Edits `cells` in place; returns how many cells changed.
 * @param {Float32Array} lab  source Lab, 3 floats per cell
 * @param {number} width
 * @param {MosaicColour[]} palette
 * @param {number[]} kept  palette indices allowed
 * @param {Uint8Array} cells
 * @param {keyof METRICS} [metric]  picks the replacement nearest the source
 */
export function keepThinLines(lab, width, palette, kept, cells, metric = DEFAULT_METRIC) {
  const M = METRICS[metric];
  const n = lab.length / 3;
  const height = n / width;
  const at = (c) => [lab[c * 3], lab[c * 3 + 1], lab[c * 3 + 2]];
  const result = Uint8Array.from(cells);
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = y * width + x;
      const src = at(c);
      for (const [a, b] of [[x > 0 ? c - 1 : -1, x < width - 1 ? c + 1 : -1], [y > 0 ? c - width : -1, y < height - 1 ? c + width : -1]]) {
        if (a < 0 || b < 0) continue;
        if (result[a] !== result[c] || result[b] !== result[c]) continue;
        const la = at(a);
        const lb = at(b);
        if (deltaE2000(la, lb) > FLAT_DE) continue;
        const side = Math.sign(src[0] - la[0]);
        if (side === 0 || side !== Math.sign(src[0] - lb[0])) continue;
        if (deltaE2000(src, la) < RIDGE_DE || deltaE2000(src, lb) < RIDGE_DE) continue;
        const around = palette[result[c]].lab;
        let best = -1;
        let bd = Infinity;
        for (const q of kept) {
          const ql = palette[q].lab;
          if (Math.sign(ql[0] - around[0]) !== side || deltaE2000(ql, around) < SHOW_DE) continue;
          const d = M.d(M.space(src), M.space(ql));
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
        if (best >= 0) {
          cells[c] = best;
          changed++;
          break;
        }
      }
    }
  }
  return changed;
}
