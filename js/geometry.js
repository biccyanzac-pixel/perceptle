// Shapes in stage units: the stage is a square, (0,0) top-left to (1,1) bottom-right, on every screen.
// Only deterministic maths here (dmath.js), because generators and scorers use it.
import { cos, sin, TAU } from './dmath.js';

/**
 * A smooth irregular blob: r(θ) = 1 + Σ a_k cos(kθ + φ_k), sampled at n points, then stretched, rotated,
 * scaled to `r` and moved to (cx, cy). `rough` is the largest relative bump (0 = circle). Star-shaped, so it never
 * self-intersects.
 */
export function blob(rng, { cx = 0.5, cy = 0.5, r = 0.3, n = 160, rough = 0.2, harmonics = 4, minK = 2, stretch = 1, rot = 0 } = {}) {
  const terms = [];
  let sum = 0;
  for (let k = minK; k < minK + harmonics; k++) {
    const a = rng.range(0.35, 1) / k;
    terms.push([k, a, rng.range(0, TAU)]);
    sum += a;
  }
  const f = sum > 0 ? rough / sum : 0;
  const cr = cos(rot), sr = sin(rot);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i * TAU) / n;
    let rr = 1;
    for (const [k, a, ph] of terms) rr += f * a * cos(k * t + ph);
    const x = rr * cos(t) * stretch, y = rr * sin(t) / stretch;
    pts.push([cx + r * (x * cr - y * sr), cy + r * (x * sr + y * cr)]);
  }
  return pts;
}

export function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export const area = (poly) => Math.abs(signedArea(poly));

/** Area centroid (centre of mass of a uniform sheet). */
export function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    const c = x1 * y2 - x2 * y1;
    a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Scale about a point, then move by (dx, dy). */
export function transform(poly, s, ox, oy, dx = 0, dy = 0) {
  return poly.map(([x, y]) => [ox + (x - ox) * s + dx, oy + (y - oy) * s + dy]);
}

/** The part of `poly` where nx*x + ny*y <= c (Sutherland-Hodgman; fine for non-convex polygons and one line). */
export function clipHalfPlane(poly, nx, ny, c) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const dp = nx * p[0] + ny * p[1] - c, dq = nx * q[0] + ny * q[1] - c;
    if (dp <= 0) out.push(p);
    if ((dp <= 0) !== (dq <= 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from point to segment. */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

export function segmentsIntersect(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Smallest angular distance (degrees) from `deg` to a multiple of `step`. */
export function offMultiple(deg, step) {
  const m = ((deg % step) + step) % step;
  return Math.min(m, step - m);
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
