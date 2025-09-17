// js/feature.js
import {
   $, el, debounce, showLoader, showAlert,
       saveSelection, restoreSelection, highlightJSON,
       highlightMissingVars, renderUrlWithVars,
       buildKVTable, tableToSimpleArray,
       renderResponse, renderResponseSaved
 } from './ui.js';
import { getGlobalBearer, setGlobalBearer, loadReqState, saveReqState, clearReqState, loadScriptsLegacy } from './config.js';
import { updateAuthUI } from './auth.js';
const renderUrlWithVarsLocal = (u) => renderUrlWithVars(u, state.VARS);

export const state = {
  COLLECTION: null,
  ENV: null,
  VARS: {},
  ITEMS_FLAT: [],
  CURRENT_REQ_ID: null,
  CURRENT_OP_EL: null,
};

// ===== Variables & helpers =====
function stripPrefixFolder(name){
    return String(name||'').replace(/^DriverGateway\s*\/\s*/i,'') || 'No folder';
}
function resolveVars(str, extra={}) {
    if(typeof str!=='string') return str;
    return str.replace(/{{\s*([^}]+)\s*}}/g,(_,k)=>{
        if (extra && extra[k] != null) return extra[k];
        if (state.VARS[k] != null && state.VARS[k] !== '') return state.VARS[k];
        return '';
    });
}
// --- Модал Environment Variables ---
const varsBtn = $('#varsBtn');
const varsModal = $('#varsModal');
const varsCancel = $('#varsCancel');
const varsSave = $('#varsSave');

if (varsBtn && varsModal) {
    varsBtn.addEventListener('click', () => {
        buildVarsTableBody();
        varsModal.hidden = false;
    });
}
if (varsCancel) {
    varsCancel.addEventListener('click', () => {
        varsModal.hidden = true;
    });
}
if (varsSave) {
    varsSave.addEventListener('click', () => {
        const rows = Array.from(document.querySelectorAll('#varsTable tbody tr'));
        const values = rows.map(tr => {
            const keyInp = tr.querySelector('input[data-field="key"]');
            const valInp = tr.querySelector('input[data-field="value"]');
            const chk = tr.querySelector('input[data-field="enabled"]');
            if (!keyInp || !valInp) return null;
            const key = keyInp.value.trim();
            if (!key) return null;
            return {
                key,
                value: valInp.value,
                enabled: chk ? chk.checked : true
            };
        }).filter(Boolean);

        state.ENV.values = values;

        const currentEnv = localStorage.getItem('selected_env') || 'dev';
        try {
            localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
        } catch {}

        buildVarMap();
        highlightMissingVars(document, state.VARS);

        varsModal.hidden = true;
        showAlert('Variables saved', 'success');
    });
}
function normalizeUrl(u){
    if(!u) return ''; if(typeof u==='string') return u;
    let raw = u.raw || '';
    if(!raw){
        const protocol = u.protocol ? u.protocol+'://' : '';
        const host = Array.isArray(u.host) ? u.host.join('.') : (u.host||'');
        const path = Array.isArray(u.path) ? '/'+u.path.join('/') : (u.path||'');
        const query = Array.isArray(u.query) && u.query.length ? '?' + u.query.filter(q=>!q.disabled).map(q=>`${q.key}=${q.value??''}`).join('&') : '';
        raw = protocol + host + path + query;
    }
    return raw;
}
function pathOnly(u){
    if(!u) return '';
    try{
        const full = resolveVars(u);
        const isAbs = /^https?:\/\//i.test(full);
        const urlObj = new URL(isAbs ? full : (location.origin + (full.startsWith('/')?full:'/'+full)));
        return urlObj.pathname || '/';
    }catch{ return String(u).replace(/^https?:\/\/[^/]+/i,'') || '/'; }
}


