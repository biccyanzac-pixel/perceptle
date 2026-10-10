// The arena: a full-screen, locked play surface (no scrolling, no zooming) holding the square stage.
// The page can't scroll or zoom while it's open, so neither can help with a task.
import { Controls, el } from './render/controls.js';
import { Stage } from './render/stage.js';
import { RENDERERS } from './render/tasks.js';
import { TASKS } from './tasks/index.js';
import { scoreTask } from './plan.js';
import { scoreBlock } from './scoring.js';

const MAX_STAGE = 620;
const block = (e) => e.preventDefault();
const blockZoomWheel = (e) => { if (e.ctrlKey) e.preventDefault(); };
const blockZoomKeys = (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); };

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
    this.ro = new ResizeObserver(() => this.fit());
  }

  open() {
    document.body.append(this.root);
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
      await new Promise((r) => setTimeout(r, 650));
    }
    this.overlay.hidden = true;
  }

  /** Show one task and wait for the answer. Returns { answer, result: { points, err } }. */
  async play(task, { label }) {
    const def = TASKS[task.type];
    this.result.classList.remove('shown');
    this.name.textContent = `${label} · ${def.emoji} ${def.name}`;
    this.badge.hidden = !task.illusion;
    this.badge.textContent = task.illusion ? `✨ Illusion special: ${def.illusionName}` : '';
    this.prompt.textContent = def.prompt(task.params);
    this.stage.clearHandlers();
    this.controls.clear();
    this.fit();
    const answer = await RENDERERS[task.type].run({
      stage: this.stage, controls: this.controls, task, prompt: (t) => { this.prompt.textContent = t; },
    });
    this.stage.clearHandlers();
    this.controls.clear();
    return { answer, result: scoreTask(task, answer) };
  }

  /** The true answer and the points, then wait for Next. */
  async reveal(task, answer, result, { next = 'Next →' } = {}) {
    const def = TASKS[task.type];
    RENDERERS[task.type].reveal({ stage: this.stage, task, answer });
    this.prompt.textContent = `${def.truthText(task.params)[0].toUpperCase()}${def.truthText(task.params).slice(1)} · ${def.answerText(task.params, answer)}`;
    this.result.replaceChildren(
      el('span', { class: `arena-points ${result.points >= 60 ? 'good' : result.points >= 30 ? 'ok' : 'bad'}`, text: String(result.points) }),
      el('span', { class: 'arena-out-of', text: '/ 100' }));
    this.result.classList.add('shown');
    await this.controls.button(next).done;
  }
}
