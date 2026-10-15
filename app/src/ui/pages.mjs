import startHtml from './start/start.html?raw';
import resultHtml from './result/result.html?raw';
import mosaicHtml from './mosaic/mosaic.html?raw';
import aboutHtml from './about/about.html?raw';

/**
 * Each page's markup lives beside its code (`ui/<page>/<page>.html`);
 * index.html only has the shell and one empty <section> per page. This fills
 * them, before the language switch translates the page and before any page
 * module looks up its elements.
 */
export const PAGES = { start: startHtml, result: resultHtml, mosaic: mosaicHtml, about: aboutHtml };

export function mountPages(doc = document) {
  for (const [id, html] of Object.entries(PAGES)) {
    const section = doc.getElementById(id);
    section.innerHTML = html;
    if (id === 'start') section.setAttribute('aria-labelledby', 'start-title');
  }
}
