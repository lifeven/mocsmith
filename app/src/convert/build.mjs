import { meshBounds, voxelizeColoured } from './voxelize.mjs';
import { PALETTE, nearestCell, nearestCellOf } from '../core/palette.mjs';
import { applyPaint } from '../core/paint.mjs';
import { layout } from './layout.mjs';
import { check } from '../core/check.mjs';
import { repair } from './repair.mjs';
import { weld } from './weld.mjs';
import { applySlopes } from './slopes.mjs';
import { applyTiles } from './tiles.mjs';
import { applyRound } from './round.mjs';
import { withDefaults } from './config.mjs';
import { delight } from './delight.mjs';
import { limitColours, recolourToStock } from './colours.mjs';
import { thicken } from './thicken.mjs';
import { withStock, ldrawId } from '../core/catalog.mjs';
import { shortfall } from '../core/stock.mjs';

/**
 * @typedef {object} BuildSettings
 * @property {number} lengthStuds longest horizontal extent
 * @property {boolean} repair join parts detached from the main body
 * @property {{ tiles: boolean, slopes: boolean, inverted: boolean }} parts which optional kinds of part to use (`OPTIONAL_PARTS`); bricks and plates always
 * @property {boolean} slopeTolerance also on two-plate ledges
 * @property {boolean} delight take baked light and shadow out of the colours first
 * @property {number | null} maxColours colour cap (`colours.mjs`); null = no cap
 * @property {boolean} thicken grow 1-stud-wide details to 2 studs (`thicken.mjs`)
 * @property {'layer' | 'column' | 'post'} [thickenRule] which thin cells count (default 'post')
 * @property {import('../core/stock.mjs').Stock | null} stock only use these parts (core/stock.mjs); null = any part LEGO made
 * @property {'colours' | 'strict'} [stockMode] with a stock: only the colours follow it (default), or also every part
 * @property {import('../core/paint.mjs').Paint} [paint] recolours, applied to the voxels before layout
 */

/**
 * @typedef {object} BuiltModel
 * @property {import('../core/grid.mjs').VoxelGrid} grid
 * @property {{ parts: import('./layout.mjs').PlacedPart[], owner: Int32Array, recolouredCells?: number }} result
 * @property {ReturnType<typeof check>} before checks straight after layout
 * @property {ReturnType<typeof check>} stats checks on the final model
 * @property {{ slopes: number, inverted: number, tiles: number, round: number, welds: number, droppedCells: number, filled: number, thickened?: number }} counts parts placed, or cells dropped or filled (repair) or added (thicken, only when on), by the later stages
 * @property {BuildSettings} settings the settings this model was built with
 * @property {number[]} sourceCodes LDraw codes present in the voxelized source after the colour cap, before paint
 * @property {[number, number][]} merged colours the cap merged, [fromCode, toCode]
 * @property {{ recoloured: [number, number, number][], have: number, buy: number, toBuy: [string, number, number][] }} [stocked]
 *   only with a stock: colours moved to ones the stock has, and what the parts take from it / leave to buy (core/stock.mjs shortfall)
 * @property {{ changed: number, cellsDropped: boolean }} painted what the paint did (paint.mjs)
 * @property {{ min: number[], scale: number }} placement source mesh → world (studs): (p − min) × scale
 * @property {{ voxelize: number, layout: number, check: number, repair: number, weld: number, slopes: number, inverted: number, tiles: number, round: number, total: number }} ms
 */

/**
 * What the stages hand on to each other. Each stage reads what earlier ones
 * left here and adds or replaces its own fields; `result` is the part list
 * being worked on (`{ parts, owner }` plus whatever the stages report).
 *
 * @typedef {{ mesh: object, grid?: object, sourceCodes?: number[], painted?: object, laid?: object, before?: object,
 *   result?: object, stats?: object, counts: BuiltModel['counts'] }} BuildContext
 */

/**
 * @typedef {object} BuildStage
 * @property {string} name
 * @property {keyof BuiltModel['ms']} timer where its time is counted
 * @property {(settings: BuildSettings) => boolean} [enabled] skipped when this says false
 * @property {(ctx: BuildContext, settings: BuildSettings) => void} run
 */

