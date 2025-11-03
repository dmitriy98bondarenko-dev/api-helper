// js/config.js
import {$, highlightMissingVars, showAlert, tableToSimpleArray} from "./ui.js";
import {state} from "./state.js";
import {buildVarMap, buildVarsTableBody, getEnvVarsOnly, updateVarsBtnCounter} from "./vars.js";
import {renderTree} from "./sidebar.js";
import {openRequest} from "./feature.js";

const urlParams = new URLSearchParams(location.search);

export const DEFAULT_COLLECTION_PATH = urlParams.get('collection') || './data/smoke_collection.json';
export const DEFAULT_ENV_PATH        = urlParams.get('env')        || './data/dev_environment.json';
export const AUTO_OPEN_FIRST         = urlParams.get('autoOpen') !== '0';
export const  COLLECTIONS = [
    { name: 'Create Orders',  path: './data/smoke_collection.json' },
    { name: 'Restrictions',   path: './data/restrictions_collection.json' }
];

let _GLOBAL_BEARER = localStorage.getItem('global_bearer') || '';
export const getGlobalBearer = () => _GLOBAL_BEARER;
export const setGlobalBearer = (v) => {
  _GLOBAL_BEARER = String(v || '');
  localStorage.setItem('global_bearer', _GLOBAL_BEARER);
};

// keys and LocalStorage
const reqKey = id => `pm_req_${id}`;
const scriptsKey = id => `pm_scripts_${id}`; // legacy

