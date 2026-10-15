/**
 * Earlier build steps appear lighter and less saturated while retaining
 * their hue. Fade in Oklab by moving lightness towards `L` and scaling
 * chroma; this module has no rendering dependency.
 */

/** Lightness the fade moves towards (OKLab L, 0–1). */
const TARGET_L = 0.93;
/** How far lightness moves towards TARGET_L, and how much chroma is removed. */
export const FADE = { light: 0.3, chroma: 0.35 };

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

/**
 * @param {number} hex sRGB colour, e.g. 0xfe8a18
 * @param {{ light: number, chroma: number }} [fade]
 * @returns {number} the faded sRGB colour
 */
export function fadedHex(hex, fade = FADE) {
  const [r, g, b] = [hex >> 16, (hex >> 8) & 255, hex & 255].map((c) => toLin(c / 255));
  // Linear sRGB -> OKLab (Björn Ottosson's matrices).
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  let L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  let A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  let B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  L += (TARGET_L - L) * fade.light;
  A *= 1 - fade.chroma;
  B *= 1 - fade.chroma;
  // OKLab -> linear sRGB.
  const l3 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m3 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s3 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const out = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ].map((c) => Math.round(toSrgb(c) * 255));
  return (out[0] << 16) | (out[1] << 8) | out[2];
}
