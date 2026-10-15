/** Part belongs to a group with no part on the ground. */
export const FLAG_FLOATING = 1;
/** Part is above the ground but nothing sits directly under it. */
export const FLAG_HANGING = 2;
/**
 * Part is not in the main body (the largest grounded group). Covers floating
 * groups and groups that stand on the ground on their own, like a loose paw.
 */
export const FLAG_DETACHED = 4;

/** Number of distinct parts directly under a footprint (0 on the ground layer). */
export function partsBelow(grid, owner, x, y, z, w, d) {
  if (y === 0) return 0;
  const seen = new Set();
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const id = owner[grid.index(x + dx, y - 1, z + dz)];
      if (id >= 0) seen.add(id);
    }
  }
  return seen.size;
}

/**
 * Cheap buildability checks for the instant layer. Nothing here computes
 * forces; these are the hints shown on the model, not a gate.
 *
 * Two parts are connected only when one sits directly on the other (studs into
 * tubes). Side-by-side contact does not count.
 *
 * Returns summary counts plus `flags`, one FLAG_* bit set per part, which the
 * viewer uses to colour problem parts.
 *
 * @param {import('./grid.mjs').VoxelGrid} grid
 * @param {{ parts: import('../convert/layout.mjs').PlacedPart[], owner: Int32Array }} result
 */
export function check(grid, { parts, owner }) {
  const parent = new Int32Array(parts.length).map((_, i) => i);
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

  for (let y = 0; y + 1 < grid.sy; y++) {
    for (let z = 0; z < grid.sz; z++) {
      for (let x = 0; x < grid.sx; x++) {
        const a = owner[grid.index(x, y, z)];
        const b = owner[grid.index(x, y + 1, z)];
        if (a >= 0 && b >= 0 && a !== b) union(a, b);
      }
    }
  }

  const groundedRoots = new Set();
  let groundCells = 0;
  for (const p of parts) {
    if (p.y === 0) {
      groundedRoots.add(find(p.id));
      groundCells += p.w * p.d;
    }
  }
  const mainRoot = mainGroup(parts, find, groundedRoots);
  const roots = new Set();
  const flags = new Uint8Array(parts.length);
  let floatingParts = 0;
  let detachedParts = 0;
  let hangingParts = 0;
  let interlocked = 0;
  let sumBelow = 0;
  let aboveGround = 0;
  for (const p of parts) {
    const r = find(p.id);
    roots.add(r);
    if (!groundedRoots.has(r)) {
      floatingParts++;
      flags[p.id] |= FLAG_FLOATING;
    }
    if (r !== mainRoot) {
      detachedParts++;
      flags[p.id] |= FLAG_DETACHED;
    }
    if (p.y > 0) {
      aboveGround++;
      const below = partsBelow(grid, owner, p.x, p.y, p.z, p.w, p.d);
      sumBelow += below;
      if (below === 0) {
        hangingParts++;
        flags[p.id] |= FLAG_HANGING;
      }
      if (below >= 2) interlocked++;
    }
  }

  return {
    flags,
    parts: parts.length,
    bricks: parts.filter((p) => p.kind === 'brick').length,
    components: roots.size,
    floatingParts,
    detachedParts,
    hangingParts,
    groundCells,
    meanPartsBelow: aboveGround ? sumBelow / aboveGround : 0,
    interlockedShare: aboveGround ? interlocked / aboveGround : 0,
  };
}

/**
 * The model's main body: the grounded group with the most cells, or the
 * largest group when nothing touches the ground.
 */
function mainGroup(parts, find, groundedRoots) {
  const volume = new Map();
  for (const p of parts) {
    const r = find(p.id);
    volume.set(r, (volume.get(r) ?? 0) + p.w * p.d * p.h);
  }
  let best = -1;
  let bestVolume = -1;
  const anyGrounded = groundedRoots.size > 0;
  for (const [r, v] of volume) {
    if (anyGrounded && !groundedRoots.has(r)) continue;
    if (v > bestVolume) {
      best = r;
      bestVolume = v;
    }
  }
  return best;
}
