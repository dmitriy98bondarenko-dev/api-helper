// js/ui.js
export const $ = sel => document.querySelector(sel);
import { state } from './state.js';
export const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  const boolAttrs = new Set([
    'checked', 'disabled', 'readonly', 'required', 'selected', 'multiple', 'hidden', 'open'
  ]);

  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') {
      n.className = v;
    } else if (k === 'dataset') {
      Object.assign(n.dataset, v);
    } else if (k.startsWith('on') && typeof v === 'function') {
      n.addEventListener(k.slice(2), v);
    } else if (boolAttrs.has(k)) {
      n[k] = !!v;
      if (v) n.setAttribute(k, '');
      else n.removeAttribute(k);
    } else {
      n.setAttribute(k, v);
    }
  });

  children.forEach(c => n.append(c));
  return n;
};

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function showLoader(on) {
  const l = $('#loader');
  if (!l) return;
  l.hidden = !on;
}

// Тема (UI)
export function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('ui_theme', t);
  const sw = $('#themeToggleSwitch');
  if (sw) sw.checked = (t === 'dark');
}

// Инициализация темы + подписка на переключатель
export function initThemeUI() {
  const t = localStorage.getItem('ui_theme') || 'light';
  applyTheme(t);
  const sw = $('#themeToggleSwitch');
  if (sw) {
    sw.addEventListener('change', (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      applyTheme(newTheme);
    });
  }
}

// Подсветка "пропущенных" переменных в инпутах
export function highlightMissingVars(rootEl, varsMap) {
  const regex = /{{\s*([^}]+)\s*}}/g;
  rootEl.querySelectorAll('input, textarea').forEach(inp => {
    const val = inp.value || '';
    let missing = false;
    val.replace(regex, (_, key) => {
      const exists = varsMap && varsMap[key] != null && varsMap[key] !== '';
      if (!exists) missing = true;
    });
    inp.classList.toggle('var-missing', missing);
  });
}

// Рендер токенов {{var}} в URL
export function renderUrlWithVars(url, varsMap) {
  const regex = /{{\s*([^}]+)\s*}}/g;
  return String(url || '').replace(regex, (_, key) => {
    const val = varsMap ? varsMap[key] : undefined;
    const missing = !val;
    return `<span class="var-token ${missing ? 'missing' : 'filled'}" data-var="${key}" title="${val || '(not set)'}">{{${key}}}</span>`;
  });
}

// Таблички KV (Params/Headers)
export function buildKVTable(rows, { onChange } = {}) {
  const t = el('table', { class: 'kvTable' });
  t.append(el('thead', {}, el('tr', {},
    el('th', { class: 'kvOn' }, 'On'),
    el('th', {}, 'Key'),
    el('th', {}, 'Value'),
    el('th', {}, '')
  )));
  const tb = el('tbody');

  (rows || []).forEach(r => appendRow(tb, r, false, onChange));
  addNewRow(tb, onChange);

  t.append(tb);
  return t;
}

export function appendRow(tb, row, isNew = false, onChange) {
  const tr = el('tr');

  const cb = el('input', {
    type: 'checkbox',
    'data-field': 'enabled',
    checked: row.enabled === true
  });

  const keyInp = el('input', { value: row.key ?? '', 'data-field': 'key', placeholder: isNew ? 'key' : '' });
  const valInp = el('input', { value: row.value ?? '', 'data-field': 'value', placeholder: isNew ? 'value' : '' });

  const onInput = () => {
    const has = (keyInp.value.trim() || valInp.value.trim());
    cb.checked = !!has;

    if (isNew && has && tr === tb.lastElementChild) {
      appendRow(tb, { key: '', value: '', enabled: false }, true, onChange);
    }
    if (onChange) onChange();
  };

  keyInp.addEventListener('input', onInput);
  valInp.addEventListener('input', onInput);
  cb.addEventListener('change', () => onChange && onChange());

  const removeBtn = el('button', {
    class: 'varRemove',
    title: 'Delete row',
    onclick: () => {
      tr.remove();
      if (onChange) onChange();
    }
  }, '✖');

  tr.append(
    el('td', { class: 'kvOn' }, el('div', { class: 'cell' }, cb)),
    el('td', {}, el('div', { class: 'cell' }, keyInp)),
    el('td', {}, el('div', { class: 'cell' }, valInp)),
    el('td', {}, el('div', { class: 'cell' }, removeBtn))
  );

  tb.append(tr);
}

