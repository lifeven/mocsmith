import { FLAG_DETACHED } from './check.mjs';
import { forEachCell, groupsAfter, partGraph } from './graph.mjs';

/**
 * Mutable layout state for repeated repair and surface-finishing edits.
 * Parts retain stable slot IDs during editing. Each change updates only
 * the affected owner cells and graph edges; `order` preserves deterministic
 * part ordering. `toResult` assigns final IDs when producing the result.
 */
export class EditableModel {
  /**
   * @param {import('./grid.mjs').VoxelGrid} grid
   * @param {{ parts: object[], owner: Int32Array }} result parts numbered 0..n-1
   */
  constructor(grid, result) {
    this.grid = grid;
    /** @type {(object | null)[]} part by slot id; null once removed */
    this.slots = result.parts.slice();
    /** @type {number[]} slot ids in part order */
    this.order = result.parts.map((p) => p.id);
    this.owner = result.owner.slice();
    this.adj = partGraph(grid, result);
    /** Groups of the current parts, built on demand (`components`). */
    this.comp = null;
  }

  /** Live parts in order. */
  parts() {
    return this.order.map((id) => this.slots[id]);
  }

  /**
   * Group counts after a hypothetical edit, without applying it.
   * @param {Set<number>} removed slot ids
   * @param {object[]} list parts after the edit, in order (kept ones carry their slot `id`)
   * @param {(i: number) => boolean} isNew
   */
  whatIf(removed, list, isNew) {
    return groupsAfter(this.grid, this.owner, this.adj, removed, list, isNew);
  }

