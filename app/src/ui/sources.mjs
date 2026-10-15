import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { meshDataFromGltf } from '../io/gltf.mjs';
import { parseLdr, importedModel } from '../io/ldr-import.mjs';
import { createTo3D, mockProvider } from '../services/to3d.mjs';
import { SAMPLES } from '../data/samples.mjs';
import { t } from '../i18n/index.mjs';

/**
 * Turning what the visitor brings into a result-page source:
 * `{ id, label | labelKey, scene, data }` for a mesh to build, or
 * `{ …, imported: { model, skipped } }` for an `.ldr` shown as it is.
 * Failures reject with a message for the start page.
 */

export function loadGltf(url) {
  return new GLTFLoader().loadAsync(url);
}

/** A source from a loaded glTF scene. */
export const gltfSource = (id, label, gltf) => ({ id, label, scene: gltf.scene, data: meshDataFromGltf(gltf.scene) });

/** The visitor's own file: a.glb is built into bricks, an.ldr /.mpd is shown as it is. */
export async function sourceFromFile(file) {
  if (/\.(ldr|mpd)$/i.test(file.name)) {
    try {
      const parsed = parseLdr(await file.text());
      const { model, skipped } = importedModel(parsed);
      if (!model) throw new Error(t('error.noParts'));
      const label = parsed.name || file.name.replace(/\.(ldr|mpd)$/i, '');
      return { id: `mine:${file.name}:${file.size}:${Date.now()}`, label, scene: null, imported: { model, skipped } };
    } catch (err) {
      throw new Error(t('error.file', { message: err.message ?? err }));
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const gltf = await loadGltf(url);
    return gltfSource(`mine:${file.name}:${file.size}:${Date.now()}`, file.name.replace(/\.glb$/i, ''), gltf);
  } catch (err) {
    throw new Error(t('error.glb', { message: err.message ?? err }));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Picture → 3D. The demo has no image-to-3D service: the mock sends the
 * picture nowhere and answers with the fox sample (`services/to3d.mjs`).
 *
 * @param {File} file
 * @param {(text: string) => void} status progress line for the start page
 */
export async function sourceFromPicture(file, status) {
  const name = file.name.replace(/\.\w+$/, '');
  const to3d = createTo3D({ provider: mockProvider({ sampleUrl: SAMPLES.fox.url }), pollMs: 600 });
  try {
    const { glb } = await to3d.imageToGlb(file, {
      onProgress: ({ state, progress = 0 }) =>
        status(state === 'queued' ? t('start.to3d.queued') : state === 'done' ? t('start.to3d.done') : t('start.to3d.running', { pct: Math.round(progress * 100) })),
    });
    const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    const gltf = await loadGltf(url).finally(() => URL.revokeObjectURL(url));
    return gltfSource(`picture:${file.name}:${file.size}:${Date.now()}`, t('start.to3d.label', { name }), gltf);
  } catch (err) {
    throw new Error(t('start.to3d.failed', { message: err.message ?? err }));
  }
}
