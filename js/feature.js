// js/feature.js
import {
    $, el, debounce, showLoader, showAlert,
    saveSelection, restoreSelection, highlightJSON,
    highlightMissingVars, renderUrlWithVars,
    buildKVTable, tableToSimpleArray,
    renderResponse, renderResponseSaved, renderLogs, showScriptLoader, refreshAuthVars
} from './ui.js';
import {
    getGlobalBearer, loadReqState, saveReqState,
    clearReqState, loadScriptsLegacy,
    fetchWithTimeout, clampStr, getVal, getSelectedCollection, setSelectedCollection, initEnvDropdown
} from './config.js';
import {
    flattenItems, renderTree,
    setActiveRow, normalizeUrl
} from './sidebar.js';
import { initHotkeys } from './hotkeys.js';
import {
    buildVarMap, buildVarsTableBody, initVarsModal,
    initResetModal, updateVarsBtnCounter, initVarEditModal,
    toggleVarsModal, getEnvVarsOnly
} from './vars.js';
import {clearScript, loadJson, loadScript, saveScript} from './state.js';
import { state, resolveVars } from './state.js';
import { initSidebarNav, addHistoryEntry, renderHistory } from './history.js';
import { copyCurl, safeBuildUrl, openCurlImportModal } from './curl.js';
import {
    selectNextRequest, selectPrevRequest,
    focusSidebar, setOnRequestOpen,togglePinCurrent
} from './sidebar.js';
import {
    detectContentType,
    runUserScript,
    makePreCtx,
    makePostCtx
} from './scriptEngine.js';
import {initSettingsSidebar} from "./settings.js";
import {clearTimePickerState, initTimePicker, initCalendarVisibility} from "./timePicker.js";
const renderUrlWithVarsLocal = (u) => renderUrlWithVars(u, getEnvVarsOnly());
// dataPicker element
const timeGroupEl = document.querySelector('#timeContainer .timeGroup');
const dropdownEl = document.getElementById('timeDropdown');
const calendarEl = document.getElementById('calendarPopup');
if (dropdownEl) dropdownEl.classList.add('hidden');
if (calendarEl) calendarEl.classList.add('hidden');


// helpers needAuth
function getNeedAuthFromEnvOrCollection() {
    const row = (state.ENV?.values || []).find(v => v.key === 'needAuth' && v.enabled !== false);
    if (row) return String(row.value);
    return String(state.COLLECTION_VARS?.needAuth ?? '');
}

function setNeedAuthInEnv(value) {
    if (!state.ENV) state.ENV = { values: [] };
    if (!Array.isArray(state.ENV.values)) state.ENV.values = [];
    let row = state.ENV.values.find(v => v.key === 'needAuth');
    if (row) {
        row.value = String(value);
        row.enabled = true;
    } else {
        state.ENV.values.push({ key: 'needAuth', value: String(value), enabled: true });
    }
    try {
        const currentEnv = localStorage.getItem('selected_env') || 'dev';
        localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
    } catch {}
}


function getInitialStateForItem(item, forceDefaults = false) {
    const id = item.id;
    const tmpSaved = loadReqState(id);
    const saved = (!tmpSaved || forceDefaults) ? {} : tmpSaved;


    const methodOrig = String(item.request.method || 'GET').toUpperCase();
    const urlRaw     = normalizeUrl(item.request.url);

    const method = (saved?.method || methodOrig).toUpperCase();
    const url    = saved?.url || urlRaw;

    const paramsInit = saved?.params ?? (
        (typeof item.request.url === 'object' && Array.isArray(item.request.url.query))
            ? item.request.url.query.map(q => ({
                key: q.key,
                value: String(q.value ?? ''),
                enabled: q.disabled === true ? false : true
            }))
            : []
    );


    let headersInit = saved?.headers ?? (
        Array.isArray(item.request.header)
            ? item.request.header.map(h => ({
                key: h.key,
                value: String(h.value ?? ''),
                enabled: h.disabled === true ? false : true
            }))
            : []
    );


    // auto authorization
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
// build scripts only for request level
    let preArr = [], postArr = [];

// default collection scripts
    if (Array.isArray(item.event)) {
        item.event.forEach(ev => {
            const code = (ev.script?.exec || []).join('\n');
            if (ev.listen === 'prerequest' && code) preArr.push(code);
            if (ev.listen === 'test'       && code) postArr.push(code);
        });
    }

    const requestDefaults = {
        pre:  preArr.join('\n'),
        post: postArr.join('\n')
    };

// if has saved або legacy use saved if exists, else use defaults
    const savedScripts = saved?.scripts ?? loadScriptsLegacy(id);
    const scripts = {
        pre:  (savedScripts && typeof savedScripts.pre  === 'string') ? savedScripts.pre  : requestDefaults.pre,
        post: (savedScripts && typeof savedScripts.post === 'string') ? savedScripts.post : requestDefaults.post
    };



    const extraScripts = { pre: '', post: '' };

// adding collection / folder to extraScripts
    //if (state.COLLECTION_SCRIPTS?.pre)  extraScripts.pre += state.COLLECTION_SCRIPTS.pre.trim() + '\n';
    if (state.COLLECTION_SCRIPTS?.post) extraScripts.post += state.COLLECTION_SCRIPTS.post.trim() + '\n';

    if (item.folderEvents && item.folderEvents.length) {
        item.folderEvents.forEach(ev => {
            const code = (ev.script?.exec || []).join('\n');
            if (ev.listen === 'prerequest' && code) extraScripts.pre += code + '\n';
            if (ev.listen === 'test'       && code) extraScripts.post += code + '\n';
        });
    }


    // auth
    let reqAuthType  = item?.request?.auth?.type || '';
    let reqAuthToken = '';

    if (reqAuthType === 'bearer') {
        const arr = Array.isArray(item.request.auth.bearer) ? item.request.auth.bearer : [];
        const rec = arr.find(x => x.key === 'token') || arr[0];
        reqAuthToken = String(rec?.value ?? '');
    }

    const globalToken = getGlobalBearer() || '';
    let auth =
        (saved?.auth && (saved.auth.type || saved.auth.token)) ? saved.auth :
            (reqAuthType ? { type: reqAuthType, token: reqAuthToken } :
                { type: 'bearer', token: globalToken });

    if (!auth.token) auth.token = (reqAuthToken || globalToken);

    return {
        method, methodOrig, url,
        paramsInit, headersInit,
        bodyText, scripts, auth,
        response: saved.response || null,
        extraScripts
    };
}