function buildVarMap(){
    const map = {};
    // переменные из выбранного ENV в памяти
    if (state.ENV && Array.isArray(state.ENV.values)){
        state.ENV.values.forEach(v=>{
            if(!v) return;
            if (v.enabled === false) return;
            const key = v.key ?? v.name;
            const val = (v.currentValue ?? v.value ?? v.initialValue);
            if (key) map[key] = val;
        });
    }

    // переменные из коллекции
    if (state.COLLECTION && Array.isArray(state.COLLECTION.variable)){
        state.COLLECTION.variable.forEach(v=>{
            if(!v) return;
            const key = v.key ?? v.name;
            const val = (v.currentValue ?? v.value ?? v.initialValue);
            if (key && map[key]==null) map[key]=val;
        });
    }
    state.VARS = map;
}
function buildVarsTableBody() {
    const tb = $('#varsTable tbody');
    tb.innerHTML = '';

    let list = Array.isArray(state.ENV?.values) ? state.ENV.values : [];
    if (list.length < 10) {
        list = list.concat(
            Array.from({ length: 10 - list.length }, () => ({ key: '', value: '', enabled: false }))
        );
    }

    list.forEach((v, i) => {
        const tr = document.createElement('tr');
        const key = v.key ?? v.name ?? '';
        const val = v.currentValue ?? v.value ?? '';
        const enabled = v.enabled !== false;

        tr.append(
            el('td', {}, el('input', { value: key, 'data-idx': i, 'data-field': 'key', type: 'text' })),
            el('td', {}, el('input', { value: val, 'data-idx': i, 'data-field': 'value', type: 'text' })),
            el('td', {}, el('input', { type: 'checkbox', checked: enabled, 'data-idx': i, 'data-field': 'enabled' })),
            el('td', {}, el('button', {
                class: 'varRemove',
                title: 'Delete',
                onclick: () => {
                    const keyToRemove = v.key ?? v.name ?? '';
                    state.ENV.values = state.ENV.values.filter(x => x.key !== keyToRemove);

                    const currentEnv = localStorage.getItem('selected_env') || 'dev';
                    try {
                        localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
                    } catch {}

                    buildVarsTableBody();
                    if (typeof updateVarsBtn === 'function') updateVarsBtn();
                }
            }, '✖'))
        );

        tb.append(tr);
    });

    // строка для добавления новых переменных
    const trNew = document.createElement('tr');
    trNew.append(
        el('td', {}, el('input', { 'data-idx': 'new', 'data-field': 'key', placeholder: 'key', type: 'text' })),
        el('td', {}, el('input', { 'data-idx': 'new', 'data-field': 'value', placeholder: 'value', type: 'text' })),
        el('td', {}, el('input', { type: 'checkbox', 'data-idx': 'new', 'data-field': 'enabled', checked: true })),
        el('td', {}, '')
    );
    tb.append(trNew);
}

function flattenItems(node, path=[]){
    if(!node) return;
    if(Array.isArray(node)){ node.forEach(n=>flattenItems(n, path)); return; }
    if(node.item){ const newPath = node.name ? path.concat(stripPrefixFolder(node.name)) : path; node.item.forEach(child=>flattenItems(child, newPath)); return; }
    if(node.request){
        state.ITEMS_FLAT.push({
            id: crypto.randomUUID(),
            path: path.join(' / '),
            name: node.name || '(untitled)',
            request: node.request,
            event: node.event || []
        });
    }

}

function safeBuildUrl(url, queryArr){
    const raw = url || '';
    const [preHash, hashPart=''] = raw.split('#');
    const [base, qStr=''] = preHash.split('?');
    const params = new URLSearchParams(qStr);
    (queryArr||[]).forEach(p => {
        const key = (p.key||'').trim();
        if (!key) return;
        if (p.enabled) {
            params.set(key, resolveVars(String(p.value ?? '')));
        } else {
            params.delete(key);
        }
    });

    const qs = params.toString();
    return base + (qs ? '?' + qs : '') + (hashPart ? '#' + hashPart : '');
}

// ===== Sidebar =====
function setActiveRow(elm){
    if (state.CURRENT_OP_EL) state.CURRENT_OP_EL.classList.remove('active');
    state.CURRENT_OP_EL = elm;
    if (state.CURRENT_OP_EL) state.CURRENT_OP_EL.classList.add('active');
}

function renderTree(filter = '') {
    const tree = $('#tree');
    tree.innerHTML = '';

    const q = (filter || '').toLowerCase();
    const match = s => (s || '').toLowerCase().includes(q);

    const groups = {};
    state.ITEMS_FLAT.forEach(it => {
        const folder = it.path || 'ROOT';
        const urlRaw = normalizeUrl(it.request.url);
        if (q && !(match(it.name) || match(folder) || match(urlRaw))) return;
        (groups[folder] ||= []).push(it);
    });

    Object.entries(groups).forEach(([folder, items]) => {
        const sec = el('div', { class: 'node' });
        sec.append(el('div', { class: 'folder' }, folder === 'ROOT' ? 'No folder' : stripPrefixFolder(folder)));

        items.forEach(it => {
            const urlRaw = normalizeUrl(it.request.url);
            const urlResolved = resolveVars(urlRaw);
            const method = (it.request.method || 'GET').toUpperCase();
            const displayPath = pathOnly(urlResolved || urlRaw);
            const row = el(
                'div',
                { class: 'op ' + method, 'data-req-id': it.id,
                    onclick: (e) => { openRequest(it); setActiveRow(e.currentTarget); },
                    title: (it.name ? it.name + ' • ' : '') + (urlResolved || urlRaw || '') },
                el('div', { class: 'op-method' }, method),
                el('div', { class: 'op-path' }, displayPath || '(no url)')
            );
            sec.append(row);
        });

        tree.append(sec);
    });

    if (!tree.children.length) {
        tree.append(el('div', { class: 'section muted small' }, 'Nothing found'));
    }
}

