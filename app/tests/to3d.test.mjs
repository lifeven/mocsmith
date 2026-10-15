import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTo3D, mockProvider, To3DError } from '../src/services/to3d.mjs';

const image = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer; // 'glTF'

/** A clock that only moves when the loop sleeps, so nothing really waits. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => void (t += ms) };
}

test('the mock goes queued → running → done and returns its sample without uploading', async () => {
  const loaded = [];
  const provider = mockProvider({ sampleUrl: './samples/fox.glb', load: async (url) => (loaded.push(url), GLB) });
  const seen = [];
  const out = await createTo3D({ provider, ...fakeClock() }).imageToGlb(image, { onProgress: (s) => seen.push(s.state) });
  assert.deepEqual(seen, ['queued', 'running', 'running', 'done']);
  assert.equal(out.glb, GLB);
  assert.equal(out.provider, 'mock');
  assert.equal(out.attempts, 1);
  assert.deepEqual(loaded, ['./samples/fox.glb']);
});

test('a failed job is submitted again, up to the retry count', async () => {
  let submits = 0;
  const flaky = {
    name: 'flaky',
    submit: async () => ({ id: String(++submits) }),
    status: async (id) => (id === '3' ? { state: 'done' } : { state: 'failed', error: 'gpu busy' }),
    result: async () => GLB,
  };
  const out = await createTo3D({ provider: flaky, retries: 2, ...fakeClock() }).imageToGlb(image);
  assert.equal(out.attempts, 3);
  await assert.rejects(
    createTo3D({ provider: { ...flaky, status: async () => ({ state: 'failed', error: 'gpu busy' }) }, retries: 1, ...fakeClock() }).imageToGlb(image),
    (e) => e instanceof To3DError && e.reason === 'failed' && /gpu busy/.test(e.message),
  );
});

test('a job that never finishes times out', async () => {
  const stuck = { name: 'stuck', submit: async () => ({ id: '1' }), status: async () => ({ state: 'running' }), result: async () => GLB };
  await assert.rejects(
    createTo3D({ provider: stuck, timeoutMs: 10_000, pollMs: 3000, ...fakeClock() }).imageToGlb(image),
    (e) => e instanceof To3DError && e.reason === 'timeout',
  );
});

test('an aborted request stops before the next poll', async () => {
  const controller = new AbortController();
  const provider = mockProvider({ sampleUrl: 'x', load: async () => GLB, steps: 10 });
  const run = createTo3D({ provider, ...fakeClock() }).imageToGlb(image, {
    signal: controller.signal,
    onProgress: (s) => s.state === 'running' && controller.abort(),
  });
  await assert.rejects(run, (e) => e instanceof To3DError && e.reason === 'aborted');
});
