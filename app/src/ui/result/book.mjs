import { BookRenderer } from '../../book/render.mjs';
import { layoutBook } from '../../book/layout.mjs';
import { drawPage, PAGE } from '../../book/pages.mjs';
import { makePdf } from '../../book/pdf.mjs';
import { fileStem } from '../../io/ldr.mjs';
import { partAvailable } from '../../core/catalog.mjs';
import { planBuild } from '../../steps/plan.mjs';
import { locale, t } from '../../i18n/index.mjs';
import { cm, colourCss, colourName, kindName, shownKind, sizeText } from '../words.mjs';
import { downloadBlob } from '../download.mjs';
import { el, labelOf } from './texts.mjs';

/**
 * 「看搭建说明书」: the instruction book for the model as shown (with
 * recolours and edits), drawn page by page into a dialog. Pictures come from `BookRenderer`, the pages from `layoutBook` and
 * `drawPage`; each page becomes a JPEG shown as an image, and drawing yields
 * between pages so the page stays responsive. Stop ends it where it is; the
 * pages drawn so far stay. Closing (×, outside, Esc) stops a run still going.
 *
 * @param {import('./index.mjs').ResultPage} page
 */
export function setupBook(page) {
  const { state } = page;
  const dialog = el('book');
  /** The run drawing now (its `stop` flag ends it), and what it drew. */
  let run = null;

  function openBook() {
    if (!state.model) return;
    dialog.showModal();
    // Same model, same language, and a finished run: show it again as it is.
    if (run && run.model === state.model && run.locale === locale() && run.done) return;
    start();
  }
  // From 「导出」, and from the book button at the top right while building.
  el('open-book').addEventListener('click', openBook);
  el('book-quick').addEventListener('click', openBook);
  el('book-stop').addEventListener('click', () => run && (run.stop = true));
  // The pages are JPEGs already: the PDF puts one on each A4 page (jsPDF loads on the first click).
  el('book-pdf').addEventListener('click', async () => {
    const me = run;
    if (!me?.done) return;
    const button = el('book-pdf');
    button.disabled = true;
    const name = t('book.file', { name: `${labelOf(state.source)} ${cm(me.model.settings.lengthStuds)}` });
    try {
      const pdf = await makePdf(me.blobs, {
        title: name,
        onProgress: (i, n) => run === me && (el('book-status').textContent = t('book.pdfProgress', { i, n })),
      });
      downloadBlob(`${fileStem(name)}.pdf`, pdf);
      if (run === me) el('book-status').textContent = t('book.pdfDone', { n: me.blobs.length, mb: (pdf.size / 1048576).toFixed(1) });
    } catch (err) {
      if (run === me) el('book-status').textContent = t('book.pdfFailed', { why: err?.message ?? String(err) });
    } finally {
      button.disabled = false;
    }
  });
  el('book-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  // Closing stops a run that is still drawing (opening again starts over); a finished book is
  // kept for the same model and language. The close event comes after close() returns, so a
  // quick reopen can come first: then there is nothing to stop.
  dialog.addEventListener('close', () => {
    if (!dialog.open && !printing && run && !run.done) run.stop = true;
  });
  // The browser's Print is the fallback when the PDF cannot be made. A modal dialog is out of
  // the page flow, so for printing it is reopened as a plain one (the print styles in
  // styles/book.css then lay the pages out one per sheet), and made modal again afterwards.
  let printing = false;
  addEventListener('beforeprint', () => {
    if (!dialog.open || !dialog.matches(':modal')) return;
    printing = true;
    dialog.close();
    dialog.show();
  });
  addEventListener('afterprint', () => {
    if (!printing) return;
    dialog.close();
    dialog.showModal();
    setTimeout(() => (printing = false), 0); // after the queued close event
  });
  addEventListener('appnavigate', () => dialog.open && dialog.close());

  function clear() {
    if (run) run.stop = true;
    for (const url of run?.urls ?? []) URL.revokeObjectURL(url);
    run = null;
    el('book-pages').replaceChildren();
  }

  async function start() {
    clear();
    const model = state.model;
    const me = { model, locale: locale(), stop: false, done: false, urls: [], blobs: [] };
    run = me;
    const plan = planBuild(model);
    const { pages } = layoutBook(model, plan);
    const status = (key, i) => (el('book-status').textContent = t(key, { i, n: pages.length }));
    el('book-stop').hidden = false;
    el('book-pdf').hidden = true;
    status('book.progress', 1);
    await pause();
    if (me.stop) return;

    const book = new BookRenderer();
    try {
      book.setModel(model, plan);
      const icons = await loadIcons(book.partIcons(plan.steps.map((s) => s.ids), 64));
      book.drawModel();
      const cover = book.snapshot();
      const chapterPictures = new Map();
      const backs = new Set();
      const words = bookWords(model, pages[0]);
      const canvas = document.createElement('canvas');
      canvas.width = PAGE.width;
      canvas.height = PAGE.height;
      const ctx = canvas.getContext('2d');

      for (const [k, p] of pages.entries()) {
        if (me.stop) break;
        status('book.progress', k + 1);
        // Steps are drawn in order: the camera's side carries from one to the next.
        const pictures = new Map();
        if (p.type === 'steps') {
          for (const s of p.steps) {
            if (book.drawStep(s.index)?.back) backs.add(s.index);
            pictures.set(s.index, book.snapshot());
          }
        }
        if (p.type === 'chapter') {
          book.drawUpTo(p.last);
          chapterPictures.set(p.chapter, book.snapshot());
        }
        drawPage(ctx, p, { cover, picture: (i) => pictures.get(i), chapterPicture: (c) => chapterPictures.get(c), icon: (key) => icons.get(key) }, words, { back: (i) => backs.has(i) });
        const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
        if (me.stop || run !== me) break;
        const url = URL.createObjectURL(blob);
        me.urls.push(url);
        me.blobs.push(blob);
        const img = new Image();
        img.src = url;
        img.alt = t('book.page', { i: k + 1, n: pages.length });
        el('book-pages').append(img);
        await pause();
      }
    } finally {
      book.dispose();
    }
    if (run !== me) return;
    me.done = me.blobs.length === pages.length;
    el('book-stop').hidden = true;
    el('book-pdf').hidden = !me.done;
    el('book-status').textContent = me.done ? t('book.done', { n: pages.length }) : t('book.stopped', { i: me.blobs.length, n: pages.length });
  }

  /** What the pages say, in the current language. */
  function bookWords(model, cover) {
    const { parts } = model.result;
    const detached = model.stats.detachedParts;
    const coverLines = [
      t('book.cover.counts', { parts: cover.parts, colours: cover.colours, steps: cover.steps }),
      sizeText(model.grid, parts),
      cover.chapters > 1 ? (cover.subs ? t('book.cover.chapters', { n: cover.chapters, subs: cover.subs }) : t('book.cover.chaptersOnly', { n: cover.chapters })) : '',
      parts.every(partAvailable) ? t('book.cover.made') : '',
      detached ? t('book.cover.detached', { n: detached }) : t('book.cover.connected'),
    ].filter(Boolean);
    const subName = (k) => t('result.step.subName', { i: k + 1 });
    return {
      title: labelOf(state.source),
      coverLines,
      legal: t('legal.trademark'),
      inventoryTitle: (p) => t('book.inventory', { i: p.part, n: p.of }),
      colourName,
      colourCss,
      partLabel: (item) => `${item.w}×${item.d} ${kindName(shownKind(item))}`,
      chapterTitle: (p) => t('book.chapter', { i: p.chapter + 1 }),
      chapterSteps: (p) => t('book.chapterSteps', { a: p.first + 1, b: p.last + 1 }),
      subTitle: (p) => t('result.step.sub', { i: p.sub + 1, total: p.subs }),
      stepNotes: (s, { back }) => [
        s.attach.length ? t('result.step.attach', { list: new Intl.ListFormat(locale()).format(s.attach.map(subName)) }) : '',
        s.fromBelow ? t(s.attach.length ? 'result.step.fromBelowToo' : 'result.step.fromBelow') : '',
        back ? t('result.step.fromBack') : '',
      ].filter(Boolean),
      pageNumber: (n) => String(n),
    };
  }

  Object.assign(page, { bookRun: () => run });
}

/** Let the browser paint and handle input between pages. */
const pause = () => new Promise((ok) => setTimeout(ok, 0));

/** Decode the part pictures (data URLs) before the pages draw them. */
async function loadIcons(urls) {
  const out = new Map();
  await Promise.all(
    [...urls].map(([key, url]) => {
      const img = new Image();
      img.src = url;
      out.set(key, img);
      return img.decode().catch(() => {});
    }),
  );
  return out;
}