// ==== Content-Type detection ====
function detectContentType(body){
    const s = (body||'').trim();
    if (!s) return null;
    try{ JSON.parse(s); return 'application/json'; }catch{}
    if (/^[^=\s&]+=[^=&]*(?:&[^=\s&]+=[^=&]*)*$/.test(s)) return 'application/x-www-form-urlencoded';
    if (/^--?[-\w]+/i.test(s) && /content-disposition/i.test(s)) return 'multipart/form-data';
    return null;
}
// ==== scripts sandbox ====
function runUserScript(code, ctx){
    const pm = makePmAdapter(ctx);
    const fn = new Function('ctx', 'pm', `
    "use strict";
    const console = { log: (...a)=> (ctx._logs.push(a.map(String).join(' '))) };
    ${code}
  `);
    fn(ctx, pm);
}

function makePreCtx({method, url, params, headers, body}){
    const ctx = {
        _logs: [], vars: {...state.VARS}, setVar: (k,v)=>{ state.VARS[k]=v; },
        request: { method, url, params: JSON.parse(JSON.stringify(params)), headers: JSON.parse(JSON.stringify(headers)), body },
        setHeader: (k,v)=>{ ctx.request.headers[k]=v; },
        setParam: (k,v)=>{ const p=ctx.request.params.find(x=>x.key===k); if(p) p.value=v; else ctx.request.params.push({key:k,value:v}); },
        setBody: v=>{ ctx.request.body = v; }, setMethod: m=>{ ctx.request.method = String(m||'GET').toUpperCase(); }, setUrl: u=>{ ctx.request.url = String(u||''); },
        log: (...a)=>ctx._logs.push(a.map(String).join(' '))
    };
    return ctx;
}


// ===== Request UI (сокращённо — ядро сохранено) =====
function makePostCtx({request, response, error}){
    const ctx = {
        _logs: [],
        vars: { ...state.VARS },
        request,
        response,
        error: error || null,
        setResponseBody: (text)=>{ if(ctx.response) ctx.response.bodyText = String(text); },
        log: (...a)=>ctx._logs.push(a.map(String).join(' '))
    };
    return ctx;
}
function makePmAdapter(ctx){
    // быстрый доступ/синхронизация переменных окружения
    const setEnv = (key, value) => {
        state.VARS[key] = value;

        // в in-memory ENV
        if (!state.ENV) state.ENV = { values: [] };
        if (!Array.isArray(state.ENV.values)) state.ENV.values = [];
        const row = state.ENV.values.find(v => v.key === key);
        if (row) { row.value = value; row.enabled = true; }
        else { state.ENV.values.push({ key, value, enabled: true }); }

        // пересобираем карту VARS из ENV/collection
        buildVarMap();
    };

    const getEnv = (key) => {
        if (Array.isArray(state.ENV?.values)) {
            const row = state.ENV.values.find(v => v.key === key && v.enabled !== false);
            if (row) return row.value;
        }
        return state.VARS[key];
    };

    const response = {
        code: ctx.response?.status ?? 0,
        text: () => ctx.response?.bodyText ?? '',
        json: () => {
            const t = ctx.response?.bodyText ?? '';
            try { return JSON.parse(t); }
            catch(e){ throw new Error('pm.response.json() parse error: '+e.message); }
        }
    };

    return {
        environment: {
            set: setEnv,
            get: getEnv,
            unset: (key) => {
                if (!Array.isArray(state.ENV?.values)) state.ENV.values = [];
                const idx = state.ENV.values.findIndex(v => v.key === key);
                if (idx >= 0) state.ENV.values.splice(idx, 1);
                delete state.VARS[key];
                buildVarMap();
            }
        },
        variables: { get: getEnv, set: setEnv },
        globals: { get: getEnv, set: setEnv },
        collectionVariables: { get: getEnv, set: setEnv },
        request: ctx.request,
        response
    };
}

function getInitialStateForItem(item, forceDefaults = false) {
    const id = item.id;
    const saved = forceDefaults ? null : loadReqState(id);

    const methodOrig = String(item.request.method || 'GET').toUpperCase();
    const urlRaw     = normalizeUrl(item.request.url);

    const method = (saved?.method || methodOrig).toUpperCase();
    const url    = saved?.url || urlRaw;

    const paramsInit = saved?.params ?? (
        (typeof item.request.url==='object' && Array.isArray(item.request.url.query))
            ? item.request.url.query.map(q=>({key:q.key, value: resolveVars(q.value??''), enabled: q.disabled!==true }))
            : []
    );

    let headersInit = saved?.headers ?? (
        Array.isArray(item.request.header)
            ? item.request.header.map(h=>({key:h.key, value: resolveVars(h.value??''), enabled: h.disabled!==true }))
            : []
    );

    // auto Authorization (если нет сохранённого)
    if (!saved?.headers){
        const bearer = getGlobalBearer();
        if (bearer && !headersInit.some(h=>String(h.key||'').toLowerCase()==='authorization')){
            headersInit.unshift({key:'Authorization', value:'Bearer '+bearer, enabled:true});
        } else if (item.request.auth && item.request.auth.type==='bearer'){
            const token = (item.request.auth.bearer||[]).find(x=>x.key==='token')?.value
                || state.VARS.token || state.VARS.access_token || '';
            if (token && !headersInit.some(h=>String(h.key||'').toLowerCase()==='authorization')){
                headersInit.unshift({key:'Authorization', value:'Bearer '+resolveVars(token), enabled:true});
            }
        }
    }

    let bodyText = saved?.body;
    if (bodyText == null){
        bodyText = item.request.body?.raw != null
            ? (typeof item.request.body.raw === 'string'
                ? item.request.body.raw
                : JSON.stringify(item.request.body.raw, null, 2))
            : '';
    }

    // скрипты (legacy + event)
    let scripts = saved?.scripts ?? loadScriptsLegacy(id);
    if (!scripts || (!scripts.pre && !scripts.post)) {
        scripts = { pre:'', post:'' };
        if (Array.isArray(item.event)) {
            item.event.forEach(ev => {
                if (ev.listen === 'prerequest') {
                    scripts.pre = (ev.script?.exec || []).join('\n');
                } else if (ev.listen === 'test') {
                    scripts.post = (ev.script?.exec || []).join('\n');
                }
            });
        }
    }

    const auth = saved?.auth ?? { type:'bearer', token: '' };

    return {
        method, methodOrig, url,
        paramsInit, headersInit,
        bodyText, scripts, auth,
        response: saved?.response || null
    };
}

