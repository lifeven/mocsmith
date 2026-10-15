import { partType } from '../core/parts.mjs';
import { attachedAt } from '../steps/player.mjs';
import { stepNeeds } from '../steps/plan.mjs';

/**
 * The pages of an instruction book , as plain
 * data: what goes on each page, not how it looks. A page is one of
 *
 * - `cover`: the counts for the front page (the picture is the finished model);
 * - `inventory`: part pictures and counts, grouped by colour, in rows of `INVENTORY.cols`, over as many pages as needed;
 * - `chapter`: an opener before the first step of each chapter (only when there are two or more);
 * - `steps`: one to four steps, each with its number, the parts it needs and its notes;
 *   a page of sub-assembly steps carries `sub` and holds that sub-assembly's steps only.
 *
 * Steps come in plan order and each step is on exactly one page. Pages of
 * steps break at chapters and wherever a sub-assembly starts or ends, so a
 * sub-assembly is one framed box on its pages.
 */

/** The inventory grid: part pictures per row, and rows per page (a colour's header counts half a row). */
export const INVENTORY = { cols: 6, rows: 7.5 };

/** One picture per part type and colour. */
export const iconKey = (part) => `${partType(part).ldraw}/${part.color}`;

/**
 * How many steps share a page: one for a short book, up to four for a long one,
 * so that a 300-step model is not 300 pages.
 * @param {number} steps
 */
export function stepsPerPage(steps) {
  if (steps <= 40) return 1;
  if (steps <= 120) return 2;
  if (steps <= 250) return 3;
  return 4;
}

/**
 * @param {{ result: { parts: object[] } }} model
 * @param {{ steps: { ids: number[], chapter?: number, sub?: number, fromBelow?: boolean }[] }} plan
 * @param {{ perPage?: number, inventoryCols?: number, inventoryRows?: number }} [opts]
 */
export function layoutBook(model, plan, { perPage, inventoryCols = INVENTORY.cols, inventoryRows = INVENTORY.rows } = {}) {
  const { parts } = model.result;
  const { steps } = plan;
  const per = perPage ?? stepsPerPage(steps.length);
  const chapters = (steps.at(-1)?.chapter ?? 0) + 1;
  const subs = steps.reduce((m, s) => Math.max(m, s.sub ?? -1), -1) + 1;
  const colours = new Set(parts.map((p) => p.color));
  const pages = [{ type: 'cover', parts: parts.length, colours: colours.size, steps: steps.length, chapters, subs }];

  // Inventory: by colour (most parts first), then by count.
  const byColour = new Map();
  for (const p of parts) {
    const key = iconKey(p);
    const group = byColour.get(p.color) ?? new Map();
    const item = group.get(key) ?? { key, ...partFields(p), count: 0 };
    item.count++;
    group.set(key, item);
    byColour.set(p.color, group);
  }
  const groups = [...byColour.entries()]
    .map(([color, items]) => ({ color, items: [...items.values()].sort((a, b) => b.count - a.count || b.w * b.d - a.w * a.d) }))
    .sort((a, b) => total(b.items) - total(a.items) || a.color - b.color);
  let page = null;
  let used = 0;
  for (const g of groups) {
    for (let i = 0; i < g.items.length; ) {
      // A colour's header costs half a row; start a new page when not even one row would fit under it.
      if (!page || inventoryRows - used - 0.5 < 1) {
        page = { type: 'inventory', groups: [] };
        pages.push(page);
        used = 0;
      }
      const rows = Math.floor(inventoryRows - used - 0.5);
      const take = g.items.slice(i, i + rows * inventoryCols);
      page.groups.push({ color: g.color, items: take, continued: i > 0 });
      used += 0.5 + Math.ceil(take.length / inventoryCols);
      i += take.length;
    }
  }
  const inventoryPages = pages.length - 1;
  pages.forEach((p, i) => p.type === 'inventory' && Object.assign(p, { part: i, of: inventoryPages }));

  // Steps.
  let current = null;
  steps.forEach((step, index) => {
    const chapter = step.chapter ?? 0;
    const sub = step.sub;
    if (chapters > 1 && (index === 0 || chapter !== (steps[index - 1].chapter ?? 0))) {
      const last = lastIndex(steps, (s) => (s.chapter ?? 0) === chapter);
      pages.push({ type: 'chapter', chapter, chapters, first: index, last });
      current = null;
    }
    if (!current || current.steps.length === per || current.sub !== sub) {
      current = { type: 'steps', steps: [], ...(sub !== undefined && { sub, subs }) };
      pages.push(current);
    }
    current.steps.push({
      index,
      number: index + 1,
      needs: stepNeeds(parts, step.ids).map((g) => ({ key: iconKey(parts[g.ids[0]]), ...partFields(parts[g.ids[0]]), count: g.count })),
      fromBelow: Boolean(step.fromBelow),
      attach: attachedAt(steps, index),
      chapter,
    });
  });
  pages.forEach((p, i) => (p.page = i + 1));
  return { pages, chapters, subs, perPage: per };
}

function partFields(p) {
  const type = partType(p);
  return { ldraw: type.ldraw, kind: p.kind, w: Math.min(p.w, p.d), d: Math.max(p.w, p.d), color: p.color };
}

const total = (items) => items.reduce((n, it) => n + it.count, 0);

function lastIndex(list, test) {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return i;
  return -1;
}
