/**
 * Build-plan metrics for connectivity, assembly access and step complexity.
 *
 * Contacts are the ones `check` uses: two parts are connected only when one
 * sits directly on the other. Side contact matters only for how scattered a
 * step's new parts are.
 *
 * Per step, for the parts it places:
 * - `floating`: placed parts that cannot reach the ground through placed
 *   parts, not counting parts that never reach it in the finished model either;
 * - `blocked`: parts that already have an earlier part directly above and
 *   an earlier part (or the ground) directly below, so there is no way to put
 *   them in;
 * - `fromBelow`: parts with nothing under them yet (an earlier or same-step
 *   part, or the ground) but something above, so they are pushed on from below;
 * - `unattached`: parts above the ground touching no earlier or same-step
 *   part at all;
 * - `size`, `patches` (groups of new parts joined by side or vertical
 *   contact among themselves) and `spread` (S5: the new parts' bounding-box
 *   diagonal over the model's, plates counted at 0.4 stud);
 * - `colours` and `kinds`: how many colours, and how many different parts
 *   (colour, kind, footprint, part number), the builder picks up for it;
 * - `covered`: new parts whose face towards the camera (the top; the bottom
 *   on a step pushed on from below or a sub-assembly built upside down) is
 *   entirely covered by other parts of the same step, so the picture of the
 *   step hides them.
 *
 * @typedef {{ size: number, floating: number, blocked: number, fromBelow: number,
 *   unattached: number, patches: number, spread: number, colours: number, kinds: number, covered: number }} StepScore
 * @typedef {{ steps: number, chapters: number, sizeMax: number, sizeMean: number, sizeMedian: number,
 *   overCap: number, floatingSteps: number, floatingMax: number, blocked: number,
 *   fromBelow: number, unattached: number, patchesMean: number, patchesMax: number,
 *   spreadMean: number, spreadMax: number, coloursMean: number, kindsMean: number,
 *   covered: number, coveredSteps: number, neverGrounded: number, mirrorPairs: number,
 *   mirrorSame: number, mirrorClose: number }} PlanScore
 *
 * The plan also gets S6: of the mirror pairs (`mirrorPartners`), the share
 * placed in the same step (`mirrorSame`) and in the same or the next step
 * (`mirrorClose`).
 */

/** A plate is 3.2 mm, a stud 8 mm. */
const PLATE_IN_STUDS = 0.4;

/**
 * Whether every column of a part's top (`up`) or bottom face has a cell
 * owned by a part `isMate(owner)` right against it: nothing of that face is
 * left to see from that side.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {Int32Array} owner
 * @param {{ x: number, y: number, z: number, w: number, d: number, h: number }} p
 * @param {boolean} up
 * @param {(owner: number) => boolean} isMate
 */
export function faceCovered(grid, owner, p, up, isMate) {
  const y = up ? p.y + p.h : p.y - 1;
  if (y < 0 || y >= grid.sy) return false;
  for (let x = p.x; x < p.x + p.w; x++) {
    for (let z = p.z; z < p.z + p.d; z++) {
      const o = owner[grid.index(x, y, z)];
      if (o < 0 || !isMate(o)) return false;
    }
  }
  return true;
}

/**
 * Vertical and side neighbours of every part, from the owner grid.
 *
 * @param {import('../core/grid.mjs').VoxelGrid} grid
 * @param {{ parts: object[], owner: Int32Array }} result
 */
export function contacts(grid, { parts, owner }) {
  const above = parts.map(() => new Set());
  const below = parts.map(() => new Set());
  const side = parts.map(() => new Set());
  const { sx, sy, sz } = grid;
  const layer = sx * sz;
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = grid.index(x, y, z);
        const a = owner[i];
        if (a < 0) continue;
        if (y + 1 < sy) {
          const b = owner[i + layer];
          if (b >= 0 && b !== a) {
            above[a].add(b);
            below[b].add(a);
          }
        }
        for (const j of [x + 1 < sx ? i + 1 : -1, z + 1 < sz ? i + sx : -1]) {
          const b = j < 0 ? -1 : owner[j];
          if (b >= 0 && b !== a) {
            side[a].add(b);
            side[b].add(a);
          }
        }
      }
    }
  }
  return { above, below, side };
}

/**
 * Union-find over placed parts that keeps how many placed parts are in groups
 * with no part on the ground.
 */