// Для краткости: ниже — укороченная версия openRequest, повторно использующая UI-модули
function openRequest(item, forceDefaults = false) {
state.CURRENT_REQ_ID = item.id;

const { method, methodOrig, url, paramsInit, headersInit, bodyText, scripts, auth, response } =
    getInitialStateForItem(item, forceDefaults);

const pane = $('#reqPane');
pane.innerHTML = '';
const card = el('div', { class:'card' });
// === AUTOSAVE ===
const debSave = debounce(()=> {
    const params = tableToSimpleArray(paramsTable.tBodies[0]);
    const headers= tableToSimpleArray(headersTable.tBodies[0]);
    const scriptsNew = { pre: preTA.value, post: postTA.value };
    const authNew = { type: $('#authType').value, token: $('#authTokenInp').value };
    const patch = {
        method: getSelectedMethod(),
        url: $('#urlInp').value,
        params, headers,
        body: $('#bodyRawArea').textContent,
        scripts: scriptsNew,
        auth: authNew
    };
    saveReqState(state.CURRENT_REQ_ID, patch);
}, 180);
// --- URL input / editable display ---
const urlHidden = el('input', {
    id: 'urlInp',
    value: url,
    style:'position:absolute;opacity:0;pointer-events:none;'
});

const urlDisp = el('div', {
    id:'urlInpDisplay',
    class:'urlDisp',
    contenteditable:'true'
});
    urlDisp.innerHTML = renderUrlWithVarsLocal(url);

urlDisp.addEventListener('input', ()=>{
    urlHidden.value = urlDisp.textContent;
    const params = tableToSimpleArray(paramsTable.tBodies[0]);
    urlDisp.innerHTML = renderUrlWithVarsLocal(
        safeBuildUrl($('#urlInp').value.trim(), params)
    );


    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(urlDisp);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    debSave();
});

// Header: Method + URL + Send

const header = el('div', { class: 'reqHeader' },

// --- Method dropdown ---
    (() => {
        const methods = ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
        const colors = {
            GET:    'background: var(--op-get-b); color: var(--op-get-f);',
            POST:   'background: var(--op-post-b); color: var(--op-post-f);',
            PUT:    'background: var(--op-put-b); color: var(--op-put-f);',
            PATCH:  'background: var(--op-patch-b); color: var(--op-patch-f);',
            DELETE: 'background: var(--op-del-b); color: var(--op-del-f);',
            HEAD:   'background: var(--op-other-b); color: var(--op-other-f);',
            OPTIONS:'background: var(--op-other-b); color: var(--op-other-f);'
        };

        // контейнер
        const wrap = el('div', { class: 'methodDropdown' });

        // выбранный метод
        const current = el('div', { class: 'methodCurrent', style: colors[method] }, method);
        wrap.append(current);

        // список
        const list = el('div', { class: 'methodList', style: 'display:none;' });
        methods.forEach(m => {
            const opt = el('div', {
                class: 'methodOption',
                style: colors[m],
                onclick: () => {
                    current.textContent = m;
                    current.setAttribute('style', colors[m]);
                    wrap.dataset.value = m;
                    list.style.display = 'none';
                    debSave(); // при смене сразу сохраняем
                }
            }, m);
            if (m === method) wrap.dataset.value = m;
            list.append(opt);
        });
        wrap.append(list);

        current.onclick = () => {
            list.style.display = (list.style.display==='none' ? 'block' : 'none');
        };

        return wrap;
    })(),

    // --- URL (editable + hidden) ---
    el('div', { class: 'urlWrap' }, urlDisp, urlHidden),

    // --- Send button ---
    el('button', { id: 'sendBtn', class: 'send' }, 'Send')
);


// Tabs (с атрибутом data-method для подсветки underline)
const tabs = el('div', {class:'tabs'},
    el('div', {class:'tab active', id:'tabParams', dataset:{method}}, 'Params'),
    el('div', {class:'tab', id:'tabHeaders', dataset:{method}}, 'Headers'),
    el('div', {class:'tab', id:'tabAuth', dataset:{method}}, 'Authorization'),
    el('div', {class:'tab', id:'tabScripts', dataset:{method}}, 'Scripts')
);

const paramsPane = el('div', {class:'tabPane active', id:'paneParams'});
const headersPane= el('div', {class:'tabPane',        id:'paneHeaders'});
const authPane   = el('div', {class:'tabPane',        id:'paneAuth'});
const scriptsPane= el('div', {class:'tabPane',        id:'paneScripts'});

// Params/Headers
const paramsTable = buildKVTable(paramsInit);
paramsPane.append(el('div', {class:'kvs'}, paramsTable, el('div',{class:'kvHint'},'Add or change query parameters')));

const headersTable = buildKVTable(headersInit);
headersPane.append(el('div', {class:'kvs'}, headersTable, el('div',{class:'kvHint'},'Request headers')));
// update URL
['input','change'].forEach(ev=>{
    paramsPane.addEventListener(ev, () => {
        const params = tableToSimpleArray(paramsTable.tBodies[0]);
        $('#urlInpDisplay').innerHTML = renderUrlWithVarsLocal(
            safeBuildUrl($('#urlInp').value.trim(), params)
        );
    });
});


// Authorization tab
const authTypeSel = el('select', {id:'authType'},
    el('option', {value:'bearer', selected: (auth?.type||'bearer')==='bearer'}, 'Bearer Token')
);
const authTokenInp = el('input', {id:'authTokenInp', value: auth?.token || '', placeholder:'Token value'});
authPane.append(
    el('div', {class:'authRow'}, el('div', {class:'muted'}, 'Auth type'), authTypeSel),
    el('div', {class:'authRow'}, el('div', {class:'muted'}, 'Token'), authTokenInp),
    el('div', {class:'kvHint'}, 'If there is no "Authorization" header, the token will be added automatically (Authorization tab > Global).')
);

// Scripts
const sw = el('div', {class:'scriptsSwitcher'},
    el('button', {id:'btnPre',  class:'active', onclick:()=>switchScript('pre')},  'PRE-Request'),
    el('button', {id:'btnPost', onclick:()=>switchScript('post')}, 'POST-Request')
);
const preTA  = el('textarea', {id:'preScript'},  scripts?.pre || '');
const postTA = el('textarea', {id:'postScript', style:'display:none'}, scripts?.post || '');
const scriptsArea = el('div', {class:'scriptsArea'}, preTA, postTA);
const scriptsPaneInfo = el('div', {class:'small muted', style:'padding:0 12px 12px'}, 'Available: ctx.request (method,url,params,headers,body), ctx.response (status, headers, bodyText)');
scriptsPane.append(sw, scriptsArea, scriptsPaneInfo);

// Body
const bodyWrap = el('div', {class:'reqBodyWrap'});
const bodyToolbar = el('div', {class:'reqBodyToolbar'},
    el('span', {}, 'Request body'),
    el('button', {class:'beautify', id:'beautifyBtn'}, 'Beautify JSON'),
    el('button', {
        class:'clear',
        onclick:()=>{
            const sel = saveSelection(bodyEditor);
            bodyEditor.textContent = '';
            bodyEditor.innerHTML = '';
            restoreSelection(bodyEditor, 0);
            saveReqState(state.CURRENT_REQ_ID, { body: '' });
        }
    }, 'Clear'),
    el('span', {class:'small muted'}, '(Content-Type will be set automatically if missing)')
);

// === Request Body (JSON editor with highlight) ===
const bodyCode = el('pre', { class: 'code-editor reqBody' },
    el('code', {
        id: 'bodyRawArea',
        contenteditable: 'true',
        spellcheck: 'false',
        autocapitalize: 'off',
        autocorrect: 'off'
    }, bodyText || '')
);
bodyWrap.append(bodyToolbar, bodyCode);

const bodyEditor = bodyCode.querySelector('#bodyRawArea');
bodyEditor.innerHTML = highlightJSON(bodyText || '');

// при вводе — обновляем подсветку
bodyEditor.addEventListener('input', (e) => {
    const sel = saveSelection(e.currentTarget);   // запоминаем позицию
    const text = e.currentTarget.textContent;
    e.currentTarget.innerHTML = highlightJSON(text);
    restoreSelection(e.currentTarget, sel);       // восстанавливаем каретку
    debSave();
});

// Actions
const actions = el('div', {class:'actions'});
//const sendBtn = el('button', {class:'send', id:'sendBtn'}, 'Send');
const curlBtn = el('button', {id:'curlBtn'}, 'Copy cURL');
const resetBtn= el('button', {id:'resetBtn', class:'reset', title:'Reset local changes for this request'}, 'Reset to defaults');
actions.append(curlBtn, resetBtn); // ←  sendBtn

// mount card
card.append(header, tabs, paramsPane, headersPane, authPane, scriptsPane, bodyWrap, actions);
pane.append(card);

// подсветка переменных
highlightMissingVars(card, state.VARS);
card.addEventListener('input', () => highlightMissingVars(card, state.VARS));


//  подписки на изменения
['input','change','keyup'].forEach(ev=>{
    header.addEventListener(ev, debSave);
    paramsPane.addEventListener(ev, debSave);
    headersPane.addEventListener(ev, debSave);
    scriptsPane.addEventListener(ev, debSave);
    authPane.addEventListener(ev, debSave);
    bodyWrap.addEventListener(ev, debSave);
});

// --- helpers & handlers (внутри openRequest) ---
function getSelectedMethod(){
    return document.querySelector('.methodDropdown')?.dataset.value || 'GET';
}

function activateTab(name){
    ['Params','Headers','Auth','Scripts'].forEach(t=>{
        $('#tab'+t).classList.toggle('active', t===name);
        $('#pane'+t).classList.toggle('active', t===name);
    });
}
$('#tabParams').onclick = ()=>activateTab('Params');
$('#tabHeaders').onclick= ()=>activateTab('Headers');
$('#tabAuth').onclick   = ()=>activateTab('Auth');
$('#tabScripts').onclick= ()=>activateTab('Scripts');

function switchScript(which){
    $('#btnPre').classList.toggle('active', which==='pre');
    $('#btnPost').classList.toggle('active', which==='post');
    preTA.style.display  = which==='pre' ? '' : 'none';
    postTA.style.display = which==='post'? '' : 'none';
}

// Beautify JSON
$('#beautifyBtn').onclick = ()=>{
    const src = bodyEditor.textContent.trim();
    try{
        const obj = JSON.parse(src);
        const sel = saveSelection(bodyEditor);
        const beautified = JSON.stringify(obj, null, 2);
        bodyEditor.textContent = beautified;
        bodyEditor.innerHTML = highlightJSON(beautified);
        restoreSelection(bodyEditor, sel);
        saveReqState(state.CURRENT_REQ_ID, { body: beautified });
    }catch{
        showAlert('Body is not valid JSON', 'error');
    }
};


// Reset only current request
$('#resetBtn').onclick = ()=>{
    clearReqState(state.CURRENT_REQ_ID);
    openRequest(item);
};


// ==== SEND ====
$('#sendBtn').onclick = async ()=>{
    debSave();
    const params = tableToSimpleArray(paramsTable.tBodies[0]);
    const hdrArr = tableToSimpleArray(headersTable.tBodies[0]).filter(h=>h.enabled!==false);
    let headers  = Object.fromEntries(hdrArr.filter(x=>x.key).map(x=>[x.key, resolveVars(x.value)]));

    let method = getSelectedMethod();
    let finalUrl = resolveVars(
        safeBuildUrl($('#urlInp').value.trim(), params)
    );
    let body = resolveVars($('#bodyRawArea').textContent || '');
    const authType = $('#authType').value;
    const authToken = $('#authTokenInp').value.trim();

    // Inject Authorization if missing
    const hasAuth = Object.keys(headers).some(h=>h.toLowerCase()==='authorization');
    if (!hasAuth){
        if (authType==='bearer' && authToken){
            headers['Authorization'] = 'Bearer ' + authToken;
        } else if (getGlobalBearer()){
            headers['Authorization'] = 'Bearer ' + getGlobalBearer();
        }
    }

    // Auto Content-Type
    if (!Object.keys(headers).some(h=>h.toLowerCase()==='content-type')){
        const ct = detectContentType(body);
        if (ct) headers['Content-Type'] = ct;
    }

    // PRE
    const preCode = preTA.value.trim();
    if (preCode){
        try{
            const ctx = makePreCtx({method, url:finalUrl, params, headers, body});
            runUserScript(preCode, ctx);
            ({method} = ctx.request);
            finalUrl = ctx.request.url;
            headers  = ctx.request.headers;
            body     = ctx.request.body;
        }catch(e){ renderResponse(null, 'PRE error: '+e.message, 0, finalUrl); return; }
    }

    showLoader(true); $('#sendBtn').disabled = true;
    const started = performance.now();
    let res, text;
    try{
        res = await fetch(finalUrl, { method, headers, body: (method==='GET'||method==='HEAD')?undefined:body });
        text = await res.text();
    }catch(e){
        const ms = performance.now()-started;
        renderResponse(null, String(e), ms, finalUrl);
        const postCode = postTA.value.trim();
        if (postCode){
            try{ const ctxPost = makePostCtx({request:{method,url:finalUrl,headers,body}, response:null, error:String(e)}); runUserScript(postCode, ctxPost); }catch(_){}
        }
        saveReqState(state.CURRENT_REQ_ID, { response: { status:0, statusText:'Network error', headers:{}, bodyText:String(e), url:finalUrl, timeMs:ms }});
        showLoader(false); $('#sendBtn').disabled = false;
        return;
    }

    // POST
    const postCode = postTA.value.trim();
    if (postCode){
        try{
            const ctxPost = makePostCtx({
                request:{method,url:finalUrl,headers,body},
                response:{ status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()), bodyText: text }
            });
            runUserScript(postCode, ctxPost);
            if (ctxPost.response && typeof ctxPost.response.bodyText === 'string') text = ctxPost.response.bodyText;
        }catch(e){ /* ignore */ }
    }

    const ms = performance.now()-started;
    renderResponse(res, text, ms, finalUrl);

    const respObj = {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        bodyText: text,
        url: finalUrl,
        timeMs: ms
    };
    saveReqState(state.CURRENT_REQ_ID, { response: respObj });

    showLoader(false); $('#sendBtn').disabled = false;
};

