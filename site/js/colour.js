// sRGB <-> OKLab (Björn Ottosson, 2020), with deterministic maths so every engine picks the same 8-bit colours.
import { cbrt, cos, pow, sin } from './dmath.js';

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4) - 0.055);

/** [r, g, b] 0-255 -> [L, a, b] */
export function rgbToOklab([R, G, B]) {
  const r = toLinear(R / 255), g = toLinear(G / 255), b = toLinear(B / 255);
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** [L, a, b] -> [r, g, b] 0-255 (rounded), or null if outside the sRGB gamut. */
export function oklabToRgb([L, A, B]) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  if (lin.some((c) => c < -0.0005 || c > 1.0005)) return null;
  return lin.map((c) => Math.round(Math.max(0, Math.min(1, toGamma(Math.max(0, c)))) * 255));
}

export const oklch = (L, C, hRad) => [L, C * cos(hRad), C * sin(hRad)];

export function deltaE(rgb1, rgb2) {
  const p = rgbToOklab(rgb1), q = rgbToOklab(rgb2);
  const dl = p[0] - q[0], da = p[1] - q[1], db = p[2] - q[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

export const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
