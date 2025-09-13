/* ========= Config ========= */
const urlParams = new URLSearchParams(location.search);
const DEFAULT_COLLECTION_PATH = urlParams.get('collection') || './data/postman_collection.json';
const DEFAULT_ENV_PATH        = urlParams.get('env')        || './data/dev_environment.json';
const AUTO_OPEN_FIRST         = urlParams.get('autoOpen') !== '0';

/* ========= Utilities ========= */
const $ = sel => document.querySelector(sel);
const el = (tag, attrs={}, ...children) => {
  const n = document.createElement(tag);
  const boolAttrs = new Set([
    'checked','disabled','readonly','required','selected','multiple','hidden','open'
  ]);

  Object.entries(attrs).forEach(([k,v])=>{
    if (k === 'class') {
      n.className = v;
    } else if (k === 'dataset') {
      Object.assign(n.dataset, v);
    } else if (k.startsWith('on') && typeof v === 'function') {
      n.addEventListener(k.slice(2), v);
    } else if (boolAttrs.has(k)) {
      n[k] = !!v;                     
      if (v) n.setAttribute(k,'');      
      else n.removeAttribute(k);       
    } else {
      n.setAttribute(k, v);
    }
  });

  children.forEach(c => n.append(c));
  return n;
};

function debounce(fn, ms=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function showLoader(on){ const l = $('#loader'); if (!l) return; l.hidden = !on; }
function pathOnly(u){
  if(!u) return '';
  try{
    const full = resolveVars(u);
    const isAbs = /^https?:\/\//i.test(full);
    const urlObj = new URL(isAbs ? full : (location.origin + (full.startsWith('/')?full:'/'+full)));
    return urlObj.pathname || '/';
  }catch{ return String(u).replace(/^https?:\/\/[^/]+/i,'') || '/'; }
}
function stripPrefixFolder(name){
  return String(name||'').replace(/^DriverGateway\s*\/\s*/i,'') || 'No folder';
}

/* ========= Theme ========= */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('ui_theme', t);
  $('#themeBtn').textContent = t==='dark' ? '☀️' : '🌙';
}
(function initTheme(){
  const t = localStorage.getItem('ui_theme') || 'light';
  applyTheme(t);
})();
$('#themeBtn').addEventListener('click', ()=>{
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur==='light' ? 'dark' : 'light');
});

/* ========= State ========= */
let COLLECTION = null, ENV = null, VARS = {};
let ITEMS_FLAT = [];
let CURRENT_REQ_ID = null;
let GLOBAL_BEARER = localStorage.getItem('global_bearer') || '';
let CURRENT_OP_EL = null;

/* ========= LocalStorage per-request ========= */
const reqKey = id => `pm_req_${id}`;
const scriptsKey = id => `pm_scripts_${id}`; // legacy

function loadReqState(id){
  try { const raw = localStorage.getItem(reqKey(id)); return raw ? JSON.parse(raw) : null; } catch{ return null; }
}
function saveReqState(id, patch){
  const prev = loadReqState(id) || {};
  const next = {...prev, ...patch};
  try { localStorage.setItem(reqKey(id), JSON.stringify(next)); } catch {}
}
function clearReqState(id){ try{ localStorage.removeItem(reqKey(id)); }catch{} }
function loadScriptsLegacy(id){ try{ return JSON.parse(localStorage.getItem(scriptsKey(id))||'{}'); }catch{ return {}; } }

