/**
 * Fast what-if connectivity for local edits (repair merges, slope swaps).
 *
 * `check` rebuilds the groups from every cell of the grid. An edit only
 * replaces a few parts, so a candidate can be judged on the part graph
 * instead: drop the removed parts, add the new ones with the vertical
 * contacts of their own cells, and union-find over parts. The counts are the
 * same as `check` would give on the edited model, including which group is
 * the main body: the largest grounded group by volume, the first one in part
 * order on a tie. Callers pass the parts in the order the edited model would
 * have them.
 */

/**
 * Parts that touch vertically (studs into tubes), as adjacency sets. This is
 * the graph `check` builds its groups from.
 *
 * @param {import('./grid.mjs').VoxelGrid} grid
 * @param {{ parts: object[], owner: Int32Array }} result
 * @returns {Set<number>[]}
 */
export function partGraph(grid, { parts, owner }) {
  const adj = parts.map(() => new Set());
  const layer = grid.sx * grid.sz;
  for (let i = 0; i + layer < owner.length; i++) {
    const a = owner[i];
    const b = owner[i + layer];
    if (a >= 0 && b >= 0 && a !== b) {
      adj[a].add(b);
      adj[b].add(a);
    }
  }
  return adj;
}

/**
 * `components` and `detachedParts` that `check` would report after an edit.
 *
 * @param {import('./grid.mjs').VoxelGrid} grid
 * @param {Int32Array} owner owner grid before the edit
 * @param {Set<number>[]} adj part graph before the edit
 * @param {Set<number>} removed ids of the parts the edit takes out
 * @param {object[]} list every part after the edit, in its new order; kept
 *   parts keep their old `id`, new parts are the ones at `isNew(i)`
 * @param {(i: number) => boolean} isNew
 * @param {boolean} [withFlags] also return `detached`, 1 per list entry outside the main body
 * @returns {{ components: number, detachedParts: number, detached?: Uint8Array }}
 */
export function groupsAfter(grid, owner, adj, removed, list, isNew, withFlags = false) {
  const n = list.length;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Kept parts: their old contacts, minus those to removed parts.
  const position = new Int32Array(adj.length).fill(-1);
  for (let i = 0; i < n; i++) if (!isNew(i)) position[list[i].id] = i;
  for (let i = 0; i < n; i++) {
    if (isNew(i)) continue;
    for (const nb of adj[list[i].id]) {
      const j = position[nb];
      if (j > i) union(i, j);
    }
  }

  // New parts: contacts of their own cells, with each other and with kept parts.
  const cellOf = new Map();
  for (let i = 0; i < n; i++) {
    if (!isNew(i)) continue;
    forEachCell(list[i], (x, y, z) => cellOf.set(grid.index(x, y, z), i));
  }
  const layer = grid.sx * grid.sz;
  for (const [cell, i] of cellOf) {
    for (const j of [cell - layer, cell + layer]) {
      if (j < 0 || j >= owner.length) continue;
      const mine = cellOf.get(j);
      if (mine !== undefined) {
        if (mine !== i) union(i, mine);
        continue;
      }
      const o = owner[j];
      if (o >= 0 && !removed.has(o)) union(i, position[o]);
    }
  }

  // Main body exactly as check's mainGroup picks it.
  const grounded = new Set();
  const volume = new Map();
  for (let i = 0; i < n; i++) {
    const p = list[i];
    const r = find(i);
    if (p.y === 0) grounded.add(r);
    volume.set(r, (volume.get(r) ?? 0) + p.w * p.d * p.h);
  }
  let main = -1;
  let best = -1;
  for (const [r, v] of volume) {
    if (grounded.size && !grounded.has(r)) continue;
    if (v > best) {
      main = r;
      best = v;
    }
  }
  let detachedParts = 0;
  const detached = withFlags ? new Uint8Array(n) : null;
  for (let i = 0; i < n; i++) {
    if (find(i) === main) continue;
    detachedParts++;
    if (detached) detached[i] = 1;
  }
  return { components: volume.size, detachedParts, detached };
}

/** Cells a part fills: its listed cells (slopes) or its box. */
export function forEachCell(p, fn) {
  if (p.cells) {
    for (const [x, y, z] of p.cells) fn(x, y, z);
    return;
  }
  for (let dy = 0; dy < p.h; dy++)
    for (let dz = 0; dz < p.d; dz++) for (let dx = 0; dx < p.w; dx++) fn(p.x + dx, p.y + dy, p.z + dz);
}
