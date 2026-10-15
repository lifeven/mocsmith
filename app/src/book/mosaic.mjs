import { FONT, INK, MUTED, fit, fitImage, wrap } from './draw.mjs';
import { PAGE, drawFootnote } from './pages.mjs';

/**
 * The instruction book of a flat mosaic ,
 * on the same A4 pages as the 3D book (`pages.mjs`, `pdf.mjs`): a cover,
 * the colour key (one number per colour), a map of the bases, then one page
 * per base with its cells drawn in their colours and numbered, "paint by
 * numbers" style, and the colours that base needs. A 2.5D mosaic
 * (mosaic/relief.mjs) gets a raise-plate page before each base that has
 * plates: where each plate goes, layer by layer, and how many of each size.
 * Pure layout and canvas drawing; the colours, names and words come from the
 * caller.
 */

const LINE = '#c9d3df';
/** Raise-plate layers on their page: each layer's grid in its own grey (the plates themselves are all black). */
const LAYER_FILL = ['#d6d0c4', '#8f897d', '#57524a', '#3a3631'];

/** Row names of the bases: A, B, C … (then AA, AB …). */
export function rowName(r) {
  let s = '';
  for (let n = r + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * @param {{ width: number, height: number, cells: ArrayLike<number>, palette: { code: number }[], colours: { code: number, count: number }[] }} mosaic
 *   buildMosaic() result; `colours` (most used first) sets the colour numbers 1, 2, 3 …
 * @param {{ side: number, cols: number, rows: number }} plan a fitting base plan (planBases)
 * @param {{ plates: { x: number, y: number, w: number, h: number, z: number, part: string }[] } | null} [relief]
 *   raisePlates() for this mosaic and base (2.5D); plates never cross a base seam
 */
export function layoutMosaicBook(mosaic, plan, relief = null) {
  const { width, cells, palette, colours } = mosaic;
  const numberOf = new Map(colours.map((c, i) => [c.code, i + 1]));
  /** Colour number of each cell, row by row. */
  const numbers = Uint8Array.from(cells, (p) => numberOf.get(palette[p].code));
  const pages = [{ type: 'cover' }, { type: 'legend', items: colours.map((c, i) => ({ number: i + 1, code: c.code, count: c.count })) }];
  if (plan.cols * plan.rows > 1) pages.push({ type: 'map' });
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      const counts = new Map();
      for (let y = r * plan.side; y < (r + 1) * plan.side; y++) {
        for (let x = c * plan.side; x < (c + 1) * plan.side; x++) {
          const n = numbers[y * width + x];
          counts.set(n, (counts.get(n) ?? 0) + 1);
        }
      }
      const plates = (relief?.plates ?? [])
        .filter((p) => Math.floor(p.x / plan.side) === c && Math.floor(p.y / plan.side) === r)
        .map((p) => ({ ...p, x: p.x - c * plan.side, y: p.y - r * plan.side }));
      if (plates.length) {
        const sizes = new Map();
        for (const p of plates) {
          const key = `${Math.min(p.w, p.h)}x${Math.max(p.w, p.h)}`;
          sizes.set(key, (sizes.get(key) ?? 0) + 1);
        }
        pages.push({
          type: 'raise',
          row: r,
          col: c,
          name: `${rowName(r)}${c + 1}`,
          index: r * plan.cols + c,
          plates: plates.sort((a, b) => a.z - b.z),
          layers: Math.max(...plates.map((p) => p.z)) + 1,
          sizes: [...sizes].map(([k, count]) => ({ size: k.split('x').map(Number), count })).sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1] || b.size[1] - a.size[1]),
        });
      }
      pages.push({
        type: 'base',
        row: r,
        col: c,
        name: `${rowName(r)}${c + 1}`,
        index: r * plan.cols + c,
        used: [...counts].sort((a, b) => a[0] - b[0]).map(([number, count]) => ({ number, count })),
      });
    }
  }
  pages.forEach((p, i) => (p.page = i + 1));
  return { pages, numbers, codes: colours.map((c) => c.code), plan, width: mosaic.width, height: mosaic.height };
}

/**
 * @typedef {object} MosaicWords
 * @property {string} title
 * @property {string[]} coverLines
 * @property {string} [legal] small print at the foot of the cover (the trademark note)
 * @property {string} legendTitle
 * @property {string} mapTitle
 * @property {string} mapNote
 * @property {(page: object, total: number) => string} baseTitle
 * @property {string} baseNote
 * @property {(page: object, total: number) => string} [raiseTitle] 2.5D
 * @property {(layers: number) => string} [raiseNote]
 * @property {(z: number) => string} [layerName] "第 1 层"
 * @property {(w: number, d: number) => string} [plateName] "2 × 4 薄板"
 * @property {(code: number) => string} colourName
 * @property {(code: number) => string} colourCss
 * @property {(n: number) => string} count "×12"
 * @property {(n: number) => string} pageNumber
 */

