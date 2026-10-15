/**
 * Image-to-3D provider interface and cancellable polling workflow.
 * No external provider is configured. The included mock provider returns
 * a bundled sample for local tests; the image-upload entry is disabled.
 *
 * @typedef {'queued' | 'running' | 'done' | 'failed'} JobState
 * @typedef {{ state: JobState, progress?: number, error?: string }} JobStatus
 * @typedef {object} To3DProvider
 * @property {string} name shown with the result (e.g. 'mock' or the configured provider name)
 * @property {(image: Blob, options: { views?: Blob[] }) => Promise<{ id: string }>} submit
 * @property {(id: string) => Promise<JobStatus>} status
 * @property {(id: string) => Promise<ArrayBuffer>} result GLB bytes of a finished job
 */

export class To3DError extends Error {
  /** @param {'timeout' | 'failed' | 'aborted'} reason @param {string} [detail] */
  constructor(reason, detail) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.reason = reason;
  }
}

/**
 * @param {{ provider: To3DProvider, timeoutMs?: number, retries?: number, pollMs?: number,
 *           sleep?: (ms: number) => Promise<void>, now?: () => number }} options
 *   `sleep` and `now` are injectable so tests do not wait.
 */
export function createTo3D({ provider, timeoutMs = 240_000, retries = 2, pollMs = 3000, sleep = wait, now = Date.now }) {
  return {
    provider: provider.name,
    /**
     * @param {Blob} image
     * @param {{ views?: Blob[], onProgress?: (status: JobStatus & { attempt: number }) => void, signal?: AbortSignal }} [options]
     * @returns {Promise<{ glb: ArrayBuffer, provider: string, ms: number, attempts: number }>}
     */
    async imageToGlb(image, { views, onProgress, signal } = {}) {
      const start = now();
      let lastError = '';
      for (let attempt = 1; attempt <= retries + 1; attempt++) {
        if (signal?.aborted) throw new To3DError('aborted');
        const { id } = await provider.submit(image, { views });
        for (;;) {
          if (signal?.aborted) throw new To3DError('aborted');
          if (now() - start > timeoutMs) throw new To3DError('timeout', `${Math.round(timeoutMs / 1000)} s`);
          const status = await provider.status(id);
          onProgress?.({ ...status, attempt });
          if (status.state === 'done') {
            const glb = await provider.result(id);
            return { glb, provider: provider.name, ms: now() - start, attempts: attempt };
          }
          if (status.state === 'failed') {
            lastError = status.error ?? 'failed';
            break; // resubmit, if attempts are left
          }
          await sleep(pollMs);
        }
      }
      throw new To3DError('failed', lastError);
    },
  };
}

/**
 * A provider that uploads nothing: after a few fake polls it returns the GLB
 * from `load(sampleUrl)` (by default a same-origin fetch of a bundled sample).
 *
 * @param {{ sampleUrl: string, load?: (url: string) => Promise<ArrayBuffer>, steps?: number }} options
 * @returns {To3DProvider}
 */
export function mockProvider({ sampleUrl, load = fetchBytes, steps = 3 }) {
  const jobs = new Map();
  let next = 0;
  return {
    name: 'mock',
    async submit() {
      const id = `mock-${++next}`;
      jobs.set(id, 0);
      return { id };
    },
    async status(id) {
      const polls = (jobs.get(id) ?? 0) + 1;
      jobs.set(id, polls);
      if (polls === 1) return { state: 'queued', progress: 0 };
      if (polls <= steps) return { state: 'running', progress: (polls - 1) / steps };
      return { state: 'done', progress: 1 };
    },
    async result() {
      return load(sampleUrl);
    },
  };
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new To3DError('failed', `${url}: ${res.status}`);
  return res.arrayBuffer();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
