/**
 * Draw one page of the instruction book (a `layoutBook` page) onto a 2D
 * canvas: A4 portrait at 150 dpi (1240 × 1754 px). Pictures and part icons
 * are drawn by `BookRenderer`; the words come from the caller, so this file
 * has no text of its own and draws the same in every language.
 *
 * Conventions from LEGO's own books:
 * a big step number, the parts the step needs in a box above its picture
 * with "x2" counts, a sub-assembly framed, a chapter opener page, the
 * inventory at the end of the parts list by colour.
 */

import { FONT, INK, MUTED, fit, fitImage, wrap } from './draw.mjs';

export const PAGE = { width: 1240, height: 1754, margin: 80 };

const BOX = '#eef2f7';
const BOX_LINE = '#c9d3df';
const SUB_LINE = '#e8b45a';

/**
 * @typedef {object} PageAssets
 * @property {(index: number) => CanvasImageSource | null} picture step picture
 * @property {CanvasImageSource | null} cover finished model
 * @property {(chapter: number) => CanvasImageSource | null} chapterPicture model at the end of a chapter
 * @property {(key: string) => CanvasImageSource | null} icon part picture by `iconKey`
 *
 * @typedef {object} PageWords
 * @property {string} title
 * @property {string[]} coverLines
 * @property {string} [legal] small print at the foot of the cover (the trademark note)
 * @property {(page: object) => string} inventoryTitle
 * @property {(color: number) => string} colourName
 * @property {(color: number) => string} colourCss
 * @property {(item: { kind: string, w: number, d: number, ldraw: string }) => string} partLabel
 * @property {(page: object) => string} chapterTitle
 * @property {(page: object) => string} chapterSteps
 * @property {(page: object) => string} subTitle
 * @property {(step: object, extra: { back: boolean }) => string[]} stepNotes
 * @property {(n: number) => string} pageNumber
 */

/**
 * @param {CanvasRenderingContext2D} ctx a PAGE-sized canvas
 * @param {object} page from `layoutBook`
 * @param {PageAssets} assets
 * @param {PageWords} words
 * @param {{ back?: (index: number) => boolean }} [extra] which steps are shown from the back
 */
