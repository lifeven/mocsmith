import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadedHex } from '../src/render/fade.mjs';

const rgb = (hex) => [hex >> 16, (hex >> 8) & 255, hex & 255];
/** Hue angle in degrees from a plain RGB -> HSL conversion; enough to tell orange from pink. */
function hue(hex) {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const lightness = (hex) => rgb(hex).reduce((s, c) => s + c, 0) / 3;

test('fadedHex: an earlier step stays the same colour family, only paler', () => {
  const orange = 0xfe8a18; // LEGO Orange, the fox
  const f = fadedHex(orange);
  assert.ok(Math.abs(hue(f) - hue(orange)) < 6, `orange stays orange (hue ${hue(orange).toFixed(0)} -> ${hue(f).toFixed(0)})`);
  assert.ok(lightness(f) > lightness(orange));
  // The old linear mix towards grey gave #e4bbad, hue about 15: pink-beige.
  assert.ok(hue(f) > 20);
  for (const c of [0x0055bf, 0x4b9f4a, 0xc91a09, 0x582a12]) {
    assert.ok(Math.abs(hue(fadedHex(c)) - hue(c)) < 8, `hue kept for #${c.toString(16)}`);
  }
});

test('fadedHex: white stays near white, black turns grey, nothing leaves the sRGB range', () => {
  assert.ok(lightness(fadedHex(0xffffff)) > 235);
  const black = fadedHex(0x1b2a34);
  assert.ok(lightness(black) > 60 && lightness(black) < 140);
  for (const c of [0x000000, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff]) {
    const f = fadedHex(c);
    assert.ok(f >= 0 && f <= 0xffffff);
  }
});
