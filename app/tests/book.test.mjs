import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitCamera } from '../src/book/render.mjs';
import { layoutBook, stepsPerPage } from '../src/book/layout.mjs';
import { makePdf } from '../src/book/pdf.mjs';
import { layoutMosaicBook, rowName, textOn } from '../src/book/mosaic.mjs';
import { fit, fitImage, wrap } from '../src/book/draw.mjs';

test('layoutMosaicBook: cover, key, map, then one page per base with numbered cells', () => {
  // 32 x 32 cells in three colours: left half colour 0, right half colour 1, one cell colour 2.
  const width = 32;
  const cells = Uint8Array.from({ length: 32 * 32 }, (_, i) => (i % 32 < 16 ? 0 : 1));
  cells[0] = 2;
  const palette = [{ code: 15 }, { code: 0 }, { code: 4 }];
  const colours = [{ code: 0, count: 512 }, { code: 15, count: 511 }, { code: 4, count: 1 }];
  const book = layoutMosaicBook({ width, height: 32, cells, palette, colours }, { side: 16, cols: 2, rows: 2 });
  assert.deepEqual(book.pages.map((p) => p.type), ['cover', 'legend', 'map', 'base', 'base', 'base', 'base']);
  assert.deepEqual(book.pages.filter((p) => p.type === 'base').map((p) => p.name), ['A1', 'A2', 'B1', 'B2']);
  // Numbers follow `colours`: black (most used) is 1, white 2, red 3.
  assert.equal(book.numbers[0], 3);
  assert.equal(book.numbers[1], 2);
  assert.equal(book.numbers[16], 1);
  const [a1, a2] = book.pages.filter((p) => p.type === 'base');
  assert.deepEqual(a1.used, [{ number: 2, count: 255 }, { number: 3, count: 1 }]);
  assert.deepEqual(a2.used, [{ number: 1, count: 256 }]);
  // One base: no map page.
  const one = layoutMosaicBook({ width: 16, height: 16, cells: new Uint8Array(256), palette, colours: [{ code: 15, count: 256 }] }, { side: 16, cols: 1, rows: 1 });
  assert.deepEqual(one.pages.map((p) => p.type), ['cover', 'legend', 'base']);
});

test('layoutMosaicBook with 2.5D: a raise page before each base that has plates, plates in base coordinates', async () => {
  const { raisePlates } = await import('../src/mosaic/relief.mjs');
  const width = 32;
  const palette = [{ code: 15 }];
  const colours = [{ code: 15, count: 1024 }];
  const levels = new Uint8Array(32 * 32);
  // Base A2 (right top) raised two plates in its middle 8 x 8; base B1 one plate in a 2 x 3 corner.
  for (let y = 4; y < 12; y++) for (let x = 20; x < 28; x++) levels[y * width + x] = 2;
  for (let y = 16; y < 19; y++) for (let x = 0; x < 2; x++) levels[y * width + x] = 1;
  const relief = raisePlates(levels, 32, 32, 16);
  const book = layoutMosaicBook({ width, height: 32, cells: new Uint8Array(1024), palette, colours }, { side: 16, cols: 2, rows: 2 }, relief);
  assert.deepEqual(book.pages.map((p) => p.type), ['cover', 'legend', 'map', 'base', 'raise', 'base', 'raise', 'base', 'base']);
  const [a2, b1] = book.pages.filter((p) => p.type === 'raise');
  assert.deepEqual([a2.name, a2.layers, b1.name, b1.layers], ['A2', 2, 'B1', 1]);
  assert.ok(a2.plates.every((p) => p.x >= 4 && p.x + p.w <= 12 && p.y >= 4 && p.y + p.h <= 12), 'A2 plates in base coordinates');
  assert.equal(a2.plates.reduce((n, p) => n + p.w * p.h, 0), 2 * 64);
  assert.deepEqual(b1.sizes, [{ size: [2, 3], count: 1 }]);
  assert.equal(book.pages.at(-1).page, book.pages.length);
  // Without relief the book is as before.
  assert.equal(layoutMosaicBook({ width, height: 32, cells: new Uint8Array(1024), palette, colours }, { side: 16, cols: 2, rows: 2 }).pages.length, 7);
});