/**
 * Draw page `page` of `book` (from layoutMosaicBook) on a PAGE-sized canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof layoutMosaicBook>} book
 * @param {object} page
 * @param {{ picture: CanvasImageSource, round: boolean, base: string }} look the mosaic as drawn on the page, round or square parts, base colour (CSS)
 * @param {MosaicWords} words
 */
export function drawMosaicPage(ctx, book, page, look, words) {
  const { width: W, height: H, margin: M } = PAGE;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (page.type === 'cover') {
    ctx.fillStyle = INK;
    ctx.font = `bold 72px ${FONT}`;
    ctx.fillText(fit(ctx, words.title, W - 2 * M), M, M + 72);
    // Room at the foot for the trademark note, taken from the picture.
    const foot = words.legal ? 60 : 0;
    fitImage(ctx, look.picture, M, M + 130, W - 2 * M, H - 2 * M - 420 - foot);
    let y = H - M - 210 - foot;
    words.coverLines.forEach((line, i) => {
      ctx.fillStyle = i ? MUTED : INK;
      ctx.font = `${i ? 28 : 34}px ${FONT}`;
      for (const l of wrap(ctx, line, W - 2 * M)) {
        ctx.fillText(l, M, y);
        y += i ? 42 : 52;
      }
    });
  } else if (page.type === 'legend') {
    heading(ctx, words.legendTitle);
    const cols = page.items.length > 20 ? 2 : 1;
    const colW = (W - 2 * M) / cols;
    const perCol = Math.ceil(page.items.length / cols);
    const rowH = Math.min(64, (H - 2 * M - 160) / perCol);
    page.items.forEach((it, i) => {
      const x = M + Math.floor(i / perCol) * colW;
      const y = M + 130 + (i % perCol) * rowH;
      chip(ctx, x, y, rowH - 12, it.number, words.colourCss(it.code), look.round);
      ctx.fillStyle = INK;
      ctx.font = `${Math.round(rowH * 0.42)}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(fit(ctx, words.colourName(it.code), colW - rowH - 160), x + rowH + 4, y + rowH * 0.62);
      ctx.textAlign = 'right';
      ctx.fillStyle = MUTED;
      ctx.fillText(words.count(it.count), x + colW - 24, y + rowH * 0.62);
      ctx.textAlign = 'left';
    });
  } else if (page.type === 'map') {
    heading(ctx, words.mapTitle);
    ctx.fillStyle = MUTED;
    ctx.font = `28px ${FONT}`;
    for (const [k, l] of wrap(ctx, words.mapNote, W - 2 * M).entries()) ctx.fillText(l, M, M + 110 + k * 40);
    const box = fitImage(ctx, look.picture, M, M + 200, W - 2 * M, H - 2 * M - 260);
    const { cols, rows } = book.plan;
    const cw = box.w / cols;
    const ch = box.h / rows;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.strokeRect(box.x + c * cw, box.y + r * ch, cw, ch);
        const size = Math.max(18, Math.min(48, cw * 0.3));
        ctx.font = `bold ${size}px ${FONT}`;
        const label = `${rowName(r)}${c + 1}`;
        const tw = ctx.measureText(label).width + 16;
        ctx.fillStyle = '#ffffffd0';
        ctx.fillRect(box.x + c * cw + cw / 2 - tw / 2, box.y + r * ch + ch / 2 - size * 0.75, tw, size * 1.3);
        ctx.fillStyle = INK;
        ctx.fillText(label, box.x + c * cw + cw / 2, box.y + r * ch + ch / 2 + size * 0.35);
      }
    }
    ctx.textAlign = 'left';
  } else if (page.type === 'raise') {
    drawRaise(ctx, book, page, words);
  } else {
    drawBase(ctx, book, page, look, words);
  }
  ctx.fillStyle = MUTED;
  ctx.font = `24px ${FONT}`;
  ctx.textAlign = 'center';
  if (page.type !== 'cover') ctx.fillText(words.pageNumber(page.page), W / 2, H - M / 2);
  else if (words.legal) drawFootnote(ctx, words.legal);
  ctx.restore();
}

/** One base: title, where it sits (small map), the numbered cells, the colours it needs. */
function drawBase(ctx, book, page, look, words) {
  const { width: W, height: H, margin: M } = PAGE;
  const { side, cols, rows } = book.plan;
  heading(ctx, words.baseTitle(page, cols * rows));
  ctx.fillStyle = MUTED;
  ctx.font = `26px ${FONT}`;
  const note = wrap(ctx, words.baseNote, W - 2 * M - 220).slice(0, 2);
  note.forEach((l, k) => ctx.fillText(l, M, M + 100 + k * 36));

  // Where this base sits: a small grid at the top right, this one filled in.
  const mapW = Math.min(180, 30 * cols);
  const cell = mapW / cols;
  const mx = W - M - mapW;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = r === page.row && c === page.col ? INK : '#e9e4d8';
      ctx.fillRect(mx + c * cell + 1, M + r * cell + 1, cell - 2, cell - 2);
    }
  }

  // The cells, with column numbers on top and row numbers on the left.
  const top = Math.max(M + 104 + note.length * 36, M + rows * cell + 24);
  const label = 44;
  const size = Math.min(W - 2 * M - label, H - top - M - 330 - label);
  const step = size / side;
  const gx = M + label;
  const gy = top + label;
  ctx.fillStyle = look.base;
  ctx.fillRect(gx, gy, size, size);
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = `${Math.round(Math.min(24, step * 0.55))}px ${FONT}`;
  for (let k = 0; k < side; k++) {
    if (side > 16 && k % 2 === 1 && k !== side - 1) continue; // every other label on big bases
    ctx.fillText(String(k + 1), gx + (k + 0.5) * step, gy - 12);
    ctx.fillText(String(k + 1), M + label / 2, gy + (k + 0.5) * step + 8);
  }
  const font = Math.max(9, Math.round(step * 0.42));
  ctx.font = `bold ${font}px ${FONT}`;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const n = book.numbers[(page.row * side + y) * book.width + page.col * side + x];
      const css = colourCss(book, n, (code) => words.colourCss(code));
      cellShape(ctx, gx + x * step, gy + y * step, step, css, look.round);
      ctx.fillStyle = textOn(css);
      ctx.fillText(String(n), gx + (x + 0.5) * step, gy + (y + 0.5) * step + font * 0.36);
    }
  }
  // A line every 4 cells helps keep the place while building.
  ctx.strokeStyle = '#ffffff80';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 4; k < side; k += 4) {
    ctx.moveTo(gx + k * step, gy);
    ctx.lineTo(gx + k * step, gy + size);
    ctx.moveTo(gx, gy + k * step);
    ctx.lineTo(gx + size, gy + k * step);
  }
  ctx.stroke();

  // The colours this base needs.
  ctx.textAlign = 'left';
  const ky = gy + size + 40;
  const per = 3;
  const kw = (W - 2 * M) / per;
  page.used.forEach((u, i) => {
    const x = M + (i % per) * kw;
    const y = ky + Math.floor(i / per) * 56;
    if (y > H - M - 60) return;
    const code = book.codes[u.number - 1];
    chip(ctx, x, y, 44, u.number, words.colourCss(code), look.round);
    ctx.fillStyle = INK;
    ctx.font = `22px ${FONT}`;
    ctx.fillText(fit(ctx, `${words.colourName(code)} ${words.count(u.count)}`, kw - 64), x + 54, y + 30);
  });
}

/**
 * One base's raise plates (2.5D): one grid per layer (layer 1 lies on the base,
 * layer 2 on layer 1 …), stacked or side by side, each plate drawn as a block with its
 * size written on it; a later layer's grid shows the layer under it faintly,
 * so the builder sees where it sits. Then how many plates of each size.
 */
function drawRaise(ctx, book, page, words) {
  const { width: W, height: H, margin: M } = PAGE;
  const { side, cols, rows } = book.plan;
  heading(ctx, words.raiseTitle(page, cols * rows));
  ctx.fillStyle = MUTED;
  ctx.font = `26px ${FONT}`;
  const note = wrap(ctx, words.raiseNote(page.layers), W - 2 * M - 220).slice(0, 4);
  note.forEach((l, k) => ctx.fillText(l, M, M + 100 + k * 36));
  const mapW = Math.min(180, 30 * cols);
  const cell = mapW / cols;
  const mx = W - M - mapW;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = r === page.row && c === page.col ? INK : '#e9e4d8';
      ctx.fillRect(mx + c * cell + 1, M + r * cell + 1, cell - 2, cell - 2);
    }
  }
  const top = Math.max(M + 104 + note.length * 36, M + rows * cell + 24) + 20;
  const gap = 48;
  const label = 34;
  const title = 44;
  const room = H - top - M - 220;
  // Layers stacked or side by side, whichever gives the bigger grids.
  const sizeFor = (across) => {
    const down = Math.ceil(page.layers / across);
    return Math.min((W - 2 * M - (across - 1) * gap) / across - label, (room - (down - 1) * gap) / down - label - title);
  };
  const across = page.layers > 1 && sizeFor(2) > sizeFor(1) ? 2 : 1;
  const down = Math.ceil(page.layers / across);
  const size = sizeFor(across);
  for (let z = 0; z < page.layers; z++) {
    const ox = M + (z % across) * (size + label + gap);
    const oy = top + Math.floor(z / across) * (size + label + title + gap);
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(words.layerName(z), ox, oy + 28);
    layerGrid(ctx, ox + label, oy + title + label, size, side, page.plates, z);
  }
  // The plates this base needs.
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `22px ${FONT}`;
  const y = top + down * (size + label + title) + (down - 1) * gap + 30;
  const per = 3;
  const kw = (W - 2 * M) / per;
  page.sizes.forEach((s, i) => {
    const cx = M + (i % per) * kw;
    const cy = y + Math.floor(i / per) * 40;
    if (cy > H - M - 40) return;
    ctx.fillText(fit(ctx, `${words.plateName(s.size[0], s.size[1])} ${words.count(s.count)}`, kw - 16), cx, cy + 26);
  });
}

/** One layer's grid: the base's cells, the layer under it faint, this layer's plates with their sizes, row and column numbers. */
function layerGrid(ctx, gx, gy, size, side, plates, z) {
  const step = size / side;
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(gx, gy, size, size);
  ctx.strokeStyle = '#e1dccf';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < side; k++) {
    ctx.moveTo(gx + k * step, gy);
    ctx.lineTo(gx + k * step, gy + size);
    ctx.moveTo(gx, gy + k * step);
    ctx.lineTo(gx + size, gy + k * step);
  }
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = `${Math.round(Math.min(20, step * 0.55))}px ${FONT}`;
  for (let k = 0; k < side; k++) {
    if (side > 16 && k % 2 === 1 && k !== side - 1) continue;
    if (side <= 16 && step < 22 && k % 2 === 1 && k !== side - 1) continue;
    ctx.fillText(String(k + 1), gx + (k + 0.5) * step, gy - 10);
    ctx.fillText(String(k + 1), gx - 18, gy + (k + 0.5) * step + 7);
  }
  // What this layer lies on, faint.
  if (z > 0) {
    ctx.fillStyle = '#e4ded1';
    for (const p of plates) if (p.z === z - 1) ctx.fillRect(gx + p.x * step, gy + p.y * step, p.w * step, p.h * step);
  }
  const fill = LAYER_FILL[Math.min(z, LAYER_FILL.length - 1)];
  const font = Math.round(Math.min(24, step * 0.5));
  for (const p of plates) {
    if (p.z !== z) continue;
    const x = gx + p.x * step + 2;
    const y = gy + p.y * step + 2;
    const w = p.w * step - 4;
    const h = p.h * step - 4;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    const text = `${Math.min(p.w, p.h)}×${Math.max(p.w, p.h)}`;
    ctx.font = `bold ${font}px ${FONT}`;
    if (ctx.measureText(text).width < w - 4 && font < h - 2) {
      ctx.fillStyle = textOn(fill);
      ctx.fillText(text, x + w / 2, y + h / 2 + font * 0.36);
    }
  }
  ctx.textAlign = 'left';
}

const colourCss = (book, n, css) => css(book.codes[n - 1]);

function heading(ctx, text) {
  const { width: W, margin: M } = PAGE;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `bold 48px ${FONT}`;
  ctx.fillText(fit(ctx, text, W - 2 * M - 220), M, M + 48);
}

/** A colour chip with its number on it. */
function chip(ctx, x, y, s, number, css, round) {
  cellShape(ctx, x, y, s, css, round);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = textOn(css);
  ctx.font = `bold ${Math.round(s * 0.45)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(number), x + s / 2, y + s / 2 + s * 0.16);
  ctx.textAlign = 'left';
}

function cellShape(ctx, x, y, s, css, round) {
  ctx.fillStyle = css;
  ctx.beginPath();
  if (round) ctx.arc(x + s / 2, y + s / 2, s * 0.46, 0, Math.PI * 2);
  else ctx.rect(x + s * 0.03, y + s * 0.03, s * 0.94, s * 0.94);
  ctx.fill();
}

/** Black or white text, whichever reads better on a colour (by relative luminance). */
export function textOn(css) {
  const v = parseInt(css.slice(1, 7), 16);
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(v >> 16) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  return L > 0.22 ? '#1f1d1a' : '#ffffff';
}