/**
 * The instant layer, in order. To try another algorithm for one stage, pass
 * a copy of this table with that entry replaced (`withStage`); nothing else
 * changes. Each stage only reads the context fields named in its comment.
 *
 * @type {BuildStage[]}
 */
export const STAGES = [
  {
    // mesh → coloured voxel grid. Delighting needs the mesh data (UVs, materials); a mesh without it is used as it is.
    name: 'voxelize',
    timer: 'voxelize',
    run(ctx, s) {
      const source = s.delight && ctx.mesh.data ? delight(ctx.mesh) : ctx.mesh;
      ctx.grid = voxelizeColoured(source, s.lengthStuds, s.paletteSize ? nearestCellOf(s.paletteSize) : nearestCell, { step: s.shadeStep, ...(s.shadeSpan && { span: s.shadeSpan }) });
      ctx.sourceCodes = coloursIn(ctx.grid);
    },
  },
  {
    // Only the parts I have: cells in a colour the stock has no part in move to the nearest colour it has.
    name: 'stock',
    timer: 'voxelize',
    enabled: (s) => Boolean(s.stock),
    run(ctx, s) {
      ctx.stockRecolour = recolourToStock(ctx.grid, s.stock);
      if (ctx.stockRecolour.length) ctx.sourceCodes = coloursIn(ctx.grid);
    },
  },
  {
    // The colour cap: merge the cheapest colours into their nearest until at most maxColours are left.
    // Before paint, so a colour the visitor picks is never merged away; the colours the page offers to
    // recolour are the ones left.
    name: 'colours',
    timer: 'voxelize',
    enabled: (s) => s.maxColours != null,
    run(ctx, s) {
      ctx.colourMerge = limitColours(ctx.grid, s.maxColours);
      if (ctx.colourMerge.merged.length) ctx.sourceCodes = coloursIn(ctx.grid);
    },
  },
  {
    // The visitor's recolours, on the voxels before anything is laid out.
    name: 'paint',
    timer: 'voxelize',
    run(ctx, s) {
      ctx.painted = applyPaint(ctx.grid, s.paint, s.lengthStuds);
    },
  },
  {
    // Thin details grown to 2 studs (after paint, so new cells take the visitor's colours). Changes the shape; off by default.
    name: 'thicken',
    timer: 'voxelize',
    enabled: (s) => s.thicken,
    run(ctx, s) {
      ctx.counts.thickened = thicken(ctx.grid, { rule: s.thickenRule }).added;
    },
  },
  {
    // grid → bricks and plates.
    name: 'layout',
    timer: 'layout',
    run(ctx, s) {
      ctx.laid = layout(ctx.grid, s.stock && s.stockMode !== 'strict' ? { ...s.layout, stock: s.stock, ...(s.ownBonus != null && { ownBonus: s.ownBonus }) } : s.layout);
      ctx.result = { ...ctx.laid };
    },
  },
  {
    // The checks straight after layout, to show what repair changed.
    name: 'check-laid',
    timer: 'check',
    run(ctx) {
      ctx.before = check(ctx.grid, ctx.laid);
    },
  },
  {
    // Re-tile parts that are not joined to the main body.
    name: 'repair',
    timer: 'repair',
    enabled: (s) => s.repair,
    run(ctx) {
      ctx.result = repair(ctx.grid, ctx.laid);
      ctx.counts.filled = ctx.result.filledCells ?? 0;
    },
  },
  {
    // After repair: seam plates where only a side touches, loose crumbs dropped.
    name: 'weld',
    timer: 'weld',
    enabled: (s) => s.repair,
    run(ctx) {
      const welded = weld(ctx.grid, ctx.result);
      ctx.result = { ...ctx.result, ...welded };
      ctx.counts.welds = welded.welds ?? 0;
      ctx.counts.droppedCells = welded.droppedCells ?? 0;
    },
  },
  {
    // Shape-preserving slopes on stepped surfaces.
    name: 'slopes',
    timer: 'slopes',
    enabled: (s) => s.parts.slopes,
    run(ctx, s) {
      ctx.counts.slopes = applySlopes(ctx.grid, ctx.result, { tolerance: s.slopeTolerance });
    },
  },
  {
    // The same rule upside down: inverted slopes under overhangs.
    name: 'inverted',
    timer: 'inverted',
    enabled: (s) => s.parts.inverted,
    run(ctx, s) {
      ctx.counts.inverted = applySlopes(ctx.grid, ctx.result, { tolerance: s.slopeTolerance, inverted: true });
    },
  },
  {
    // Tiles on exposed tops.
    name: 'tiles',
    timer: 'tiles',
    enabled: (s) => s.parts.tiles,
    run(ctx) {
      ctx.counts.tiles = applyTiles(ctx.grid, ctx.result);
    },
  },
  {
    // Lone 1×1 / 2×2 posts and dots become round parts; cells and connections stay.
    name: 'round',
    timer: 'round',
    enabled: (s) => s.parts.round,
    run(ctx) {
      ctx.counts.round = applyRound(ctx.grid, ctx.result);
    },
  },
  {
    // The checks on the final model.
    name: 'check',
    timer: 'check',
    run(ctx) {
      ctx.stats = check(ctx.grid, ctx.result);
    },
  },
];