  /**
   * Same counts as `whatIf(removed, [...kept parts in order,...pieces], …)`
   * for an edit whose new `pieces` cover exactly the removed parts' cells
   * (repair merges), but found by searching outward from the edit instead of
   * over every part. Only the groups holding a removed part (or touched by a
   * piece) can change. Inside them a search starts from every neighbour of
   * the removed parts and from every piece; searches that meet join, and the
   * search stops as soon as at most one is still growing: the ones that ran
   * out are the pieces that broke off (their size is now known), and the one
   * still growing is everything else of those groups (known by subtraction).
   * Falls back to the full count when the main body is a tie that needs part
   * order to settle.
   *
   * @param {Set<number>} removed slot ids
   * @param {object[]} pieces new parts, placed after all kept parts, except
   *   the first `front` of them, which go before (the order only matters for
   *   a tie between the largest groups)
   * @param {number} [front]
   * @returns {{ components: number, detachedParts: number }}
   */
  whatIfLocal(removed, pieces, front = 0) {
    const { label, groups } = this.components();
    const { grid, owner, adj, slots } = this;
    const S = slots.length;
    const vol = (p) => p.w * p.d * p.h;

    // Contacts of the pieces: with each other and with kept parts.
    const pieceAdj = pieces.map(() => []);
    const toPieces = new Map();
    const cellOf = new Map();
    pieces.forEach((p, k) => forEachCell(p, (x, y, z) => cellOf.set(grid.index(x, y, z), k)));
    const layer = grid.sx * grid.sz;
    for (const [cell, k] of cellOf) {
      for (const j of [cell - layer, cell + layer]) {
        if (j < 0 || j >= owner.length) continue;
        const mine = cellOf.get(j);
        if (mine !== undefined) {
          if (mine !== k) pieceAdj[k].push(S + mine);
          continue;
        }
        const o = owner[j];
        if (o < 0 || removed.has(o)) continue;
        pieceAdj[k].push(o);
        if (!toPieces.has(o)) toPieces.set(o, []);
        toPieces.get(o).push(S + k);
      }
    }

    // The groups that can change, and what they hold after the edit.
    const affected = new Set();
    for (const r of removed) affected.add(label[r]);
    for (const o of toPieces.keys()) affected.add(label[o]);
    const total = { volume: 0, size: 0, grounded: 0 };
    for (const c of affected) {
      total.volume += groups[c].volume;
      total.size += groups[c].size;
      total.grounded += groups[c].grounded;
    }
    for (const r of removed) {
      total.volume -= vol(slots[r]);
      total.size--;
      if (slots[r].y === 0) total.grounded--;
    }
    for (const p of pieces) {
      total.volume += vol(p);
      total.size++;
      if (p.y === 0) total.grounded++;
    }

    // Searches from every seed; union-find over search ids.
    const partOf = (node) => (node < S ? slots[node] : pieces[node - S]);
    const neighbours = (node) => {
      if (node >= S) return pieceAdj[node - S];
      const out = [];
      for (const nb of adj[node]) if (!removed.has(nb)) out.push(nb);
      const extra = toPieces.get(node);
      if (extra) out.push(...extra);
      return out;
    };
    const seen = new Map(); // node → search id
    const parent = [];
    const info = [];
    const find = (s) => {
      while (parent[s] !== s) s = parent[s] = parent[parent[s]];
      return s;
    };
    const visit = (node, s) => {
      seen.set(node, s);
      const p = partOf(node);
      const g = info[s];
      g.volume += vol(p);
      g.size++;
      if (p.y === 0) g.grounded++;
      g.queue.push(node);
    };
    const join = (a, b) => {
      a = find(a);
      b = find(b);
      if (a === b) return;
      const [big, small] = info[a].queue.length >= info[b].queue.length ? [a, b] : [b, a];
      parent[small] = big;
      const g = info[big];
      const h = info[small];
      g.volume += h.volume;
      g.size += h.size;
      g.grounded += h.grounded;
      for (const node of h.queue) g.queue.push(node);
      h.queue = [];
    };
    const seed = (node) => {
      const prev = seen.get(node);
      const s = parent.length;
      parent.push(s);
      info.push({ volume: 0, size: 0, grounded: 0, queue: [] });
      if (prev === undefined) visit(node, s);
      else join(s, prev);
    };
    for (const r of removed) for (const nb of adj[r]) if (!removed.has(nb)) seed(nb);
    for (let k = 0; k < pieces.length; k++) seed(S + k);

    let active = [...new Set(parent.map((_, s) => find(s)))].filter((s) => info[s].queue.length);
    while (active.length > 1) {
      for (const s0 of active) {
        let s = find(s0);
        const node = info[s].queue.pop();
        if (node === undefined) continue;
        for (const nb of neighbours(node)) {
          const other = seen.get(nb);
          if (other === undefined) visit(nb, s);
          else {
            join(s, other);
            s = find(s); // the joined search lives on under one of the two roots
          }
        }
      }
      active = [...new Set(active.map(find))].filter((s) => info[s].queue.length);
    }

    // New groups: searches that ran out, plus the rest of the affected groups.
    const roots = [...new Set(parent.map((_, s) => find(s)))];
    const fresh = roots.filter((s) => !info[s].queue.length).map((s) => info[s]);
    const done = fresh.reduce((a, g) => ({ volume: a.volume + g.volume, size: a.size + g.size, grounded: a.grounded + g.grounded }), { volume: 0, size: 0, grounded: 0 });
    if (total.size > done.size) {
      fresh.push({ volume: total.volume - done.volume, size: total.size - done.size, grounded: total.grounded - done.grounded, rest: true });
    }

    // Main body exactly as groupsAfter picks it (largest grounded; tie → first in part order).
    const all = [];
    groups.forEach((g, c) => {
      if (!affected.has(c)) all.push(g);
    });
    for (const g of fresh) all.push(g);
    const anyGrounded = all.some((g) => g.grounded > 0);
    const pool = anyGrounded ? all.filter((g) => g.grounded > 0) : all;
    const best = Math.max(...pool.map((g) => g.volume));
    const top = pool.filter((g) => g.volume === best);
    if (top.length > 1) {
      // A tie: part order decides, which the local search does not track.
      const kept = this.parts().filter((p) => !removed.has(p.id));
      const list = [...pieces.slice(0, front), ...kept, ...pieces.slice(front)];
      const isNew = (i) => i < front || i >= front + kept.length;
      const { components, detachedParts } = groupsAfter(grid, owner, adj, removed, list, isNew);
      return { components, detachedParts };
    }
    const partsAfter = this.order.length - removed.size + pieces.length;
    return { components: all.length, detachedParts: partsAfter - top[0].size };
  }