/* ========= Variables & helpers ========= */
function buildVarMap(){
  const map = {};
  if (ENV && Array.isArray(ENV.values)){
    ENV.values.forEach(v=>{
      if(!v) return;
      if (v.enabled === false) return;
      const key = v.key ?? v.name;
      const val = (v.currentValue ?? v.value ?? v.initialValue);
      if (key) map[key] = val;
    });
  }
  if (COLLECTION && Array.isArray(COLLECTION.variable)){
    COLLECTION.variable.forEach(v=>{
      if(!v) return;
      const key = v.key ?? v.name;
      const val = (v.currentValue ?? v.value ?? v.initialValue);
      if (key && map[key]==null) map[key]=val;
    });
  }
  VARS = map;
  try {
  const stored = JSON.parse(localStorage.getItem('pm_env') || '{"values":[]}');
  if (Array.isArray(stored.values)) {
    stored.values.forEach(v=>{
      if (v && v.enabled !== false) VARS[v.key] = v.value;
    });
  }
} catch {}

}
function resolveVars(str, extra={}){ 
  if(typeof str!=='string') return str; 
  return str.replace(/{{\s*([^}]+)\s*}}/g,(_,k)=> 
    (extra && extra[k]!=null) ? extra[k] : (VARS[k]!=null ? VARS[k] : `{{${k}}}`)
  ); 
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
function flattenItems(node, path=[]){
  if(!node) return;
  if(Array.isArray(node)){ node.forEach(n=>flattenItems(n, path)); return; }
  if(node.item){ const newPath = node.name ? path.concat(stripPrefixFolder(node.name)) : path; node.item.forEach(child=>flattenItems(child, newPath)); return; }
  if(node.request){
  ITEMS_FLAT.push({
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


  // highlight Missing Vars in URL
function highlightMissingVars(rootEl) {
  const regex = /{{\s*([^}]+)\s*}}/g;

  rootEl.querySelectorAll('input, textarea').forEach(inp => {
    const val = inp.value || '';
    let missing = false;
    val.replace(regex, (_, key) => {
      const exists = VARS[key] != null && VARS[key] !== '';
      if (!exists) missing = true;
    });
    inp.classList.toggle('var-missing', missing);
  });
}
  function renderUrlWithVars(url) {
  const regex = /{{\s*([^}]+)\s*}}/g;
  return url.replace(regex, (_, key) => {
    const val = VARS[key];
    const missing = !val;
    return `<span 
      class="var-token ${missing ? 'missing' : 'filled'}" 
      data-var="${key}" 
      title="${val || '(not set)'}">
        {{${key}}}
    </span>`;
  });
}

/* ========= Sidebar ========= */
function renderTree(filter = '') {
  const tree = $('#tree');
  tree.innerHTML = '';

  const q = (filter || '').toLowerCase();
  const match = s => (s || '').toLowerCase().includes(q);

  const groups = {};
  ITEMS_FLAT.forEach(it => {
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
function setActiveRow(elm){
  if (CURRENT_OP_EL) CURRENT_OP_EL.classList.remove('active');
  CURRENT_OP_EL = elm;
  if (CURRENT_OP_EL) CURRENT_OP_EL.classList.add('active');
}

/* ========= KV tables (with On/Off) ========= */
function buildKVTable(rows){
  const t = el('table', {class:'kvTable'});
  t.append(el('thead', {}, el('tr', {}, 
    el('th', {class:'kvOn'}, 'On'), 
    el('th', {}, 'Key'), 
    el('th', {}, 'Value')
  )));
  const tb = el('tbody');

  // строки из данных
  (rows||[]).forEach(r=>{
    const hasValue = !!((r.key && r.key.trim()) || (r.value && r.value.trim()));
    const tr = el('tr');

    const cb = el('input',{
  type:'checkbox',
  'data-field':'enabled',
  checked: r.enabled === true   // только если реально есть данные
});

    const keyInp = el('input',{value: r.key ?? '', 'data-field':'key'});
    const valInp = el('input',{value: r.value ?? '', 'data-field':'value'});

    [keyInp, valInp].forEach(inp=>{
      inp.addEventListener('input', ()=>{
        const has = (keyInp.value.trim() || valInp.value.trim());
        cb.checked = !!has;
      });
    });

    tr.append(
      el('td', {class:'kvOn'}, el('div',{class:'cell'}, cb)),
      el('td', {}, el('div',{class:'cell'}, keyInp)),
      el('td', {}, el('div',{class:'cell'}, valInp))
    );
    tb.append(tr);
  });

  // пустая строка в конце
  addNewRow(tb);

  t.append(tb);
  return t;
}

function appendRow(tb, row, isNew=false){
  const tr = el('tr');

  const hasValue = !!((row.key && row.key.trim()) || (row.value && row.value.trim()));
  const cb = el('input',{
    type:'checkbox',
    'data-field':'enabled',
    checked: row.enabled === true
  });

  const keyInp = el('input',{value: row.key ?? '', 'data-field':'key', placeholder:isNew?'key':''});
  const valInp = el('input',{value: row.value ?? '', 'data-field':'value', placeholder:isNew?'value':''});

  [keyInp, valInp].forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const has = (keyInp.value.trim() || valInp.value.trim());
      cb.checked = !!has;

      // если ввели текст в новой строке → добавить ещё одну пустую
      if (isNew && has && tr === tb.lastElementChild){
        appendRow(tb, {key:'', value:'', enabled:false}, true);
      }
    });
  });

  tr.append(
    el('td', {class:'kvOn'}, el('div',{class:'cell'}, cb)),
    el('td', {}, el('div',{class:'cell'}, keyInp)),
    el('td', {}, el('div',{class:'cell'}, valInp))
  );

  tb.append(tr);
}

function addNewRow(tb){
  const trNew = el('tr');
  const cbNew = el('input',{type:'checkbox','data-field':'enabled', checked:false});
  const keyNew = el('input',{'data-field':'key', placeholder:'key'});
  const valNew = el('input',{'data-field':'value', placeholder:'value'});

  [keyNew, valNew].forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const has = (keyNew.value.trim() || valNew.value.trim());
      cbNew.checked = !!has;

      // если ввели что-то в пустую строку → добавить новую пустую в конец
      if (has && trNew === tb.lastElementChild){
        addNewRow(tb);
      }
    });
  });

  trNew.append(
    el('td', {class:'kvOn'}, el('div',{class:'cell'}, cbNew)),
    el('td', {}, el('div',{class:'cell'}, keyNew)),
    el('td', {}, el('div',{class:'cell'}, valNew))
  );
  tb.append(trNew);
}
  