/**
 * A copy of a stage table with one stage's `run` replaced, e.g. to compare
 * another layout: `buildModel(mesh, settings, withStage(STAGES, 'layout', run))`.
 *
 * @param {BuildStage[]} stages
 * @param {string} name
 * @param {BuildStage['run']} run
 */
export function withStage(stages, name, run) {
  if (!stages.some((st) => st.name === name)) throw new Error(`no stage ${name}`);
  return stages.map((st) => (st.name === name ? { ...st, run } : st));
}

/**
 * The whole instant layer for one coloured mesh: the stages in order, each
 * timed. Deterministic for the same mesh and settings, so a project stores
 * settings and recolours, never bricks.
 *
 * @param {import('./voxelize.mjs').ColouredMesh} mesh
 * @param {Partial<BuildSettings>} [settings]
 * @param {BuildStage[]} [stages]
 * @returns {BuiltModel}
 */
export function buildModel(mesh, settings = {}, stages = STAGES) {
  const s = withDefaults(settings);
  const ms = { voxelize: 0, layout: 0, check: 0, repair: 0, weld: 0, slopes: 0, inverted: 0, tiles: 0, round: 0, total: 0 };
  /** @type {BuildContext} */
  const ctx = { mesh, counts: { slopes: 0, inverted: 0, tiles: 0, round: 0, welds: 0, droppedCells: 0, filled: 0 } };
  const t0 = performance.now();
  // With a stock and stockMode 'strict' , every stage only sees parts the stock has
  // (core/catalog.mjs withStock); by default only the colours follow the stock (the 'stock' stage).
  withStock(s.stockMode === 'strict' ? s.stock : null, () => {
    for (const stage of stages) {
      if (stage.enabled && !stage.enabled(s)) continue;
      const t = performance.now();
      stage.run(ctx, s);
      ms[stage.timer] += performance.now() - t;
    }
  });
  ms.total = performance.now() - t0;
  return {
    grid: ctx.grid,
    result: ctx.result,
    before: ctx.before,
    stats: ctx.stats,
    counts: ctx.counts,
    settings: s,
    sourceCodes: ctx.sourceCodes,
    merged: ctx.colourMerge?.merged ?? [],
    painted: ctx.painted,
    // With a stock: cells moved to colours the stock has, and what the parts take from it / leave to buy.
    ...(s.stock && {
      stocked: {
        recoloured: ctx.stockRecolour,
        ...shortfall(s.stock, ctx.result.parts.map((p) => ({ ldraw: ldrawId(p), code: PALETTE[p.color - 1].code }))),
      },
    }),
    placement: placementOf(mesh, s.lengthStuds),
    ms,
  };
}

/**
 * Where the source mesh sits relative to the bricks, for drawing both in the
 * same place: world (studs) = (p − min) × scale, as in voxelizeColoured.
 */
function placementOf(mesh, lengthStuds) {
  const { min, max } = meshBounds([mesh]);
  return { min, scale: lengthStuds / Math.max(max[0] - min[0], max[2] - min[2]) };
}

/** LDraw codes of the colours present in a grid, in palette order. */
function coloursIn(grid) {
  const seen = new Uint8Array(PALETTE.length + 1);
  for (const v of grid.cells) seen[v] = 1;
  return PALETTE.filter((_, i) => seen[i + 1]).map((c) => c.code);
}
