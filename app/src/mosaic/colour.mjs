/**
 * Colour maths for the mosaic: sRGB ↔ linear light ↔ CIE Lab, Oklab, and the
 * colour distances.
 */

/** sRGB channel 0–255 → linear 0–1. */
export function toLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear RGB (0–1) → CIE Lab, D65. */
export function linToLab(R, G, B) {
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const RAD = Math.PI / 180;
const POW25_7 = 25 ** 7;

/**
 * CIEDE2000 colour difference (Sharma, Wu & Dalal 2005), kL = kC = kH = 1.
 * @param {ArrayLike<number>} lab1
 * @param {ArrayLike<number>} lab2
 */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cm7 / (Cm7 + POW25_7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : (Math.atan2(b1, a1p) / RAD + 360) % 360;
  const h2p = C2p === 0 ? 0 : (Math.atan2(b2, a2p) / RAD + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm /= 2;
    else hpm = hpm < 360 ? (hpm + 360) / 2 : (hpm - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * RAD) + 0.24 * Math.cos(2 * hpm * RAD)
    + 0.32 * Math.cos((3 * hpm + 6) * RAD) - 0.2 * Math.cos((4 * hpm - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Cpm7 = Cpm ** 7;
  const RC = 2 * Math.sqrt(Cpm7 / (Cpm7 + POW25_7));
  const Lm50 = (Lpm - 50) ** 2;
  const SL = 1 + (0.015 * Lm50) / Math.sqrt(20 + Lm50);
  const SC = 1 + 0.045 * Cpm;
  const SH = 1 + 0.015 * Cpm * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;
  const l = dLp / SL;
  const c = dCp / SC;
  const h = dHp / SH;
  return Math.sqrt(l * l + c * c + h * h + RT * c * h);
}

/** CIE Lab (D65) → linear sRGB (0–1, may fall outside the gamut). */
export function labToLin(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = inv(fx) * 0.95047;
  const Y = inv(fy);
  const Z = inv(fz) * 1.08883;
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
}

/** Linear sRGB → Oklab (Ottosson 2020), scaled ×100 so L runs 0–100 like Lab. */
export function linToOklab100(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    100 * (0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s),
    100 * (1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s),
    100 * (0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s),
  ];
}

const euclid = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/**
 * Distances for matching palette colours. Each metric maps a Lab colour to
 * its comparison space (`space`) and measures distance there (`d`).
 * `cie76` is the default Euclidean Lab distance; `ciede2000` applies the
 * CIEDE2000 formula; `oklab` uses Euclidean Oklab distance scaled by 100.
 */
export const METRICS = {
  ciede2000: { space: (lab) => lab, d: deltaE2000 },
  cie76: { space: (lab) => lab, d: euclid },
  oklab: { space: (lab) => linToOklab100(...labToLin(...lab)), d: euclid },
};
export const DEFAULT_METRIC = 'cie76';
