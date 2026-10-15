/**
 * 2D mosaic: a photo → a grid of 1×1 parts, one per stud, in colours LEGO
 * really made that part in (data/mosaic-colours.json). Pure functions, no DOM:
 * the page hands in ImageData-like pixels and gets back colour indices.
 *
 * Steps:
 *   1. crop and shrink to the grid by area averaging (in linear light, so a
 *      thin bright line keeps its share of brightness);
 *   2. adjust brightness / contrast / saturation in Lab;
 *   3. nearest colour (straight-line Lab distance by default, see METRICS);
 *   4. if more colours are used than allowed, drop the one whose loss costs
 *      least error, until the cap is met;
 *   5. optional error-diffusion dithering, then put back 1-cell lines and dots;
 *   or, with a `stock` of parts in hand, steps 3–5 become the two-phase
 *   limited-stock assignment (stock.mjs).
 *
 * Files: palette.mjs (parts and colours), colour.mjs (colour maths and
 * distances), sample.mjs (steps 1–2), quantize.mjs (steps 3–5), stock.mjs
 * (the limited stock); this file
 * runs them in order.
 */

import { SURFACE_PARTS, mosaicPalette } from './palette.mjs';
import { DEFAULT_METRIC, deltaE2000 } from './colour.mjs';
import { adjustLab, fitCrop, gridSize, sampleLab } from './sample.mjs';
import { keepThinLines, quantize } from './quantize.mjs';
import { limitToStock, STOCK_MODES } from './stock.mjs';

/**
 * Photo → mosaic in one call.
 * @param {Pixels} img
 * @param {{ part?: string, studs?: number, crop?: { x: number, y: number, w: number, h: number }, maxColours?: number, dither?: 'none' | 'floyd' | 'atkinson', keepLines?: boolean, metric?: keyof METRICS, brightness?: number, contrast?: number, saturation?: number, minSets?: number, special?: boolean, cache?: Map<string, Float32Array> }} [opts]
 *   crop: the part of the photo to use (default all of it); the centred part with the grid's aspect is taken from it (fitCrop).
 *   keepLines: put back 1-cell lines and dots (default on).
 *   cache: keeps the shrunk photo per grid size, so changing only colours, parts or dithering skips the slowest step; use one Map per photo.
 *   stock: Rebrickable colour id → parts in hand ("only the parts I have"); the colour cap, dithering and line keeping are then off,
 *   colours in the stock count even when rare or special, and cells beyond the stock take their nearest usual colour and are listed in `buy`.
 *   stockMode: key of STOCK_MODES (default 'fewest'): how far a box colour may be from a cell's best colour before the cell is bought instead;
 *   the result's `shortBy` gives the parts to buy under every mode.
 */
export function buildMosaic(img, opts = {}) {
  const { part = 'roundTile', studs = 48, maxColours = Infinity, dither = 'none', keepLines = true, metric = DEFAULT_METRIC, minSets, special, cache } = opts;
  const region = opts.crop ?? { x: 0, y: 0, w: img.width, h: img.height };
  const { width, height } = gridSize(region, studs);
  const crop = fitCrop(region, width, height);
  const { stock } = opts;
  const usual = mosaicPalette(part, { minSets, special });
  const palette = stock
    ? mosaicPalette(part, { minSets: 0, special: true }).filter((c) => stock.get(c.code) > 0 || usual.some((u) => u.code === c.code))
    : usual;
  const key = `${width}x${height}:${crop.x},${crop.y},${crop.w},${crop.h}`;
  let sampled = cache?.get(key);
  if (!sampled) {
    sampled = sampleLab(img, crop, width, height);
    cache?.set(key, sampled);
  }
  const lab = adjustLab(Float32Array.from(sampled), opts);
  let cells;
  let used;
  let quantError = 0;
  let lineCells = 0;
  let buy = [];
  let short = 0;
  let shortBy = null;
  if (stock) {
    const r = limitToStock(lab, palette, stock, { metric, tolerance: STOCK_MODES[opts.stockMode ?? 'fewest'] });
    shortBy = r.shortBy;
    cells = r.cells;
    used = [...new Set(cells)];
    buy = [...r.buy].map(([p, count]) => ({ code: palette[p].code, count })).sort((a, b) => b.count - a.count);
    short = r.short;
  } else {
    ({ cells, used, error: quantError } = quantize(lab, palette, { maxColours, dither, width, metric }));
    lineCells = keepLines ? keepThinLines(lab, width, palette, used, cells, metric) : 0;
  }
  let error = quantError;
  if (lineCells || stock) {
    error = 0;
    for (let c = 0; c < cells.length; c++) error += deltaE2000([lab[c * 3], lab[c * 3 + 1], lab[c * 3 + 2]], palette[cells[c]].lab);
    error /= cells.length;
  }
  const counts = new Map();
  for (const p of cells) counts.set(p, (counts.get(p) ?? 0) + 1);
  return {
    width,
    height,
    crop,
    part,
    partId: SURFACE_PARTS[part],
    palette,
    cells,
    colours: used.filter((p) => counts.has(p)).map((p) => ({ ...palette[p], index: p, count: counts.get(p) })).sort((a, b) => b.count - a.count),
    error,
    lineCells,
    ...(stock && { buy, short, shortBy, stocked: [...stock.values()].reduce((a, b) => a + b, 0) }),
  };
}
