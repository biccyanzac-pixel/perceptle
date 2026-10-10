// Controls under the stage: a compact on-screen keypad (also takes the physical keyboard) and a confirm button.
// The on-screen keypad means the phone keyboard never pops up and shifts the layout mid-task.

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.filter((c) => c !== null && c !== undefined));
  return n;
}

export class Controls {
  constructor(host) { this.host = host; this.cleanup = []; }

  clear() {
    for (const f of this.cleanup.splice(0)) f();
    this.host.replaceChildren();
  }

  listenKeys(fn) {
    const h = (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) fn(e); };
    window.addEventListener('keydown', h);
    this.cleanup.push(() => window.removeEventListener('keydown', h));
  }

  /**
   * Number entry. Resolves with an integer when OK is pressed.
   * `ready()` can veto OK (e.g. area: a shape must be picked first); call `refresh()` after it changes.
   */
  keypad({ unit = '', maxDigits = 3, max = 999, okLabel = 'OK', ready = () => true } = {}) {
    this.clear();
    let value = '';
    const shown = el('span', { class: 'kp-value', text: '' });
    const display = el('div', { class: 'kp-display', 'aria-live': 'polite' }, shown, el('span', { class: 'kp-unit', text: unit }));
    const ok = el('button', { class: 'kp-key kp-ok', type: 'button', text: okLabel, disabled: '' });
    const refresh = () => {
      shown.textContent = value || '–';
      display.classList.toggle('empty', !value);
      ok.disabled = !value || !ready();
    };
    const press = (k) => {
      if (k === 'back') value = value.slice(0, -1);
      else if (/^\d$/.test(k) && value.length < maxDigits) {
        const next = value === '0' ? k : value + k;
        if (Number(next) <= max) value = next;
      }
      refresh();
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) =>
      el('button', { class: 'kp-key', type: 'button', text: d, onpointerdown: (e) => { e.preventDefault(); press(d); } }));
    const back = el('button', { class: 'kp-key kp-back', type: 'button', 'aria-label': 'Delete', text: '⌫', onpointerdown: (e) => { e.preventDefault(); press('back'); } });
    this.host.append(el('div', { class: 'keypad' }, display, el('div', { class: 'kp-grid' }, ...keys, back, ok)));
    refresh();
    return {
      refresh,
      done: new Promise((resolve) => {
        const submit = () => { if (!ok.disabled) resolve(Number(value)); };
        ok.addEventListener('click', submit);
        this.listenKeys((e) => {
          if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); }
          else if (e.key === 'Backspace') { press('back'); e.preventDefault(); }
          else if (e.key === 'Enter') { submit(); e.preventDefault(); }
        });
      }),
    };
  }

  /** A single button. Resolves on click/Enter once enabled. */
  button(label, { enabled = true, kind = 'primary' } = {}) {
    this.clear();
    const b = el('button', { class: `ctl-btn ${kind}`, type: 'button', text: label });
    b.disabled = !enabled;
    this.host.append(b);
    return {
      el: b,
      enable(on = true, text) { b.disabled = !on; if (text) b.textContent = text; },
      done: new Promise((resolve) => {
        b.addEventListener('click', () => !b.disabled && resolve());
        this.listenKeys((e) => { if (e.key === 'Enter' && !b.disabled) { e.preventDefault(); resolve(); } });
      }),
    };
  }

  note(text) {
    this.clear();
    this.host.append(el('p', { class: 'ctl-note', text }));
  }
}

export { el };
