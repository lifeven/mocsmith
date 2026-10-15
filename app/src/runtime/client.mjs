import { colouredMesh } from '../core/mesh-data.mjs';
import { unpackModel } from './transport.mjs';

/** The conversion pipeline for running on the page thread, imported once when first needed. */
let inlinePipeline = null;
const loadInline = () => (inlinePipeline ??= import('../convert/build.mjs'));

/**
 * Main-thread side of the pipeline Worker.
 *
 * At most one build runs at a time. While it runs, newer requests replace
 * each other, so a fast slider drag costs one build in flight plus the latest
 * setting, never a queue of stale ones. Results for a mesh that has since
 * been replaced are dropped. Without Worker support, or if the Worker fails,
 * the same pipeline runs on the main thread.
 *
 * @param {(model: import('../convert/build.mjs').BuiltModel, info: { latency: number, inWorker: boolean }) => void} onBuilt
 * @param {(message: string) => void} [onError]
 * @param {{ useWorker?: boolean }} [options] `useWorker: false` forces the main thread (for comparison)
 */
export function createBuilder(onBuilt, onError = console.error, { useWorker = true } = {}) {
  let worker = null;
  try {
    if (useWorker) worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  let meshId = 0;
  /** Mesh data stays here too (it is copied to the Worker), for the fallback. */
  let meshData = null;
  let inlineMesh = null;
  let seq = 0;
  let busy = null; // { seq, start, settings }
  let pending = null;

  if (worker) {
    worker.onmessage = ({ data: msg }) => {
      const job = busy;
      busy = null;
      if (msg.id === meshId) {
        if (msg.type === 'built') onBuilt(unpackModel(msg.model), { latency: performance.now() - job.start, inWorker: true });
        else onError(msg.message);
      }
      pump();
    };
    worker.onerror = (e) => {
      // A Worker that cannot load (old browser, blocked module workers): run inline from now on.
      e.preventDefault?.();
      worker.terminate();
      worker = null;
      pending = pending ?? busy?.settings ?? null;
      busy = null;
      pump();
    };
  }

  function pump() {
    if (busy || !pending || !meshData) return;
    const settings = pending;
    pending = null;
    const start = performance.now();
    if (!worker) {
      // The pipeline on this thread (no Worker, or ?worker=0): loaded the first time it is needed, so the start
      // page does not download it. Busy while loading, so newer settings wait in `pending` as with the Worker.
      busy = { seq: ++seq, start, settings };
      const id = meshId;
      loadInline().then(
        ({ buildModel }) => {
          busy = null;
          if (id === meshId && meshData) {
            inlineMesh ??= colouredMesh(meshData);
            const t0 = performance.now();
            try {
              onBuilt(buildModel(inlineMesh, settings), { latency: performance.now() - t0, inWorker: false });
            } catch (err) {
              onError(String(err?.message ?? err));
            }
          }
          pump();
        },
        (err) => {
          busy = null;
          onError(String(err?.message ?? err));
        },
      );
      return;
    }
    busy = { seq: ++seq, start, settings };
    worker.postMessage({ type: 'build', id: meshId, seq: busy.seq, settings });
  }

  return {
    /** @param {import('../core/mesh-data.mjs').MeshData} data */
    setMesh(data) {
      meshId++;
      meshData = data;
      inlineMesh = null;
      pending = null;
      if (worker) worker.postMessage({ type: 'mesh', id: meshId, data });
    },
    /** @param {Partial<import('../convert/build.mjs').BuildSettings>} settings */
    build(settings) {
      pending = settings;
      pump();
    },
    get inWorker() {
      return worker !== null;
    },
  };
}