function getAuthData() {
    const type = $('#authType')?.value || 'bearer';
    const token = $('#authTokenInp')?.textContent.trim() || '';
    return { type, token };
}


// build request from item
export function openRequest(item, forceDefaults = false) {
    state.CURRENT_REQ_ID = item.id;

    const { method, url, paramsInit, headersInit, bodyText, scripts, auth, response, extraScripts } =
        getInitialStateForItem(item, forceDefaults);

    // load pre/post scripts from localStorage if exists
    scripts.pre = loadScript('pre', item.id, scripts.pre);
    scripts.post = loadScript('post', item.id, scripts.post);

    const pane = $('#reqPane');
    const dropdown = document.getElementById('timeDropdown');
    const calendar = document.getElementById('calendarModal');
    const timeToggle = document.getElementById("timeToggle");
    const oldSendGroup = pane.querySelector('.sendGroup');
    if (oldSendGroup && timeToggle && oldSendGroup.contains(timeToggle)) {
        oldSendGroup.removeChild(timeToggle);
    }
    pane.innerHTML = '';
    if (dropdown && !document.body.contains(dropdown)) document.body.appendChild(dropdown);
    const card = el('div', { class:'card' });
// autosave
    const debSave = debounce(()=> {
        const params = tableToSimpleArray(paramsTable.tBodies[0]);
        const headers= tableToSimpleArray(headersTable.tBodies[0]);
        const scriptsNew = { pre: preTA.value, post: postTA.value };
        const authNew = {
            type: $('#authType').value,
            token: ($('#authTokenInp')?.textContent || '').trim()
        };

        // do not save if scripts are default
        const isScriptsDefault =
            (scriptsNew.pre  || '').trim() === (scripts.pre  || '').trim() &&
            (scriptsNew.post || '').trim() === (scripts.post || '').trim();

        const patch = {
            method: getSelectedMethod(),
            url: $('#urlInp').value,
            params, headers,
            body: $('#bodyRawArea').textContent,
            scripts: isScriptsDefault ? undefined : scriptsNew,
            auth: authNew
        };
        saveReqState(state.CURRENT_REQ_ID, patch);
    }, 180);

// URL editable input
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
    highlightMissingVars(urlDisp, getEnvVarsOnly());


    urlDisp.addEventListener('input', () => {
        urlHidden.value = urlDisp.textContent;

        const params = tableToSimpleArray(paramsTable.tBodies[0]);

        // render URL
        urlDisp.innerHTML = renderUrlWithVarsLocal(
            safeBuildUrl($('#urlInp').value.trim(), params)
        );

        // highlightMissingVars(urlDisp, state.VARS);

        const range = document.createRange();
        range.selectNodeContents(urlDisp);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        debSave();
    });

    // send button + curl dropdown
    const sendGroup = el('div', { class: 'sendGroup' },
        el('button', { id: 'sendBtn', class: 'sendMain' }, 'Send'),
        el('button', { id: 'sendDropdownBtn', class: 'sendDropdown' },
            el('span', { class: 'arrow' }, '▼')
        ),
        el('div', { id: 'sendMenu', class: 'sendMenu', style: 'display:none;' },
            el('div', {
                class: 'sendMenuItem',
                onclick: () => {
                    copyCurl(paramsTable, headersTable, getSelectedMethod);
                    hideSendMenu();
                }
            }, 'Copy cURL')
            /*el('div', {
                class: 'sendMenuItem',
                onclick: () => {
                    openCurlImportModal();
                    hideSendMenu();
                }
            }, 'Import cURL')*/
        ),

    );
    // time picker
    if (timeToggle && sendGroup) {
        import('./timePicker.js').then(({ initCalendarVisibility, initTimePicker }) => {
            // get pre-script from active request
            const activeReq = state.ITEMS_FLAT?.find(r => r.id === state.CURRENT_REQ_ID);
            const preScript =
                activeReq?.event?.find(e => e.listen === 'prerequest')?.script?.exec?.join('\n') || '';

            // init visibility of calendar
            initCalendarVisibility(timeToggle, sendGroup);

            // init time picker
            initTimePicker(state.CURRENT_REQ_ID, preScript);
        });
    }

    const sendBtn = sendGroup.querySelector('#sendBtn');

    function validateUrlInput() {
        const urlVal = ($('#urlInp').value || '').trim();

    }

// listening changes in URL
    urlDisp.addEventListener('input', validateUrlInput);
    function showUrlError() {
        const disp = $('#urlInpDisplay');
        if (!disp) return;

        disp.classList.add('url-error');
        disp.setAttribute('title', 'URL cannot be empty');

        // delay to show error
        setTimeout(() => {
            disp.classList.remove('url-error');
            disp.removeAttribute('title');
        }, 3000);
    }


    const sendBtn = sendGroup.querySelector('#sendBtn');

    function validateUrlInput() {
        const urlVal = ($('#urlInp').value || '').trim();

    }

// listening changes in URL
    urlDisp.addEventListener('input', validateUrlInput);
    function showUrlError() {
        const disp = $('#urlInpDisplay');
        if (!disp) return;

        disp.classList.add('url-error');
        disp.setAttribute('title', 'URL cannot be empty');

        // delay to show error
        setTimeout(() => {
            disp.classList.remove('url-error');
            disp.removeAttribute('title');
        }, 3000);
    }


// header method + URL +button send

    const header = el('div', { class: 'reqHeader' },

//  method dropdown
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

            const wrap = el('div', { class: 'methodDropdown' });

            // selected method
            const current = el('div', { class: 'methodCurrent', style: colors[method] },
                method + ' ',
                el('span', { class: 'methodArrow' }, '▼')
            );
            wrap.append(current);

            // list
            const list = el('div', { class: 'methodList', style: 'display:none;' });
            methods.forEach(m => {
                const opt = el('div', {
                    class: 'methodOption',
                    style: colors[m],
                    onclick: () => {
                        // update method text
                        current.childNodes[0].textContent = m + ' ';
                        current.setAttribute('style', colors[m]);
                        wrap.dataset.value = m;
                        list.style.display = 'none';

                        // reset arrow
                        current.querySelector('.methodArrow').textContent = '▼';

                        debSave();
                    }
                }, m);
                if (m === method) wrap.dataset.value = m;
                list.append(opt);
            });
            wrap.append(list);

            current.onclick = () => {
                const isOpen = list.style.display === 'block';
                list.style.display = isOpen ? 'none' : 'block';
                current.querySelector('.methodArrow').textContent = isOpen ? '▼' : '▲';
            };

            return wrap;
        })(),

        // url
        el('div', { class: 'urlWrap' }, urlDisp, urlHidden),
        sendGroup

);

