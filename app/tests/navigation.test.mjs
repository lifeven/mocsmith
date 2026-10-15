import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePath, legacyPath } from '../src/ui/navigation.mjs';

test('clean links and existing bookmarked hash links identify the same pages', () => {
  for (const [old, path, parsed] of [
    ['#/', '/', { page: 'start' }],
    ['#/s/fox', '/models/fox/', { page: 'sample', key: 'fox' }],
    ['#/mosaic/labrador', '/mosaic/labrador/', { page: 'mosaicSample', key: 'labrador' }],
    ['#/mine', '/model/', { page: 'model' }],
    ['#/about', '/about/', { page: 'about' }],
  ]) {
    assert.equal(legacyPath(old), path);
    assert.deepEqual(parsePath(path), parsed);
    if (path !== '/') assert.deepEqual(parsePath(path.slice(0, -1)), parsed);
  }
});

test('unrelated URLs and file paths are not captured by the application router', () => {
  for (const path of ['/unknown/', '/assets/app.js', '/models/fox/extra/', '/mosaic/../']) assert.equal(parsePath(path), null);
  for (const hash of ['#section', '#/s/fox/extra', '#/unknown']) assert.equal(legacyPath(hash), null);
});
