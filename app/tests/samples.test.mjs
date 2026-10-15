import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SAMPLES, CATEGORIES, FEATURED, inCategory } from '../src/data/samples.mjs';
import { MOSAIC_SAMPLES } from '../src/data/mosaic-samples.mjs';

const locale = (id) => JSON.parse(readFileSync(new URL(`../src/i18n/${id}.json`, import.meta.url), 'utf8'));

test('every sample is in one library section, and every section has a name and samples', () => {
  const zh = locale('zh-CN');
  const en = locale('en');
  for (const [key, s] of Object.entries(SAMPLES)) {
    assert.ok(CATEGORIES.includes(s.category), `${key}: category ${s.category}`);
    assert.ok(existsSync(new URL(`../public/${s.thumb.slice(1)}`, import.meta.url)), `${key}: thumbnail`);
    assert.ok(existsSync(new URL(`../public/${s.url.slice(1)}`, import.meta.url)), `${key}: model file`);
  }
  for (const c of CATEGORIES) {
    assert.ok(zh[`category.${c}`] && en[`category.${c}`], `category.${c}`);
    assert.ok(inCategory(c).length > 0, `${c} is empty`);
  }
  assert.equal(CATEGORIES.flatMap(inCategory).length, Object.keys(SAMPLES).length);
});

test('featured samples exist and are not duplicated', () => {
  assert.ok(FEATURED.length > 0);
  assert.equal(new Set(FEATURED).size, FEATURED.length);
  for (const key of FEATURED) assert.ok(SAMPLES[key], key);
});

test('every mosaic example has its photo file and a name in both languages', () => {
  const zh = locale('zh-CN');
  const en = locale('en');
  assert.ok(Object.keys(MOSAIC_SAMPLES).length >= 1);
  for (const [key, s] of Object.entries(MOSAIC_SAMPLES)) {
    for (const file of [s.url, s.preview, s.thumb]) assert.ok(existsSync(new URL(`../public/${file.slice(1)}`, import.meta.url)), `${key}: ${file}`);
    assert.ok(zh[`mosaicSample.${key}.label`] && en[`mosaicSample.${key}.label`], `${key}: name`);
  }
});
