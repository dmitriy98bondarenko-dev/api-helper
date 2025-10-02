// js/ui.js
export const $ = sel => document.querySelector(sel);
import { state } from './state.js';
import { getEnvVarsOnly } from './vars.js';
export const el = (tag, attrs = {}, ...children) => {
    const ns = "http://www.w3.org/2000/svg";

    // svg tags
    const svgTags = ['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g', 'defs', 'clipPath', 'use'];

    const n = svgTags.includes(tag)
        ? document.createElementNS(ns, tag)
        : document.createElement(tag);

    // applying attributes
    Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'class' || k === 'className') {
            if (n instanceof SVGElement) {
                n.setAttribute('class', v);   // svg
            } else {
                n.className = v;              // html
            }
        }
        else if (k === 'dataset') {
            Object.entries(v).forEach(([dk, dv]) => n.dataset[dk] = dv);
        } else if (k.startsWith('on') && typeof v === 'function') {
            n.addEventListener(k.slice(2), v);
        } else {
            n.setAttribute(k, v);
        }
    });

    // adding children
    children.forEach(c => {
        if (c) n.append(c);
    });

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


// applies theme
export function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('ui_theme', t);
    const sw = $('#themeToggleSwitch');
    if (sw) sw.checked = (t === 'dark');
}

// theme toggle
export function initTheme() {
    const sw = $('#themeToggleSwitch');

    // take default from localStorage
    let saved = localStorage.getItem('ui_theme');

    if (!saved) {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            saved = 'dark';
        } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            saved = 'light';
        } else {
            saved = 'dark'; //default
        }
    }

    applyTheme(saved);

    // manual shifting theme
    sw?.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        applyTheme(newTheme);
    });

    // if the user hasnt set
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function systemChange(e) {
        const userPref = localStorage.getItem('ui_theme');
        if (!userPref) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    }

    if (mq.addEventListener) {
        mq.addEventListener('change', systemChange); // chrome, FF, Safari 14+
    } else if (mq.addListener) {
        mq.addListener(systemChange); // safari <14
    }
}
export function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
}

// highlight variables
export function highlightMissingVars(rootEl, varsMap) {
    const regex = /{{\s*([^}]+)\s*}}/g;

    // highlight inputs
    rootEl.querySelectorAll('input, textarea').forEach(inp => {
        const val = inp.value || '';
        let missing = false;
        val.replace(regex, (_, key) => {
            const hasVal = varsMap && key in varsMap && String(varsMap[key]).trim() !== '';
            if (!hasVal) missing = true;
        });
        inp.classList.toggle('var-missing', missing);
    });

    // highlight tokens {{var}} in text
    rootEl.querySelectorAll('.var-token').forEach(span => {
        const key = (span.dataset.var || span.textContent.replace(/[{}]/g, '').trim()).trim();
        const val = (varsMap && key in varsMap && String(varsMap[key]).trim() !== '')
            ? String(varsMap[key]).trim()
            : '';

        span.classList.toggle('missing', !val);
        span.classList.toggle('filled', !!val);
        span.setAttribute('title', val || '(not set)');
    });
}


// render tokens {{var}} in url
export function renderUrlWithVars(url, varsMap) {
  const regex = /{{\s*([^}]+)\s*}}/g;
  return String(url || '').replace(regex, (_, key) => {
    const val = varsMap ? varsMap[key] : undefined;
    const missing = !val;
    return `<span class="var-token ${missing ? 'missing' : 'filled'}" data-var="${key}" title="${val || '(not set)'}">{{${key}}}</span>`;
  });
}

// tables KV (Params/Headers)
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

export function appendRow(tb, row = {}, isNew = false, onChange) {
    const tr = el('tr');


    const cb = el('input', {
        type: 'checkbox',
        'data-field': 'enabled',
    });
    cb.checked = row.enabled === true;

    const keyInp = el('input', {
        value: row.key ?? '',
        'data-field': 'key',
        placeholder: isNew ? 'key' : ''
    });

    const valCell = el('div', {
        class: 'kvValue code-editor',
        contenteditable: 'true',
        'data-field': 'value',
        spellcheck: 'false'
    });

// initial variable highlighting
    const rawVal = String(row.value ?? '');

// if var has render highlight
    if (/{{\s*[^}]+\s*}}/.test(rawVal)) {
        valCell.innerHTML = renderUrlWithVars(rawVal, getEnvVarsOnly());
        highlightMissingVars(valCell, getEnvVarsOnly());
    } else {
        // or just set text
        valCell.textContent = rawVal;
    }


