import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aboutHtml } from '../src/ui/about.mjs';

test('the About page credits every sample source and data source in both languages', () => {
  for (const locale of ['zh-CN', 'en']) {
    const html = aboutHtml(locale);
    for (const needle of ['LifeVen LLC', 'Khronos', 'PixelMannen', 'Cube Pets', 'Kenney', 'LDraw', 'Rebrickable', 'three.js', 'jsPDF', 'third-party-notices.txt', 'LEGO®', 'Vermeer', 'Hokusai', 'Dktue', 'Wikimedia Commons', 'Depth Anything V2', 'ONNX Runtime Web', 'Apache 2.0', 'CC BY 2.0 / CC BY 4.0', 'Hugging Face', 'AGPL-3.0', 'CC BY 4.0', 'Based on MOCsmith by LifeVen LLC', 'LICENSE', 'NOTICE', 'href="https://github.com/lifeven/mocsmith"']) {
      assert.ok(html.includes(needle), `${locale}: ${needle}`);
    }
    // Every link opens safely in a new tab.
    for (const [tag] of html.matchAll(/<a [^>]+>/g)) assert.match(tag, /rel="noopener noreferrer"/);
  }
  assert.notEqual(aboutHtml('zh-CN'), aboutHtml('en'));
});
