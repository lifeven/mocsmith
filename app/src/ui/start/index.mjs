import { setupSamples } from './samples.mjs';
import { setupOwn } from './own.mjs';
import { setupMosaicBlock } from './mosaic-block.mjs';

/**
 * Start page (`start.html`): sample cards and the sample library
 * (samples.mjs), the visitor's own model file or AI picture (own.mjs), and
 * the photo → flat mosaic block (mosaic-block.mjs).
 *
 * @param {{ onFile: (file: File) => void, onPicture?: (file: File) => void, onMosaic?: (file: File) => void }} handlers
 */
export function setupStart({ onFile, onPicture, onMosaic }) {
  setupSamples();
  setupOwn({ onFile, onPicture, status: startStatus });
  setupMosaicBlock({ onMosaic });
}

/** One line under "use your own": loading, or what went wrong. */
export function startStatus(text) {
  document.getElementById('start-status').textContent = text;
}

/** One line in the mosaic block: reading the photo, or what went wrong. */
export function mosaicStatus(text) {
  document.getElementById('mosaic-status').textContent = text;
}