// tabs + panes
    const tabs = el('div', {class:'tabsBar'},
        el('div', {class:'tabs'},
            el('div', {class:'tab active', id:'tabParams', dataset:{method}}, 'Params'),
            el('div', {class:'tab', id:'tabHeaders', dataset:{method}}, 'Headers'),
            el('div', {class:'tab', id:'tabAuth', dataset:{method}}, 'Authorization'),
            el('div', {class:'tab', id:'tabScripts', dataset:{method}}, 'Scripts')
        ),
        el('div', {class:'tabsTools'})
    );


    const paramsPane = el('div', {class:'tabPane active', id:'paneParams'});
    const headersPane= el('div', {class:'tabPane',        id:'paneHeaders'});
    const authPane   = el('div', {class:'tabPane',        id:'paneAuth'});
    const scriptsPane= el('div', {class:'tabPane',        id:'paneScripts'});
// tabs params/headers
    const paramsTable = buildKVTable(paramsInit, { onChange: debSave });
    paramsPane.append(el('div', {class:'kvs'}, paramsTable));

// rebuild url
    {
        const paramsInitial = tableToSimpleArray(paramsTable.tBodies[0]);
        const builtUrl = safeBuildUrl(url, paramsInitial);
        urlHidden.value = builtUrl;
        urlDisp.innerHTML = renderUrlWithVarsLocal(builtUrl);
    }

    let headersTable = buildKVTable(headersInit, { onChange: debSave });
    const headersBox = el('div', { class: 'kvs' }, headersTable);
    headersPane.append(headersBox);

// update url
    ['input','change'].forEach(ev=>{
        paramsPane.addEventListener(ev, () => {
            const params = tableToSimpleArray(paramsTable.tBodies[0]);
            const builtUrl = safeBuildUrl($('#urlInp').value.trim(), params);
            urlHidden.value = builtUrl;
            $('#urlInpDisplay').innerHTML = renderUrlWithVarsLocal(builtUrl);
            debSave();
        });
    });


// auth tab
    const authTypeSel = el('select', {id:'authType'},
        el('option', {value:'bearer', selected: (auth?.type||'bearer')==='bearer'}, 'Bearer Token')
    );
    const authTokenInp = el('div', {
        id: 'authTokenInp',
        class: 'code-editor var-support',
        contenteditable: 'true',
        spellcheck: 'false'
    });

    authTokenInp.innerHTML = renderUrlWithVarsLocal(String(auth?.token ?? ''));
    highlightMissingVars(authTokenInp, getEnvVarsOnly());


    authPane.append(
        el('div', {class:'authRow'}, el('div', {class:'muted'}, 'Auth type'), authTypeSel),
        el('div', {class:'authRow'}, el('div', {class:'muted'}, 'Token'), authTokenInp),
        el('div', {class:'kvHint'}, 'Token from Authorization tab is used for all requests.')
    );

// tab scripts
    const sw = el('div', {class:'scriptsSwitcher'},
        el('button', {id:'btnPre',  class:'active', onclick:()=>switchScript('pre')},  'PRE-Request'),
        el('button', {id:'btnPost', onclick:()=>switchScript('post')}, 'POST-Request')
    );
    const preTA  = el('textarea', {id:'preScript'},  scripts?.pre || '');
    const postTA = el('textarea', {id:'postScript', style:'display:none'}, scripts?.post || '');
    // save script
    preTA.addEventListener('input', () => {
        saveScript('pre', preTA.value, state.CURRENT_REQ_ID);
    });
    postTA.addEventListener('input', () => {
        saveScript('post', postTA.value, state.CURRENT_REQ_ID);
    });
    const scriptsArea = el('div', {class:'scriptsArea'}, preTA, postTA);
    const scriptsPaneInfo = el('div', {class:'small muted', style:'padding:0 12px 12px'}, 'Available: ctx.request (method,url,params,headers,body), ctx.response (status, headers, bodyText)');
    scriptsPane.append(sw, scriptsArea, scriptsPaneInfo);

