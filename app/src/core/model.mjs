/**
 * Helpers on a laid-out brick model (`{ parts, owner }` over a voxel grid),
 * shared by the steps that edit part lists (tiles, weld, the editor, `.ldr`
 * import), paint, and picking in the renderer.
 */

/** Grid cells a placed part fills: its box, or its own cell list for slopes. */
export function cellsOfPart(part) {
  if (part.cells) return part.cells.map(([x, y, z]) => [x, y, z]);
  const out = [];
  for (let dy = 0; dy < part.h; dy++) {
    for (let dz = 0; dz < part.d; dz++) {
      for (let dx = 0; dx < part.w; dx++) out.push([part.x + dx, part.y + dy, part.z + dz]);
    }
  }
  return out;
}

/**
 * Renumber a part list and rebuild the owner grid; parts with `cells`
 * (slopes) mark only those cells, the others their box.
 *
 * @param {import('./grid.mjs').VoxelGrid} grid
 * @param {object[]} list
 * @returns {{ parts: object[], owner: Int32Array }}
 */
export function rebuildWithCells(grid, list) {
  const parts = list.map((p, id) => ({ ...p, id }));
  const owner = new Int32Array(grid.cells.length).fill(-1);
  for (const p of parts) {
    if (p.cells) {
      for (const [cx, cy, cz] of p.cells) owner[grid.index(cx, cy, cz)] = p.id;
      continue;
    }
    for (let dy = 0; dy < p.h; dy++) {
      for (let dz = 0; dz < p.d; dz++) {
        for (let dx = 0; dx < p.w; dx++) owner[grid.index(p.x + dx, p.y + dy, p.z + dz)] = p.id;
      }
    }
  }
  return { parts, owner };
}