function tableToSimpleArray(tbody){
  const out = [];
  Array.from(tbody.querySelectorAll('tr')).forEach(tr=>{
    const key = tr.querySelector('input[data-field="key"]')?.value?.trim() ?? '';
    const val = tr.querySelector('input[data-field="value"]')?.value ?? '';
    const en  = tr.querySelector('input[data-field="enabled"]')?.checked;
    if (key || val) out.push({key, value: val, enabled: !!en});
  });
  return out;
}

/* ========= Request UI ========= */
function getInitialStateForItem(item){
  const id = item.id;
  const saved = loadReqState(id);
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

  if (!saved?.headers){
    if (GLOBAL_BEARER && !headersInit.some(h=>String(h.key||'').toLowerCase()==='authorization')){
      headersInit.unshift({key:'Authorization', value:'Bearer '+GLOBAL_BEARER, enabled:true});
    } else if (item.request.auth && item.request.auth.type==='bearer'){
      const token = (item.request.auth.bearer||[]).find(x=>x.key==='token')?.value || VARS.token || VARS.access_token || '';
      if (token && !headersInit.some(h=>String(h.key||'').toLowerCase()==='authorization')){
        headersInit.unshift({key:'Authorization', value:'Bearer '+resolveVars(token), enabled:true});
      }
    }
  }

  let bodyText = saved?.body;
  if (bodyText == null){
    bodyText = item.request.body?.raw != null ? (typeof item.request.body.raw === 'string' ? item.request.body.raw : JSON.stringify(item.request.body.raw, null, 2)) : '';
  }
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

  return { method, methodOrig, url, paramsInit, headersInit, bodyText, scripts, auth, response: saved?.response || null };
}

