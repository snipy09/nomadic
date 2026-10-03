/*
 * Fixture runtime: reproduces the behaviours of real ATS front-ends that break
 * naive form fillers. Loaded by every fixture page (and iframe).
 *
 *  - [data-controlled]          React-controlled text inputs (value tracker: a value set through the
 *                               element's own `value` setter is ignored, like React's inputValueTracking;
 *                               DOM is re-rendered from state on blur / commit).
 *  - [data-controlled-choice]   React-controlled radios / checkboxes (tracked `checked`).
 *  - .yesno[data-name]          Ashby Yes/No button groups.
 *  - [data-rselect]             react-select comboboxes (Greenhouse job-boards, Ashby EEO).
 *  - [data-autocomplete]        Location typeahead: value only sticks when an option is picked.
 *  - select.select2-offscreen   select2 (classic Greenhouse) - hidden native select + visible widget.
 *  - [data-wd-select]           Workday listbox button; options render in a body-level portal.
 *  - [data-step] / [data-next]  multi-step wizard.
 *  - <x-field-input> / <x-field-select> / <x-field-checkbox>  open shadow-DOM web components.
 *  - required validation messages on blur (role=alert) and on submit.
 *  - submit is intercepted: window.__submitted = true.
 */
(function () {
  'use strict';
  var state = (window.__state = window.__state || {});
  var renderers = [];
  window.__benchCommit = function () {
    renderers.forEach(function (r) { try { r(); } catch (e) {} });
    return state;
  };

  function protoDesc(el, prop) {
    var p = Object.getPrototypeOf(el);
    while (p) {
      var d = Object.getOwnPropertyDescriptor(p, prop);
      if (d) return d;
      p = Object.getPrototypeOf(p);
    }
    return null;
  }

  // ── React-controlled text inputs ───────────────────────────────────────
  function controlText(el) {
    var key = el.getAttribute('data-controlled') || el.name || el.id;
    var desc = protoDesc(el, 'value');
    var tracked = desc.get.call(el);
    state[key] = tracked;
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: function () { return desc.get.call(this); },
      set: function (v) { tracked = String(v); desc.set.call(this, v); },
    });
    function onChange() {
      var cur = desc.get.call(el);
      if (cur === tracked) return; // value tracker says "no change" -> React drops the event
      tracked = cur;
      state[key] = cur;
    }
    el.addEventListener('input', onChange);
    el.addEventListener('change', onChange);
    renderers.push(function () {
      var v = state[key] == null ? '' : state[key];
      if (desc.get.call(el) !== v) desc.set.call(el, v);
      tracked = v;
    });
  }

  // ── React-controlled radios / checkboxes ───────────────────────────────
  function controlChoice(el) {
    var key = el.getAttribute('data-controlled-choice') || el.name || el.id;
    var desc = protoDesc(el, 'checked');
    var tracked = desc.get.call(el);
    var isRadio = el.type === 'radio';
    if (isRadio) { if (!(key in state)) state[key] = ''; }
    else { state[key + '::' + el.value] = tracked; }
    Object.defineProperty(el, 'checked', {
      configurable: true,
      get: function () { return desc.get.call(this); },
      set: function (v) { tracked = !!v; desc.set.call(this, v); },
    });
    function onClick() {
      var cur = desc.get.call(el);
      if (cur === tracked) return;
      tracked = cur;
      if (isRadio) { if (cur) state[key] = el.value; }
      else state[key + '::' + el.value] = cur;
    }
    el.addEventListener('click', onClick);
    el.addEventListener('change', onClick);
    renderers.push(function () {
      var want = isRadio ? state[key] === el.value : !!state[key + '::' + el.value];
      if (desc.get.call(el) !== want) desc.set.call(el, want);
      tracked = want;
      var wrap = el.closest('[data-option]');
      if (wrap) wrap.classList.toggle('_selected_', want);
    });
  }

  // ── Ashby Yes/No buttons ───────────────────────────────────────────────
  function yesNo(group) {
    var key = group.getAttribute('data-name');
    state[key] = '';
    var buttons = Array.prototype.slice.call(group.querySelectorAll('button'));
    function render() {
      buttons.forEach(function (b) {
        var on = state[key] === b.textContent.trim();
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('_active_', on);
      });
      var hidden = group.parentElement.querySelector('input[type="hidden"][name="' + key + '"]');
      if (hidden) hidden.value = state[key];
      clearError(group);
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        state[key] = b.textContent.trim();
        render();
      });
    });
    renderers.push(render);
    render();
  }

  // ── Listbox helpers ────────────────────────────────────────────────────
  function buildMenu(options, onPick, className) {
    var menu = document.createElement('div');
    menu.className = className || 'select__menu';
    var list = document.createElement('div');
    list.className = 'select__menu-list';
    list.setAttribute('role', 'listbox');
    options.forEach(function (o, i) {
      var opt = document.createElement('div');
      opt.className = 'select__option';
      opt.setAttribute('role', 'option');
      opt.id = 'opt-' + Math.random().toString(36).slice(2) + '-' + i;
      opt.textContent = o;
      opt.addEventListener('mousedown', function (e) { e.preventDefault(); });
      opt.addEventListener('click', function (e) { e.preventDefault(); onPick(o); });
      list.appendChild(opt);
    });
    menu.appendChild(list);
    return menu;
  }

  // ── react-select combobox ──────────────────────────────────────────────
  function reactSelect(container) {
    var key = container.getAttribute('data-rselect');
    var options = JSON.parse(container.getAttribute('data-options') || '[]');
    var input = container.querySelector('input[role="combobox"]');
    var control = container.querySelector('.select__control');
    var single = container.querySelector('.select__single-value');
    var placeholder = container.querySelector('.select__placeholder');
    var hidden = container.querySelector('input[type="hidden"]');
    state[key] = '';
    var menu = null;
    function close() {
      if (menu) { menu.remove(); menu = null; }
      input.setAttribute('aria-expanded', 'false');
    }
    function open() {
      close();
      var q = (input.value || '').toLowerCase();
      var filtered = options.filter(function (o) { return !q || o.toLowerCase().indexOf(q) !== -1; });
      menu = buildMenu(filtered, function (o) {
        state[key] = o;
        input.value = '';
        render();
        close();
      });
      container.appendChild(menu);
      input.setAttribute('aria-expanded', 'true');
    }
    function render() {
      single.textContent = state[key];
      single.style.display = state[key] ? '' : 'none';
      placeholder.style.display = state[key] ? 'none' : '';
      if (hidden) hidden.value = state[key];
      clearError(container);
    }
    control.addEventListener('mousedown', function (e) {
      if (e.target !== input) e.preventDefault();
      input.focus();
      menu ? close() : open();
    });
    input.addEventListener('input', open);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' && !menu) { open(); e.preventDefault(); }
      else if (e.key === 'Enter' && menu) {
        var first = menu.querySelector('[role="option"]');
        if (first) first.click();
        e.preventDefault();
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); input.value = ''; });
    renderers.push(render);
    render();
  }

  // ── Location typeahead (value only sticks when an option is picked) ───
  function autocomplete(input) {
    var key = input.getAttribute('data-autocomplete');
    var options = JSON.parse(input.getAttribute('data-options') || '[]');
    var desc = protoDesc(input, 'value');
    state[key] = '';
    var menu = null;
    var wrap = input.parentElement;
    function close() { if (menu) { menu.remove(); menu = null; } input.setAttribute('aria-expanded', 'false'); }
    function open() {
      close();
      var q = desc.get.call(input).toLowerCase().trim();
      if (q.length < 2) return;
      var first = q.split(',')[0].trim();
      var filtered = options.filter(function (o) { return o.toLowerCase().indexOf(first) !== -1; });
      if (!filtered.length) return;
      menu = buildMenu(filtered, function (o) {
        state[key] = o;
        desc.set.call(input, o);
        close();
        clearError(wrap);
      }, 'select__menu autocomplete-menu');
      wrap.appendChild(menu);
      input.setAttribute('aria-expanded', 'true');
    }
    input.addEventListener('input', open);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && menu) {
        var f = menu.querySelector('[role="option"]');
        if (f) f.click();
        e.preventDefault();
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        close();
        if (desc.get.call(input) !== state[key]) desc.set.call(input, state[key]);
      }, 200);
    });
    renderers.push(function () { if (desc.get.call(input) !== state[key]) desc.set.call(input, state[key]); });
  }

  // ── select2 ────────────────────────────────────────────────────────────
  function select2(sel) {
    var c = document.createElement('div');
    c.className = 'select2-container';
    var a = document.createElement('a');
    a.className = 'select2-choice';
    a.href = 'javascript:void(0)';
    var chosen = document.createElement('span');
    chosen.className = 'select2-chosen';
    a.appendChild(chosen);
    c.appendChild(a);
    sel.parentNode.insertBefore(c, sel);
    function render() {
      var o = sel.options[sel.selectedIndex];
      chosen.textContent = o ? o.text : '';
      if (sel.value) clearError(sel);
    }
    var drop = null;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      if (drop) { drop.remove(); drop = null; return; }
      drop = document.createElement('ul');
      drop.className = 'select2-drop select2-results';
      Array.prototype.forEach.call(sel.options, function (o, i) {
        if (i === 0 && !o.value) return;
        var li = document.createElement('li');
        li.className = 'select2-result';
        li.setAttribute('role', 'option');
        li.textContent = o.text;
        li.addEventListener('click', function () {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          drop.remove(); drop = null;
        });
        drop.appendChild(li);
      });
      c.appendChild(drop);
    });
    sel.addEventListener('change', render);
    render();
  }

  // ── Workday listbox button (portal) ────────────────────────────────────
  function wdSelect(btn) {
    var key = btn.getAttribute('data-wd-select');
    var options = JSON.parse(btn.getAttribute('data-options') || '[]');
    var hidden = btn.parentElement.querySelector('input[type="hidden"]');
    state[key] = '';
    var popup = null;
    function render() {
      btn.textContent = state[key] || 'Select One';
      btn.setAttribute('aria-label', (btn.getAttribute('data-label') || '') + ' ' + (state[key] || 'Select One'));
      btn.setAttribute('value', state[key]);
      if (hidden) hidden.value = state[key];
      if (state[key]) clearError(btn);
    }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (popup) { popup.remove(); popup = null; btn.setAttribute('aria-expanded', 'false'); return; }
      popup = document.createElement('div');
      popup.setAttribute('data-automation-widget', 'wd-popup');
      popup.className = 'wd-popup';
      var ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      ul.setAttribute('aria-labelledby', btn.id);
      options.forEach(function (o) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('data-automation-id', 'promptOption');
        var d = document.createElement('div');
        d.textContent = o;
        li.appendChild(d);
        li.addEventListener('click', function () {
          state[key] = o;
          render();
          popup.remove(); popup = null;
          btn.setAttribute('aria-expanded', 'false');
        });
        ul.appendChild(li);
      });
      popup.appendChild(ul);
      document.body.appendChild(popup);
      btn.setAttribute('aria-expanded', 'true');
    });
    renderers.push(render);
    render();
  }

  // ── Validation ─────────────────────────────────────────────────────────
  function fieldContainer(el) {
    return el.closest('[data-field], .field, .application-question, ._fieldEntry_, .form-group, [data-automation-id="formField"]') || el.parentElement;
  }
  function showError(el, msg) {
    var c = fieldContainer(el);
    if (!c || c.querySelector('[role="alert"].bench-error')) return;
    var e = document.createElement('div');
    e.className = 'bench-error error-message _errorMessage_';
    e.setAttribute('role', 'alert');
    e.textContent = msg || 'This field is required.';
    c.appendChild(e);
    if (el.setAttribute) el.setAttribute('aria-invalid', 'true');
  }
  function clearError(el) {
    var c = fieldContainer(el);
    if (!c) return;
    var e = c.querySelector('[role="alert"].bench-error');
    if (e) e.remove();
    var inv = c.querySelector('[aria-invalid="true"]');
    if (inv) inv.removeAttribute('aria-invalid');
  }
  function isEmpty(el) {
    var rs = el.closest && el.closest('[data-rselect]');
    if (rs) return !state[rs.getAttribute('data-rselect')];
    if (el.type === 'checkbox' || el.type === 'radio') {
      var group = el.name ? el.form ? el.form.querySelectorAll('input[name="' + el.name + '"]') : document.querySelectorAll('input[name="' + el.name + '"]') : [el];
      return !Array.prototype.some.call(group, function (g) { return g.checked; });
    }
    if (el.type === 'file') return !el.files || el.files.length === 0;
    return !String(el.value || '').trim();
  }
  document.addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el || !el.hasAttribute) return;
    setTimeout(function () {
      window.__benchCommit();
      if (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') {
        if (isEmpty(el)) showError(el); else clearError(el);
      }
    }, 0);
  }, true);
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.hasAttribute && !isEmpty(el)) clearError(el);
  }, true);
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el && el.hasAttribute && !isEmpty(el)) clearError(el);
  }, true);

  // ── Multi-step wizard ──────────────────────────────────────────────────
  function initSteps() {
    var steps = Array.prototype.slice.call(document.querySelectorAll('[data-step]'));
    if (!steps.length) return;
    var idx = 0;
    function show() {
      steps.forEach(function (s, i) { s.style.display = i === idx ? '' : 'none'; });
      var label = document.querySelector('[data-step-label]');
      if (label) label.textContent = steps[idx].getAttribute('data-step');
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-next]'), function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        window.__benchCommit();
        if (idx < steps.length - 1) { idx++; show(); }
      });
    });
    show();
  }

  // ── Shadow DOM web components ──────────────────────────────────────────
  function defineComponents() {
    if (!window.customElements || customElements.get('x-field-input')) return;
    var css = '<style>label{display:block;font:600 13px system-ui;margin:0 0 4px}input,select{font:14px system-ui;padding:6px;width:100%;box-sizing:border-box}.req{color:#b00}</style>';
    customElements.define('x-field-input', class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        var root = this.attachShadow({ mode: 'open' });
        var id = 'in-' + (this.getAttribute('name') || Math.random().toString(36).slice(2));
        root.innerHTML = css + '<div class="field" part="field"><label for="' + id + '">' + this.getAttribute('label') +
          (this.hasAttribute('required') ? ' <span class="req">*</span>' : '') + '</label><input id="' + id + '" name="' + (this.getAttribute('name') || '') +
          '" type="' + (this.getAttribute('type') || 'text') + '"' + (this.hasAttribute('required') ? ' required aria-required="true"' : '') + '></div>';
      }
    });
    customElements.define('x-field-select', class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        var root = this.attachShadow({ mode: 'open' });
        var id = 'sel-' + (this.getAttribute('name') || Math.random().toString(36).slice(2));
        var opts = JSON.parse(this.getAttribute('options') || '[]');
        root.innerHTML = css + '<div class="field"><label for="' + id + '">' + this.getAttribute('label') +
          (this.hasAttribute('required') ? ' <span class="req">*</span>' : '') + '</label><select id="' + id + '" name="' + (this.getAttribute('name') || '') + '"' +
          (this.hasAttribute('required') ? ' required' : '') + '><option value="">Select...</option>' +
          opts.map(function (o) { return '<option>' + o + '</option>'; }).join('') + '</select></div>';
      }
    });
    customElements.define('x-field-checkbox', class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        var root = this.attachShadow({ mode: 'open' });
        var id = 'cb-' + (this.getAttribute('name') || Math.random().toString(36).slice(2));
        root.innerHTML = css + '<div class="field"><input type="checkbox" style="width:auto" id="' + id + '" name="' + (this.getAttribute('name') || '') +
          '"' + (this.hasAttribute('required') ? ' required' : '') + '> <label style="display:inline" for="' + id + '">' + this.getAttribute('label') + '</label></div>';
      }
    });
  }

  function init() {
    defineComponents();
    Array.prototype.forEach.call(document.querySelectorAll('[data-controlled]'), controlText);
    Array.prototype.forEach.call(document.querySelectorAll('[data-controlled-choice]'), controlChoice);
    Array.prototype.forEach.call(document.querySelectorAll('.yesno[data-name]'), yesNo);
    Array.prototype.forEach.call(document.querySelectorAll('[data-rselect]'), reactSelect);
    Array.prototype.forEach.call(document.querySelectorAll('[data-autocomplete]'), autocomplete);
    Array.prototype.forEach.call(document.querySelectorAll('select.select2-offscreen'), select2);
    Array.prototype.forEach.call(document.querySelectorAll('[data-wd-select]'), wdSelect);
    initSteps();
    Array.prototype.forEach.call(document.querySelectorAll('[data-open-modal]'), function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var m = document.querySelector(b.getAttribute('data-open-modal'));
        if (m) { m.style.display = 'block'; m.classList.add('show'); }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('form'), function (f) {
      f.setAttribute('novalidate', '');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        window.__submitted = true;
        document.documentElement.setAttribute('data-submitted', '1');
        try { if (window.parent && window.parent !== window) window.parent.postMessage('bench-submitted', '*'); } catch (err) {}
        Array.prototype.forEach.call(f.querySelectorAll('[required],[aria-required="true"]'), function (el) {
          if (isEmpty(el)) showError(el);
        });
      });
    });
    window.addEventListener('message', function (e) { if (e.data === 'bench-submitted') window.__submitted = true; });
    window.__fixtureReady = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