export function loadReqState(id) {
  try {
    const raw = localStorage.getItem(reqKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveReqState(id, patch) {
  const prev = loadReqState(id) || {};
  const next = { ...prev, ...patch };
  try { localStorage.setItem(reqKey(id), JSON.stringify(next)); } catch {}
}
export function clearReqState(id) {
  try { localStorage.removeItem(reqKey(id)); } catch {}
}
export function loadScriptsLegacy(id) {
  try { return JSON.parse(localStorage.getItem(scriptsKey(id)) || '{}'); } catch { return {}; }
}


export async function loadJson(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
    return resp.json();
}

// clear localStorage
export function clearLocalStorage(prefixes = [], exactKeys = []) {
    Object.keys(localStorage).forEach(key => {
        if (prefixes.some(p => key.startsWith(p)) || exactKeys.includes(key)) {
            localStorage.removeItem(key);
        }
    });
}


export function getVal(v) {
    return v?.currentValue ?? v?.value ?? v?.initialValue ?? '';
}
/* proxy config
export const PROXY_URL = "http://localhost:8080/";
const REQUEST_TIMEOUT_MS = 15000;
export function fetchWithTimeout(url, opts = {}, ms = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const options = { ...opts, signal: controller.signal };
    const finalUrl = PROXY_URL? PROXY_URL + url: url;

    return fetch(finalUrl, options)
        .finally(() => clearTimeout(timer));
}
*/
/* delete proxy if run on uklon domain */
// Detect if the app is running on localhost (any port)
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// Proxy URL for local development
const LOCAL_PROXY_URL = 'http://localhost:8080/';

const REQUEST_TIMEOUT_MS = 15000;

export function fetchWithTimeout(url, opts = {}, ms = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const options = { ...opts, signal: controller.signal };

    // If running locally → prepend proxy
    // If not → keep the original URL untouched
    const finalUrl = isLocalhost ? LOCAL_PROXY_URL + url : url;

    return fetch(finalUrl, options)
        .finally(() => clearTimeout(timer));
}
*/

const RESPONSE_BODY_MAX = 512 * 1024; // 512 KB

export function clampStr(s, max = RESPONSE_BODY_MAX) {
    if (typeof s !== 'string') s = String(s ?? '');
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const note = `\n/* truncated: ${s.length - max} bytes not stored */`;
    return cut + note;
}
export function getSelectedCollection() {
    return localStorage.getItem('selected_collection') || DEFAULT_COLLECTION_PATH;
}
export function setSelectedCollection(path) {
    localStorage.setItem('selected_collection', path);
}
export function initEnvDropdown() {
    const envDropdown = $('#envDropdown');
    if (!envDropdown) return;

    const envCurrent = envDropdown.querySelector('.envCurrent');
    const envList = envDropdown.querySelector('.envList');

    // derive env from LS
    let currentEnv = localStorage.getItem('selected_env') || 'dev';
    document.documentElement.setAttribute('data-env', currentEnv);
    envCurrent.innerHTML = currentEnv.toUpperCase() + ' <span class="arrow">▼</span>';
    envCurrent.className = 'envCurrent ' + currentEnv;

    // open dropdown on click
    envCurrent.onclick = () => {
        const isOpen = envList.style.display === 'block';
        envList.style.display = isOpen ? 'none' : 'block';
        envCurrent.querySelector('.arrow').textContent = isOpen ? '▼' : '▲';
    };

    // reset  .envOption
    envList.querySelectorAll('.envOption').forEach(opt => {
        const newOpt = opt.cloneNode(true);
        opt.parentNode.replaceChild(newOpt, opt);
    });

    // new env options
    envList.querySelectorAll('.envOption').forEach(opt => {
        opt.addEventListener('click', async () => {
            const envKey = opt.dataset.value; // dev / staging / prod
            let newPath;
            if (envKey === 'dev') newPath = './data/dev_environment.json';
            if (envKey === 'staging') newPath = './data/staging_enviroment.json';
            if (envKey === 'prod') newPath = './data/prod_environment.json';

            // try load from LocalStorage
            let savedEnv = null;
            try {
                const raw = localStorage.getItem(`pm_env_${envKey}`);
                if (raw) savedEnv = JSON.parse(raw);
            } catch {}

            // if LS empty read from file
            if (savedEnv && Array.isArray(savedEnv.values)) {
                state.ENV = savedEnv;
            } else {
                try {
                    const newEnv = await loadJson(newPath);
                    state.ENV = newEnv;
                    localStorage.setItem(`pm_env_${envKey}`, JSON.stringify(newEnv));
                } catch (err) {
                    showAlert(`Failed to load environment: ${envKey}`, 'error');
                    state.ENV = { values: [] };
                    localStorage.setItem(`pm_env_${envKey}`, JSON.stringify(state.ENV));
                }
            }

            // update LS and UI
            localStorage.setItem('selected_env', envKey);

            buildVarMap();
            renderTree('', { onRequestClick: openRequest });
            highlightMissingVars(document, getEnvVarsOnly());
            updateVarsBtnCounter();

            const varsModal = $('#varsModal');
            if (varsModal && !varsModal.hidden) buildVarsTableBody();

            envCurrent.innerHTML = opt.textContent + ' <span class="arrow">▼</span>';
            envCurrent.className = 'envCurrent ' + envKey;

            envList.style.display = 'none';
            document.documentElement.setAttribute('data-env', envKey);
            showAlert(`Environment switched: ${envKey.toUpperCase()}`, 'success');

            // open current request if exists
            if (state.CURRENT_REQ_ID) {
                const item = state.ITEMS_FLAT.find(x => x.id === state.CURRENT_REQ_ID);
                if (item) openRequest(item, true);
            }
        });
    });

    // close dropdown on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            envList.style.display = 'none';
            envCurrent.querySelector('.arrow').textContent = '▼';
        }
    });
}
// delete (doesnt work hotkey send req)
export function forceSave() {
    const params = tableToSimpleArray(document.querySelector('#paneParams table')?.tBodies[0] || []);
    const headers = tableToSimpleArray(document.querySelector('#paneHeaders table')?.tBodies[0] || []);
    const body = document.querySelector('#bodyRawArea')?.textContent || '';
    const authToken = document.querySelector('#authTokenInp')?.textContent.trim() || '';

    saveReqState(state.CURRENT_REQ_ID, {
        method: getSelectedMethod(),
        url: document.querySelector('#urlInp')?.value.trim(),
        params, headers,
        body,
        auth: { type: 'bearer', token: authToken }
    });
}