function groundedGroups(parts) {
  const parent = new Int32Array(parts.length).fill(-1);
  const size = new Int32Array(parts.length);
  const grounded = new Uint8Array(parts.length);
  let ungrounded = 0;
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return;
    if (grounded[ra] !== grounded[rb]) ungrounded -= grounded[ra] ? size[rb] : size[ra];
    if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    size[ra] += size[rb];
    grounded[ra] |= grounded[rb];
  };
  return {
    add(id, neighbours) {
      parent[id] = id;
      size[id] = 1;
      grounded[id] = parts[id].y === 0 ? 1 : 0;
      if (!grounded[id]) ungrounded++;
      for (const nb of neighbours) if (parent[nb] >= 0) union(id, nb);
    },
    isGrounded: (id) => grounded[find(id)] === 1,
    get ungrounded() {
      return ungrounded;
    },
  };
}

/** Bounding box of parts' cells as [min x, y, z, max x, y, z] (max exclusive). */
function boxOf(parts, ids) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const p = parts[id];
    b[0] = Math.min(b[0], p.x);
    b[1] = Math.min(b[1], p.y);
    b[2] = Math.min(b[2], p.z);
    b[3] = Math.max(b[3], p.x + p.w);
    b[4] = Math.max(b[4], p.y + p.h);
    b[5] = Math.max(b[5], p.z + p.d);
  }
  return b;
}

const diagonal = (b) => Math.hypot(b[3] - b[0], (b[4] - b[1]) * PLATE_IN_STUDS, b[5] - b[2]);

/** What a builder picks up for a part: colour, kind, footprint (short side first) and part number. */
const kindKey = (p) => `${p.color}/${p.kind}/${Math.min(p.w, p.d)}x${Math.max(p.w, p.d)}/${p.ldraw ?? ''}`;

/**
 * Mirror partners (S6): for each part, the part that is its mirror image
 * about the model's middle along x, or along z, whichever axis has more such
 * pairs; -1 when it has none. A partner has the same kind, part number,
 * footprint, height, layer and colour, and the mirrored position across the
 * axis (same place along the other one). A part on the middle line is not its
 * own partner.
 *
 * @param {{ id: number, kind: string, x: number, y: number, z: number, w: number, d: number, h: number, color: number, ldraw?: string }[]} parts
 * @returns {Int32Array}
 */
export function mirrorPartners(parts) {
  return mirrorAxis(parts).partner;
}

/**
 * The mirror axis behind `mirrorPartners`: which of x and z, how many pairs,
 * and the partners.
 *
 * @param {Parameters<typeof mirrorPartners>[0]} parts
 * @returns {{ axis: 'x' | 'z' | null, pairs: number, partner: Int32Array }}
 */
export function mirrorAxis(parts) {
  const best = { axis: null, pairs: -1, partner: new Int32Array(parts.length).fill(-1) };
  if (!parts.length) return { ...best, pairs: 0 };
  const box = boxOf(parts, parts.map((p) => p.id));
  for (const axis of ['x', 'z']) {
    const [lo, hi, size] = axis === 'x' ? [box[0], box[3], 'w'] : [box[2], box[5], 'd'];
    const other = axis === 'x' ? 'z' : 'x';
    const key = (p, pos) => `${p.kind}|${p.ldraw ?? ''}|${p.w}|${p.d}|${p.h}|${p.y}|${p.color}|${p[other]}|${pos}`;
    const at = new Map(parts.map((p) => [key(p, p[axis]), p.id]));
    const partner = new Int32Array(parts.length).fill(-1);
    let pairs = 0;
    for (const p of parts) {
      const q = at.get(key(p, lo + hi - p[axis] - p[size]));
      if (q === undefined || q === p.id) continue;
      partner[p.id] = q;
      if (p.id < q) pairs++;
    }
    if (pairs > best.pairs) Object.assign(best, { axis, pairs, partner });
  }
  return best;
}

/**
 * Score a build plan on a model.
 *
 * @param {{ grid: import('../core/grid.mjs').VoxelGrid, result: { parts: object[], owner: Int32Array } }} model
 * @param {{ ids: number[] }[]} steps every part exactly once (the planner contract)
 * @param {{ cap?: number }} [options] steps with more parts than `cap` count in `overCap`
 * @returns {{ perStep: StepScore[], summary: PlanScore }}
 */
