// The stage: a square canvas drawn in stage units (0..1 on both axes), the same on every screen.
// Line widths and sizes are in stage units too, so a phone and a desktop see the same picture, only scaled.

// The theme colours, read once and cached. Reading them (getComputedStyle) on every animation frame was most of
// the cost of the reveal animations on a slow phone. The cache is dropped when the colour scheme changes and on
// resize; each new object means "colours changed", which also invalidates the offscreen layers below.
let themeCache = null;
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { themeCache = null; }); } catch { /* old browsers */ }

export function themeColours() {
  if (themeCache) return themeCache;
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return (themeCache = {
    bg: v('--stage'), ink: v('--ink'), muted: v('--muted'), accent: v('--accent'), good: v('--good'),
    bad: v('--bad'), fill: v('--fill'), shade: v('--shade'), faint: v('--faint'), empty: v('--empty'),
  });
}

export class Stage {
  constructor(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage-canvas';
    host.replaceChildren(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.S = 300;
    this.drawFn = null;
    this.handlers = new Set();
    this.c = themeColours();
    const pt = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.dragging = true;
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
      for (const h of this.handlers) h(...pt(e), 'down');
    });
    this.canvas.addEventListener('pointermove', (e) => { if (this.dragging) for (const h of this.handlers) h(...pt(e), 'move'); });
    const up = (e) => { if (this.dragging) { this.dragging = false; for (const h of this.handlers) h(...pt(e), 'up'); } };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  /** Size in CSS pixels. Redraws the current picture (resizing never changes what's shown, only its scale). */
  resize(S) {
    this.S = Math.max(120, Math.floor(S));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.style.width = this.canvas.style.height = `${this.S}px`;
    this.canvas.width = this.canvas.height = Math.round(this.S * dpr);
    themeCache = null; // a resize is rare: re-read the colours then, in case anything changed
    this.redraw();
  }

  /** Set what to draw; it's called again on resize. Stops any running animation. */
  draw(fn) { this.animId = (this.animId || 0) + 1; this.layers = null; this.drawFn = fn; this.redraw(); }

  /**
   * Animate for `ms`: fn(stage, t) with t eased 0..1 each frame, then it stays at t = 1 (and redraws on resize).
   * Resolves when done or when something else is drawn. Reduced-motion users jump straight to the end.
   */
  animate(ms, fn) {
    const id = (this.animId = (this.animId || 0) + 1);
    this.layers = null;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2);
    return new Promise((resolve) => {
      const step = () => {
        if (this.animId !== id) { resolve(false); return; }
        const raw = reduce ? 1 : Math.min(1, (performance.now() - t0) / ms);
        const t = ease(raw);
        this.drawFn = (s) => fn(s, t, raw);
        this.redraw();
        if (raw < 1) requestAnimationFrame(step); else resolve(true);
      };
      step();
    });
  }

  redraw() {
    const { ctx } = this;
    this.c = themeColours();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.c.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.S * this.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.drawFn) this.drawFn(this);
  }

  /**
   * Draw the static part of a picture once into an offscreen canvas and copy it in on every redraw, so an
   * animation only redraws what moves. Rebuilt when the size or the colours change; dropped by draw()/animate().
   * add(L), if given, runs on every call with the layer as the drawing target, to paint on what's new since the
   * last frame (keep its progress on L, which starts fresh whenever the layer is rebuilt).
   */
  layer(key, fn, add) {
    const w = this.canvas.width;
    let L = this.layers?.get(key);
    if (!L || L.w !== w || L.c !== this.c) {
      const cv = L?.cv || document.createElement('canvas');
      cv.width = cv.height = w;
      const main = this.ctx;
      const k = this.S * this.dpr;
      this.ctx = cv.getContext('2d');
      this.ctx.setTransform(k, 0, 0, k, 0, 0);
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      try { fn(this); } finally { this.ctx = main; }
      L = { cv, w, c: this.c };
      (this.layers ||= new Map()).set(key, L);
    }
    if (add) {
      const main = this.ctx;
      this.ctx = L.cv.getContext('2d');
      try { add(L); } finally { this.ctx = main; }
    }
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(L.cv, 0, 0);
    ctx.restore();
  }

  onPointer(h) { this.handlers.add(h); return () => this.handlers.delete(h); }
  clearHandlers() { this.handlers.clear(); }

  // --- drawing helpers, all in stage units ---
  path(pts, close = true) {
    const { ctx } = this;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (close) ctx.closePath();
  }
  poly(pts, { fill, stroke, width = 0.006, dash } = {}) {
    const { ctx } = this;
    this.path(pts);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); }
  }
  line(a, b, { stroke = this.c.ink, width = 0.008, dash } = {}) {
    const { ctx } = this;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  }
  circle(x, y, r, { fill, stroke, width = 0.005 } = {}) {
    const { ctx } = this;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  /** Text at a stage point; size in stage units. Drawn in pixels so tiny fonts render properly everywhere. */
  text(x, y, str, { size = 0.045, fill = this.c.ink, align = 'center', weight = 700, halo = true } = {}) {
    const { ctx } = this;
    const k = this.S * this.dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${weight} ${Math.round(size * k)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (halo) { ctx.lineWidth = Math.max(2, size * k * 0.22); ctx.strokeStyle = this.c.bg; ctx.strokeText(str, x * k, y * k); }
    ctx.fillStyle = fill;
    ctx.fillText(str, x * k, y * k);
    ctx.restore();
  }
  marker(x, y, colour, r = 0.022) {
    this.circle(x, y, r, { stroke: colour, width: 0.006 });
    this.line([x - r * 1.6, y], [x - r * 0.45, y], { stroke: colour, width: 0.005 });
    this.line([x + r * 0.45, y], [x + r * 1.6, y], { stroke: colour, width: 0.005 });
    this.line([x, y - r * 1.6], [x, y - r * 0.45], { stroke: colour, width: 0.005 });
    this.line([x, y + r * 0.45], [x, y + r * 1.6], { stroke: colour, width: 0.005 });
  }
}
