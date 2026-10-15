import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelGrid } from '../src/core/grid.mjs';
import { layout } from '../src/convert/layout.mjs';
import { check } from '../src/core/check.mjs';
import { repair } from '../src/convert/repair.mjs';
import { importNote, partInfoHtml } from '../src/ui/result/texts.mjs';
import { detachedGroups, marksOf, MARK_COLOURS } from '../src/ui/marks.mjs';
import { clearestView, pickSide, pickView, stepFraming, stepViews, viewCamera } from '../src/render/camera.mjs';
import { attachedAt, stepDisplay } from '../src/steps/player.mjs';
import { FLAG_DETACHED, FLAG_HANGING } from '../src/core/check.mjs';
import { cm, sizeText, colourName, partInfo } from '../src/ui/words.mjs';
import { availability } from '../src/core/catalog.mjs';
import { setLocale } from '../src/i18n/index.mjs';
import { cellValue } from '../src/core/palette.mjs';
import { fillBox } from './helpers.mjs';

/** A tall, deep block with one loose plate on the ground beside it, in a laid-out model. */
function blockWithLoosePlate() {
  const grid = new VoxelGrid(10, 30, 12);
  fillBox(grid, [0, 0, 0], [4, 30, 12], 1);
  grid.set(8, 0, 6, 1);
  // Repair joins the block (layout alone stacks its seams straight up); the plate has no neighbour.
  const result = repair(grid, layout(grid));
  return { grid, result, stats: check(grid, result) };
}

test('detachedGroups: one loose part → one group with its box and ids', () => {
  const model = blockWithLoosePlate();
  const groups = detachedGroups(model);
  assert.equal(groups.length, 1);
  const [g] = groups;
  assert.equal(g.ids.size, model.stats.detachedParts);
  assert.ok(g.box.containsPoint(new THREE.Vector3(8.5, 0.2, 6.5)));
  assert.equal(g.topLayer, 0);
});

test('marksOf: not joined beats hanging beats recoloured, each only when shown', () => {
  const model = { stats: { flags: Uint8Array.from([FLAG_DETACHED | FLAG_HANGING, FLAG_HANGING, 0, 0]) } };
  const parts = [{ id: 0, recoloured: 1 }, { id: 1, recoloured: 1 }, { id: 2, recoloured: 1 }, { id: 3 }];
  const all = marksOf(model, { detached: true, hanging: true, recoloured: true });
  assert.deepEqual(parts.map(all), [MARK_COLOURS.detached, MARK_COLOURS.hanging, MARK_COLOURS.recoloured, 0]);
  const none = marksOf(model, { detached: false });
  assert.deepEqual(parts.map(none), [0, 0, 0, 0]);
});

test('stepDisplay: later steps hidden, earlier faded, this one outlined', () => {
  const d = stepDisplay({ stepOf: Int32Array.from([0, 1, 2]), index: 1 });
  assert.deepEqual([0, 1, 2].map(d.hidden), [false, false, true]);
  assert.deepEqual([0, 1, 2].map(d.faded), [true, false, false]);
  assert.deepEqual([0, 1, 2].map(d.outlined), [false, true, false]);
});

test('stepDisplay: a sub-assembly step shows only that sub-assembly; the next main step outlines it going on', () => {
  // Steps: 0 main [0], 1–2 sub 0 [1] [2], 3 main [3] (sub 0 goes on here), 4 main [4].
  const steps = [{ ids: [0] }, { ids: [1], sub: 0 }, { ids: [2], sub: 0 }, { ids: [3] }, { ids: [4] }];
  const stepOf = Int32Array.from([0, 1, 2, 3, 4]);
  const ids = [0, 1, 2, 3, 4];
  const at = (index) => {
    const d = stepDisplay({ stepOf, index, steps });
    return ids.map((id) => (d.hidden(id) ? '-' : d.outlined(id) ? 'N' : d.faded(id) ? 'f' : 'o')).join('');
  };
  assert.equal(at(1), '-N---');
  assert.equal(at(2), '-fN--');
  assert.equal(at(3), 'fNNN-');
  assert.equal(at(4), 'ooooN'); // the last step: the finished model in its real colours
  assert.deepEqual(attachedAt(steps, 3), [0]);
  assert.deepEqual(attachedAt(steps, 2), []);
  assert.deepEqual(attachedAt(steps, 4), []);
  // Two blocks back to back go on together.
  const two = [{ ids: [0] }, { ids: [1], sub: 0 }, { ids: [2], sub: 1 }, { ids: [3] }];
  assert.deepEqual(attachedAt(two, 3), [0, 1]);
});