// request body
    const bodyWrap = el('div', {class:'reqBodyWrap'});
    // dropdown content type's
    const ctOptions = [
        { value: 'auto', label: 'Auto detect' },
        { value: 'application/json', label: 'JSON' },
        { value: 'application/x-www-form-urlencoded', label: 'Form URL Encoded' },
        { value: 'multipart/form-data', label: 'Multipart Form Data' },
        { value: 'text/plain', label: 'Text' },
        { value: 'application/xml', label: 'XML' },
        { value: 'application/octet-stream', label: 'Binary' }
    ];

    const ctWrap = el('div', { class: 'ctDropdown', dataset: { value: 'application/json' } });
// selected value + arrow
    const ctCurrent = el('div', { class: 'ctCurrent' },
               'JSON ',
               el('span', { class: 'ctArrow' }, '▼')
           );
    ctWrap.append(ctCurrent);

// list of options
    const ctList = el('div', { class: 'ctList', style: 'display:none;' });
    ctOptions.forEach(opt => {
        const optEl = el('div', {
            class: 'ctOption',
            onclick: () => {
                ctCurrent.childNodes[0].textContent = opt.label + ' '; // update text
                ctWrap.dataset.value = opt.value;
                ctList.style.display = 'none';
                ctCurrent.querySelector('.ctArrow').textContent = '▼';
            }
        }, opt.label);
        ctList.append(optEl);
    });
    ctWrap.append(ctList);

// open and close behavior
    ctCurrent.onclick = () => {
        const isOpen = ctList.style.display === 'block';
        ctList.style.display = isOpen ? 'none' : 'block';
        ctCurrent.querySelector('.ctArrow').textContent = isOpen ? '▼' : '▲';
    };
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
        ctWrap,
        el('span', {class:'small muted'}, '(Content-Type will be set automatically if missing)')
    );

    // request body with highlight
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


    let pretty = bodyText || '';
    try {
        pretty = JSON.stringify(JSON.parse(bodyText), null, 2);
    } catch {}
    bodyEditor.dataset.raw = pretty;
    bodyEditor.innerHTML = highlightJSON(pretty);


    bodyEditor.addEventListener('input', () => {
        const offset = saveSelection(bodyEditor)
        const raw = bodyEditor.textContent;
        const highlighted = highlightJSON(raw);
        bodyEditor.dataset.raw = raw;
        bodyEditor.innerHTML = highlighted;
        restoreSelection(bodyEditor, offset);

        debSave();
    });

// actions
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

// highlight vars
    highlightMissingVars(card, state.VARS);
    document.addEventListener('click', (e) => {
        const t = e.target.closest('.var-token');
        if (t && window.openVarEdit) {
            const key = t.dataset.var || t.textContent.replace(/[{}]/g,'').trim();
            if (key) window.openVarEdit(key);
        }
    });

//  listen changes
    ['input','change','keyup'].forEach(ev=>{
        header.addEventListener(ev, debSave);
        paramsPane.addEventListener(ev, debSave);
        headersPane.addEventListener(ev, debSave);
        scriptsPane.addEventListener(ev, debSave);
        authPane.addEventListener(ev, debSave);
        bodyWrap.addEventListener(ev, debSave);
    });

// helpers
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

// beautify json
    $('#beautifyBtn').onclick = ()=>{
        const src = bodyEditor.textContent.trim();
        try {
            const obj = JSON.parse(src);
            const beautified = JSON.stringify(obj, null, 2);

            bodyEditor.dataset.raw = beautified;
            bodyEditor.innerHTML = highlightJSON(beautified);
            saveReqState(state.CURRENT_REQ_ID, { body: beautified });
        } catch {
            showAlert('Body is not valid JSON', 'error');
        }
    };


// reset only current request
    $('#resetBtn').onclick = ()=>{
        clearReqState(state.CURRENT_REQ_ID);
        clearTimePickerState(state.CURRENT_REQ_ID);
        clearScript('pre', state.CURRENT_REQ_ID);
        clearScript('post', state.CURRENT_REQ_ID);
        openRequest(item);
    };


