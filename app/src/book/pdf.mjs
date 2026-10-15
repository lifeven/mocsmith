/**
 * The instruction book as one PDF: every page
 * is already a JPEG drawn at A4 portrait, 150 dpi (`book/pages.mjs`); each goes
 * on a page of its own, edge to edge, as it is (JPEG data goes into a PDF
 * unchanged, so nothing is compressed twice). jsPDF is loaded the first time
 * a PDF is made, so the page does not download it otherwise.
 */

/** A4 portrait in PDF points (1/72 inch). */
export const A4_PT = [595.28, 841.89];

/**
 * @param {Blob[]} pages JPEG pages in order
 * @param {{ title?: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<Blob>} application/pdf
 */
export async function makePdf(pages, { title = '', onProgress = () => {}, signal } = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title, creator: 'MOCsmith by LifeVen' });
  for (const [i, page] of pages.entries()) {
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    if (i > 0) doc.addPage('a4', 'portrait');
    const bytes = new Uint8Array(await page.arrayBuffer());
    doc.addImage(bytes, 'JPEG', 0, 0, A4_PT[0], A4_PT[1], `page-${i + 1}`, 'NONE');
    onProgress(i + 1, pages.length);
    // Let the page repaint the progress line now and then.
    if (i % 8 === 7) await new Promise((ok) => setTimeout(ok, 0));
  }
  return doc.output('blob');
}