test('clearestView: looks at the loose plate from its open side, not through the block', () => {
  const model = blockWithLoosePlate();
  const [g] = detachedGroups(model);
  // Preferring the blocked side (towards the tall block, -x) must still pick a view that clears it.
  const preferred = new THREE.Vector3(-1, 0.3, 0).normalize();
  const dir = clearestView(model, g, preferred);
  assert.ok(Math.abs(dir.length() - 1) < 1e-9);
  // The candidate nearest the preferred view (heading -x, 20° up) runs straight into the block.
  assert.ok(dir.dot(preferred) < 0.99, `view direction ${dir.toArray()} comes through the block`);
});

test('page words: centimetres, outer size, Chinese colour names', () => {
  assert.equal(cm(24), '约 19 厘米');
  const grid = new VoxelGrid(25, 30, 10);
  assert.equal(sizeText(grid), '约 20 × 8 × 10 厘米（长 × 宽 × 高）');
  // With parts, only the filled extent counts (an empty grid margin is ignored).
  const parts = [{ x: 1, y: 0, z: 0, w: 23, d: 10, h: 30 }];
  assert.equal(sizeText(grid, parts), '约 18 × 8 × 10 厘米（长 × 宽 × 高）');
  assert.equal(importNote({}), '从文件读入的模型按原样显示：不改大小、不重新铺砖，也不在这里改颜色。');
  assert.match(importNote({ part: 2, rotation: 1 }), /有 3 块没读进来：不认识的零件 2，侧放或倒放的零件 1。$/);
  assert.equal(colourName(cellValue(15)), '白');
});

test('part info card: number, name, size, colour, sets, link', () => {
  const tile = { kind: 'tile', x: 0, y: 0, z: 0, w: 2, d: 1, h: 1, color: cellValue(322) };
  const info = partInfo(tile);
  const { sets, lastYear } = availability('3069b', 322);
  assert.equal(info.id, '3069b');
  assert.equal(info.name, 'Tile 1 x 2 with Groove');
  assert.equal(info.size, '1 × 2 凸点，高 1 块薄板（约 0.8 × 1.6 × 0.3 厘米）');
  assert.equal(info.colour, '中天蓝 Medium Azure（LDraw 颜色 322）');
  assert.equal(info.made, `出现在 ${sets} 个官方套装里，最近一套是 ${lastYear} 年的`);
  assert.equal(info.url, 'https://rebrickable.com/parts/3069b/');

  const slope = { kind: 'slope', ldraw: '3039', dir: [1, 0], x: 0, y: 0, z: 0, w: 2, d: 2, h: 3, color: cellValue(4) };
  assert.equal(partInfo(slope).name, 'Brick Sloped 45° 2 x 2');
  assert.match(partInfo(slope).size, /^2 × 2 凸点，高 3 块薄板/);

  // Element id only (a 2x8 brick in Lime), and no record at all (an imported 1x8 brick in Medium Azure).
  const brick = (w, code) => ({ kind: 'brick', x: 0, y: 0, z: 0, w, d: 2, h: 3, color: cellValue(code) });
  assert.match(partInfo(brick(8, 27)).made, /^LEGO 给这个颜色编过元件号/);
  assert.equal(partInfo({ ...brick(8, 322), d: 1 }).made, '没找到 LEGO 出过这个颜色的记录');

  const html = partInfoHtml(tile);
  assert.match(html, /<a href="https:\/\/rebrickable.com\/parts\/3069b\/" target="_blank" rel="noopener">/);
  assert.equal((html.match(/<dt>/g) ?? []).length, 7);
  assert.match(html, /3069b（LDraw 和 Rebrickable 同号）/);

  // An inverted slope has a different Rebrickable number: the card shows both, the link uses Rebrickable's.
  const under = { kind: 'slope', ldraw: '3660b', dir: [1, 0], x: 0, y: 0, z: 0, w: 2, d: 2, h: 3, color: cellValue(4) };
  const info2 = partInfo(under);
  assert.deepEqual([info2.id, info2.rbId, info2.url], ['3660b', '3660', 'https://rebrickable.com/parts/3660/']);
  assert.match(partInfoHtml(under), /LDraw 3660b，Rebrickable 3660/);
  assert.doesNotMatch(partInfoHtml(under), /同号/);
});

