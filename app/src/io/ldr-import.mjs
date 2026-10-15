/**
 * Read an LDraw `.ldr` / `.mpd` model back into the instant layer's part
 * format, so a model exported here (or one built by hand in Studio with the
 * same parts) can be viewed, stepped through, checked and exported again.
 *
 * Only what the instant layer can represent is read: upright parts of the
 * part table (`parts.mjs`), in palette colours, on the stud / plate grid.
 * Everything else is skipped and counted by reason, so the page can say what
 * was left out. Inverse of `placement()` in ldr.mjs; same axes:
 * grid (x, y, z) = (X / 20, −Y / 8, −Z / 20).
 */

import { PALETTE } from '../core/palette.mjs';
import { slopeCells, typeById } from '../core/parts.mjs';
import { rebuildWithCells } from '../core/model.mjs';
import { VoxelGrid } from '../core/grid.mjs';
import { check } from '../core/check.mjs';

const PALETTE_VALUE = new Map(PALETTE.map((c, i) => [c.code, i + 1]));

/** Reasons a line was not read; the words shown for each are `skip.<reason>` in the locale files. */
export const SKIP_REASONS = ['part', 'colour', 'rotation', 'grid', 'overlap', 'submodel'];

/**
 * Parse LDraw text. For a multi-part `.mpd`, only the first (main) model is
 * read; references to its submodels are skipped.
 *
 * @returns {{ name: string, parts: object[], skipped: Record<string, number> }}
 */
export function parseLdr(text) {
  const skipped = {};
  const skip = (reason) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  const parts = [];
  let name = '';
  let files = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const t = line.split(/\s+/);
    if (t[0] === '0') {
      if (t[1] === 'FILE' && ++files > 1) break; // only the main model of an .mpd
      if (!name && t.length > 1 && t[1] !== 'FILE' && !t[1].endsWith(':') && !t[1].startsWith('!') && t[1] !== 'STEP') {
        name = line.slice(2).trim();
      }
      continue;
    }
    if (t[0] !== '1' || t.length < 15) continue;
    const file = t.slice(14).join(' ').toLowerCase().replace(/\\/g, '/');
    if (file.endsWith('.ldr') || file.endsWith('.mpd')) {
      skip('submodel');
      continue;
    }
    const id = file.replace(/\.dat$/, '');
    const color = PALETTE_VALUE.get(Number(t[1]));
    const n = t.slice(2, 14).map(Number);
    const part = toPart(id, n.slice(0, 3), n.slice(3));
    if (typeof part === 'string') skip(part);
    else if (!color) skip('colour');
    else parts.push({ ...part, color });
  }
  return { name, parts, skipped };
}

/** One type-1 line → a part in grid coordinates, or the reason it can't be read. */
function toPart(id, [X, Y, Z], r) {
  const near = (v, w) => Math.abs(v - w) < 1e-6;
  // Upright only: the part's own Y axis must stay world Y.
  if (!near(r[1], 0) || !near(r[4], 1) || !near(r[7], 0) || !near(r[3], 0) || !near(r[5], 0)) return 'rotation';
  const top = -Y / 8;
  // Records in the part table (`parts.mjs`); anything else is skipped.
  const type = typeById(id);
  if (!type) return 'part';
  if (type.round) {
    // A round part looks the same at any turn about Y, so any upright rotation is fine.
    const p = { kind: type.kind, ldraw: type.ldraw, x: X / 20 - type.w / 2, y: top - type.h, z: -Z / 20 - type.d / 2, w: type.w, d: type.d, h: type.h };
    return onGrid(p) ? p : 'grid';
  }
  if (!type.slope) {
    // Where the part's long axis (local X) points: world X (r[0]) or world Z (r[6]).
    const alongX = near(Math.abs(r[0]), 1);
    if (!alongX && !near(Math.abs(r[6]), 1)) return 'rotation';
    const w = alongX ? type.d : type.w;
    const d = alongX ? type.w : type.d;
    const p = { kind: type.kind, x: X / 20 - w / 2, y: top - type.h, z: -Z / 20 - d / 2, w, d, h: type.h };
    return onGrid(p) ? p : 'grid';
  }
  const { slope } = type;
  // Local +Z maps to (−dx, 0, dz) (ldr.mjs placement); must be a quarter turn.
  const dx = Math.round(-r[2]) || 0; // || 0: no -0 in `dir`
  const dz = Math.round(r[8]) || 0;
  if (Math.abs(dx) + Math.abs(dz) !== 1 || !near(-r[2], dx) || !near(r[8], dz)) return 'rotation';
  const length = slope.studs + slope.slope;
  const start = (dx || dz) > 0 ? 0 : slope.slope;
  const sx = X / 20;
  const sz = -Z / 20;
  const along = dx !== 0;
  const p = {
    kind: type.kind,
    slope: slope.key,
    ldraw: slope.ldraw,
    dir: [dx, dz],
    studs: slope.studs,
    x: along ? sx - start - slope.studs / 2 : sx - slope.width / 2,
    z: along ? sz - slope.width / 2 : sz - start - slope.studs / 2,
    w: along ? length : slope.width,
    d: along ? slope.width : length,
    y: top - 3,
    h: 3,
  };
  if (!onGrid(p)) return 'grid';
  return { ...p, cells: slopeCells(p) };
}