// send request
    $('#sendBtn').onclick = async ()=>{
        const currentUrl = ($('#urlInp').value || '').trim();
        if (!currentUrl) {
            showAlert('URL cannot be empty', 'error');
            showUrlError();
            return;
        }
        debSave();
        state.LOGS = [];
        renderLogs();
        const sendBtn = $('#sendBtn');   // start loading animation on send button
        sendBtn.classList.add('loading');
        sendBtn.disabled = true;
        //const cleanup = () => { showLoader(false); $('#sendBtn').disabled = false; };
        const cleanup = () => {
            showLoader(false);
            sendBtn.classList.remove('loading'); // stop loading animation
            sendBtn.disabled = false;
        };


        const params = tableToSimpleArray(paramsTable.tBodies[0]);
        const hdrArr = tableToSimpleArray(headersTable.tBodies[0]).filter(h=>h.enabled!==false);
        let headers  = Object.fromEntries(hdrArr.filter(x=>x.key).map(x=>[x.key, resolveVars(x.value)]));

        let method = getSelectedMethod();
        let finalUrl = resolveVars(safeBuildUrl($('#urlInp').value.trim(), params));
        let body = resolveVars($('#bodyRawArea').dataset.raw || $('#bodyRawArea').textContent || '');
        let { type: authType, token: rawToken } = getAuthData();
        let authToken = rawToken;

// if input has {{varName}}
        const varMatch = rawToken.match(/^\{\{\s*([^}]+)\s*\}\}$/);
        if (varMatch) {
            const varName = varMatch[1];
            authToken = state.VARS[varName] || state.COLLECTION_VARS[varName] || '';
        }

        if (!Object.keys(headers).some(h => h.toLowerCase() === 'authorization')) {
            if (authType === 'bearer' && authToken) {
                headers['Authorization'] = 'Bearer ' + authToken;
            } else if (getGlobalBearer()) {
                headers['Authorization'] = 'Bearer ' + getGlobalBearer();
            }
        }


        if (!Object.keys(headers).some(h=>h.toLowerCase()==='content-type')){
            const ctSelVal = document.querySelector('.ctDropdown')?.dataset.value || 'auto';
            let ct = ctSelVal === 'auto' ? detectContentType(body) : ctSelVal;
            if (!ct) ct = 'application/json';   // application/jso by default
            headers['Content-Type'] = ct;
        }
        // check if needAuth true, run auth
        if (String(getNeedAuthFromEnvOrCollection()).toLowerCase() === "true") {
            showScriptLoader(true, 'Running auth script...');
            await runCollectionAuth();
            showScriptLoader(false);

            // turn off the flag if auth is valid
            setNeedAuthInEnv('false');
            buildVarMap();
            updateVarsBtnCounter();
        }


        // PRE scripts
        const preCodeAll = [
            (extraScripts?.pre || ''),   // collection + folder
            (preTA.value.trim() || scripts.pre || '') // request-level
        ].filter(Boolean).join('\n');

// if to run the collection level pre script
        let skipCollectionPre = false;

// check the needAuth variable
        const needAuthValue = String(getNeedAuthFromEnvOrCollection()).toLowerCase();

// if needAuth false authorization is  valid
        if (needAuthValue === 'false') {
            skipCollectionPre = true;
        }

// if a request has its own pre script
        const hasRequestPre = Boolean(preTA.value.trim() || scripts.pre.trim());