export function addNewRow(tb, onChange) {
  const trNew = el('tr');
  const cbNew = el('input', { type: 'checkbox', 'data-field': 'enabled', checked: false });
  const keyNew = el('input', { 'data-field': 'key', placeholder: 'key' });
  const valNew = el('input', { 'data-field': 'value', placeholder: 'value' });

  const onInput = () => {
    const has = (keyNew.value.trim() || valNew.value.trim());
    cbNew.checked = !!has;
    if (has && trNew === tb.lastElementChild) addNewRow(tb, onChange);
    if (onChange) onChange();
  };
  keyNew.addEventListener('input', onInput);
  valNew.addEventListener('input', onInput);
  cbNew.addEventListener('change', () => onChange && onChange());

  trNew.append(
    el('td', { class: 'kvOn' }, el('div', { class: 'cell' }, cbNew)),
    el('td', {}, el('div', { class: 'cell' }, keyNew)),
    el('td', {}, el('div', { class: 'cell' }, valNew)),
    el('td', {}, '')
  );
  tb.append(trNew);
}

export function tableToSimpleArray(tbody) {
  const out = [];
  Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
    const key = tr.querySelector('input[data-field="key"]')?.value?.trim() ?? '';
    const val = tr.querySelector('input[data-field="value"]')?.value ?? '';
    const en = tr.querySelector('input[data-field="enabled"]')?.checked;
    if (key || val) out.push({ key, value: val, enabled: !!en });
  });
  return out;
}
// ===== Response rendering =====

export function escapeHtml(text='') {
    return String(text)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

// ===== Response rendering (обновлено) =====
// ui.js

// Подсветка JSON
function syntaxHighlight(json) {
    if (!json) return '';
    let html = String(json)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    html = html.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        match => {
            if (/^"/.test(match)) {
                if (/:$/.test(match)) return `<span class="json-key">${match}</span>`;
                return `<span class="json-string">${match}</span>`;
            }
            if (/true|false/.test(match)) return `<span class="json-boolean">${match}</span>`;
            if (/null/.test(match)) return `<span class="json-null">${match}</span>`;
            return `<span class="json-number">${match}</span>`;
        }
    );
    return html;
}

// тулбар с копированием
function buildRespTools(bodyText) {
    const fieldInp = el('input', {
        id: 'copyFieldInp',
        placeholder: 'Field to copy (e.g., access_token)',
        style: 'flex:1; padding:4px;'
    });

    const copyFieldBtn = el('button', {
        id: 'copyFieldBtn',
        onclick: () => {
            try {
                const parsed = JSON.parse(bodyText);
                const field = fieldInp.value.trim();
                if (field && parsed[field] != null) {
                    navigator.clipboard.writeText(parsed[field]);
                    showAlert(`Field "${field}" copied`, 'success');
                } else {
                    showAlert(`Field not found: ${field}`, 'error');
                }
            } catch {
                showAlert('Response is not valid JSON', 'error');
            }
        }
    }, 'Copy field');

    const copyBodyBtn = el('button', {
        id: 'copyBodyBtn',
        onclick: () => {
            navigator.clipboard.writeText(bodyText || '');
            showAlert('Body copied', 'success');
        }
    }, 'Copy body');

    const copyAllBtn = el('button', {
        id: 'copyAllBtn',
        onclick: () => {
            const text = document.querySelector('#resPane pre.body')?.innerText || '';
            navigator.clipboard.writeText(text);
            showAlert('All response copied', 'success');
        }
    }, 'Copy all');

    return el('div', { class: 'respTools', style: 'display:flex; gap:6px; margin:6px 0;' },
        fieldInp, copyFieldBtn, copyBodyBtn, copyAllBtn
    );
}