test('rowName and textOn', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(rowName), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  assert.equal(textOn('#ffffff'), '#1f1d1a');
  assert.equal(textOn('#f2cd37'), '#1f1d1a'); // bright yellow
  assert.equal(textOn('#05131d'), '#ffffff'); // black
  assert.equal(textOn('#0055bf'), '#ffffff'); // blue
});

test('makePdf: one A4 page per JPEG, each kept as JPEG (DCTDecode), with progress', async () => {
  // The smallest valid JPEG: 1 x 1 grey.
  const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const pages = [1, 2, 3].map(() => new Blob([jpg], { type: 'image/jpeg' }));
  const seen = [];
  const pdf = await makePdf(pages, { title: 'Fox', onProgress: (done, total) => seen.push(`${done}/${total}`) });
  assert.equal(pdf.type, 'application/pdf');
  const text = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
  assert.ok(text.startsWith('%PDF-'));
  assert.equal((text.match(/\/Type \/Page\b/g) ?? []).length, 3);
  assert.equal((text.match(/\/DCTDecode/g) ?? []).length, 3);
  assert.ok(/\/MediaBox \[0 0 595\.2\d+ 841\.8\d+\]/.test(text), 'A4 portrait');
  assert.deepEqual(seen, ['1/3', '2/3', '3/3']);
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(makePdf(pages, { signal: stop.signal }), { name: 'AbortError' });
});

test('fitCamera: every corner of the box is in view, and one is near the edge', () => {
  for (const [size, aspect] of [[[20, 6, 4], 4 / 3], [[10, 10, 10], 4 / 3], [[4, 12, 4], 0.7]]) {
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(...size));
    const camera = fitCamera(box, new THREE.Vector3(0.9, 0.9, 1.6).normalize(), aspect);
    let edge = 0;
    for (let k = 0; k < 8; k++) {
      const c = new THREE.Vector3(k & 1 ? size[0] : 0, k & 2 ? size[1] : 0, k & 4 ? size[2] : 0).project(camera);
      assert.ok(Math.abs(c.x) <= 1 && Math.abs(c.y) <= 1, `corner ${k} of ${size} out of view`);
      edge = Math.max(edge, Math.abs(c.x), Math.abs(c.y));
    }
    assert.ok(edge > 0.9, `${size}: the box should nearly fill the view (${edge.toFixed(2)})`);
  }
});

/** A fake model: `n` parts, plates of a few sizes and colours; and a plan of one part per step. */
function book(n, { chapterAt = [], sub = null } = {}) {
  const sizes = [[1, 1], [1, 2], [2, 2], [2, 4]];
  const parts = Array.from({ length: n }, (_, id) => {
    const [w, d] = sizes[id % sizes.length];
    return { id, x: 0, y: id, z: 0, w, d, h: 1, kind: 'plate', color: 1 + (id % 3) };
  });
  let chapter = 0;
  const steps = parts.map((p, i) => {
    if (chapterAt.includes(i)) chapter++;
    const s = { ids: [p.id], chapter };
    if (sub && i >= sub[0] && i <= sub[1]) Object.assign(s, { sub: 0, fromBelow: true });
    return s;
  });
  return { model: { result: { parts } }, plan: { steps } };
}

const stepPages = (pages) => pages.filter((p) => p.type === 'steps');

test('layoutBook: cover, inventory, then every step once and in order', () => {
  const { model, plan } = book(10);
  const { pages, perPage } = layoutBook(model, plan);
  assert.equal(perPage, 1);
  assert.deepEqual(pages.slice(0, 2).map((p) => p.type), ['cover', 'inventory']);
  assert.equal(pages[0].parts, 10);
  assert.equal(pages[0].colours, 3);
  assert.equal(pages.filter((p) => p.type === 'chapter').length, 0, 'one chapter: no opener');
  assert.deepEqual(stepPages(pages).flatMap((p) => p.steps.map((s) => s.index)), [...Array(10).keys()]);
  assert.deepEqual(pages.map((p) => p.page), pages.map((_, i) => i + 1));
  const first = stepPages(pages)[0].steps[0];
  assert.equal(first.number, 1);
  assert.deepEqual(first.needs, [{ key: '3024/1', ldraw: '3024', kind: 'plate', w: 1, d: 1, color: 1, count: 1 }]);
});

