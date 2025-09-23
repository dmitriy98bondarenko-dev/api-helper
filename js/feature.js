// js/feature.js
import {
    $, el, debounce, showLoader, showAlert,
    saveSelection, restoreSelection, highlightJSON,
    highlightMissingVars, renderUrlWithVars,
    buildKVTable, tableToSimpleArray,
    renderResponse, renderResponseSaved
} from './ui.js';
import { getGlobalBearer, loadReqState, saveReqState, clearReqState, loadScriptsLegacy, fetchWithTimeout, clampStr } from './config.js';
import { flattenItems, renderTree, setActiveRow, normalizeUrl } from './sidebar.js';

import { buildVarMap, buildVarsTableBody, initVarsModal, initResetModal, updateVarsBtnCounter, initVarEditModal } from './vars.js';

import { loadJson } from './state.js';
import { state, resolveVars } from './state.js';

const renderUrlWithVarsLocal = (u) => renderUrlWithVars(u, state.VARS);














function safeBuildUrl(url, queryArr){
    const raw = url || '';
    const hashIdx = raw.indexOf('#');
    const [preHash, hashPart] = hashIdx>=0 ? [raw.slice(0,hashIdx), raw.slice(hashIdx+1)] : [raw,''];
    const qIdx = preHash.indexOf('?');
    const base = qIdx>=0 ? preHash.slice(0,qIdx) : preHash;

    const enabled = (queryArr||[]).filter(p => (p?.key||'').trim() && p.enabled!==false);
    const qs = enabled.map(p => {
        const k = encodeURIComponent(p.key.trim());
        const v = resolveVars(String(p.value ?? ''));
        return v==='' ? k : `${k}=${encodeURIComponent(v)}`;
    }).join('&');

    return base + (qs ? `?${qs}` : '') + (hashPart ? `#${hashPart}` : '');
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

// ==== postman scripts ====
function runUserScript(code, ctx){
    const pm = makePmAdapter(ctx);
    try {
        const fn = new Function('ctx', `
            "use strict";
            const pm = arguments[1]; 
            const console = { log: (...a)=> (ctx._logs.push(a.map(String).join(' '))) };
            ${code}
        `);
        fn(ctx, pm);
    } catch (err) {
        console.error("Script execution error:", err);
        ctx._logs.push("Script error: " + err.message);
    }
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
        try {
            const currentEnv = localStorage.getItem('selected_env') || 'dev';
            localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
        } catch {}
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
    const tmpSaved = loadReqState(id);
    const saved = (forceDefaults || !tmpSaved) ? null : tmpSaved;


    const methodOrig = String(item.request.method || 'GET').toUpperCase();
    const urlRaw     = normalizeUrl(item.request.url);

    const method = (saved?.method || methodOrig).toUpperCase();
    const url    = saved?.url || urlRaw;

    const paramsInit = saved?.params ?? (
        (typeof item.request.url==='object' && Array.isArray(item.request.url.query))
            ? item.request.url.query.map(q => ({
                key: q.key,
                value: resolveVars(q.value ?? ''),
                enabled: q.disabled !== true
            }))
            : []
    );

    let headersInit = saved?.headers ?? (
        Array.isArray(item.request.header)
            ? item.request.header.map(h => ({
                key: h.key,
                value: resolveVars(h.value ?? ''),
                enabled: h.disabled !== true
            }))
            : []
    );

    // auto Authorization: всегда актуализируем глобальный токен
    const bearer = getGlobalBearer();
    if (bearer) {
        const idx = headersInit.findIndex(h => String(h.key||'').toLowerCase() === 'authorization');
        if (idx >= 0) {
            headersInit[idx].value = 'Bearer ' + bearer;
            headersInit[idx].enabled = true;
        } else {
            headersInit.unshift({ key: 'Authorization', value: 'Bearer ' + bearer, enabled: true });
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

    // auth:
    const globalToken = getGlobalBearer() || '';
    const auth = saved?.auth ?? { type: 'bearer', token: globalToken };
    if (!auth.token) auth.token = globalToken;

    return {
        method, methodOrig, url,
        paramsInit, headersInit,
        bodyText, scripts, auth,
        response: saved?.response || null
    };
}

function getAuthData() {
    return {
        type: $('#authType').value,
        token: $('#authTokenInp').value.trim()
    };
}

// Для краткости: ниже — укороченная версия openRequest, повторно использующая UI-модули
export function openRequest(item, forceDefaults = false) {
    state.CURRENT_REQ_ID = item.id;

    const { method, url, paramsInit, headersInit, bodyText, scripts, auth, response } =
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
    highlightMissingVars(urlDisp, state.VARS);


    urlDisp.addEventListener('input', () => {
        urlHidden.value = urlDisp.textContent;

        const params = tableToSimpleArray(paramsTable.tBodies[0]);

        // ререндерим URL c токенами
        urlDisp.innerHTML = renderUrlWithVarsLocal(
            safeBuildUrl($('#urlInp').value.trim(), params)
        );

        // (опционально) если хочешь также прогонять общую подсветку по инпутам внутри блока
        // highlightMissingVars(urlDisp, state.VARS);

        // вернуть каретку в конец
        const range = document.createRange();
        range.selectNodeContents(urlDisp);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

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


// Tabs
    const tabs = el('div', {class:'tabsBar'},
        el('div', {class:'tabs'},
            el('div', {class:'tab active', id:'tabParams', dataset:{method}}, 'Params'),
            el('div', {class:'tab', id:'tabHeaders', dataset:{method}}, 'Headers'),
            el('div', {class:'tab', id:'tabAuth', dataset:{method}}, 'Authorization'),
            el('div', {class:'tab', id:'tabScripts', dataset:{method}}, 'Scripts')
        ),
        el('div', {class:'tabsTools'},
            el('button', {id:'curlBtn', class:'btnCurl'}, 'Copy cURL')
        )
    );


    const paramsPane = el('div', {class:'tabPane active', id:'paneParams'});
    const headersPane= el('div', {class:'tabPane',        id:'paneHeaders'});
    const authPane   = el('div', {class:'tabPane',        id:'paneAuth'});
    const scriptsPane= el('div', {class:'tabPane',        id:'paneScripts'});

// Params/Headers
    const paramsTable = buildKVTable(paramsInit, { onChange: debSave });
    paramsPane.append(el('div', {class:'kvs'}, paramsTable));

    const headersTable = buildKVTable(headersInit, { onChange: debSave });
    headersPane.append(el('div', {class:'kvs'}, headersTable));

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
        el('div', {class:'kvHint'}, 'Token from Authorization tab is used for all requests.')
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
                bodyEditor.textContent = '';
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
        })
    );
    bodyWrap.append(bodyToolbar, bodyCode);

    const bodyEditor = bodyCode.querySelector('#bodyRawArea');

    // === Инициализация с подсветкой ===
    // === Инициализация при загрузке ===
    let pretty = bodyText || '';
    try {
        pretty = JSON.stringify(JSON.parse(bodyText), null, 2);
    } catch {}
    bodyEditor.innerHTML = highlightJSON(pretty);

// === При вводе не трогаем HTML ===
    bodyEditor.addEventListener('input', () => {
        const offset = saveSelection(bodyEditor)
        const raw = bodyEditor.textContent;         // 2. взять текст
        const highlighted = highlightJSON(raw);    // 3. подсветить
        bodyEditor.innerHTML = highlighted;        // 4. вставить обратно
        restoreSelection(bodyEditor, offset);      // 5. вернуть курсор

        debSave();
    });


// Actions
    const actions = el('div', {class:'actions'});
    const resetBtn= el('button', {
        id:'resetBtn',
        class:'reset',
        title:'Reset local changes for this request'
    }, 'Reset to defaults');
    actions.append(resetBtn);


// mount card
    card.append(header, tabs, paramsPane, headersPane, authPane, scriptsPane, bodyWrap, actions);
    pane.append(card);

// подсветка переменных
    highlightMissingVars(card, state.VARS);
    card.addEventListener('click', (e) => {
        const t = e.target;
        if (t.classList.contains('var-token')) {
            const key = t.dataset.var || t.textContent.replace(/[{}]/g,'').trim();
            if (key) window.openVarEdit(key);
        }
    });




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
        try {
            const obj = JSON.parse(src);
            const beautified = JSON.stringify(obj, null, 2);

            bodyEditor.textContent = beautified;
            bodyEditor.innerHTML = highlightJSON(beautified);// ✅ чистый текст
            saveReqState(state.CURRENT_REQ_ID, { body: beautified });
        } catch {
            showAlert('Body is not valid JSON', 'error');
        }
    };



// Reset only current request
    $('#resetBtn').onclick = ()=>{
        clearReqState(state.CURRENT_REQ_ID);
        openRequest(item);
    };


// ==== SEND ====
    // ==== SEND (with timeout & safe cleanup) ====
    // ==== SEND (with timeout & safe cleanup) ====
    $('#sendBtn').onclick = async ()=>{
        debSave();

        const cleanup = () => { showLoader(false); $('#sendBtn').disabled = false; };

        const params = tableToSimpleArray(paramsTable.tBodies[0]);
        const hdrArr = tableToSimpleArray(headersTable.tBodies[0]).filter(h=>h.enabled!==false);
        let headers  = Object.fromEntries(hdrArr.filter(x=>x.key).map(x=>[x.key, resolveVars(x.value)]));

        let method = getSelectedMethod();
        let finalUrl = resolveVars(safeBuildUrl($('#urlInp').value.trim(), params));
        let body = resolveVars($('#bodyRawArea').textContent || '');
        const { type: authType, token: authToken } = getAuthData();

        if (!Object.keys(headers).some(h=>h.toLowerCase()==='authorization')){
            if (authType==='bearer' && authToken){
                headers['Authorization'] = 'Bearer ' + authToken;
            } else if (getGlobalBearer()){
                headers['Authorization'] = 'Bearer ' + getGlobalBearer();
            }
        }

        if (!Object.keys(headers).some(h=>h.toLowerCase()==='content-type')){
            const ct = detectContentType(body);
            if (ct) headers['Content-Type'] = ct;
        }

        // PRE scripts
        const preCode = preTA.value.trim();
        if (preCode){
            try{
                const ctx = makePreCtx({method, url:finalUrl, params, headers, body});
                runUserScript(preCode, ctx);
                ({method} = ctx.request);
                finalUrl = ctx.request.url;
                headers  = ctx.request.headers;
                body     = ctx.request.body;
            }catch(e){
                renderResponse(null, 'PRE error: '+e.message, 0, finalUrl);
                return;
            }
        }

        showLoader(true); $('#sendBtn').disabled = true;
        const started = performance.now();

        try {
            let res = await fetchWithTimeout(finalUrl, {
                method,
                headers,
                body: (method==='GET'||method==='HEAD') ? undefined : body
            });
            let text = await res.text();

            // POST scripts
            const postCode = postTA.value.trim();
            if (postCode){
                try {
                    const ctxPost = makePostCtx({
                        request:{method,url:finalUrl,headers,body},
                        response:{ status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()), bodyText: text }
                    });
                    runUserScript(postCode, ctxPost);
                    if (ctxPost.response && typeof ctxPost.response.bodyText === 'string') {
                        text = ctxPost.response.bodyText;
                    }
                } catch(_) {}
            }

            const ms = performance.now() - started;

// если сервер ответил ошибкой (например 503)
            if (!res.ok) {
                showAlert('Request failed', 'error');

                // если пустое тело — подставляем statusText
                if (!text.trim()) {
                    text = res.statusText || 'Error';
                }
            }

// рисуем блок респонза всегда
            renderResponse(res, text, ms, finalUrl);

            const respObj = {
                status: res.status,
                statusText: res.statusText,
                headers: Object.fromEntries(res.headers.entries()),
                bodyText: clampStr(text),
                url: finalUrl,
                timeMs: ms
            };
            saveReqState(state.CURRENT_REQ_ID, { response: respObj });
        } catch(e) {
            const ms = performance.now() - started;
            let errMsg = String(e);
            let statusText = 'Network error';

            if (e && (e.name === 'AbortError' || errMsg.includes('aborted'))) {
                errMsg = 'Request timed out';
                statusText = 'Timeout';
            }
            else if (errMsg.includes('Failed to fetch')) {
                // Сами эмулируем ответ 503
                errMsg = 'Request blocked by CORS or network error';
                statusText = 'Service Unavailable';

                const fakeRes = {
                    ok: false,
                    status: 503,
                    statusText,
                    headers: new Headers(),
                    url: finalUrl
                };

                renderResponse(fakeRes, 'Service Unavailable', ms, finalUrl);

                saveReqState(state.CURRENT_REQ_ID, {
                    response: {
                        status: fakeRes.status,
                        statusText: fakeRes.statusText,
                        headers: {},
                        bodyText: 'Service Unavailable',
                        url: finalUrl,
                        timeMs: ms
                    }
                });

                showAlert('Request failed (CORS/network)', 'error');
                return;
            }


            // показываем короткий алерт
            showAlert('Request failed', 'error');

            // формируем фейковый ответ для блока Response
            const fakeRes = {
                ok: false,
                status: 0,
                statusText,
                headers: new Headers(),
                url: finalUrl
            };

            renderResponse(fakeRes, errMsg, ms, finalUrl);

            // если есть post-script
            const postCode = postTA.value.trim();
            if (postCode){
                try {
                    const ctxPost = makePostCtx({
                        request:{method,url:finalUrl,headers,body},
                        response:{
                            status: fakeRes.status,
                            statusText: fakeRes.statusText,
                            headers: {},
                            bodyText: errMsg
                        },
                        error: errMsg
                    });
                    runUserScript(postCode, ctxPost);
                } catch(_) {}
            }

            saveReqState(state.CURRENT_REQ_ID, {
                response: {
                    status: fakeRes.status,
                    statusText,
                    headers: {},
                    bodyText: errMsg,
                    url: finalUrl,
                    timeMs: ms
                }
            });
            return;
        } finally {
            cleanup();
        }
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
        const authTypeEl = $('#authType');
        const authTokenEl = $('#authTokenInp');
        const authType = authTypeEl.value;
        const authToken = authTokenEl.value.trim();

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

}
function toggleWelcomeCard(show) {
    const card = document.getElementById('welcomeCard');
    if (card) {
        card.hidden = !show;   // проще чем менять display
    }
}

export async function bootApp({ collectionPath, autoOpenFirst }) {
    let collection = null;

    try {
        collection = await loadJson(collectionPath);
    } catch (err) {
        console.error("Failed to load collection", err);
        toggleWelcomeCard(true);   // показать welcome
        return;
    }

    if (!collection || !Array.isArray(collection.item) || !collection.item.length) {
        toggleWelcomeCard(true);   // коллекция пустая → показать welcome
        return;
    }

    // если всё ок, скрываем welcome
    toggleWelcomeCard(false);

    // читаем окружение из LS или ставим dev
    let currentEnv = localStorage.getItem('selected_env') || 'dev';
    let savedEnv = null;

    try {
        const raw = localStorage.getItem(`pm_env_${currentEnv}`);
        if (raw) savedEnv = JSON.parse(raw);
    } catch {}

    let env;
    if (savedEnv && Array.isArray(savedEnv.values)) {
        // если окружение есть в LS → используем
        env = savedEnv;
    } else {
        try {
            if (currentEnv === 'dev') {
                // для dev всегда пытаемся загрузить файл
                env = await loadJson('./data/dev_environment.json');
            } else {
                // для stage/prod файла нет → создаём пустой
                env = { values: [] };
                localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(env));
            }
        } catch {
            env = { values: [] };
        }
    }

    state.COLLECTION = collection;
    state.ENV = env;
    state.ITEMS_FLAT = [];
    flattenItems(collection, []);


// синхронизация ENV → VARS и UI
    buildVarMap();
    updateVarsBtnCounter();
    renderTree('', { onRequestClick: openRequest });

    initVarsModal();
    initResetModal();
    initVarEditModal();
    const urlDispNow = $('#urlInpDisplay');
    if (urlDispNow) {
        const currentRaw = $('#urlInp')?.value?.trim() || '';
        urlDispNow.innerHTML = renderUrlWithVarsLocal(currentRaw);
        highlightMissingVars(urlDispNow, state.VARS); // опционально
    }


    // Поиск/фильтр в сайдбаре
    {
        let filterInp = $('#search');             // основное поле
        if (!filterInp) filterInp = $('#searchInp'); // запасной вариант

        if (filterInp) {
            const applyFilter = () => {
                const v = (filterInp.value || '').trim();
                renderTree(v, { onRequestClick: openRequest });
            };
            const deb = debounce(applyFilter, 150);

            filterInp.addEventListener('input', deb);
            filterInp.addEventListener('change', deb);

            // если в поле уже есть текст, сразу применим фильтр
            if (filterInp.value) applyFilter();
        }
    }
    // --- Переключение окружения (кастомный dropdown) ---
    const envDropdown = $('#envDropdown');
    if (envDropdown) {
        const envCurrent = envDropdown.querySelector('.envCurrent');
        const envList = envDropdown.querySelector('.envList');
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
                renderTree('', { onRequestClick: openRequest });
                highlightMissingVars(document, state.VARS);
                updateVarsBtnCounter();

                const varsModal = $('#varsModal');
                if (varsModal && !varsModal.hidden) buildVarsTableBody();

                envCurrent.innerHTML = opt.textContent + ' <span class="arrow">▼</span>';
                envCurrent.className = 'envCurrent ' + envKey;

                envList.style.display = 'none';
                document.documentElement.setAttribute('data-env', envKey);
                showAlert(`Environment switched: ${envKey.toUpperCase()}`, 'success');
                if (state.CURRENT_REQ_ID) {
                    const item = state.ITEMS_FLAT.find(x => x.id === state.CURRENT_REQ_ID);
                    if (item) openRequest(item, true);
                }
            });
        });


        // закрывать при клике вне
        document.addEventListener('keydown', (e)=>{
            if (e.key==='Escape') {
                envList.style.display = 'none';
                envCurrent.querySelector('.arrow').textContent = '▼';
            }
        });
    }



    if (autoOpenFirst && state.ITEMS_FLAT[0]) {
        // open first request
        openRequest(state.ITEMS_FLAT[0], true); // forceDefaults = true → не подтягивает старый response
        // clear responce
        const resPane = $('#resPane');
        if (resPane) resPane.innerHTML = '';
        // show active
        const firstRow = document.querySelector(`.op[data-req-id="${state.ITEMS_FLAT[0].id}"]`);
        if (firstRow) setActiveRow(firstRow);
    }

    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('pm_req_')) {
            localStorage.removeItem(k);
        }
    });

}