function openRequest(item, forceDefaults = false) {
  CURRENT_REQ_ID = item.id;

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
  saveReqState(CURRENT_REQ_ID, patch);
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
urlDisp.innerHTML = renderUrlWithVars(url);

urlDisp.addEventListener('input', ()=>{
  urlHidden.value = urlDisp.textContent;
  urlDisp.innerHTML = renderUrlWithVars(urlHidden.value);

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
    $('#urlInpDisplay').innerHTML = renderUrlWithVars(
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
    saveReqState(CURRENT_REQ_ID,{body:''});
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
  highlightMissingVars(card);
  card.addEventListener('input', () => highlightMissingVars(card));

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
    saveReqState(CURRENT_REQ_ID, { body: beautified });
  }catch{ alert('Body is not valid JSON'); }
};



  // Reset only current request
 $('#resetBtn').onclick = ()=>{
  clearReqState(CURRENT_REQ_ID);
  openRequest(item); // откроет заново и заново создаст подсветку
   localStorage.setItem('selected_env', 'dev');
  envSelect.value = 'dev';
  loadEnv('dev');
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
      } else if (GLOBAL_BEARER){
        headers['Authorization'] = 'Bearer ' + GLOBAL_BEARER;
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
      saveReqState(CURRENT_REQ_ID, { response: { status:0, statusText:'Network error', headers:{}, bodyText:String(e), url:finalUrl, timeMs:ms }});
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
    saveReqState(CURRENT_REQ_ID, { response: respObj });

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
      else if (GLOBAL_BEARER) hdrs['Authorization']='Bearer '+GLOBAL_BEARER;
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
    alert('cURL copied');
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
/* ==== Content-Type detection ==== */
function detectContentType(body){
  const s = (body||'').trim();
  if (!s) return null;
  try{ JSON.parse(s); return 'application/json'; }catch{}
  if (/^[^=\s&]+=[^=&]*(?:&[^=\s&]+=[^=&]*)*$/.test(s)) return 'application/x-www-form-urlencoded';
  if (/^--?[-\w]+/i.test(s) && /content-disposition/i.test(s)) return 'multipart/form-data';
  return null;
}

/* ==== scripts sandbox ==== */
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
    _logs: [], vars: {...VARS}, setVar: (k,v)=>{ VARS[k]=v; },
    request: { method, url, params: JSON.parse(JSON.stringify(params)), headers: JSON.parse(JSON.stringify(headers)), body },
    setHeader: (k,v)=>{ ctx.request.headers[k]=v; },
    setParam: (k,v)=>{ const p=ctx.request.params.find(x=>x.key===k); if(p) p.value=v; else ctx.request.params.push({key:k,value:v}); },
    setBody: v=>{ ctx.request.body = v; }, setMethod: m=>{ ctx.request.method = String(m||'GET').toUpperCase(); }, setUrl: u=>{ ctx.request.url = String(u||''); },
    log: (...a)=>ctx._logs.push(a.map(String).join(' '))
  };
  return ctx;
}
function makePostCtx({request, response, error}){
  const ctx = {
    _logs: [],
    vars: { ...VARS }, 
    request,
    response,
    error: error || null,
    setResponseBody: (text)=>{ if(ctx.response) ctx.response.bodyText = String(text); },
    log: (...a)=>ctx._logs.push(a.map(String).join(' '))
  };
  return ctx;
}
/* ========= Response (with JSON highlight) ========= */
function buildRespTools(rawText){
  const tools = el('div', {class:'respTools'});
  const input = el('input', {id:'copyField', placeholder:'Field to copy (e.g., access_token or data.token)'});
  const btn   = el('button', {id:'copyBtn'}, 'Copy field');
  const btnAll= el('button', {id:'copyAllBtn'}, 'Copy body');
  tools.append(input, btn, btnAll);

  btn.onclick = ()=>{
    try{
      const obj = JSON.parse(rawText||'{}');
      const path = (input.value||'').trim();
      const val = path ? getByPath(obj, path) : '';
      if (val==null) { alert('Field not found'); return; }
      navigator.clipboard.writeText(String(val));
      btn.textContent='Copied!'; setTimeout(()=>btn.textContent='Copy field', 1000);
    }catch{
      alert('Response is not JSON');
    }
  };
  btnAll.onclick = ()=>{
    const text = $('#respPre')?.textContent || rawText || '';
    navigator.clipboard.writeText(text);
    btnAll.textContent='Copied!'; setTimeout(()=>btnAll.textContent='Copy body', 1000);
  };
  return tools;
}
function getByPath(obj, path){
  return path.split('.').reduce((acc, key)=> (acc!=null ? acc[key] : undefined), obj);
}

function syntaxHighlight(json) {
  if (typeof json != 'string') { json = JSON.stringify(json, undefined, 2); }
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    if (/^"/.test(match)) {
      if (/:$/.test(match)) return '<span class="json-key">' + match + '</span>';
      if (/^"(http|https):/.test(match)) return '<span class="json-url">' + match + '</span>';
      return '<span class="json-string">' + match + '</span>';
    }
    if (/true|false/.test(match)) return '<span class="json-boolean">' + match + '</span>';
    if (/null/.test(match)) return '<span class="json-null">' + match + '</span>';
    return '<span class="json-number">' + match + '</span>';
  });
}