test('layoutBook: chapter openers before their steps, sub-assembly steps on pages of their own', () => {
  const { model, plan } = book(130, { chapterAt: [60], sub: [20, 26] });
  const { pages, perPage, chapters, subs } = layoutBook(model, plan);
  assert.equal(perPage, stepsPerPage(130));
  assert.equal(perPage, 3);
  assert.equal(chapters, 2);
  assert.equal(subs, 1);
  const openers = pages.filter((p) => p.type === 'chapter');
  assert.deepEqual(openers.map((p) => [p.chapter, p.first, p.last]), [[0, 0, 59], [1, 60, 129]]);
  for (const o of openers) {
    const next = pages[pages.indexOf(o) + 1];
    assert.equal(next.steps[0].index, o.first, 'an opener is followed by its first step');
  }
  const sp = stepPages(pages);
  assert.deepEqual(sp.flatMap((p) => p.steps.map((s) => s.index)), [...Array(130).keys()]);
  for (const p of sp) {
    assert.ok(p.steps.length <= perPage);
    assert.ok(p.steps.every((s) => (plan.steps[s.index].sub !== undefined) === (p.sub !== undefined)), 'no page mixes sub-assembly and main steps');
    assert.ok(p.steps.every((s) => s.chapter === p.steps[0].chapter), 'no page spans two chapters');
  }
  assert.deepEqual(sp.filter((p) => p.sub === 0).flatMap((p) => p.steps.map((s) => s.index)), [20, 21, 22, 23, 24, 25, 26]);
  // The step after the sub-assembly attaches it.
  assert.deepEqual(sp.flatMap((p) => p.steps).find((s) => s.index === 27).attach, [0]);
});

test('layoutBook: the inventory groups by colour and runs over pages, marking a colour that continues', () => {
  const { model, plan } = book(12);
  // 3 colours x 4 sizes over the 12 parts: 12 kinds of part, 4 per colour. Two per row and room
  // for a header and one row per page: each colour takes two pages, the second marked as continued.
  const { pages } = layoutBook(model, plan, { inventoryCols: 2, inventoryRows: 1.5 });
  const inv = pages.filter((p) => p.type === 'inventory');
  assert.equal(inv.length, 6);
  assert.deepEqual(inv.map((p) => [p.part, p.of]), [1, 2, 3, 4, 5, 6].map((i) => [i, 6]));
  assert.deepEqual(inv.map((p) => p.groups.map((g) => [g.items.length, g.continued])), [1, 2, 3, 4, 5, 6].map((i) => [[2, i % 2 === 0]]));
  const items = inv.flatMap((p) => p.groups.flatMap((g) => g.items));
  assert.equal(items.length, 12);
  assert.equal(items.reduce((n, it) => n + it.count, 0), 12);
  // The default grid: everything on one page.
  assert.equal(layoutBook(model, plan).pages.filter((p) => p.type === 'inventory').length, 1);
});

test('book drawing helpers: fit shortens with …, wrap breaks CJK per character and English per word, fitImage centres', () => {
  // A fake canvas: every character is 10 px wide; drawImage is recorded.
  const drawn = [];
  const ctx = { measureText: (t) => ({ width: [...t].length * 10 }), drawImage: (...a) => drawn.push(a.slice(1)) };
  assert.equal(fit(ctx, 'short', 100), 'short');
  assert.equal(fit(ctx, 'a long title', 60), 'a lon…');
  assert.deepEqual(wrap(ctx, 'one two three', 80), ['one two', 'three']);
  assert.deepEqual(wrap(ctx, '积木匠说明书', 30), ['积木匠', '说明书']);
  // A 200 x 100 picture in a 100 x 100 box: half size, centred vertically.
  assert.deepEqual(fitImage(ctx, { width: 200, height: 100 }, 0, 0, 100, 100), { x: 0, y: 25, w: 100, h: 50 });
  assert.deepEqual(drawn, [[0, 25, 100, 50]]);
  assert.equal(fitImage(ctx, { width: 0, height: 0 }, 0, 0, 100, 100), null);
  assert.equal(drawn.length, 1);
});
