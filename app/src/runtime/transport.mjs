import { VoxelGrid } from '../core/grid.mjs';

/**
 * A built model as postable data (the grid loses its class in postMessage),
 * plus the typed-array buffers worth transferring instead of copying.
 *
 * @param {import('../convert/build.mjs').BuiltModel} model
 */
export function packModel(model) {
  const { grid, result } = model;
  const packed = { ...model, grid: { sx: grid.sx, sy: grid.sy, sz: grid.sz, cells: grid.cells } };
  return { model: packed, transfer: [grid.cells.buffer, result.owner.buffer] };
}

/** Undo `packModel` on the receiving side: give the grid back its methods. */
export function unpackModel(packed) {
  const { sx, sy, sz, cells } = packed.grid;
  const grid = new VoxelGrid(sx, sy, sz);
  grid.cells = cells;
  return { ...packed, grid };
}