// cURL
$('#curlBtn').onclick = ()=>{
    const m = getSelectedMethod();
    const params = tableToSimpleArray(paramsTable.tBodies[0]);
    const finalUrl = resolveVars(
        safeBuildUrl($('#urlInp').value.trim(), params)
    );
    const hdrsArr = tableToSimpleArray(headersTable.tBodies[0]).filter(h=>h.enabled!==false);
    const hdrs = Object.fromEntries(hdrsArr.map(p=>[p.key, resolveVars(p.value)]));
    const authType = $('#authType').value;
    const authToken = $('#authTokenInp').value.trim();

    if (!Object.keys(hdrs).some(h=>h.toLowerCase()==='authorization')){
        if (authType==='bearer' && authToken) hdrs['Authorization']='Bearer '+authToken;
        else if (getGlobalBearer()) hdrs['Authorization'] = 'Bearer ' + getGlobalBearer();
    }

    if (!Object.keys(hdrs).some(h=>h.toLowerCase()==='content-type')){
        const ct = detectContentType($('#bodyRawArea').textContent || '');
        if (ct) hdrs['Content-Type'] = ct;
    }

    const body = (m==='GET' || m==='HEAD') ? '' : resolveVars($('#bodyRawArea').textContent || '');
    const hdrStr = Object.entries(hdrs).filter(([k])=>k).map(([k,v])=>` -H '${k}: ${String(v).replace(/'/g,"'\\''")}'`).join('');
    const bodyStr = body ? ` --data '${String(body).replace(/'/g,"'\\''")}'` : '';
    const cmd = `curl -X ${m}${hdrStr}${bodyStr} '${finalUrl.replace(/'/g,"'\\''")}'`;
    navigator.clipboard.writeText(cmd);
    showAlert('cURL copied', 'success');
};