export function drawPage(ctx, page, assets, words, extra = {}) {
  const { width: W, height: H, margin: M } = PAGE;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  if (page.type === 'cover') drawCover(ctx, page, assets, words);
  else if (page.type === 'inventory') drawInventory(ctx, page, assets, words);
  else if (page.type === 'chapter') drawChapter(ctx, page, assets, words);
  else drawSteps(ctx, page, assets, words, extra);
  if (page.type !== 'cover') {
    ctx.fillStyle = MUTED;
    ctx.font = `24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(words.pageNumber(page.page), W / 2, H - M / 2);
  } else if (words.legal) {
    drawFootnote(ctx, words.legal);
  }
  ctx.restore();
}

function drawCover(ctx, page, assets, words) {
  const { width: W, height: H, margin: M } = PAGE;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `bold 84px ${FONT}`;
  ctx.fillText(fit(ctx, words.title, W - 2 * M), M, M + 84);
  // Room at the foot for the trademark note, taken from the picture.
  const foot = words.legal ? 60 : 0;
  if (assets.cover) fitImage(ctx, assets.cover, M, M + 150, W - 2 * M, H - 2 * M - 420 - foot);
  ctx.font = `34px ${FONT}`;
  const top = H - M - 200 - foot;
  let y = top;
  for (const line of words.coverLines) {
    ctx.fillStyle = y === top ? INK : MUTED;
    for (const l of wrap(ctx, line, W - 2 * M)) {
      ctx.fillText(l, M, y);
      y += 50;
    }
    ctx.font = `28px ${FONT}`;
  }
}

function drawInventory(ctx, page, assets, words) {
  const { width: W, margin: M } = PAGE;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `bold 48px ${FONT}`;
  ctx.fillText(words.inventoryTitle(page), M, M + 48);
  const cols = 6;
  const cell = (W - 2 * M) / cols;
  let y = M + 100;
  for (const g of page.groups) {
    ctx.fillStyle = words.colourCss(g.color);
    roundRect(ctx, M, y, 36, 36, 6);
    ctx.fill();
    ctx.strokeStyle = BOX_LINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText(words.colourName(g.color), M + 52, y + 30);
    y += 56;
    g.items.forEach((item, i) => {
      const cx = M + (i % cols) * cell;
      const cy = y + Math.floor(i / cols) * 190;
      const icon = assets.icon(item.key);
      if (icon) fitImage(ctx, icon, cx + 10, cy, cell - 20, 120);
      ctx.fillStyle = INK;
      ctx.font = `bold 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${item.count}x`, cx + cell / 2, cy + 150);
      ctx.fillStyle = MUTED;
      ctx.font = `20px ${FONT}`;
      ctx.fillText(fit(ctx, `${words.partLabel(item)} · ${item.ldraw}`, cell - 8), cx + cell / 2, cy + 178);
      ctx.textAlign = 'left';
    });
    y += Math.ceil(g.items.length / cols) * 190 + 24;
  }
}

function drawChapter(ctx, page, assets, words) {
  const { width: W, height: H, margin: M } = PAGE;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = `bold 120px ${FONT}`;
  ctx.fillText(words.chapterTitle(page), W / 2, M + 260);
  ctx.fillStyle = MUTED;
  ctx.font = `36px ${FONT}`;
  ctx.fillText(words.chapterSteps(page), W / 2, M + 340);
  const picture = assets.chapterPicture(page.chapter);
  if (picture) fitImage(ctx, picture, M, M + 420, W - 2 * M, H - 2 * M - 520);
}

function drawSteps(ctx, page, assets, words, extra) {
  const { width: W, height: H, margin: M } = PAGE;
  let x0 = M;
  let y0 = M;
  let w = W - 2 * M;
  let h = H - 2 * M - 40;
  if (page.sub !== undefined) {
    // Framed, not filled: the step pictures are on white paper.
    ctx.strokeStyle = SUB_LINE;
    ctx.lineWidth = 6;
    roundRect(ctx, x0 - 20, y0 - 20, w + 40, h + 40, 24);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.font = `bold 36px ${FONT}`;
    for (const line of wrap(ctx, words.subTitle(page), w)) {
      ctx.fillText(line, x0, y0 + 36);
      y0 += 48;
      h -= 48;
    }
    y0 += 16;
    h -= 16;
  }
  const n = page.steps.length;
  const cells = n === 4 ? grid(x0, y0, w, h, 2, 2) : grid(x0, y0, w, h, 1, n);
  page.steps.forEach((step, i) => drawStep(ctx, step, cells[i], assets, words, extra.back?.(step.index) ?? false));
}

function drawStep(ctx, step, { x, y, w, h }, assets, words, back) {
  const big = h > 600 ? 96 : 72;
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `bold ${big}px ${FONT}`;
  ctx.fillText(String(step.number), x, y + big);
  const numberWidth = ctx.measureText(String(step.number)).width + 28;

  // Parts box: icons with counts, to the right of the number.
  const iconH = h > 600 ? 110 : 84;
  const slot = iconH + 24;
  const boxW = Math.min(w - numberWidth, step.needs.length * slot + 24);
  const boxH = iconH + 64;
  ctx.fillStyle = BOX;
  ctx.strokeStyle = BOX_LINE;
  ctx.lineWidth = 2;
  roundRect(ctx, x + numberWidth, y, boxW, boxH, 14);
  ctx.fill();
  ctx.stroke();
  step.needs.forEach((item, k) => {
    const ix = x + numberWidth + 12 + k * slot;
    if (ix + slot > x + numberWidth + boxW) return;
    const icon = assets.icon(item.key);
    if (icon) fitImage(ctx, icon, ix, y + 8, iconH, iconH);
    ctx.fillStyle = INK;
    ctx.font = `bold 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${item.count}x`, ix + iconH / 2, y + iconH + 44);
    ctx.textAlign = 'left';
  });

  // Notes under the box.
  let ny = y + boxH + 40;
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = '#b4321e';
  for (const note of words.stepNotes(step, { back })) {
    for (const line of wrap(ctx, note, w)) {
      ctx.fillText(line, x, ny);
      ny += 36;
    }
  }

  const picture = assets.picture(step.index);
  const top = Math.max(y + Math.max(big, boxH) + 12, ny - 16);
  if (picture) fitImage(ctx, picture, x, top, w, y + h - top);
}

/** Cells of a cols × rows grid with 32 px gutters. */
function grid(x, y, w, h, cols, rows) {
  const gap = 32;
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = (h - gap * (rows - 1)) / rows;
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: x + c * (cw + gap), y: y + r * (ch + gap), w: cw, h: ch });
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * One line of small print centred at the foot of a page, where other pages
 * have their number: the cover's trademark note.
 */
export function drawFootnote(ctx, text) {
  const { width: W, height: H, margin: M } = PAGE;
  ctx.save();
  ctx.fillStyle = MUTED;
  ctx.font = `22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(fit(ctx, text, W - 2 * M), W / 2, H - M / 2);
  ctx.restore();
}
