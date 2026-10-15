import { MOSAIC_SAMPLES } from '../../data/mosaic-samples.mjs';
import { t } from '../../i18n/index.mjs';
import { onFileInput } from './own.mjs';

/**
 * The flat-mosaic block: the visitor's own photo, or one of the example
 * photos. Each example shows its ready-made mosaic preview with the photo as
 * a small inset (data/mosaic-samples.mjs, tools/mosaic-thumbs.sh); the full
 * photo is only loaded when the example is opened.
 *
 * @param {{ onMosaic?: (file: File) => void }} handlers
 */
export function setupMosaicBlock({ onMosaic }) {
  onFileInput('upload-mosaic', (file) => onMosaic?.(file));
  document.getElementById('mosaic-examples').innerHTML = Object.entries(MOSAIC_SAMPLES).map(([key, s]) => exampleCard(key, s)).join('');
  document.getElementById('mosaic-examples-wrap').hidden = false;
  renderTexts();
  document.addEventListener('localechange', renderTexts);
}

function exampleCard(key, s) {
  return `<li><a class="mosaic-example" href="/mosaic/${key}/" data-key="${key}">
    <span class="mosaic-frame"><img class="preview" src="${s.preview}" alt="" loading="lazy" width="384" height="384">
      <img class="inset" src="${s.thumb}" alt="" loading="lazy" width="96" height="96"></span>
    <span class="name"></span></a></li>`;
}

/** Names in the current language. */
function renderTexts() {
  for (const a of document.querySelectorAll('.mosaic-example')) a.querySelector('.name').textContent = t(`mosaicSample.${a.dataset.key}.label`);
}