// skip the collection pre
        if (skipCollectionPre && !hasRequestPre) {
            //console.log('Skipping collection pre-script (auth not required)');
        } else if (preCodeAll.trim()) {
            try {
                const ctx = makePreCtx({ method, url: finalUrl, params, headers, body });

                showScriptLoader(true, 'Running pre-request script...');
                await runUserScript(preCodeAll, ctx);
                // all promises waiting from runUserScript
                showScriptLoader(false);
                // update vars
                buildVarMap();
                updateVarsBtnCounter();
                highlightMissingVars(document, getEnvVarsOnly());
                while (!ctx._allDone) {
                    await new Promise(r => setTimeout(r, 10));
                }
                // rebuilding body UI
                const bodyEditor = document.getElementById('bodyRawArea');
                if (bodyEditor) {
                    const offset = saveSelection(bodyEditor);
                    const raw = bodyEditor.dataset.raw || bodyEditor.textContent;
                    const highlighted = highlightJSON(raw);
                    bodyEditor.innerHTML = highlighted;
                    restoreSelection(bodyEditor, offset);
                }

                await new Promise(r => setTimeout(r, 50));
                buildVarMap();
                ({ method } = ctx.request);
                finalUrl = ctx.request.url;
                headers  = ctx.request.headers;
                body     = ctx.request.body;

                let hdrsAfterArr = tableToSimpleArray(headersTable.tBodies[0]);
                const fromCtx = Array.isArray(ctx.request.headers)
                    ? ctx.request.headers
                    : Object.entries(ctx.request.headers || {}).map(([k, v]) => ({
                        key: k,
                        value: v,
                        enabled: true
                    }));

                fromCtx.forEach(h => {
                    if (!h || !h.key) return;
                    const idx = hdrsAfterArr.findIndex(x => x.key.toLowerCase() === h.key.toLowerCase());
                    if (idx === -1) {
                        hdrsAfterArr.push({ key: h.key, value: h.value, enabled: h.enabled !== false });
                    } else {
                        hdrsAfterArr[idx].value = h.value;
                        hdrsAfterArr[idx].enabled = h.enabled !== false;
                    }
                });

                headersTable = buildKVTable(hdrsAfterArr, { onChange: debSave });
                headersBox.replaceChildren(headersTable);

                headers = Object.fromEntries(
                    hdrsAfterArr.filter(h => h.enabled !== false && h.key)
                        .map(h => [h.key, resolveVars(h.value)])
                );

                const paramsAfter = tableToSimpleArray(paramsTable.tBodies[0]);
                finalUrl = resolveVars(safeBuildUrl($('#urlInp').value.trim(), paramsAfter));
                body = resolveVars($('#bodyRawArea').textContent || '');

                if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) {
                    const ct = detectContentType(body);
                    if (ct) headers['Content-Type'] = ct;
                }

            }
            catch (e) {
                renderResponse(null, 'PRE error: ' + e.message, 0, finalUrl);
                return;
            }
            finally {
                showScriptLoader(false);
            }
        }

        // final auth enforce
        (() => {
            const { type: aType, token: rawTok } = getAuthData();
            let tok = (rawTok || '').trim();
            const m = tok.match(/^\{\{\s*([^}]+)\s*\}\}$/);
            if (m) {
                const name = m[1];
                tok = state.VARS[name] ?? state.COLLECTION_VARS[name] ?? '';
            }

            const hasAuth = Object.keys(headers)
                .some(h => h.toLowerCase() === 'authorization');

            if (!hasAuth) {
                const globalTok = getGlobalBearer() || '';
                const finalTok = aType === 'bearer' ? (tok || globalTok) : '';
                if (finalTok) headers['Authorization'] = 'Bearer ' + finalTok;
            }
        })();


        showLoader(true); $('#sendBtn').disabled = true;
        const started = performance.now();

        try {
            let res = await fetchWithTimeout(finalUrl, {
                method,
                headers,
                body: (method==='GET'||method==='HEAD') ? undefined : body
            });
            let text = await res.text();
            let handledAlert = false;
            if (res.status === 401) {
                console.warn("Got 401 on main request, resetting needAuth");
                setNeedAuthInEnv('true');
                state.COLLECTION_VARS.needAuth = "true";
                buildVarMap();
                updateVarsBtnCounter();

                showAlert('Authorization expired — resend request', 'error');
                handledAlert = true;
            }


            // POST scripts
            const postCodeAll = [
                (extraScripts?.post || ''),  // collection + folder
                (postTA.value.trim() || scripts.post || '') // request-level
            ].filter(Boolean).join('\n');

// check if there are scripts
            const hasAnyPostScript =
                (Array.isArray(item.event) && item.event.some(ev => ev.listen === 'test')) ||
                (Array.isArray(item.folderEvents) && item.folderEvents.some(ev => ev.listen === 'test')) ||
                (Array.isArray(state.COLLECTION?.event) && state.COLLECTION.event.some(ev => ev.listen === 'test'));

// skip if there are no scripts
            if (hasAnyPostScript && postCodeAll.trim()) {
                try {
                    const ctxPost = makePostCtx({
                        request: { method, url: finalUrl, headers, body },
                        response: {
                            status: res.status,
                            statusText: res.statusText,
                            headers: Object.fromEntries(res.headers.entries()),
                            bodyText: text
                        }
                    });

                    showScriptLoader(true, 'Running test script...');
                    await runUserScript(postCodeAll, ctxPost);
                    showScriptLoader(false);

                    buildVarMap();
                    updateVarsBtnCounter();

                    if (ctxPost.response && typeof ctxPost.response.bodyText === 'string') {
                        text = ctxPost.response.bodyText;
                    }
                    if (ctxPost._logs.length) {
                    }
                } catch (e) {
                    console.error("POST script error:", e);
                } finally {
                    showScriptLoader(false);
                }
            }

            const ms = performance.now() - started;
            // if response code is 503
            if (!res.ok && !handledAlert) {
                showAlert('Request failed', 'error');

                if (!text.trim()) {
                    text = res.statusText || 'Error';
                }
            }
            // show response body
            state.LAST_REQ_HEADERS = headers;
            renderResponse(res, text, ms, finalUrl);

            addHistoryEntry({
                method,
                url: finalUrl,
                body,
                response: {
                    status: res.status,
                    statusText: res.statusText,
                    headers: Object.fromEntries(res.headers.entries()),
                    bodyText: text,
                    url: finalUrl,
                    timeMs: ms
                }
            });

            const respObj = {
                status: res.status,
                statusText: res.statusText,
                headers: Object.fromEntries(res.headers.entries()),
                bodyText: text,
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
                // mock 503
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
                throw e;
            }

            showAlert('Request failed', 'error');

            // fake response
            const fakeRes = {
                ok: false,
                status: 0,
                statusText,
                headers: new Headers(),
                url: finalUrl
            };

            renderResponse(fakeRes, errMsg, ms, finalUrl);

            // if has post-script
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
            throw e;
        } finally {
            cleanup();
            showScriptLoader(false);
        }
    };

// show saved response if any
    if (response) {
        renderResponseSaved(response);
    } else if (item.response) {
        renderResponseSaved(item.response);
    } else {
        $('#resPane').innerHTML = '';
    }

// snd dropdown menu logic
    $('#sendDropdownBtn').onclick = (e) => {
        e.stopPropagation();
        const menu = $('#sendMenu');
        if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sendGroup')) hideSendMenu();
    });

    function hideSendMenu() {
        const menu = $('#sendMenu');
        if (menu) menu.style.display = 'none';
    }