// Show saved response if any
if (response){
    renderResponseSaved(response);
} else {
    $('#resPane').innerHTML = '';
}
// logs DELETE
console.log("Events for", item.name, item.event);

}

// ====== Загрузка коллекции/окружения и старт ======
async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function bootApp({ collectionPath, envPath, autoOpenFirst }) {
  const [collection, env] = await Promise.all([
    loadJson(collectionPath),
    loadJson(envPath)
  ]);

    state.COLLECTION = collection;
    state.ENV = env;
    state.ITEMS_FLAT = [];
    flattenItems(collection, []);

// синхронизация ENV → VARS и UI
    buildVarMap();
    renderTree('');
    highlightMissingVars(document, state.VARS);


    // Поиск/фильтр в сайдбаре
  const filterInp = $('#searchInp');
  if (filterInp) {
    const deb = debounce((e) => renderTree(e.target.value || ''), 150);
    filterInp.addEventListener('input', deb);
  }
    // --- Переключение окружения (кастомный dropdown) ---
    const envDropdown = $('#envDropdown');
    if (envDropdown) {
        const envCurrent = envDropdown.querySelector('.envCurrent');
        const envList = envDropdown.querySelector('.envList');
        const arrow = envCurrent.querySelector('.arrow');

        // выставляем дефолт при старте
        let currentEnv = localStorage.getItem('selected_env') || 'dev';
        document.documentElement.setAttribute('data-env', currentEnv);
        envCurrent.innerHTML = currentEnv.toUpperCase() + ' <span class="arrow">▼</span>';
        envCurrent.className = 'envCurrent ' + currentEnv;


        // открыть/закрыть список
        envCurrent.addEventListener('click', () => {
            const isOpen = envList.style.display === 'block';
            envList.style.display = isOpen ? 'none' : 'block';
            envCurrent.querySelector('.arrow').textContent = isOpen ? '▼' : '▲';
        });

        // выбор окружения
        envList.querySelectorAll('.envOption').forEach(opt => {
            opt.addEventListener('click', async () => {
                const envKey = opt.dataset.value; // dev / staging / prod
                let newPath;
                if (envKey === 'dev') newPath = './data/dev_environment.json';
                if (envKey === 'staging') newPath = './data/stage_environment.json';
                if (envKey === 'prod') newPath = './data/prod_environment.json';

                // --- 1. пробуем взять из LS ---
                let savedEnv = null;
                try {
                    const raw = localStorage.getItem(`pm_env_${envKey}`);
                    if (raw) savedEnv = JSON.parse(raw);
                } catch {}

                if (savedEnv && Array.isArray(savedEnv.values)) {
                    // --- 2. если есть кастомное окружение — используем его ---
                    state.ENV = savedEnv;
                } else {
                    // --- 3. иначе пробуем загрузить JSON ---
                    try {
                        const newEnv = await loadJson(newPath);
                        state.ENV = newEnv;
                        localStorage.setItem(`pm_env_${envKey}`, JSON.stringify(newEnv));
                    } catch (err) {
                        showAlert(`Failed to load environment: ${newPath}`, 'error');
                        state.ENV = { values: [] };
                        localStorage.setItem(`pm_env_${envKey}`, JSON.stringify(state.ENV));
                    }
                }

                // --- 4. обновляем LS и UI ---
                localStorage.setItem('selected_env', envKey);

                buildVarMap();
                renderTree('');
                highlightMissingVars(document, state.VARS);

                const varsModal = $('#varsModal');
                if (varsModal && !varsModal.hidden) buildVarsTableBody();

                envCurrent.innerHTML = opt.textContent + ' <span class="arrow">▼</span>';
                envCurrent.className = 'envCurrent ' + envKey;

                envList.style.display = 'none';
                document.documentElement.setAttribute('data-env', envKey);
                showAlert(`Environment switched: ${envKey.toUpperCase()}`, 'success');
            });
        });


        // закрывать при клике вне
        document.addEventListener('click', (e) => {
            if (!envDropdown.contains(e.target)) {
                envList.style.display = 'none';
                envCurrent.querySelector('.arrow').textContent = '▼';
            }
        });
    }



    if (autoOpenFirst && state.ITEMS_FLAT[0]) {
    openRequest(state.ITEMS_FLAT[0]);
    // и можно подсветить активный
    const firstRow = document.querySelector(`.op[data-req-id="${state.ITEMS_FLAT[0].id}"]`);
    if (firstRow) setActiveRow(firstRow);
  }
}
// ====== Reset Local Storage ======
const resetBtn = $('#clearStorageBtn');
const resetModal = $('#resetModal');
const resetCancel = $('#resetCancel');
const resetEnvsAuth = $('#resetEnvsAuth');
const resetFull = $('#resetFull');