const onGrid = (p) => [p.x, p.y, p.z].every((v) => Math.abs(v - Math.round(v)) < 1e-6);

/**
 * Turn parsed parts into a model the result page can show: shifted so the
 * lowest part sits on the ground at the origin, on a grid just big enough,
 * with the usual checks. Overlapping parts (the later one) are skipped.
 *
 * @param {{ name: string, parts: object[], skipped: Record<string, number> }} parsed
 */
export function importedModel(parsed) {
  const { parts } = parsed;
  const skipped = { ...parsed.skipped };
  if (!parts.length) return { model: null, skipped };
  const min = (k) => Math.min(...parts.map((p) => Math.round(p[k])));
  const [ox, oy, oz] = [min('x'), min('y'), min('z')];
  const moved = parts.map((p) => {
    const q = { ...p, x: Math.round(p.x) - ox, y: Math.round(p.y) - oy, z: Math.round(p.z) - oz };
    if (q.cells) q.cells = p.cells.map(([x, y, z]) => [Math.round(x) - ox, Math.round(y) - oy, Math.round(z) - oz]);
    return q;
  });
  const size = (k, ext) => Math.max(...moved.map((p) => p[k] + p[ext]));
  const grid = new VoxelGrid(size('x', 'w'), size('y', 'h'), size('z', 'd'));
  const kept = [];
  for (const p of moved) {
    const cells = p.cells ?? boxCells(p);
    if (cells.some(([x, y, z]) => grid.get(x, y, z))) {
      skipped.overlap = (skipped.overlap ?? 0) + 1;
      continue;
    }
    for (const [x, y, z] of cells) grid.set(x, y, z, p.color);
    kept.push(p);
  }
  const result = rebuildWithCells(grid, kept);
  const stats = check(grid, result);
  const count = (kind) => result.parts.filter((p) => p.kind === kind).length;
  const sourceCodes = [...new Set(result.parts.map((p) => PALETTE[p.color - 1].code))];
  const zero = { voxelize: 0, layout: 0, check: 0, repair: 0, weld: 0, slopes: 0, inverted: 0, tiles: 0, round: 0, total: 0 };
  return {
    skipped,
    model: {
      grid,
      result,
      before: stats,
      stats,
      counts: { slopes: count('slope'), inverted: count('inverted'), tiles: count('tile') },
      settings: { lengthStuds: Math.max(grid.sx, grid.sz), imported: true },
      sourceCodes,
      painted: { changed: 0, cellsDropped: false },
      placement: null,
      ms: zero,
    },
  };
}

function boxCells(p) {
  const out = [];
  for (let dy = 0; dy < p.h; dy++) {
    for (let dz = 0; dz < p.d; dz++) for (let dx = 0; dx < p.w; dx++) out.push([p.x + dx, p.y + dy, p.z + dz]);
  }
  return out;
}