export function scorePlan(model, steps, { cap = 6 } = {}) {
  const { parts } = model.result;
  const { above, below, side } = contacts(model.grid, model.result);
  const vertical = (id) => [...above[id], ...below[id]];

  // Parts that never reach the ground, even with everything placed.
  const all = groundedGroups(parts);
  for (const p of parts) all.add(p.id, vertical(p.id));
  const neverGrounded = new Uint8Array(parts.length);
  for (const p of parts) if (!all.isGrounded(p.id)) neverGrounded[p.id] = 1;

  const stepOf = new Int32Array(parts.length).fill(-1);
  steps.forEach((s, k) => s.ids.forEach((id) => (stepOf[id] = k)));
  const modelDiag = diagonal(boxOf(parts, parts.map((p) => p.id))) || 1;

  const groups = groundedGroups(parts);
  let placedNever = 0;
  const perStep = steps.map((s, k) => {
    let blocked = 0;
    let fromBelow = 0;
    let unattached = 0;
    const earlier = (set) => [...set].some((b) => stepOf[b] < k);
    const byNow = (set) => [...set].some((b) => stepOf[b] <= k);
    for (const id of s.ids) {
      const p = parts[id];
      if (earlier(above[id]) && (p.y === 0 || earlier(below[id]))) blocked++;
      if (p.y > 0 && !byNow(below[id])) {
        if (byNow(above[id])) fromBelow++;
        else unattached++;
      }
    }
    for (const id of s.ids) {
      groups.add(id, vertical(id));
      placedNever += neverGrounded[id];
    }

    // Patches: new parts joined by any contact among themselves.
    const inStep = new Set(s.ids);
    const up = !(s.fromBelow || s.sub !== undefined);
    const covered = s.ids.filter((id) => faceCovered(model.grid, model.result.owner, parts[id], up, (o) => inStep.has(o))).length;
    const seen = new Set();
    let patches = 0;
    for (const id of s.ids) {
      if (seen.has(id)) continue;
      patches++;
      const queue = [id];
      seen.add(id);
      while (queue.length) {
        const a = queue.pop();
        for (const set of [above[a], below[a], side[a]]) {
          for (const b of set) {
            if (inStep.has(b) && !seen.has(b)) {
              seen.add(b);
              queue.push(b);
            }
          }
        }
      }
    }

    return {
      size: s.ids.length,
      floating: groups.ungrounded - placedNever,
      blocked,
      fromBelow,
      unattached,
      patches,
      spread: diagonal(boxOf(parts, s.ids)) / modelDiag,
      colours: new Set(s.ids.map((id) => parts[id].color)).size,
      kinds: new Set(s.ids.map((id) => kindKey(parts[id]))).size,
      covered,
    };
  });

  const n = perStep.length || 1;
  const sizes = perStep.map((s) => s.size).sort((a, b) => a - b);
  const sum = (key) => perStep.reduce((t, s) => t + s[key], 0);
  const max = (key) => perStep.reduce((m, s) => Math.max(m, s[key]), 0);
  const partner = mirrorPartners(parts);
  let mirrorPairs = 0;
  let mirrorSame = 0;
  let mirrorNext = 0;
  for (const p of parts) {
    const q = partner[p.id];
    if (q < p.id) continue;
    mirrorPairs++;
    const gap = Math.abs(stepOf[p.id] - stepOf[q]);
    if (gap === 0) mirrorSame++;
    else if (gap === 1) mirrorNext++;
  }
  return {
    perStep,
    summary: {
      steps: perStep.length,
      chapters: new Set(steps.map((st) => st.chapter ?? 0)).size,
      sizeMax: max('size'),
      sizeMean: sum('size') / n,
      sizeMedian: sizes.length ? sizes[(sizes.length - 1) >> 1] : 0,
      overCap: perStep.filter((s) => s.size > cap).length,
      floatingSteps: perStep.filter((s) => s.floating > 0).length,
      floatingMax: max('floating'),
      blocked: sum('blocked'),
      fromBelow: sum('fromBelow'),
      unattached: sum('unattached'),
      patchesMean: sum('patches') / n,
      patchesMax: max('patches'),
      spreadMean: sum('spread') / n,
      spreadMax: max('spread'),
      coloursMean: sum('colours') / n,
      kindsMean: sum('kinds') / n,
      covered: sum('covered'),
      coveredSteps: perStep.filter((s) => s.covered > 0).length,
      neverGrounded: neverGrounded.reduce((t, v) => t + v, 0),
      mirrorPairs,
      mirrorSame: mirrorPairs ? mirrorSame / mirrorPairs : 1,
      mirrorClose: mirrorPairs ? (mirrorSame + mirrorNext) / mirrorPairs : 1,
    },
  };
}