  /**
   * Groups of the current parts (lazy; `replace` clears it): a label per slot
   * and per group its volume, size and number of parts on the ground.
   */
  components() {
    if (this.comp) return this.comp;
    const label = new Int32Array(this.slots.length).fill(-1);
    const groups = [];
    const stack = [];
    for (const slot of this.order) {
      if (label[slot] >= 0) continue;
      const g = { volume: 0, size: 0, grounded: 0 };
      const c = groups.length;
      groups.push(g);
      label[slot] = c;
      stack.push(slot);
      while (stack.length) {
        const s = stack.pop();
        const p = this.slots[s];
        g.volume += p.w * p.d * p.h;
        g.size++;
        if (p.y === 0) g.grounded++;
        for (const nb of this.adj[s]) {
          if (label[nb] < 0) {
            label[nb] = c;
            stack.push(nb);
          }
        }
      }
    }
    this.comp = { label, groups };
    return this.comp;
  }

  /**
   * Apply an edit: drop `removed`, add `before` at the front and `after` at the
   * end of the part order. New parts get fresh slot ids.
   * @param {Set<number>} removed
   * @param {object[]} before
   * @param {object[]} after
   */
  replace(removed, before, after) {
    const { grid, owner, adj } = this;
    this.comp = null; // groups change
    for (const id of removed) {
      for (const nb of adj[id]) adj[nb].delete(id);
      adj[id] = new Set();
      this.slots[id] = null;
    }
    const added = [...before, ...after].map((p) => {
      const id = this.slots.length;
      const part = { ...p, id };
      this.slots.push(part);
      adj.push(new Set());
      return part;
    });
    // Removed and added parts cover the same cells, so only those change hands.
    for (const p of added) forEachCell(p, (x, y, z) => (owner[grid.index(x, y, z)] = p.id));
    const layer = grid.sx * grid.sz;
    for (const p of added) {
      forEachCell(p, (x, y, z) => {
        const i = grid.index(x, y, z);
        for (const j of [i - layer, i + layer]) {
          if (j < 0 || j >= owner.length) continue;
          const o = owner[j];
          if (o >= 0 && o !== p.id) {
            adj[p.id].add(o);
            adj[o].add(p.id);
          }
        }
      });
    }
    const kept = this.order.filter((id) => !removed.has(id));
    this.order = [
      ...added.slice(0, before.length).map((p) => p.id),
      ...kept,
      ...added.slice(before.length).map((p) => p.id),
    ];
    return added;
  }

  /**
   * What repair needs from `check`: group counts and the detached flag per
   * slot, computed on the part graph (same rules as `check`).
   */
  groups() {
    const list = this.parts();
    const counts = groupsAfter(this.grid, this.owner, this.adj, new Set(), list, () => false, true);
    const flags = new Uint8Array(this.slots.length);
    list.forEach((p, i) => {
      if (counts.detached[i]) flags[p.id] = FLAG_DETACHED;
    });
    return { components: counts.components, detachedParts: counts.detachedParts, flags };
  }

  /** The edited result, numbered in part order (what rebuild-every-time produced). */
  toResult() {
    const parts = this.parts().map((p, id) => ({ ...p, id }));
    const remap = new Int32Array(this.slots.length).fill(-1);
    this.order.forEach((slot, id) => (remap[slot] = id));
    const owner = this.owner.map((o) => (o >= 0 ? remap[o] : -1));
    return { parts, owner };
  }
}
