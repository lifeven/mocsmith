/**
 * Sub-assemblies: a cluster of hanging parts
 * that the main build would push on from below one step at a time is built
 * on its own instead, turned over on the table where the same order presses
 * each part on, and then pushed on as one piece.
 *
 * Works on a finished list of forward steps. A cluster is a group of parts
 * from steps marked `fromBelow` that touch each other vertically. It becomes
 * a sub-assembly when it has at least `min` parts, nothing else is pressed
 * onto any of its parts before its last step (so moving all of it there
 * changes nothing for the rest), and a main step comes after that step. A
 * cluster that something is pressed onto part-way is cut at that step and
 * the two halves are tried again. The
 * `max` largest such pieces are taken; their parts leave their old steps
 * (emptied steps are dropped) and come back as a block of steps right after
 * the cluster's last old step, in their old order, `cap` parts a step within
 * `rise` plates (`layer` is the step's top layer, where the turned-over piece
 * starts), each marked `sub` (0, 1, 2… in build order). The main step after a
 * block is where the piece goes on (`steps/player.mjs` attachedAt).
 *
 * @param {{ parts: { id: number, y: number }[] }} result
 * @param {{ above: Set<number>[], below: Set<number>[] }} contacts
 * @param {{ ids: number[], chapter?: number, fromBelow?: true }[]} steps
 * @param {{ cap?: number, rise?: number, min?: number, max?: number }} [options]
 */
export function gatherSubAssemblies({ parts }, { above, below }, steps, { cap = 6, rise = 3, min = 3, max = 6 } = {}) {
  const stepOf = new Int32Array(parts.length).fill(-1);
  steps.forEach((s, k) => s.ids.forEach((id) => (stepOf[id] = k)));
  const hanging = new Set(steps.filter((s) => s.fromBelow).flatMap((s) => s.ids));

  // Clusters: hanging parts joined by vertical contact, in build order.
  const cluster = new Int32Array(parts.length).fill(-1);
  const clusters = [];
  for (const s of steps) {
    for (const id of s.ids) {
      if (!hanging.has(id) || cluster[id] >= 0) continue;
      const members = [];
      const stack = [id];
      cluster[id] = clusters.length;
      while (stack.length) {
        const a = stack.pop();
        members.push(a);
        for (const b of [...above[a], ...below[a]]) {
          if (hanging.has(b) && cluster[b] < 0) {
            cluster[b] = clusters.length;
            stack.push(b);
          }
        }
      }
      members.sort((a, b) => stepOf[a] - stepOf[b] || steps[stepOf[a]].ids.indexOf(a) - steps[stepOf[b]].ids.indexOf(b));
      clusters.push({ index: clusters.length, members, last: stepOf[members.at(-1)] });
    }
  }

  // Nothing outside a piece may be pressed onto it before its last step (the
  // parts above it that were there first are what it hangs from), and a step
  // that stays in the main build must follow it: that is where it goes on.
  // A cluster that something is pressed onto part-way is cut at that step:
  // what hung before it and what hangs after it are tried on their own
  // (each split into the groups that still touch), down to `min` parts.
  let lastFixed = -1;
  steps.forEach((s, k) => {
    if (s.ids.some((id) => !hanging.has(id))) lastFixed = k;
  });
  const order = (a, b) => stepOf[a] - stepOf[b] || steps[stepOf[a]].ids.indexOf(a) - steps[stepOf[b]].ids.indexOf(b);
  const touching = (list) => {
    const inList = new Set(list);
    const seen = new Set();
    const groups = [];
    for (const id of list) {
      if (seen.has(id)) continue;
      const group = [];
      const stack = [id];
      seen.add(id);
      while (stack.length) {
        const a = stack.pop();
        group.push(a);
        for (const b of [...above[a], ...below[a]]) {
          if (inList.has(b) && !seen.has(b)) {
            seen.add(b);
            stack.push(b);
          }
        }
      }
      groups.push(group.sort(order));
    }
    return groups;
  };
  const pieces = [];
  const cut = (members) => {
    if (members.length < min) return;
    const last = stepOf[members.at(-1)];
    if (last >= lastFixed) return;
    const inPiece = new Set(members);
    let pressed = Infinity; // first step that presses something onto the piece before it is finished
    for (const a of members) {
      for (const q of above[a]) if (!inPiece.has(q) && stepOf[q] > stepOf[a] && stepOf[q] <= last) pressed = Math.min(pressed, stepOf[q]);
    }
    if (pressed === Infinity) {
      pieces.push({ members, last });
      return;
    }
    for (const part of [members.filter((id) => stepOf[id] < pressed), members.filter((id) => stepOf[id] >= pressed)]) {
      for (const group of touching(part)) cut(group);
    }
  };
  for (const c of clusters) cut(c.members);
  const chosen = pieces.sort((a, b) => b.members.length - a.members.length || a.last - b.last).slice(0, max);
  if (!chosen.length) return steps;
  chosen.sort((a, b) => order(a.members[0], b.members[0]));
  const pieceOf = new Int32Array(parts.length).fill(-1);
  chosen.forEach((c, k) => c.members.forEach((id) => (pieceOf[id] = k)));
  const after = new Map(); // old step index -> pieces whose block follows it, in build order
  for (const c of chosen) after.set(c.last, [...(after.get(c.last) ?? []), c]);

  const out = [];
  let sub = 0;
  steps.forEach((s, k) => {
    const ids = s.ids.filter((id) => pieceOf[id] < 0);
    if (ids.length) out.push({ ...s, ids });
    for (const c of after.get(k) ?? []) {
      // `cap` parts a step, spanning at most `rise` plates, as the main steps do.
      let chunk = [];
      const flush = () => {
        if (!chunk.length) return;
        const top = Math.max(...chunk.map((id) => parts[id].y));
        out.push({ ids: chunk, layer: top, ...(s.chapter !== undefined && { chapter: s.chapter }), sub });
        chunk = [];
      };
      for (const id of c.members) {
        if (chunk.length === cap || (chunk.length && Math.abs(parts[id].y - parts[chunk[0]].y) > rise)) flush();
        chunk.push(id);
      }
      flush();
      sub++;
    }
  });
  return out;
}