test('words follow the language', () => {
  const grid = { sx: 25, sy: 30, sz: 10 };
  const tile = { kind: 'tile', x: 0, y: 0, z: 0, w: 2, d: 1, h: 1, color: cellValue(322) };
  setLocale('en', { remember: false });
  try {
    assert.equal(cm(24), 'about 19 cm');
    assert.equal(sizeText(grid), 'about 20 × 8 × 10 cm (L × W × H)');
    assert.equal(colourName(cellValue(322)), 'Medium Azure');
    assert.equal(partInfo(tile).colour, 'Medium Azure (LDraw colour 322)');
    assert.equal(importNote({ part: 2 }), 'A model read from a file is shown as it is: no resizing, no re-tiling, and no recolouring here. 2 parts were not read: unknown part 2.');
  } finally {
    setLocale('zh-CN', { remember: false });
  }
  assert.equal(cm(24), '约 19 厘米');
});

test('step views: front-right and its mirror, above or below the ground', () => {
  const up = stepViews();
  const down = stepViews(true);
  assert.ok(Math.abs(up.right.length() - 1) < 1e-9 && Math.abs(up.left.length() - 1) < 1e-9);
  assert.ok(up.right.x > 0 && up.left.x < 0 && up.right.z > 0);
  assert.ok(Math.abs(up.right.x + up.left.x) < 1e-9 && Math.abs(up.right.y - up.left.y) < 1e-9);
  assert.ok(up.right.y > 0 && down.right.y < 0 && Math.abs(up.right.y + down.right.y) < 1e-9);
});

test('pickSide: the side that shows the worst new part better, but no swing for a small gain', () => {
  const s = (l, r) => ({ left: { min: l, mean: l }, right: { min: r, mean: r } });
  assert.equal(pickSide(s(0.2, 0.6), null), 'right');
  assert.equal(pickSide(s(0.6, 0.2), null), 'left');
  assert.equal(pickSide({ left: { min: 0.5, mean: 0.9 }, right: { min: 0.5, mean: 0.7 } }, null), 'left');
  assert.equal(pickSide(s(0.6, 0.5), 'right'), 'right'); // 10 points better is not enough
  assert.equal(pickSide(s(0.7, 0.5), 'right'), 'left'); // 20 points is
  assert.equal(pickSide(s(0.05, 0), 'right'), 'left'); // a side that shows nothing gives way to one that shows some
});

test('step views: the back two mirror the front, the top one looks almost straight down (or up)', () => {
  const up = stepViews();
  const down = stepViews(true);
  assert.ok(Math.abs(up.backRight.z + up.right.z) < 1e-9 && Math.abs(up.backRight.x - up.right.x) < 1e-9);
  assert.ok(Math.abs(up.backLeft.x + up.backRight.x) < 1e-9);
  assert.ok(up.top.y > 0.95 && down.top.y < -0.95);
});

test('pickView: back or top only for a step the front side shows badly, and only when clearly better', () => {
  const v = (min) => ({ min, mean: min });
  const scores = (front, extra) => ({ right: v(front), left: v(0), backLeft: v(extra.bl ?? 0), backRight: v(extra.br ?? 0), top: v(extra.top ?? 0) });
  assert.equal(pickView(scores(0.5, { top: 1 }), 'right'), 'right'); // the front shows it well enough
  assert.equal(pickView(scores(0.2, { bl: 0.4 }), 'right'), 'right'); // 20 points is not enough
  assert.equal(pickView(scores(0.2, { bl: 0.4, top: 0.6 }), 'right'), 'top'); // 40 points is, and the best one wins
  assert.equal(pickView(scores(0, { br: 0.1 }), 'right'), 'backRight'); // anything beats not seeing it at all
  assert.equal(pickView({ right: v(0.1), left: v(0) }, 'right'), 'right'); // extra views not scored
});

test('stepFraming + viewCamera: the new parts sit in the middle of the view', () => {
  const part = (id, x, y, z, w = 2, d = 2, h = 1) => ({ id, x, y, z, w, d, h });
  const parts = [part(0, 0, 0, 0, 10, 10, 3), part(1, 8, 3, 8)];
  const { target, radius } = stepFraming(parts, [1], () => true);
  assert.deepEqual(target.toArray().map((v) => +v.toFixed(3)), [9, 1.4, 9]);
  assert.ok(radius >= 0.6 * 0.5 * Math.hypot(10, 1.6, 10) - 1e-9);
  const cam = viewCamera(target, stepViews().right, radius);
  const p = target.clone().project(cam);
  assert.ok(Math.abs(p.x) < 1e-6 && Math.abs(p.y) < 1e-6);
});