// sync with row
    Object.defineProperty(valCell, 'value', {
        get() { return valCell.textContent; },
        set(v) {
            valCell.textContent = v;
            row.value = v;
            highlightMissingVars(valCell, getEnvVarsOnly());
        }
    });

// events
    valCell.addEventListener('input', () => {
        const text = valCell.textContent;
        row.value = text;

        if (/{{\s*[^}]+\s*}}/.test(text)) {
            valCell.innerHTML = renderUrlWithVars(text, getEnvVarsOnly());
        }
        highlightMissingVars(valCell, getEnvVarsOnly());
        onChange && onChange();
    });


// open modal by tap on varName
    valCell.addEventListener('click', (e) => {
        const t = e.target.closest('.var-token');
        if (t && window.openVarEdit) {
            const key = t.dataset.var || t.textContent.replace(/[{}]/g,'').trim();
            if (key) window.openVarEdit(key);
        }
    });

    const removeBtn = el('button', {
        class: 'clearPinsBtn',
        title: 'Delete row',
        onclick: () => {
            tr.remove();
            onChange && onChange();
            const pane = tb.closest('#paneParams');
            if (pane) {
                pane.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }, '✖');



    tr.append(
        el('td', { class: 'kvOn' }, el('div', { class: 'cell' }, cb)),
        el('td', {}, el('div', { class: 'cell' }, keyInp)),
        el('td', {}, el('div', { class: 'cell' }, valCell)),
        el('td', {}, el('div', { class: 'cell' }, removeBtn))
    );

    tb.append(tr);

    function keyValFilled() {
        return keyInp.value.trim().length > 0 && valCell.value.trim().length > 0;
    }


    keyInp.addEventListener('input', () => onChange && onChange());
    valCell.addEventListener('input', () => onChange && onChange());
    cb.addEventListener('change', () => onChange && onChange());
}

export function addNewRow(tb, onChange) {
    const trNew = el('tr');

    const cbNew = el('input', {
        type: 'checkbox',
        'data-field': 'enabled',
        checked: false
    });

    const keyNew = el('input', { 'data-field': 'key', placeholder: 'key' });
    const valNew = el('input', { 'data-field': 'value', placeholder: 'value' });

    const onInput = () => {
        const keyFilled = keyNew.value.trim().length > 0;
        const valFilled = valNew.value.trim().length > 0;

        cbNew.checked = keyFilled && valFilled;
        if (cbNew.checked && trNew === tb.lastElementChild) {
            addNewRow(tb, onChange);
        }
        onChange && onChange();
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
      const valEl = tr.querySelector('[data-field="value"]');
      const val = valEl?.value ?? valEl?.textContent ?? '';
    const en = tr.querySelector('input[data-field="enabled"]')?.checked;
    if (key || val) out.push({ key, value: val, enabled: !!en });
  });
  return out;
}
// response rendering