// ensure active highlight is updated when request opened
    if (item?.id) {
        const row = document.querySelector(`.op[data-req-id="${item.id}"]`);
        if (row) {
            import('./sidebar.js').then(({ setActiveRow }) => {
                setActiveRow(row);
            });
        }
    }
    highlightMissingVars(document, getEnvVarsOnly());
    requestAnimationFrame(() => {
        validateUrlInput();
        urlDisp.addEventListener('input', validateUrlInput);
    });
    // initialization timePicker
    requestAnimationFrame(() => {
        try {
            const reqId = state.CURRENT_REQ_ID;
            // if there is a saved time picker state
            const saved = localStorage.getItem(`timePicker_${reqId}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                state.TIME_PICKER_STATE[reqId] = parsed;
                console.debug('[TimePicker] Restored from localStorage:', parsed);
            }
            // init time picker whe request is loaded
            initTimePicker(reqId);
        } catch (e) {
            console.warn('[TimePicker] Restore error:', e);
            initTimePicker(state.CURRENT_REQ_ID);
        }
    });
}
function toggleWelcomeCard(show) {
    const card = document.getElementById('welcomeCard');
    if (card) {
        card.hidden = !show;
    }
}
//one time run auth script
async function runCollectionAuth() {
    try {
        const code = (state.COLLECTION?.event || [])
            .filter(ev => ev.listen === 'prerequest')
            .map(ev => (ev.script?.exec || []).join('\n'))
            .join('\n');


        if (!code.trim()) return;

        const ctx = makePreCtx({ method: "GET", url: "", params: [], headers: {}, body: "" });
        await runUserScript(code, ctx);
        await Promise.all(ctx._promises || []);
        // update vars and counter
        buildVarMap();
        updateVarsBtnCounter();

    } catch (err) {
    }
}

export async function bootApp({ collectionPath, autoOpenFirst }) {
    let collection = null;
    const path = collectionPath || getSelectedCollection();

    try {
        collection = await loadJson(path);

        if (path) {
            setSelectedCollection(path);
        }
    } catch (err) {
        showAlert('Error loading collection: ' + err.message, 'error');
        toggleWelcomeCard(true);
        return;
    }

    if (!collection || !Array.isArray(collection.item) || !collection.item.length) {
        toggleWelcomeCard(true);   // if collection empty also show welcome card
        return;
    }

    // hide if collection is already shown
    toggleWelcomeCard(false);

    // read env from LS
    let currentEnv = localStorage.getItem('selected_env') || 'dev';
    let savedEnv = null;

    try {
        const raw = localStorage.getItem(`pm_env_${currentEnv}`);
        if (raw) savedEnv = JSON.parse(raw);
    } catch {}

    let env;
    if (savedEnv && Array.isArray(savedEnv.values)) {
        // if env has in LS → use
        env = savedEnv;
    } else {
        try {
            if (currentEnv === 'dev') {
                // for dev always download
                env = await loadJson('./data/dev_environment.json');
            } else {
                // for stage/prod if file doesnt exs → create empty
                env = { values: [] };
                localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(env));
            }
        } catch {
            env = { values: [] };
        }
    }

    state.COLLECTION = collection;
    state.COLLECTION_VARS = {};
      if (Array.isArray(collection.variable)) {
              collection.variable.forEach(v => {
                      const key = v.key ?? v.name;
                     if (key) state.COLLECTION_VARS[key] = getVal(v);
                  });
          }

    state.ENV = env;
    state.VARS = {};
    Object.assign(state.VARS, state.COLLECTION_VARS);
    // ensure needAuth is in ENV (sync from collection only once)
     if (state.COLLECTION_VARS.needAuth !== undefined) {
             const row = state.ENV.values.find(v => v.key === "needAuth");
             if (!row) {
                     state.ENV.values.push({
                             key: "needAuth",
                             value: state.COLLECTION_VARS.needAuth,
                             enabled: true
                     });
                     try {
                             const currentEnv = localStorage.getItem('selected_env') || 'dev';
                             localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
                         } catch {}
                      }
         }
    state.ITEMS_FLAT = [];
    flattenItems(collection, []);
    buildVarMap();
    // load globals
    try {
        const globals = await loadJson('./data/postman_globals.json');
        if (Array.isArray(globals.values)) {
            state.GLOBALS = {};
            globals.values.forEach(v => {
                if (v.enabled !== false) {
                    state.GLOBALS[v.key] = v.value;
                }
            });
        }
    } catch {
        state.GLOBALS = {};
    }

    // collection's scripts one time run
    state.COLLECTION_SCRIPTS = { pre: '', post: '' };
    if (Array.isArray(collection.event)) {
        collection.event.forEach(ev => {
            const code = (ev.script?.exec || []).join('\n');
            if (ev.listen === 'prerequest') state.COLLECTION_SCRIPTS.pre += code + '\n';
            if (ev.listen === 'test')       state.COLLECTION_SCRIPTS.post += code + '\n';
        });
    }


// run script if needAuth = true when collection is loaded!
   /* if (state.COLLECTION_VARS.needAuth === "true") {
        await runCollectionAuth();
    } */
    const needAuthInit = getNeedAuthFromEnvOrCollection();
    if (String(needAuthInit).toLowerCase() === 'true') {
        await runCollectionAuth();
        setNeedAuthInEnv('false');
        buildVarMap();
    }

// sync env vars and ui
    buildVarMap();
    updateVarsBtnCounter();
    renderTree('', { onRequestClick: openRequest });
    import('./settings.js').then(({ initCollectionDropdown }) => {
        initCollectionDropdown();
    });
    initEnvDropdown();


    initVarsModal();
    initResetModal();
    initVarEditModal();
    const urlDispNow = $('#urlInpDisplay');
    if (urlDispNow) {
        const currentRaw = $('#urlInp')?.value?.trim() || '';
        urlDispNow.innerHTML = renderUrlWithVarsLocal(currentRaw);
        highlightMissingVars(urlDispNow, getEnvVarsOnly()); // optional
    }


    // search
    {
        let filterInp = $('#search') || $('#searchInp');

        if (filterInp) {
            const applyFilter = () => {
                const v = (filterInp.value || '').trim();
                const isHistoryActive = !$('#historyPane').hidden;

                if (isHistoryActive) {
                    renderHistory(v);
                } else {
                    renderTree(v, { onRequestClick: openRequest }); // filter
                }
            }
            const deb = debounce(applyFilter, 150);
            filterInp.addEventListener('input', deb);
            if (filterInp.value) applyFilter();
        }
    }
    //  env dropdown
    initEnvDropdown();

    if (autoOpenFirst && state.ITEMS_FLAT[0]) {
        // open first request
        openRequest(state.ITEMS_FLAT[0], false); // forceDefaults = true doesn't pull up the old response
        // clear response
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
    initSidebarNav();
    initSettingsSidebar();
// close all dropdowns on tap
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.methodDropdown, .envDropdown, .ctDropdown, .dropdown').forEach(drop => {
            if (!drop.contains(e.target)) {
                const list = drop.querySelector('.methodList, .envList, .ctList, .dropdown-content');
                const arrow = drop.querySelector('.arrow, .ctArrow, .methodArrow');
                if (list) list.style.display = 'none';
                if (arrow) arrow.textContent = '▼';
            }
        });
    });
    setOnRequestOpen(openRequest);
    initHotkeys({
        get sendBtn() { return document.getElementById('sendBtn'); },        selectNextRequest,
        selectPrevRequest,
        focusSidebar,
        togglePinCurrent,
        toggleVarsModal
    });
    import('./timePicker.js');
    // override console methods to tab logs
    ["log", "warn", "error"].forEach(level => {
        const orig = console[level];
        console[level] = (...args) => {
            const msg = args.map(a =>
                typeof a === "object" ? JSON.stringify(a) : String(a)
            ).join(" ");

            state.LOGS.push(`[${level.toUpperCase()}] ${msg}`);
            orig.apply(console, args);
            renderLogs();
        };
    });
}
export function updatePreScriptDate(dateConstString) {
    const preTA = $('#preScript');
    if (!preTA || !state.CURRENT_REQ_ID) {
        showAlert('Request pane not open or ID missing.', 'error');
        return;
    }

    let scriptContent = preTA.value;

    // Regex definitions (using 'g' flag for robust global replacement where needed)
    const DATE_CONST_REGEX = /^\s*const\s+futureDate\s*=\s*new\s+Date\s*\(.*?\);?\s*$/gm;
    const PAYLOAD_LINE_REGEX = /^\s*payload\.pickup_time\s*=\s*Math\.floor\s*\(futureDate\.getTime\(\)\s*\/\s*1000\);\s*$/gm;
    const ANCHOR_LINE_REGEX = /^(\s*payload\.fare_id\s*=\s*pm\.collectionVariables\.get\s*\("fareId"\);\s*)/m;

    // Regex for the safety block we inject
    const SAFETY_BLOCK_REGEX = /if\s*\(\s*typeof\s+payload\s*!==\s*['"]undefined['"]\s*&&\s*payload[\s\S]+?payload\.pickup_time\s*=\s*null\s*;?\s*\}\s*/m;

    const NEW_PAYLOAD_LINE = 'payload.pickup_time = Math.floor(futureDate.getTime() / 1000);';

    // Helper to remove excess newlines after cleanup
    const cleanScript = (content) => content.replace(/\n\s*\n/g, '\n\n').trim();

    if (!dateConstString.trim()) {
        // Mode "Now": Remove date/payload injections and insert safety block.

        // Remove old date and payload lines (global flag is key here)
        scriptContent = scriptContent
            .replace(PAYLOAD_LINE_REGEX, '')
            .replace(DATE_CONST_REGEX, '');

        const PAYLOAD_DECL_REGEX = /(\bpayload\s*=\s*[^;]+;)/m;
        const safetyLine = `if (typeof payload !== 'undefined' && payload && payload.pickup_time === undefined) { payload.pickup_time = null; }`;

        // Only inject safety block if not already present
        if (!SAFETY_BLOCK_REGEX.test(scriptContent)) {
            if (PAYLOAD_DECL_REGEX.test(scriptContent)) {
                // Insert after payload declaration
                scriptContent = scriptContent.replace(PAYLOAD_DECL_REGEX, `$1\n${safetyLine}`);
            } else {
                // Prepend safety block
                scriptContent = `${safetyLine}\n${scriptContent}`;
            }
        }

        scriptContent = cleanScript(scriptContent);

    } else {
        // Mode "Future Date": Remove safety block and inject/update date and pickup_time.

        // Remove any previously injected safety block first
        if (SAFETY_BLOCK_REGEX.test(scriptContent)) {
            scriptContent = scriptContent.replace(SAFETY_BLOCK_REGEX, '');
        }

        const newDateConst = dateConstString.trim();
        const fullNewBlock = `\n${newDateConst}\n${NEW_PAYLOAD_LINE}\n`;

        const isExisting = DATE_CONST_REGEX.test(scriptContent) || PAYLOAD_LINE_REGEX.test(scriptContent);

        if (isExisting) {
            // Update existing lines: update const and ensure only one payload line exists.
            scriptContent = scriptContent
                .replace(DATE_CONST_REGEX, newDateConst)
                // Ensure single payload line (using global flag)
                .replace(PAYLOAD_LINE_REGEX, NEW_PAYLOAD_LINE);

            // If the date const was present but payload line was not, insert it using the anchor
            if (!PAYLOAD_LINE_REGEX.test(scriptContent)) {
                scriptContent = scriptContent.replace(ANCHOR_LINE_REGEX, `$1\n${NEW_PAYLOAD_LINE}\n`);
            }

        } else if (ANCHOR_LINE_REGEX.test(scriptContent)) {
            // Insert full block after anchor if neither existed
            scriptContent = scriptContent.replace(ANCHOR_LINE_REGEX, `$1${fullNewBlock}`);
        } else {
            // Prepend new block to the script
            scriptContent = `${newDateConst}\n${NEW_PAYLOAD_LINE}\n\n${scriptContent.trim()}`;
        }

        scriptContent = cleanScript(scriptContent);
    }

    // Apply and trigger save event
    preTA.value = scriptContent;
    preTA.dispatchEvent(new Event('input'));
}