function renderResponse(res, text, ms, url){
  const pane = $('#resPane'); pane.innerHTML = '';
  const card = el('div', {class:'card'}); card.append(el('h3', {}, 'Response'));
  const head = el('div', {class:'respHeader'});
  const status = res ? `${res.status} ${res.statusText}` : 'Network error';
  head.append(el('span', {class:'pill', style:`color:${res ? (res.ok?'var(--ok)':'var(--err)'):'var(--err)'}`}, status));
  head.append(el('span', {class:'pill'}, `Time: ${ms.toFixed(0)} ms`));
  head.append(el('span', {class:'pill'}, `URL: ${url}`));
  card.append(head);

  const tools = buildRespTools(text);
  card.append(tools);

  const bodyWrap = el('div', {class:'respBody'});
  let formatted = text; 
  try { 
    formatted = JSON.stringify(JSON.parse(text),null,2); 
    formatted = syntaxHighlight(formatted);
  } catch {}
  bodyWrap.innerHTML = '<pre id="respPre">'+(formatted || (text || '—'))+'</pre>';
  card.append(bodyWrap);

  if (res){
    const hdrsCard = el('div', {class:'card'}); hdrsCard.append(el('h3', {}, 'Response headers'));
    const table = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Header'), el('th', {}, 'Value'))));
    const tb = el('tbody'); res.headers.forEach((v,k)=> tb.append(el('tr', {}, el('td', {}, k), el('td', {}, v))));
    table.append(tb); hdrsCard.append(el('div', {class:'kvs'}, table));
    pane.append(card, hdrsCard);
  } else {
    pane.append(card);
  }
}
function renderResponseSaved(resp){
  const pane = $('#resPane'); pane.innerHTML = '';
  const card = el('div', {class:'card'}); card.append(el('h3', {}, 'Response (last)'));
  const head = el('div', {class:'respHeader'});
  head.append(el('span', {class:'pill', style:`color:${resp.status && resp.status>=200 && resp.status<400 ? 'var(--ok)' : 'var(--err)'}`}, `${resp.status||0} ${resp.statusText||''}`));
  if (resp.timeMs!=null) head.append(el('span', {class:'pill'}, `Time: ${Math.round(resp.timeMs)} ms`));
  if (resp.url) head.append(el('span', {class:'pill'}, `URL: ${resp.url}`));
  card.append(head);

  const tools = buildRespTools(resp.bodyText||'');
  card.append(tools);

  const bodyWrap = el('div', {class:'respBody'});
  let formatted = resp.bodyText; 
  try { 
    formatted = JSON.stringify(JSON.parse(resp.bodyText||''),null,2); 
    formatted = syntaxHighlight(formatted);
  } catch {}
  bodyWrap.innerHTML = '<pre id="respPre">'+(formatted || (resp.bodyText || '—'))+'</pre>';
  card.append(bodyWrap);

  if (resp.headers && Object.keys(resp.headers).length){
    const hdrsCard = el('div', {class:'card'}); hdrsCard.append(el('h3', {}, 'Response headers'));
    const table = el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Header'), el('th', {}, 'Value'))));
    const tb = el('tbody'); Object.entries(resp.headers).forEach(([k,v])=> tb.append(el('tr', {}, el('td', {}, k), el('td', {}, String(v)))));
    table.append(tb); hdrsCard.append(el('div', {class:'kvs'}, table));
    pane.append(card, hdrsCard);
  } else {
    pane.append(card);
  }
}

/* ========= Authorize (global) ========= */
function updateAuthUI(){
  const btn = $('#authBtn');
  if (GLOBAL_BEARER){
    btn.textContent = 'Authorized';
    btn.style.background = '#d1fae5';
    btn.style.color = '#065f46';
  }else{
    btn.textContent = 'Authorize';
    btn.style.background = '';
    btn.style.color = '';
  }
}
$('#authBtn').addEventListener('click', ()=>{
  $('#authModal').hidden = false;
  $('#authToken').value = GLOBAL_BEARER || '';
  $('#authState').style.display = GLOBAL_BEARER ? '' : 'none';
  $('#authState').textContent = GLOBAL_BEARER ? 'Token is set' : '';
});
$('#authCancel').addEventListener('click', ()=> $('#authModal').hidden = true);
$('#authSave').addEventListener('click', ()=>{
  GLOBAL_BEARER = $('#authToken').value.trim();
  localStorage.setItem('global_bearer', GLOBAL_BEARER);
  updateAuthUI();
  $('#authModal').hidden = true;
});
$('#authClear').addEventListener('click', ()=>{
  GLOBAL_BEARER = '';
  localStorage.removeItem('global_bearer');
  updateAuthUI();
  $('#authState').style.display = 'none';
  $('#authToken').value = '';
});

