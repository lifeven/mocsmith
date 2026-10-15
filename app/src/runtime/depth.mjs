/**
 * Main-thread side of the depth Worker (runtime/depth-worker.mjs). Created
 * on first use only, so the runtime and the model are not downloaded unless a
 * visitor turns 2.5D on. One request at a time; a newer photo replaces an
 * older one still waiting. `cancel()` stops the Worker (download included);
 * the next request starts a fresh one.
 */
export function createDepthEstimator() {
  let worker = null;
  let seq = 0;
  /** @type {Map<number, { resolve: Function, reject: Function, onProgress?: Function }>} */
  const waiting = new Map();

  function start() {
    worker = new Worker(new URL('./depth-worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: msg }) => {
      const job = waiting.get(msg.id);
      if (!job) return;
      if (msg.type === 'progress') job.onProgress?.(msg.loaded, msg.total);
      else {
        waiting.delete(msg.id);
        if (msg.type === 'depth') job.resolve({ data: msg.data, w: msg.w, h: msg.h, ms: msg.ms });
        else job.reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      for (const job of waiting.values()) job.reject(new Error(e.message || 'depth worker failed'));
      waiting.clear();
      worker = null;
    };
  }

  return {
    /**
     * Depth for a photo.
     * @param {ImageData} image
     * @param {(loaded: number, total: number) => void} [onProgress] model download
     * @returns {Promise<{ data: Float32Array, w: number, h: number, ms: number }>}
     */
    estimate(image, onProgress) {
      if (!worker) start();
      const id = ++seq;
      const rgba = new Uint8ClampedArray(image.data);
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject, onProgress });
        worker.postMessage({ type: 'depth', id, rgba, w: image.width, h: image.height }, [rgba.buffer]);
      });
    },
    /** Stop everything in flight; waiting promises reject with 'cancelled'. */
    cancel() {
      worker?.terminate();
      worker = null;
      for (const job of waiting.values()) job.reject(new Error('cancelled'));
      waiting.clear();
    },
  };
}