// Рендер основного ответа
// ===== Response rendering =====
export function renderResponse(res, text, ms, url) {
    const pane = document.querySelector('#resPane');
    if (!pane) return;
    pane.innerHTML = '';

    if (!res) {
        pane.append(el('div', { class: 'error' }, text || 'No response'));
        return;
    }

    // ---------- Заголовок карточки ----------
    const title = el('div', { class: 'respTitle' }, 'Response');

    // ---------- Header зі статусом / часом / URL ----------
    const header = el('div', { class: 'respHeader' },
        el('span', { class: 'statusPill ' + (res.status >= 200 && res.status < 300 ? 'ok' : 'err') }, res.status),
        el('span', { class: 'respMeta' }, `${ms.toFixed(0)} ms`),
        el('span', { class: 'respUrl' }, url || '')
    );

    // ---------- Body ----------
    let highlighted, pretty;
    try {
        const json = JSON.parse(text);
        pretty = JSON.stringify(json, null, 2);
        highlighted = syntaxHighlight(pretty);
    } catch {
        pretty = text || '';
        highlighted = syntaxHighlight(pretty);
    }
    const bodyPre = el('pre', { class: 'body' });
    bodyPre.innerHTML = highlighted;

    // ---------- Headers ----------
    const headersList = Object.entries(res.headers ? Object.fromEntries(res.headers) : {})
        .map(([k, v]) => `${k}: ${v}`).join('\n');
    const headersPre = el('pre', { class: 'headers' }, headersList);

    // ---------- Authentication ----------
    const authToken = extractBearer(res, text);
    const authPre = el('pre', { class: 'auth' }, authToken || '— no token —');

    // ---------- Tools ----------
    const tools = buildRespTools(pretty);

    // ---------- Tabs ----------
    const tabs = el('div', { class: 'tabs' },
        el('div', { class: 'tab active', dataset: { tab: 'body' }, onclick: () => switchTab('body') }, 'Body'),
        el('div', { class: 'tab', dataset: { tab: 'headers' }, onclick: () => switchTab('headers') }, 'Headers'),
        el('div', { class: 'tab', dataset: { tab: 'auth' }, onclick: () => switchTab('auth') }, 'Authentication')
    );

    const tabPanes = el('div', { class: 'tabPanes' },
        el('div', { class: 'tabPane active', id: 'tab-body' }, tools, bodyPre),
        el('div', { class: 'tabPane', id: 'tab-headers' }, headersPre),
        el('div', { class: 'tabPane', id: 'tab-auth' }, authPre)
    );

    // ---------- Card (все разом) ----------
    const card = el('div', { class: 'respCard' },
        title,
        header,
        tabs,
        tabPanes
    );

    pane.append(card);

    function switchTab(tab) {
        pane.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        pane.querySelectorAll('.tabPane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    }
}

// ---------- Extract Bearer ----------
function extractBearer(res, bodyText) {
    if (!res) return '';
    const headers = res.headers ? Object.fromEntries(res.headers) : {};
    const fromHdr = headers['authorization'] || headers['Authorization'];
    if (fromHdr) return fromHdr;

    try {
        const json = JSON.parse(bodyText || '{}');
        if (json.access_token) return 'Bearer ' + json.access_token;
    } catch {}
    return '';
}




export function renderResponseSaved(saved) {
    const pane = document.querySelector('#resPane');
    if (!pane) return;
    pane.innerHTML = '';

    const header = el('div', { class: 'respHeader' },
        el('span', { class: 'pill' }, `${saved.status} ${saved.statusText}`),
        el('span', { class: 'rightInfo' }, `${saved.timeMs} ms`),
        el('span', { class: 'rightInfo' }, saved.url || '')
    );

    let highlighted, pretty;
    try {
        const json = JSON.parse(saved.bodyText || '');
        pretty = JSON.stringify(json, null, 2);
        highlighted = syntaxHighlight(pretty);
    } catch {
        pretty = saved.bodyText || '';
        highlighted = syntaxHighlight(pretty);
    }

    const bodyPre = el('pre', { class: 'body' });
    bodyPre.innerHTML = highlighted;
    const bodyWrap = el('div', { class: 'respBody' }, bodyPre);

    const headersPre = el('pre', { class: 'headers' },
        Object.entries(saved.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n')
    );

    const tools = buildRespTools(pretty);

    pane.append(header, tools, bodyWrap, headersPre);
}
export function highlightJSON(text) {
    if (!text) return "";

    let html = String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // === 1. Ключи: "key":
    html = html.replace(
        /"([^"]+)"\s*:/g,
        (_, key) => `<span class='json-key'>"${key}"</span>:`
    );

/*
    html = html.replace(
            /"([^"]+)"\s*:/g,
            (_, key) => `\"<span class="json-key">${key}</span>\":`
        );

*/
    // 3) Строки-значения (не ключи)
    html = html.replace(
        /"([^"]*?)"/g,
        (match, value) => {
            // если это {{var}}, выделим как переменную
            if (value.startsWith("{{") && value.endsWith("}}")) {
                const varName = value.replace(/[{}]/g, "");
                return `"<span class="var-token" data-var="${varName}">{{${varName}}}</span>"`;
            }
            return `<span class="json-string">"${value}"</span>`;
        }
    );

    // 4) Числа
    html = html.replace(
        /\b(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+\-]?\d+)?)\b/g,
        '<span data-json="number">$1</span>'
    );

    // 5) true/false/null
    html = html.replace(/\b(true|false)\b/g, '<span data-json="boolean">$1</span>');
    html = html.replace(/\b(null)\b/g, '<span data-json="null">$1</span>');

    // 6) {{vars}} — кликабельные токены (цвет как в URL)
    html = html.replace(/{{\s*([^}]+)\s*}}/g, (_, key) => {
        const k = key.trim();
        const val = (state.VARS && state.VARS[k] != null) ? String(state.VARS[k]) : '';
        const title = (val || '(not set)').replace(/"/g, '&quot;');
        return `<span class="var-token ${val ? 'filled' : 'missing'}" data-var="${k}" title="${title}">{{${k}}}</span>`;
    });

    return html;
}

