import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Layer boundaries: each directory under src/ may only
 * import from the layers listed here. Imports inside comments (JSDoc types)
 * are ignored; `three` and its addons count as the layer 'three'.
 */
const ALLOWED = {
  data: [],
  i18n: [],
  core: ['data'],
  convert: ['core', 'data'],
  steps: ['core'],
  mosaic: ['data'],
  io: ['core', 'steps', 'mosaic', 'i18n', 'three'],
  render: ['core', 'three'],
  runtime: ['convert', 'core', 'mosaic', 'package:onnxruntime-web/wasm', 'package:onnxruntime-web/ort-wasm-simd-threaded.wasm?url'],
  services: ['data'],
  session: ['core', 'convert', 'steps'],
  book: ['core', 'steps', 'render', 'i18n', 'three', 'package:jspdf'],
  ui: ['data', 'i18n', 'core', 'convert', 'steps', 'mosaic', 'io', 'render', 'services', 'session', 'book', 'three'],
  dev: '*',
  main: '*',
};

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.mjs') ? [p] : [];
  });
}

const layerOf = (path) => {
  const rel = relative(src, path).split(sep);
  return rel.length === 1 ? (rel[0] === 'main.mjs' ? 'main' : `root:${rel[0]}`) : rel[0];
};

/** Real imports only: block comments and whole-line comments stripped first. */
function importsOf(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/\bfrom\s*'([^']+)'|\bimport\(\s*'([^']+)'\s*\)|\bimport\s+'([^']+)'/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

test('every source file sits in a known layer', () => {
  const unknown = files(src).map(layerOf).filter((l) => !(l in ALLOWED));
  assert.deepEqual([...new Set(unknown)], []);
});

test('layers only import from the layers below them', () => {
  const bad = [];
  for (const file of files(src)) {
    const from = layerOf(file);
    const allowed = ALLOWED[from];
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      let to;
      if (spec === 'three' || spec.startsWith('three/')) to = 'three';
      else if (spec.startsWith('.')) to = layerOf(resolve(dirname(file), spec));
      else to = `package:${spec}`;
      if (to === from || allowed === '*') continue;
      if (!allowed.includes(to)) bad.push(`${relative(src, file)} → ${spec} (${from} → ${to})`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the boundary check sees imports and ignores comments', () => {
  const text = "import { a } from './a.mjs';\n/** @type {import('../b.mjs').B} */\n// import { c } from './c.mjs';\nconst m = await import('./d.mjs');\nimport './e.mjs';";
  assert.deepEqual(importsOf(text), ['./a.mjs', './d.mjs', './e.mjs']);
});