export function escapeHtml(text='') {
    return String(text)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

// highlight json
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

// toolbar with copy btns
function buildRespTools(bodyText) {
    const fieldInp = el('input', {
        id: 'copyFieldInp',
        class: 'copyFieldInp',
        placeholder: 'Field to copy (e.g., access_token)'
    });

    const copyFieldBtn = el('button', {
        id: 'copyFieldBtn',
        class: 'respBtn',
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
    }, el('span', { class: 'respBtnText' }, 'Copy field')
    );

    const copyBodyBtn = el('button', {
        id: 'copyBodyBtn',
        class: 'respBtn',
        onclick: () => {
            navigator.clipboard.writeText(bodyText || '');
            showAlert('Body copied', 'success');
        }
    }, el('span', { class: 'respBtnText' }, 'Copy body')
    );

    const copyAllBtn = el('button', {
        id: 'copyAllBtn',
        class: 'respBtn',
        onclick: () => {
            const text = document.querySelector('#resPane pre.body')?.innerText || '';
            navigator.clipboard.writeText(text);
            showAlert('All response copied', 'success');
        }
    }, el('span', { class: 'respBtnText' }, 'Copy all')
    );

    return el('div', { class: 'respToolsWrap' },
        el('div', { class: 'respTools' },
            fieldInp,
            copyFieldBtn,
            copyBodyBtn,
            copyAllBtn
        )
    );

}

// response rendering
export function renderResponse(res, text, ms, url) {
    const pane = document.querySelector('#resPane');
    if (!pane) return;
    pane.innerHTML = '';

    if (!res) {
        pane.append(el('div', { class: 'error' }, text || 'No response'));
        return;
    }

    // title of card
    const title = el('div', { class: 'respTitle' }, 'Response');

    // header with status +time
    const header = el('div', { class: 'respHeader' },
        el('span', { class: 'statusPill ' + (res.status >= 200 && res.status < 300 ? 'ok' : 'err') }, res.status),
        el('span', { class: 'respMeta' }, `${ms.toFixed(0)} ms`),
        el('span', { class: 'respUrl' },
            el('span', { class: 'respUrlText' }, url || '')
        )
    );

    // response body
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

    const bodyWrap = el('div', { class: 'respBodyWrap' }, bodyPre);


    // headers
    const headersList = Object.entries(res.headers ? Object.fromEntries(res.headers) : {})
        .map(([k, v]) => `${k}: ${v}`).join('\n');
    const headersPre = el(
        'pre',
        { id: 'respHeadersArea'},
        headersList || '— no headers —'
    );
    //  auth
    const authTokenResp = extractBearer(res, text);
    const sentToken = state.LAST_REQ_HEADERS?.Authorization || state.LAST_REQ_HEADERS?.authorization;

    let authContent = [];
    if (sentToken) {
        authContent.push(
            el('div', { class: 'muted' }, 'Sent Authorization:'),
            el('pre', { class: 'auth' }, sentToken)
        );
    }
    if (authTokenResp) {
        authContent.push(
            el('div', { class: 'muted', style: 'margin-top:8px' }, 'Response Authentication:'),
            el('pre', { class: 'auth' }, authTokenResp)
        );
    }
    if (authContent.length === 0) {
        authContent.push(el('div', {}, '— no token —'));
    }


    //  tools
    const tools = buildRespTools(pretty);

    // tabs
    const tabs = el('div', { class: 'tabs' },
        el('div', { class: 'tab active', dataset: { tab: 'body' }, onclick: () => switchTab('body') }, 'Body'),
        el('div', { class: 'tab', dataset: { tab: 'headers' }, onclick: () => switchTab('headers') }, 'Headers'),
        el('div', { class: 'tab', dataset: { tab: 'auth' }, onclick: () => switchTab('auth') }, 'Authentication'),
        el('div', { class: 'tab', dataset: { tab: 'logs' }, onclick: () => switchTab('logs') }, 'Logs')
    );

    const tabPanes = el('div', { class: 'tabPanes' },
        el('div', { class: 'tabPane active', id: 'tab-body' }, tools, bodyWrap),
        el('div', { class: 'tabPane', id: 'tab-headers' }, headersPre),
        el('div', { class: 'tabPane', id: 'tab-auth' }, ...authContent),
        el('div', { class: 'tabPane', id: 'tab-logs' },
            el('pre', { id: 'respLogsArea', class: 'logsArea' })
        )
    );

    // response card
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
        if (tab === 'logs') renderLogs();
    }
}

// extract bearer
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

    //title of card
    const title = el('div', { class: 'respTitle' }, 'Response');

    // header
    const header = el('div', { class: 'respHeader' },
        el('span', { class: 'statusPill ' + (saved.status >= 200 && saved.status < 300 ? 'ok' : 'err') }, saved.status),
        el('span', { class: 'respMeta' }, `${saved.timeMs.toFixed(0)} ms`),
        el('span', { class: 'respUrl' }, saved.url || '')
    );

    // body
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

    // headers
    const headersList = Object.entries(saved.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    const headersPre = el(
        'pre',
        { id: 'respHeadersArea', class: 'headers' },
        headersList || '— no headers —'
    );

    const tools = buildRespTools(pretty);

    //tabs
    const tabs = el('div', { class: 'tabs' },
        el('div', { class: 'tab active', dataset: { tab: 'body' }, onclick: () => switchTab('body') }, 'Body'),
        el('div', { class: 'tab', dataset: { tab: 'headers' }, onclick: () => switchTab('headers') }, 'Headers'),
        el('div', { class: 'tab', dataset: { tab: 'auth' }, onclick: () => switchTab('auth') }, 'Authentication'),
        el('div', { class: 'tab', dataset: { tab: 'logs' }, onclick: () => switchTab('logs') }, 'Logs')
    );


    const authPre = el('pre', {id: 'tab-auth', class: 'auth' }, '— no token —');


    const tabPanes = el('div', { class: 'tabPanes' },
        el('div', { class: 'tabPane active', id: 'tab-body' }, tools, bodyPre),
        el('div', { class: 'tabPane', id: 'tab-headers' }, headersPre),
        el('div', { class: 'tabPane', id: 'tab-auth' }, el('pre', { class: 'auth' }, '— no token —')),
        el('div', { class: 'tabPane', id: 'tab-logs' },
            el('pre', { id: 'respLogsArea', class: 'logsArea' })
        )
    );

    const card = el('div', { class: 'respCard' },
        title, header, tabs, tabPanes
    );

    pane.append(card);

    function switchTab(tab) {
        pane.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        pane.querySelectorAll('.tabPane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    }
}
export function highlightJSON(text) {
    if (!text) return "";

    let html = String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // key
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
    html = html.replace(
        /"([^"]*?)"/g,
        (match, value) => {
            // if it var
            if (value.startsWith("{{") && value.endsWith("}}")) {
                const varName = value.replace(/[{}]/g, "");
                return `"<span class="var-token" data-var="${varName}">{{${varName}}}</span>"`;
            }
            return `<span class="json-string">"${value}"</span>`;
        }
    );

    // numbers
    html = html.replace(
        /\b(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+\-]?\d+)?)\b/g,
        '<span data-json="number">$1</span>'
    );

    // true false null
    html = html.replace(/\b(true|false)\b/g, '<span data-json="boolean">$1</span>');
    html = html.replace(/\b(null)\b/g, '<span data-json="null">$1</span>');

    // vars
    html = html.replace(/{{\s*([^}]+)\s*}}/g, (_, key) => {
        const k = key.trim();
        const envVal = (state.ENV?.values || []).find(v => v.key === k && v.enabled !== false);
        const val = envVal ? String(envVal.value || '').trim() : '';

        const title = (val || '(not set)').replace(/"/g, '&quot;');
        return `<span class="var-token ${val ? 'filled' : 'missing'}" data-var="${k}" title="${title}">{{${k}}}</span>`;
    });


    return html;
}

