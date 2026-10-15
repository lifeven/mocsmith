import { contacts, faceCovered, mirrorAxis } from './metrics.mjs';
import { gatherSubAssemblies } from './subs.mjs';

/** Chapters: the foundation, then halves in bands of about `chapterParts` parts per half. */
export const CHAPTERS = { foundation: 6, band: 6, minParts: 300, mirrorShare: 0.05, chapterParts: 200 };

/**
 * Which chapter zone each part belongs to: 0 for the foundation (the lowest
 * `foundation` plate layers); above it, the model is cut in two halves across
 * its longer side and built in bands, one half then the other: zone
 * 1 + 2·band + half. Bands are as tall as it takes for a half-band to hold
 * about `chapterParts` parts, and at least `band` plates. A part of the first
 * half resting on parts of the second half in the same band would have to wait
 * for them, so those supports (and the column under them) join the first half.
 * Parts in a zone may go on once the build reaches that zone, so a part left
 * behind (it could not go on yet) comes in a later chapter. Mirror pairs must
 * stay in one half, so when at least `mirrorShare` of the parts mirror across
 * the longer side, the cut runs the other way. Models under `minParts` parts
 * get the foundation and one more chapter.
 *
 * @param {{ x: number, y: number, z: number, w: number, d: number }[]} parts
 * @param {{ axis: 'x' | 'z' | null, pairs: number }} symmetry from `mirrorAxis`
 * @param {Set<number>[]} [above] vertical contacts (`contacts`), to keep supports with what they hold
 */
export function chapterZones(parts, symmetry, { foundation, band, minParts, mirrorShare, chapterParts } = CHAPTERS, above) {
  const zone = new Int32Array(parts.length);
  if (!parts.length) return zone;
  const small = parts.length < minParts;
  const lo = { x: Infinity, z: Infinity };
  const hi = { x: -Infinity, z: -Infinity };
  for (const p of parts) {
    lo.x = Math.min(lo.x, p.x);
    lo.z = Math.min(lo.z, p.z);
    hi.x = Math.max(hi.x, p.x + p.w);
    hi.z = Math.max(hi.z, p.z + p.d);
  }
  const longer = hi.x - lo.x >= hi.z - lo.z ? 'x' : 'z';
  const across = symmetry.axis === longer && symmetry.pairs * 2 >= mirrorShare * parts.length ? (longer === 'x' ? 'z' : 'x') : longer;
  const mid = (lo[across] + hi[across]) / 2;
  // Bands as tall as it takes for each half-band to hold about `chapterParts` parts, at least `band` plates.
  const upper = parts.filter((p) => p.y >= foundation);
  const top = upper.reduce((m, p) => Math.max(m, p.y + 1), foundation);
  const bands = Math.max(1, Math.round(upper.length / (2 * chapterParts)));
  const bandHeight = Math.max(band, Math.ceil((top - foundation) / bands));
  for (const p of parts) {
    if (p.y < foundation) continue;
    if (small) {
      zone[p.id] = 1;
      continue;
    }
    const centre = p[across] + (across === 'x' ? p.w : p.d) / 2;
    zone[p.id] = 1 + 2 * Math.floor((p.y - foundation) / bandHeight) + (centre < mid ? 0 : 1);
  }
  // A part of the first half that rests on parts of the second half, in the same band,
  // would have to wait for them: those supports, and the parts under them, join the first half.
  if (above && !small) {
    const bandOf = (z) => (z - 1) >> 1;
    for (const p of [...parts].sort((a, b) => b.y - a.y)) {
      if (zone[p.id] < 1) continue;
      for (const a of above[p.id]) {
        if (zone[a] >= 1 && zone[a] < zone[p.id] && bandOf(zone[a]) === bandOf(zone[p.id])) zone[p.id] = zone[a];
      }
    }
  }
  return zone;
}