if (resetBtn && resetModal) {
    // показать модальное окно
    resetBtn.addEventListener('click', () => {
        resetModal.hidden = false;
    });
}

if (resetCancel) {
    // закрыть без изменений
    resetCancel.addEventListener('click', () => {
        resetModal.hidden = true;
    });
}
if (resetEnvsAuth) {
    // очистить только ENV и токен
    resetEnvsAuth.addEventListener('click', async () => {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('pm_env_') ||
                key === 'selected_env' ||
                key === 'global_bearer') {
                localStorage.removeItem(key);
            }
        });

        // сброс токена через config.js
        setGlobalBearer('');
        updateAuthUI();


        // 👉 чистим и поле в Authorization вкладке
        const authTokenField = document.querySelector('#authTokenInp');
        if (authTokenField) authTokenField.value = '';

        // вернуть DEV по умолчанию
        const envKey = 'dev';
        const defaultPath = './data/dev_environment.json';

        try {
            const defaultEnv = await loadJson(defaultPath);
            state.ENV = defaultEnv;
            localStorage.setItem(`pm_env_${envKey}`, JSON.stringify(defaultEnv));
        } catch (err) {
            state.ENV = { values: [] }; // fallback
            showAlert('Default DEV environment file not found, using empty ENV', 'error');
        }

        state.VARS = {};
        buildVarMap();

        resetModal.hidden = true;
        showAlert('Environments and authorization reset. Default DEV loaded.', 'success');

        localStorage.setItem('selected_env', envKey);
        document.documentElement.setAttribute('data-env', envKey);

        const envCurrent = document.querySelector('#envDropdown .envCurrent');
        if (envCurrent) {
            envCurrent.innerHTML = envKey.toUpperCase() + ' <span class="arrow">▼</span>';
            envCurrent.className = 'envCurrent ' + envKey;
        }

        renderTree('');
        highlightMissingVars(document, state.VARS);
    });
}


if (resetFull) {
    resetFull.addEventListener('click', async () => {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('pm_env_') ||
                key.startsWith('pm_req_') ||
                key === 'selected_env' ||
                key === 'global_bearer') {
                localStorage.removeItem(key);
            }
        });

        // сброс токена правильно
        setGlobalBearer('');

        // 👉 обновляем кнопку Authorize
        updateAuthUI();

        resetModal.hidden = true;
        showAlert('Full reset completed. Please reload the page…', 'success');

        // гарантированная перезагрузка, чтобы подтянулись дефолтные env/collection
        setTimeout(() => location.reload(), 500);
    });
}