// save position of cursor
export function saveSelection(containerEl) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(containerEl);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length; // offset
}

// restoring the cursor position
export function restoreSelection(containerEl, offset) {
    if (offset == null) return;
    let charIndex = 0;
    const range = document.createRange();
    range.setStart(containerEl, 0);
    range.collapse(true);

    const nodeStack = [containerEl];
    let node, found = false;

    while (!found && (node = nodeStack.pop())) {
        if (node.nodeType === 3) { // text node
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
        el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 24, height: 24, viewBox: '0 0 24 24' },
            el('path', {
                d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15h-1v-6h2v6h-1zm0-8h-1V7h2v2h-1z',
                fill: '#fff'
            })
        )
    );

    const title = el('div', { class: 'alert__title' }, message);

    const closeBtn = el('div', { class: 'alert__close' },
        el('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 20, height: 20, viewBox: '0 0 20 20', fill: 'currentColor' },
            el('path', {
                d: 'm15.8 5.34-1.18-1.18-4.65 4.66-4.66-4.66-1.18 1.18 4.66 4.66-4.66 4.66 1.18 1.18 4.66-4.66 4.65 4.66 1.18-1.18-4.65-4.66z',
                fill: '#fff'
            })
        )
    );

    const alertBox = el('div', { class: `alert ${type}` }, icon, title, closeBtn);

    container.append(alertBox);

    // close alert
    closeBtn.onclick = () => alertBox.remove();

    // remove after 3 seconds
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

const searchInput = document.getElementById('search');
const clearBtn = document.getElementById('clearSearch');
if (searchInput && clearBtn) {
    searchInput.addEventListener('input', () => {
        clearBtn.style.display = searchInput.value ? 'block' : 'none';
    });
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        searchInput.focus();
        const event = new Event('input');
        searchInput.dispatchEvent(event);
    });
}

export function renderLogs(){
    const logsArea = document.getElementById('respLogsArea');
    if (!logsArea) return;
    logsArea.textContent = (state.LOGS || []).join("\n");
}

export function showScriptLoader(on, message = 'Running pre-request script...') {
    let el = document.getElementById('scriptLoader');
    if (!el) {
        el = document.createElement('div');
        el.id = 'scriptLoader';
        el.className = 'script-loader';
        el.style.position = 'fixed';
        el.style.top = '10px';
        el.style.right = '10px';
        el.style.padding = '8px 12px';
        el.style.background = 'rgba(0,0,0,0.75)';
        el.style.color = '#fff';
        el.style.borderRadius = '6px';
        el.style.fontSize = '13px';
        el.style.zIndex = '9999';
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = !on;
}
export function refreshAuthVars() {
    const authTokenInp = document.getElementById('authTokenInp');
    if (authTokenInp) {
        highlightMissingVars(authTokenInp, getEnvVarsOnly());
    }
}