/**
 * Forward steps: every step adds parts to what
 * is already built, without disassembling earlier work.
 *
 * A part can go on in one of two ways:
 * - pressed on: it is on the ground or an earlier part is directly under it,
 *   and nothing is directly above it yet;
 * - pushed on from below: an earlier part is directly above it and nothing is
 *   under it yet (a hanging part, after the part that holds it).
 * And putting it on must not shut in a part still to come: an unplaced
 * neighbour must not end up with built parts both directly above and directly
 * below it (or above it while it stands on the ground).
 *
 * Since every new part touches what is built, the built model is one grounded
 * whole after every step, while the placement rules avoid blocked and
 * unattached additions where the input allows a valid sequence.
 *
 * Each step starts from a seed: the lowest part that can go on, pressed before
 * pushed from below, nearest the previous step; but a seed that goes on the
 * same way as the previous step wins over one up to `keep` plates lower (8 by
 * default), so the build does not flip between pressing on top and hanging
 * underneath. It then grows, up to `cap`
 * parts, through parts that touch it at the side, are pressed directly on it
 * (hung directly under it) or share a part under it (over it), as long as they
 * go on the same way and lie within `rise` plates above the seed (below it,
 * for parts pushed on from below): nearest the seed's layer first, then
 * nearest the step. `rise` 3 lets a brick and the plate pressed on it share a
 * step. A part's mirror image across the
 * model's middle (`mirrorPartners`) goes on in the same step whenever it can,
 * and a part whose partner could not come along now waits for a later step
 * (`mirror`, on by default). With `colour: 'first'` (the default) a
 * growing step takes a part of a colour it already has before anything else,
 * `'layer'` only after the layer distance, `false` ignores colour.
 * With `chapters` (on by default; an object overrides `CHAPTERS`) the steps
 * follow `chapterZones` and carry their `chapter`, numbered from 0. When
 * nothing can go on by the rules, a step takes one part anyway and is marked
 * `forced`: 'shutIn' when it had to shut a part in, 'loose' when it touches
 * nothing built (parts that never reach the ground in the finished model).
 *
 * @param {{ grid: import('../core/grid.mjs').VoxelGrid, result: { parts: object[], owner: Int32Array } }} model
 * @param {{ cap?: number, rise?: number, mirror?: boolean, colour?: false | 'layer' | 'first', chapters?: boolean | object,
 *   subs?: boolean | object, cover?: 'front' | 'sides' | 'partial' | 'any', keep?: number }} [options]
 * @returns {{ ids: number[], layer: number, chapter: number, fromBelow?: true, forced?: 'shutIn' | 'loose' }[]}
 */
