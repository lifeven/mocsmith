import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOCALES, SOURCE_LOCALE, pickLocale, setLocale, t } from '../src/i18n/index.mjs';
import { OPTIONAL_PARTS } from '../src/convert/config.mjs';

const source = LOCALES.find((l) => l.id === SOURCE_LOCALE).messages;
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
/** "result.count#one" → "result.count": plural forms are optional extras of a base key. */
const baseKey = (key) => key.split('#')[0];
const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

test('every language has every key, with known placeholders and no empty text', () => {
  for (const { id, messages } of LOCALES) {
    const keys = Object.keys(messages);
    assert.deepEqual(keys.filter((k) => !k.includes('#')).sort(), Object.keys(source).filter((k) => !k.includes('#')).sort(), `${id}: keys differ from ${SOURCE_LOCALE}`);
    for (const [key, text] of Object.entries(messages)) {
      assert.ok(text.trim(), `${id}: ${key} is empty`);
      const base = source[baseKey(key)];
      assert.ok(base !== undefined, `${id}: ${key} has no base key`);
      if (key.includes('#')) {
        assert.ok(PLURAL_CATEGORIES.includes(key.split('#')[1]), `${id}: ${key} is not a plural category`);
        assert.ok(placeholders(base).includes('n'), `${id}: ${key} is a plural of a text without {n}`);
      }
      // A translation may leave a placeholder out, but must not invent one.
      for (const name of placeholders(text)) assert.ok(placeholders(base).includes(name), `${id}: ${key} has unknown {${name}}`);
    }
  }
});

test('every key named in index.html and the page templates exists', () => {
  const files = ['../index.html', '../src/ui/start/start.html', '../src/ui/result/result.html', '../src/ui/mosaic/mosaic.html', '../src/ui/about/about.html'];
  const html = files.map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const keys = [...html.matchAll(/data-i18n(?:-aria|-content|-alt)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 40);
  for (const key of keys) assert.ok(key in source, `a template names missing key ${key}`);
});

test('「用哪些零件」 has one checkbox and one label per optional kind of part', () => {
  const html = readFileSync(new URL('../src/ui/result/result.html', import.meta.url), 'utf8');
  const boxes = [...html.matchAll(/data-part="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(boxes, OPTIONAL_PARTS);
  for (const key of OPTIONAL_PARTS) assert.ok(`result.tune.part.${key}` in source, `label for ${key}`);
});

test('t returns the current language text and falls back to the key', () => {
  assert.equal(t('result.parts'), source['result.parts']);
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('plural forms follow the count', () => {
  setLocale('en', { remember: false });
  try {
    assert.equal(t('result.count', { n: 1 }), '1 part');
    assert.equal(t('result.count', { n: 0 }), '0 parts');
    assert.equal(t('result.count', { n: 12 }), '12 parts');
  } finally {
    setLocale(SOURCE_LOCALE, { remember: false });
  }
  assert.equal(t('result.count', { n: 1 }), '1 块');
});

test('starting language: stored choice, then browser languages, then English', () => {
  assert.equal(pickLocale('en', ['zh-CN']), 'en');
  assert.equal(pickLocale('fr', ['zh-TW']), 'zh-CN'); // stored choice no longer offered
  assert.equal(pickLocale(null, ['en-GB', 'zh-CN']), 'en');
  assert.equal(pickLocale(null, ['ja', 'zh-HK']), 'zh-CN');
  assert.equal(pickLocale(null, ['ja']), 'en');
  assert.equal(pickLocale(null, []), 'en');
});