// Сохранение позиции курсора в contenteditable
export function saveSelection(containerEl) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(containerEl);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length; // offset
}

// Восстановление позиции курсора по offset
export function restoreSelection(containerEl, offset) {
    if (offset == null) return;
    let charIndex = 0;
    const range = document.createRange();
    range.setStart(containerEl, 0);
    range.collapse(true);

    const nodeStack = [containerEl];
    let node, found = false;

    while (!found && (node = nodeStack.pop())) {
        if (node.nodeType === 3) { // текстовый узел
            const nextCharIndex = charIndex + node.length;
            if (offset >= charIndex && offset <= nextCharIndex) {
                range.setStart(node, offset - charIndex);
                range.collapse(true);
                found = true;
            }
            charIndex = nextCharIndex;
        } else {
            let i = node.childNodes.length;
            while (i--) {
                nodeStack.push(node.childNodes[i]);
            }
        }
    }

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}
export function showAlert(message, type = 'success') {
    const container = document.getElementById('alertsContainer');
    if (!container) return;

    const icon = el('div', { class: 'alert__icon' },
        el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none' },
            el('path', {
                d: 'm13 13h-2v-6h2zm0 4h-2v-2h2zm-1-15c-1.3 0-2.6.26-3.8.76-1.2.5-2.3 1.24-3.2 2.16-1.87 1.88-2.93 4.42-2.93 7.07 0 2.65 1.06 5.2 2.93 7.07.93.93 2 1.67 3.2 2.17 1.2.5 2.5.76 3.8.76 2.65 0 5.2-1.06 7.07-2.93 1.88-1.87 2.93-4.42 2.93-7.07 0-1.31-.26-2.61-.76-3.83-.5-1.21-1.24-2.31-2.17-3.24-.93-.93-2-1.67-3.24-2.17-1.21-.5-2.51-.76-3.83-.76z'
            })
        )
    );

    const title = el('div', { class: 'alert__title' }, message);

    const closeBtn = el('div', { class: 'alert__close' },
        el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 20, height: 20, viewBox: '0 0 20 20' },
            el('path', { d: 'm15.8 5.34-1.18-1.18-4.65 4.66-4.66-4.66-1.18 1.18 4.66 4.66-4.66 4.66 1.18 1.18 4.66-4.66 4.65 4.66 1.18-1.18-4.65-4.66z' })
        )
    );

    const alertBox = el('div', { class: `alert ${type}` }, icon, title, closeBtn);

    container.append(alertBox);

    // Закрыть по клику
    closeBtn.onclick = () => alertBox.remove();

    // Автоматически убрать через 3 сек
    setTimeout(() => alertBox.remove(), 3000);
}

export function updateVarsBtn() {
    const btn = document.getElementById('varsBtn');
    if (!btn) return;
    const list = Array.isArray(state.ENV?.values) ? state.ENV.values : [];
    const real = list.filter(v => (v?.key?.trim() || v?.value?.trim()));

    const total = real.length;
    const active = real.filter(v => v.enabled !== false && v.value && v.value.trim() !== '').length;

    btn.textContent = `Environment Variables (${active}/${total})`;
}