export function planForward(model, { cap = 6, rise = 3, mirror = true, colour = 'first', chapters = true, subs = true, cover = 'front', keep = 8 } = {}) {
  const { parts } = model.result;
  const n = parts.length;
  const { above, below, side } = contacts(model.grid, model.result);
  const symmetry = mirrorAxis(parts);
  const { partner } = symmetry;
  const zone = chapters ? chapterZones(parts, symmetry, { ...CHAPTERS, ...(typeof chapters === 'object' && chapters) }, above) : new Int32Array(n);
  const lastZone = zone.reduce((m, z) => Math.max(m, z), 0);
  let chapter = 0; // parts in zones up to this one may go on
  const placed = new Uint8Array(n);
  const anyPlaced = (set) => {
    for (const b of set) if (placed[b]) return true;
    return false;
  };
  const centre = (p) => [p.x + p.w / 2, (p.y + p.h / 2) * 0.4, p.z + p.d / 2];

  /** How a part can go on now: 'press', 'hang' or null. */
  const modeOf = (id) => {
    const up = anyPlaced(above[id]);
    const down = parts[id].y === 0 || anyPlaced(below[id]);
    if (down && !up) return 'press';
    if (up && !down) return 'hang';
    return null;
  };
  /*
   * A part shuts in a part still to come when that part ends up with a built
   * part somewhere above it and a built part (or the ground) somewhere below
   * it, through a column of unplaced parts: nothing in that column can go on
   * any more, by pressing or from below. Two marks, each only ever turned on:
   * `fromAbove[i]`: a chain of unplaced parts leads up from i to a built part;
   * `fromBelow[i]`: one leads down from i to a built part or the ground.
   */
  const fromAbove = new Uint8Array(n);
  const fromBelow = new Uint8Array(n);
  const mark = (flags, start, dir) => {
    const stack = [...start];
    while (stack.length) {
      const id = stack.pop();
      if (placed[id] || flags[id]) continue;
      flags[id] = 1;
      for (const nb of dir[id]) if (!placed[nb] && !flags[nb]) stack.push(nb);
    }
  };
  mark(fromBelow, parts.filter((p) => p.y === 0).map((p) => p.id), above);
  /** Would putting `id` on shut in a part still to come above or below it? */
  const shutsIn = (id) => {
    for (const nb of above[id]) if (!placed[nb] && fromAbove[nb]) return true;
    for (const nb of below[id]) if (!placed[nb] && fromBelow[nb]) return true;
    return false;
  };

  // Unplaced parts that might go on: ground parts, and vertical neighbours of built parts.
  const frontier = new Set(parts.filter((p) => p.y === 0).map((p) => p.id));
  const put = (id) => {
    placed[id] = 1;
    frontier.delete(id);
    for (const set of [above[id], below[id]]) for (const nb of set) if (!placed[nb]) frontier.add(nb);
    mark(fromBelow, above[id], above);
    mark(fromAbove, below[id], below);
  };

  /*
   * A part may not go on over a part of the same step (under it, for a step
   * pushed on from below) when that would leave the lower part's face towards
   * the camera entirely covered by the step and none of its sides the build
   * views can see (front, left, right; the views look from +z) still open:
   * the picture of the step would hide it. `'sides'` counts the back side too,
   * `'partial'` never allows the face to be covered, `'any'` always allows it.
   */
  const { grid } = model;
  const { owner } = model.result;
  const inStep = new Uint8Array(n);
  const sideOpen = (p) => {
    const back = cover === 'front' ? p.z - 1 : null; // the build views look from +z; the back does not count
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x - 1; x <= p.x + p.w; x++) {
        for (let z = p.z - 1; z <= p.z + p.d; z++) {
          const edge = x === p.x - 1 || x === p.x + p.w || z === p.z - 1 || z === p.z + p.d;
          const corner = (x === p.x - 1 || x === p.x + p.w) && (z === p.z - 1 || z === p.z + p.d);
          if (!edge || corner || z === back) continue;
          if (!grid.inBounds(x, y, z)) return true;
          const o = owner[grid.index(x, y, z)];
          if (o < 0 || (!placed[o] && !inStep[o])) return true;
        }
      }
    }
    return false;
  };
  /** Taking `id` would cover a step part's face as `cover` forbids. */
  const buries = (id, press) => {
    if (cover === 'any') return false;
    for (const q of press ? below[id] : above[id]) {
      if (!inStep[q]) continue;
      if (!faceCovered(grid, owner, parts[q], press, (o) => inStep[o] === 1 || o === id)) continue;
      if (cover === 'partial' || !sideOpen(parts[q])) return true;
    }
    return false;
  };

  let steps = [];
  let left = n;
  let last = null; // centre of the previous step
  let lastMode = null; // how the previous step's parts went on: 'press' or 'hang'
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  /**
   * Lowest first, pressed before hung, nearest `from`, then by id; but a seed
   * that goes on the same way as the previous step wins over one up to `keep`
   * plates lower, so the build does not flip between pressing on top and
   * hanging underneath every step.
   */
  const better = (a, b, from) => {
    if (b === null) return true;
    if (lastMode && a.mode !== b.mode && Math.abs(a.y - b.y) <= keep) return a.mode === lastMode;
    if (a.y !== b.y) return a.y < b.y;
    if (a.mode !== b.mode) return a.mode === 'press';
    if (from) {
      const da = dist2(a.c, from);
      const db = dist2(b.c, from);
      if (da !== db) return da < db;
    }
    return a.id < b.id;
  };
  /**
   * While a step grows: nearest the seed's layer first, then (with `colour`)
   * a colour already in the step, then nearest the step, then by id;
   * `colour: 'first'` puts the colour before the layer.
   */
  const closer = (a, b, y, mid, colours) => {
    if (b === null) return true;
    const sameA = colour && colours.has(parts[a.id].color);
    const sameB = colour && colours.has(parts[b.id].color);
    if (colour === 'first' && sameA !== sameB) return sameA;
    const ya = Math.abs(a.y - y);
    const yb = Math.abs(b.y - y);
    if (ya !== yb) return ya < yb;
    if (sameA !== sameB) return sameA;
    const da = dist2(a.c, mid);
    const db = dist2(b.c, mid);
    if (da !== db) return da < db;
    return a.id < b.id;
  };

  while (left > 0) {
    let seed = null;
    for (;;) {
      for (const id of frontier) {
        if (zone[id] > chapter) continue;
        const mode = modeOf(id);
        if (!mode || shutsIn(id)) continue;
        const cand = { id, y: parts[id].y, mode, c: centre(parts[id]) };
        if (better(cand, seed, last)) seed = cand;
      }
      if (seed || chapter >= lastZone) break;
      chapter++; // nothing more can go on in this chapter: start the next
    }
    let forced;
    if (!seed) {
      for (const id of frontier) {
        const mode = modeOf(id);
        if (!mode) continue;
        const cand = { id, y: parts[id].y, mode, c: centre(parts[id]) };
        if (better(cand, seed, last)) seed = cand;
      }
      forced = 'shutIn';
    }
    if (!seed) {
      for (let id = 0; id < n; id++) {
        if (placed[id]) continue;
        const cand = { id, y: parts[id].y, mode: 'press', c: centre(parts[id]) };
        if (better(cand, seed, null)) seed = cand;
      }
      forced = 'loose';
    }

    const ids = [seed.id];
    put(seed.id);
    inStep[seed.id] = 1;
    const own = [seed.id]; // the step's parts on the seed's side; mirror partners come along
    if (!forced) {
      const press = seed.mode === 'press';
      const inReach = (y) => (press ? y >= seed.y && y <= seed.y + rise : y <= seed.y && y >= seed.y - rise);
      const withPartner = (id) => {
        if (!mirror || !canPair(id)) return;
        ids.push(partner[id]);
        put(partner[id]);
        inStep[partner[id]] = 1;
      };
      /** The part's mirror partner is still to come and can go on with it now. */
      const canPair = (id) => {
        const q = partner[id];
        return q >= 0 && !placed[q] && zone[q] <= chapter && ids.length < cap && modeOf(q) === seed.mode && !shutsIn(q);
      };
      /** Taking `id` now would leave its mirror partner for a later step. */
      const strands = (id) =>
        mirror && partner[id] >= 0 && !placed[partner[id]] && (ids.length + 1 >= cap || zone[partner[id]] > chapter || modeOf(partner[id]) !== seed.mode);
      withPartner(seed.id);
      const sum = [...seed.c];
      while (ids.length < cap) {
        const mid = sum.map((v) => v / own.length);
        const colours = new Set(ids.map((i) => parts[i].color));
        let next = null;
        for (const q of ids) {
          // Beside it; pressed on it (hung under it); or sharing a part under it (over it).
          const near = [...side[q], ...(press ? above[q] : below[q])];
          for (const b of press ? below[q] : above[q]) near.push(...(press ? above[b] : below[b]));
          for (const id of near) {
            if (placed[id] || zone[id] > chapter || !inReach(parts[id].y) || modeOf(id) !== seed.mode || shutsIn(id) || strands(id) || buries(id, press)) continue;
            const cand = { id, y: parts[id].y, mode: seed.mode, c: centre(parts[id]) };
            if (closer(cand, next, seed.y, mid, colours)) next = cand;
          }
        }
        if (!next) break;
        ids.push(next.id);
        own.push(next.id);
        put(next.id);
        inStep[next.id] = 1;
        next.c.forEach((v, i) => (sum[i] += v));
        withPartner(next.id);
      }
    }
    for (const id of ids) inStep[id] = 0;
    left -= ids.length;
    last = own.map((id) => centre(parts[id])).reduce((a, c) => a.map((v, i) => v + c[i] / own.length), [0, 0, 0]);
    if (!forced) lastMode = seed.mode;
    steps.push({ ids, layer: seed.y, chapter, ...(seed.mode === 'hang' && { fromBelow: true }), ...(forced && { forced }) });
  }
  if (subs) steps = gatherSubAssemblies(model.result, { above, below }, steps, { cap, rise, ...(typeof subs === 'object' && subs) });
  // Number the chapters that got steps 0, 1, 2…
  const used = [...new Set(steps.map((s) => s.chapter))];
  for (const s of steps) s.chapter = used.indexOf(s.chapter);
  return steps;
}
