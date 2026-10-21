// The arena: a full-screen, locked play surface (no scrolling, no zooming) holding the square stage.
// The page can't scroll or zoom while it's open, so neither can help with a task.
import { Controls, el } from './render/controls.js';
import { Stage } from './render/stage.js';
import { RENDERERS } from './render/tasks.js';
import { TASKS } from './tasks/index.js';
import { scoreTask } from './plan.js';
import { fmt2, scoreBlock } from './scoring.js';

const MAX_STAGE = 620;
const block = (e) => e.preventDefault();
const blockZoomWheel = (e) => { if (e.ctrlKey) e.preventDefault(); };
const blockZoomKeys = (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); };
// jacob.gg motion (kit/jgg.js); may be missing, so each use has a plain fallback that ends in the same state.
const motion = () => window.JGG?.motion;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'; // --jgg-ease-out

/** A countdown digit arriving: scale .96 -> 1 with a fade, 220 ms (a 160 ms fade under reduce motion). */
function digitIn(node) {
  if (!node.animate) return;
  node.getAnimations().forEach((a) => a.cancel());
  const calm = reduced();
  node.animate(calm ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }],
    { duration: calm ? 160 : 220, easing: calm ? 'ease' : EASE_OUT });
}

export class Arena {
  constructor({ closable = false, onClose } = {}) {
    this.pips = el('ol', { class: 'pips', 'aria-label': 'Progress' });
    this.name = el('span', { class: 'arena-name' });
    this.badge = el('span', { class: 'arena-badge', hidden: '' });
    this.closeBtn = el('button', { class: 'arena-close', type: 'button', 'aria-label': 'Stop', text: '✕', hidden: '' });
    this.prompt = el('p', { class: 'arena-prompt', 'aria-live': 'polite' });
    this.stageHost = el('div', { class: 'stage' });
    this.overlay = el('div', { class: 'stage-overlay', hidden: '' });
    this.wrap = el('div', { class: 'stage-wrap' }, this.stageHost, this.overlay);
    this.result = el('div', { class: 'arena-result' }); // always takes its space, so the stage never jumps
    this.controlsHost = el('div', { class: 'controls' });
    this.zoomNote = el('p', { class: 'zoom-note', hidden: '', text: 'You’re zoomed in. Pinch out to 100% so the whole stage is in view.' });
    this.root = el('div', { class: 'arena', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Perceptle' },
      el('div', { class: 'arena-top' }, this.pips, el('div', { class: 'arena-title' }, this.name), this.closeBtn),
      this.badge,
      this.prompt, this.wrap, this.result, this.controlsHost, this.zoomNote);
    this.stage = new Stage(this.stageHost);
    this.controls = new Controls(this.controlsHost);
    if (closable) {
      this.closeBtn.hidden = false;
      this.closeBtn.addEventListener('click', () => { this.close(); onClose?.(); });
    }
    // fit() resizes the canvas inside the observed box: doing it next frame avoids WebKit's "ResizeObserver loop" error
    this.ro = new ResizeObserver(() => requestAnimationFrame(() => this.fit()));
  }

  /** enter: play the shared entrance (220 ms). Only when no task starts underneath it (the countdown covers it). */
  open({ enter = false } = {}) {
    document.body.append(this.root);
    if (enter) motion()?.enter(this.root);
    document.documentElement.classList.add('locked');
    window.scrollTo(0, 0);
    document.addEventListener('gesturestart', block);
    document.addEventListener('touchmove', block, { passive: false });
    window.addEventListener('wheel', blockZoomWheel, { passive: false });
    window.addEventListener('keydown', blockZoomKeys);
    this.ro.observe(this.wrap);
    this.fit();
  }

  close() {
    this.ro.disconnect();
    this.controls.clear();
    this.stage.clearHandlers();
    document.removeEventListener('gesturestart', block);
    document.removeEventListener('touchmove', block);
    window.removeEventListener('wheel', blockZoomWheel);
    window.removeEventListener('keydown', blockZoomKeys);
    document.documentElement.classList.remove('locked');
    this.root.remove();
  }

  fit() {
    const S = Math.min(this.wrap.clientWidth, this.wrap.clientHeight, MAX_STAGE);
    if (S > 0 && S !== this.stage.S) this.stage.resize(S);
    this.zoomNote.hidden = !(window.visualViewport && window.visualViewport.scale > 1.05);
  }

  setPips(scores, current) {
    this.pips.replaceChildren(...scores.map((p, i) => el('li', {
      class: `pip${i === current ? ' now' : ''}`, text: p === undefined ? '' : scoreBlock(p),
    })));
  }

  async countdown(from = 3) {
    this.result.classList.remove('shown');
    this.controls.clear();
    this.stage.draw(() => {});
    this.prompt.textContent = 'Get ready…';
    this.overlay.hidden = false;
    for (let n = from; n > 0; n--) {
      this.overlay.textContent = String(n);
      digitIn(this.overlay); // decoration only: the 650 ms steps below are the countdown's timing
      await new Promise((r) => setTimeout(r, 650));
    }
    this.overlay.hidden = true;
  }

  /** Show one task and wait for the answer. Returns { answer, result: { points, err } }. */
  async play(task, { label }) {
    const def = TASKS[task.type];
    this.result.classList.remove('shown');
    this.name.textContent = this.name.title = `${label} · ${def.emoji} ${def.name}`; // full text when it truncates
    this.badge.hidden = !task.illusion;
    this.badge.textContent = task.illusion ? `✨ Illusion special: ${def.illusionName}` : '';
    this.prompt.textContent = def.prompt(task.params);
    this.stage.clearHandlers();
    this.controls.clear();
    this.fit();
    const t0 = performance.now();
    const answer = await RENDERERS[task.type].run({
      stage: this.stage, controls: this.controls, task,
      prompt: (t) => { if (typeof t === 'string') this.prompt.textContent = t; else this.prompt.replaceChildren(t); },
    });
    this.stage.clearHandlers();
    this.controls.clear();
    const ms = Math.round(performance.now() - t0);
    return { answer, ms, result: scoreTask(task, answer, ms) };
  }

  /** The true answer and the points, then wait for Next. */
  async reveal(task, answer, result, { next = 'Next →' } = {}) {
    const def = TASKS[task.type];
    RENDERERS[task.type].reveal({ stage: this.stage, task, answer }); // may animate; Next works straight away
    this.prompt.textContent = `${def.truthText(task.params)[0].toUpperCase()}${def.truthText(task.params).slice(1)} · ${def.answerText(task.params, answer)}`;
    const points = el('span', { class: `arena-points ${result.points >= 60 ? 'good' : result.points >= 30 ? 'ok' : 'bad'}`, text: fmt2(result.points) });
    this.result.replaceChildren(
      points,
      el('span', { class: 'arena-out-of', text: '/ 100' }),
      el('span', { class: 'arena-breakdown', text: result.speed === null ? 'accuracy only' : `accuracy ${fmt2(result.acc)} · speed ${Math.round(result.speed * 100)}%` }));
    this.result.classList.add('shown');
    // Seen 8 times a day, so quick: the points enter (220 ms) and count up in 280 ms (a tap skips it); Next below is
    // tappable from the first frame. The once-a-day total keeps the longer count-up.
    const m = motion();
    if (m) { m.enter(this.result); m.settle(points, result.points, { format: fmt2, duration: 280 }); }
    await this.controls.button(next).done;
  }
}
