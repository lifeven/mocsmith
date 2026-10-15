/**
 * Instant-layer Web Worker: keeps the current mesh and runs `buildModel` off
 * the UI thread, so dragging the size slider never freezes the page.
 *
 * Messages in:  { type: 'mesh', id, data: MeshData }
 *               { type: 'build', id, seq, settings }
 * Messages out: { type: 'built', id, seq, model }  (see packModel)
 *               { type: 'error', id, seq, message }
 */
import { buildModel } from '../convert/build.mjs';
import { colouredMesh } from '../core/mesh-data.mjs';
import { packModel } from './transport.mjs';

let current = { id: -1, mesh: null };

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'mesh') {
    current = { id: msg.id, mesh: colouredMesh(msg.data) };
    return;
  }
  if (msg.type !== 'build') return;
  if (msg.id !== current.id) {
    self.postMessage({ type: 'error', id: msg.id, seq: msg.seq, message: 'mesh not loaded' });
    return;
  }
  try {
    const { model, transfer } = packModel(buildModel(current.mesh, msg.settings));
    self.postMessage({ type: 'built', id: msg.id, seq: msg.seq, model }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, seq: msg.seq, message: String(err?.message ?? err) });
  }
};