/* ========= Variables modal ========= */
function buildVarsTableBody(){
  const tb = $('#varsTable tbody');
  tb.innerHTML = '';
  let list = Array.isArray(ENV?.values) ? ENV.values : [];
  if (list.length < 10) {
    list = list.concat(
      Array.from({length: 10 - list.length}, ()=>({key:'', value:'', enabled:false}))
    );
  }
  list.forEach((v, i)=>{
    const tr = document.createElement('tr');
    const key = v.key ?? v.name ?? '';
    const val = v.currentValue ?? v.value ?? '';
    const enabled = v.enabled !== false;
    tr.append(
      el('td',{}, el('input',{value:key, 'data-idx':i, 'data-field':'key', type:'text'})),
      el('td',{}, el('input',{value:val, 'data-idx':i, 'data-field':'value', type:'text'})),
      el('td',{}, el('input',{type:'checkbox', checked:enabled, 'data-idx':i, 'data-field':'enabled'}))
    );
    tb.append(tr);
  });
  const trNew = document.createElement('tr');
  trNew.append(
    el('td',{}, el('input',{'data-idx':'new','data-field':'key', placeholder:'key', type:'text'})),
    el('td',{}, el('input',{'data-idx':'new','data-field':'value', placeholder:'value', type:'text'})),
    el('td',{}, el('input',{type:'checkbox','data-idx':'new','data-field':'enabled', checked:true}))
  );
  tb.append(trNew);
}
function readVarsTable(){
  const rows = Array.from($('#varsTable tbody').querySelectorAll('tr'));
  const out = [];
  rows.forEach(tr=>{
    const keyInp = tr.querySelector('input[data-field="key"]');
    const valInp = tr.querySelector('input[data-field="value"]');
    const enInp  = tr.querySelector('input[data-field="enabled"]');
    const key = (keyInp?.value ?? '').trim();
    const val = valInp?.value ?? '';
    const enabled = !!(enInp?.checked);
    if (key || val) out.push({ key, value: val, enabled });
  });
  return out;
}
$('#varsBtn').addEventListener('click', ()=>{
  if (!ENV) ENV = { values: [] };
  if (!Array.isArray(ENV.values)) ENV.values = [];
  buildVarsTableBody();
  $('#varsModal').hidden = false;
});
$('#varsCancel').addEventListener('click', ()=> $('#varsModal').hidden = true);
$('#varsSave').addEventListener('click', ()=>{
  const rows = readVarsTable();
  ENV.values = rows.map(r=>({ key: r.key, value: r.value, enabled: r.enabled }));
  try{ localStorage.setItem('pm_env', JSON.stringify(ENV)); }catch{}
  buildVarMap();
  renderTree($('#search').value||'');
  $('#varsModal').hidden = true;
});
$('#envImportFile').addEventListener('change', async (e)=>{
  const f = e.target.files[0]; 
  if (!f) return;
  const txt = await f.text();
  try {
    let parsed = JSON.parse(txt);
    if (Array.isArray(parsed?.values)) {
      ENV = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const values = Object.entries(parsed).map(([k,v])=>({key:k, value:String(v), enabled:true}));
      ENV = { name: 'Imported', values };
    } else {
      throw new Error('Unknown env format');
    }

    const currentEnv = localStorage.getItem('selected_env') || 'dev';
    localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(ENV));

    buildVarMap();
    buildVarsTableBody();
    alert(`Environment imported for ${currentEnv.toUpperCase()}.`);
  } catch(err){ 
    alert('Import error: '+err.message); 
  }
});


/* ========= Env Dropdown ========= */
const ENV_PATHS = {
  dev: './data/dev_environment.json',
  staging: './data/staging_environment.json',
  prod: './data/prod_environment.json'
};

const envDropdown = document.getElementById('envDropdown');
const envCurrent = envDropdown.querySelector('.envCurrent');
const envList = envDropdown.querySelector('.envList');
const envOptions = envDropdown.querySelectorAll('.envOption');

const savedEnv = localStorage.getItem('selected_env') || 'dev';
setEnvUI(savedEnv);
loadEnv(savedEnv);

function setEnvUI(envKey) {
  const opt = envDropdown.querySelector(`.envOption.${envKey}`);
  if (opt) {
    envCurrent.textContent = opt.textContent;
    envCurrent.className = `envCurrent ${envKey}`;
  }
}

