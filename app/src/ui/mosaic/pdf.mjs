import { defaultBaseColour, partsList } from '../../mosaic/base.mjs';
import { fileStem } from '../../io/file-name.mjs';
import { downloadBlob } from '../download.mjs';
import { drawMosaicPage, layoutMosaicBook } from '../../book/mosaic.mjs';
import { PAGE } from '../../book/pages.mjs';
import { makePdf } from '../../book/pdf.mjs';
import { STUD_CM } from '../words.mjs';
import { locale, t } from '../../i18n/index.mjs';
import { drawMosaicCanvas, hexOf } from './draw.mjs';
import { mosaicColourName } from './names.mjs';

/**
 * The mosaic's PDF instructions (book/mosaic.mjs), downloaded: cover, colour key, map of
 * the bases, one numbered page per base; each page drawn to an A4 JPEG, yielding between
 * pages, then one PDF. `status` shows the progress, `button` is disabled meanwhile.
 * @param {ReturnType<typeof import('../../mosaic/mosaic.mjs').buildMosaic>} m
 * @param {ReturnType<typeof import('../../mosaic/base.mjs').planBases>[number]} chosen the base it sits on
 * @param {{ title: string, fileName: string, button: HTMLButtonElement, status: HTMLElement, relief?: object | null }} ui relief: the 2.5D plates shown (raisePlates), or none
 */
export async function makeMosaicBook(m, chosen, { title, fileName, button, status, relief = null }) {
  button.disabled = true;
  status.hidden = false;
  try {
    const book = layoutMosaicBook(m, chosen, relief);
    const picture = document.createElement('canvas');
    drawMosaicCanvas(picture, m, { cellPx: 10, base: defaultBaseColour(chosen.part), heights: relief?.heights });
    const partName = t(`mosaic.part.${m.part}`);
    const baseRows = partsList(m, chosen).filter((r) => r.role !== 'surface');
    const words = {
      title,
      coverLines: [
        t('mosaic.summary', { w: m.width, h: m.height, cmW: Math.round(m.width * STUD_CM), cmH: Math.round(m.height * STUD_CM), n: m.width * m.height, colours: m.colours.length }),
        t('mosaic.pdf.cover', { part: locale() === 'en' ? partName.toLowerCase() : partName }),
        ...baseRows.map((r) => `${t('mosaic.partRow', { part: t(`mosaic.partName.${r.part}`), colour: mosaicColourName(r.colour) })} · ${t('mosaic.count', { n: r.quantity })}`),
        ...(relief ? [t('mosaic.pdf.raiseCover', { n: relief.plates.length })] : []),
        chosen.key === 'panels' ? t('mosaic.base.panelsNote', { count: chosen.count, pins: chosen.pins }) : chosen.count === 1 ? t('mosaic.base.oneNote') : t('mosaic.base.manyNote', { count: chosen.count }),
      ],
      legal: t('legal.trademark'),
      legendTitle: t('mosaic.pdf.legend'),
      mapTitle: t('mosaic.pdf.map'),
      mapNote: chosen.key === 'panels' ? t('mosaic.base.panelsNote', { count: chosen.count, pins: chosen.pins }) : t('mosaic.base.manyNote', { count: chosen.count }),
      baseTitle: (p, n) => t('mosaic.pdf.base', { name: p.name, i: p.index + 1, n }),
      baseNote: t('mosaic.pdf.baseNote'),
      raiseTitle: (p, n) => t('mosaic.pdf.raise', { name: p.name, i: p.index + 1, n }),
      raiseNote: (layers) => t(layers > 1 ? 'mosaic.pdf.raiseNote' : 'mosaic.pdf.raiseNoteOne'),
      layerName: (z) => t('mosaic.pdf.layer', { n: z + 1 }),
      plateName: (w, d) => t('mosaic.partName.raise', { w, d }),
      colourName: mosaicColourName,
      colourCss: hexOf,
      count: (n) => `×${n}`,
      pageNumber: (n) => String(n),
    };
    const look = { picture, round: m.part.startsWith('round'), base: hexOf(defaultBaseColour(chosen.part)) };
    const canvas = document.createElement('canvas');
    canvas.width = PAGE.width;
    canvas.height = PAGE.height;
    const ctx = canvas.getContext('2d');
    const pages = [];
    for (const [i, page] of book.pages.entries()) {
      status.textContent = t('mosaic.pdf.drawing', { i: i + 1, n: book.pages.length });
      drawMosaicPage(ctx, book, page, look, words);
      pages.push(await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85)));
      await new Promise((ok) => setTimeout(ok, 0));
    }
    const name = t('mosaic.pdf.file', { name: fileName });
    const pdf = await makePdf(pages, { title: name, onProgress: (i, n) => (status.textContent = t('book.pdfProgress', { i, n })) });
    downloadBlob(`${fileStem(name)}.pdf`, pdf);
    status.textContent = t('book.pdfDone', { n: pages.length, mb: (pdf.size / 1048576).toFixed(1) });
  } catch (err) {
    status.textContent = t('mosaic.pdf.failed', { why: err?.message ?? String(err) });
  } finally {
    button.disabled = false;
  }
}
