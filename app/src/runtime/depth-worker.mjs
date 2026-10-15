/**
 * Depth inference Worker. Depth Anything V2 Small downloads on first use;
 * the ONNX session then converts local photos into depth maps. The photo
 * stays in the browser. The WebAssembly runtime is served with the app.
 *
 * Input: { type: 'depth', id, rgba (transferred), w, h }
 * Output: progress messages, a transferred depth map, or an error message.
 */
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { DEPTH_MODEL_BYTES, DEPTH_MODEL_URL, inputSize, toInput } from '../mosaic/depth.mjs';

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// Without cross-origin isolation there is no SharedArrayBuffer, so one thread.
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let sessionPromise = null;

async function loadModel(id) {
  const res = await fetch(DEPTH_MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`model ${res.status}`);
  const total = Number(res.headers.get('content-length')) || DEPTH_MODEL_BYTES;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    postMessage({ type: 'progress', id, loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
}

self.onmessage = async ({ data: msg }) => {
  if (msg.type !== 'depth') return;
  const { id, rgba, w, h } = msg;
  try {
    // One download per Worker; a failed download is tried again on the next request.
    sessionPromise ??= loadModel(id).catch((err) => {
      sessionPromise = null;
      throw err;
    });
    const session = await sessionPromise;
    const t = performance.now();
    const size = inputSize(w, h);
    const input = new ort.Tensor('float32', toInput(rgba, w, h, size.w, size.h), [1, 3, size.h, size.w]);
    const result = await session.run({ [session.inputNames[0]]: input });
    const out = result[session.outputNames[0]];
    const data = new Float32Array(out.data);
    postMessage({ type: 'depth', id, data, w: size.w, h: size.h, ms: performance.now() - t }, [data.buffer]);
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err?.message ?? err) });
  }
};