async function loadEnv(envKey) {
  try {
    // пробуем достать из localStorage
    const stored = localStorage.getItem(`pm_env_${envKey}`);
    if (stored) {
      ENV = JSON.parse(stored);
    } else {
      const res = await fetch(ENV_PATHS[envKey], { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load env');
      const txt = await res.text();
      ENV = JSON.parse(txt);
      localStorage.setItem(`pm_env_${envKey}`, txt);
    }

    buildVarMap();
    renderTree($('#search').value || '');
    $('#loadedInfo').textContent = shortInfo();
  } catch (err) {
    showError(
      'Environment Load Error',
      'Failed to load environment file. Please try importing your own JSON.'
    );

    ENV = { values: [] };
    for (let i = 0; i < 10; i++) {
      ENV.values.push({ key: '', value: '', enabled: false });
    }
    localStorage.setItem(`pm_env_${envKey}`, JSON.stringify(ENV));
    buildVarMap();
    renderTree($('#search').value || '');
    $('#loadedInfo').textContent = shortInfo();
  }
}


envCurrent.onclick = () => {
  envList.style.display = envList.style.display === 'none' ? 'block' : 'none';
};

envOptions.forEach(opt => {
  opt.onclick = () => {
    const envKey = opt.dataset.value;
    localStorage.setItem('selected_env', envKey);
    setEnvUI(envKey);
    loadEnv(envKey);
    envList.style.display = 'none';
  };
});

// закрытие при клике вне dropdown
document.addEventListener('click', (e) => {
  if (!envDropdown.contains(e.target)) envList.style.display = 'none';
});


/* ========= Loaders & session ========= */
$('#collectionFile').addEventListener('change', onCollectionUpload);
$('#envFile').addEventListener('change', onEnvUpload);
$('#search').addEventListener('input', debounce((e)=> renderTree(e.target.value), 200));

async function onCollectionUpload(e){
  const f = e.target.files[0]; if(!f) return;
  const txt = await f.text();
  try{
    COLLECTION = JSON.parse(txt); localStorage.setItem('pm_collection', txt);
    ITEMS_FLAT = []; flattenItems(COLLECTION); buildVarMap(); renderTree($('#search').value||'');
    $('#loadedInfo').textContent = shortInfo();
    if (AUTO_OPEN_FIRST) autoOpenFirst();
  }catch(err){ alert('Collection parse error: '+err.message); }
}
async function onEnvUpload(e){
  const f = e.target.files[0]; if(!f) return;
  const txt = await f.text();
  try{
    ENV = JSON.parse(txt); localStorage.setItem('pm_env', txt);
    buildVarMap(); renderTree($('#search').value||'');
    $('#loadedInfo').textContent = shortInfo();
  }catch(err){ alert('Environment parse error: '+err.message); }
}
function shortInfo(){
  const name = COLLECTION?.info?.name || 'Collection';
  const cnt = ITEMS_FLAT.length;
  const envName = ENV?.name || ENV?.info?.name || 'env';
  const hasEnv = ENV ? `, env: ${envName}` : '';
  return `${name} (${cnt} requests${hasEnv})`;
}
function autoOpenFirst(){
  const first = ITEMS_FLAT[0];
  if (first){ $('#welcomeCard')?.remove(); openRequest(first); }
}

  function makePmAdapter(ctx){
  // гарантируем наличие ctx.vars
  if (!ctx.vars) ctx.vars = { ...VARS };

  const persistEnv = () => {
    try { localStorage.setItem('pm_env', JSON.stringify(ENV)); } catch {}
    if (typeof buildVarMap === 'function') buildVarMap();
  };

  const setEnv = (key, value) => {
    // обновляем runtime
    ctx.vars[key] = value;

    // синхронизируем in-memory ENV
    if (!window.ENV) window.ENV = { values: [] };
    if (!Array.isArray(ENV.values)) ENV.values = [];

    const row = ENV.values.find(v => v.key === key);
    if (row) {
      row.value = value; row.enabled = true;
    } else {
      ENV.values.push({ key, value, enabled: true });
    }

    persistEnv();

    // если открыт модал, обновим таблицу
    const modal = document.querySelector('#varsModal');
    if (modal && !modal.hidden && typeof buildVarsTableBody === 'function') {
      try { buildVarsTableBody(); } catch {}
    }
  };

  const getEnv = (key) => {
    // читаем приоритетно из in-memory ENV
    if (Array.isArray(ENV?.values)) {
      const row = ENV.values.find(v => v.key === key && v.enabled !== false);
      if (row) return row.value;
    }
    // fallback на текущие vars
    return ctx.vars[key];
  };

  const response = {
    code: ctx.response?.status ?? 0,
    text: () => ctx.response?.bodyText ?? '',
    json: () => {
      try {
        return JSON.parse(ctx.response?.bodyText ?? '');
      } catch(e) {
        throw new Error('pm.response.json() parse error: ' + e.message);
      }
    }
  };

  return {
    // совместимость с Postman
    environment: {
      set: setEnv,
      get: getEnv,
      unset: (key) => {
        if (!Array.isArray(ENV?.values)) ENV.values = [];
        const idx = ENV.values.findIndex(v => v.key === key);
        if (idx >= 0) ENV.values.splice(idx, 1);
        delete ctx.vars[key];
        persistEnv();
      }
    },
    variables: { get: getEnv, set: setEnv },         // алиасы
    globals: { get: getEnv, set: setEnv },
    collectionVariables: { get: getEnv, set: setEnv },
    request: ctx.request,
    response
  };
}

/* === Autoload from root (or query paths) === */
(async function bootstrap(){
  updateAuthUI();
  let loadedSomething = false;
  try{
    const colRes = await fetch(DEFAULT_COLLECTION_PATH, {cache:'no-cache'});
    if (colRes.ok){ const txt = await colRes.text(); COLLECTION = JSON.parse(txt); localStorage.setItem('pm_collection', txt); loadedSomething = true; }
  }catch{}
  try{
    const envRes = await fetch(DEFAULT_ENV_PATH, {cache:'no-cache'});
    if (envRes.ok){ const txt = await envRes.text(); ENV = JSON.parse(txt); localStorage.setItem('pm_env', txt); }
  }catch{}
  if (!loadedSomething){
    const storedCol = localStorage.getItem('pm_collection'); if (storedCol){ try{ COLLECTION = JSON.parse(storedCol); loadedSomething = true; }catch{} }
    const storedEnv = localStorage.getItem('pm_env'); if (storedEnv){ try{ ENV = JSON.parse(storedEnv); }catch{} }
  }
  if (loadedSomething){
    ITEMS_FLAT = []; flattenItems(COLLECTION); buildVarMap(); renderTree('');
    $('#loadedInfo').textContent = shortInfo();
    $('#colLabel').style.display='none'; $('#envLabel').style.display='none';
    if (AUTO_OPEN_FIRST) autoOpenFirst();
  }else{
    renderTree('');
  }
})();
  // === Глобальный listener для закрытия dropdown ===
document.addEventListener('click', (e) => {
  const dropdowns = document.querySelectorAll('.methodList');
  dropdowns.forEach(list => {
    const wrap = list.parentElement;
    if (wrap && !wrap.contains(e.target)) {
      list.style.display = 'none';
    }
  });
});
/* ========= Error Modal ========= */
function showError(title, msg) {
  $('#errorTitle').textContent = title;
  $('#errorMessage').textContent = msg;
  $('#errorModal').hidden = false;
}

$('#errorClose').onclick = () => {
  $('#errorModal').hidden = true;
};

/* === Variable edit modal === */
let editingVarKey = null;

// клик по токену → открываем модалку
  document.addEventListener('click', (e) => {
  const span = e.target.closest('.var-token');
  if (!span) return;

  e.stopPropagation(); 
  editingVarKey = span.dataset.var;
  const current = VARS[editingVarKey] || '';
  $('#varEditValue').value = current;
  $('#varEditTitle').textContent = `Edit variable: ${editingVarKey}`;
  $('#varEditModal').hidden = false;
});

// закрыть
$('#varEditCancel').onclick = () => {
  $('#varEditModal').hidden = true;
  editingVarKey = null;
};

// сохранить
$('#varEditSave').onclick = () => {
  const newVal = $('#varEditValue').value;
  if (editingVarKey) {
    if (!ENV) ENV = { values: [] };
    if (!Array.isArray(ENV.values)) ENV.values = [];

    const row = ENV.values.find(v => v.key === editingVarKey);
    if (row) row.value = newVal;
    else ENV.values.push({ key: editingVarKey, value: newVal, enabled: true });

    localStorage.setItem('pm_env', JSON.stringify(ENV));
    buildVarMap();

    // обновляем URL строку
    const hidden = document.querySelector('#urlInp');
    const disp = document.querySelector('#urlInpDisplay');
    if (hidden && disp) {
      disp.innerHTML = renderUrlWithVars(hidden.value);
    }
  }
  $('#varEditModal').hidden = true;
  editingVarKey = null;
};
function highlightJSON(text) {
  if (!text) return "";
  // symbols
  let html = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // string
  html = html.replace(
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"]*)")(?!\s*:)/g,
    '<span class="json-string">$1</span>'
  );

  // keys
  html = html.replace(
    /(^|[\{\[,]\s*)("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"]*)")(\s*:)/g,
    '$1<span class="json-key">$2</span>$3'
  );
  // numbers
  html = html.replace(
    /\b(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+\-]?\d+)?)\b/g,
    '<span class="json-number">$1</span>'
  );
  // boolean
  html = html.replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>');
  // null
  html = html.replace(/\b(null)\b/g, '<span class="json-null">$1</span>');
  // URL 
  html = html.replace(
    /"(https?:\/\/[^"]+)"/g,
    '"<span class="json-url">$1</span>"'
  );
  // {{vars}} 
  html = html.replace(
    /(\{\{\s*[^}]+\s*\}\})/g,
    '<span class="json-var">$1</span>'
  );

  return html;
}


function placeCaretAtEnd(el) {
  el.focus();
  if (typeof window.getSelection != "undefined"
   && typeof document.createRange != "undefined") {
    let range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    let sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
function saveSelection(containerEl) {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(containerEl);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  const caretOffset = preCaretRange.toString().length;
  return caretOffset;
}

function restoreSelection(containerEl, offset) {
  if (offset == null) return;
  let charIndex = 0;
  const range = document.createRange();
  range.setStart(containerEl, 0);
  range.collapse(true);
  const nodeStack = [containerEl];
  let node, foundStart = false;

  while (!foundStart && (node = nodeStack.pop())) {
    if (node.nodeType === 3) { // text node
      const nextCharIndex = charIndex + node.length;
      if (offset >= charIndex && offset <= nextCharIndex) {
        range.setStart(node, offset - charIndex);
        range.collapse(true);
        foundStart = true;
      }
      charIndex = nextCharIndex;
    } else {
      let i = node.childNodes.length;
      while (i--) nodeStack.push(node.childNodes[i]);
    }
  }

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
