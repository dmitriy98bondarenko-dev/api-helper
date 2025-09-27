// js/config.js
const urlParams = new URLSearchParams(location.search);

export const DEFAULT_COLLECTION_PATH = urlParams.get('collection') || './data/postman_collection.json';
export const DEFAULT_ENV_PATH        = urlParams.get('env')        || './data/dev_environment.json';
export const AUTO_OPEN_FIRST         = urlParams.get('autoOpen') !== '0';

// Глобальный bearer (сеттер/геттер, чтобы централизовать хранение)
let _GLOBAL_BEARER = localStorage.getItem('global_bearer') || '';
export const getGlobalBearer = () => _GLOBAL_BEARER;
export const setGlobalBearer = (v) => {
  _GLOBAL_BEARER = String(v || '');
  localStorage.setItem('global_bearer', _GLOBAL_BEARER);
};

// Ключи и LocalStorage для состояний запросов
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
// === Proxy config ===
export const PROXY_URL = "http://localhost:8080/";

// request timeout helpers
const REQUEST_TIMEOUT_MS = 15000; // 15s — при желании вынеси в конфиг

export function fetchWithTimeout(url, opts = {}, ms = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const options = { ...opts, signal: controller.signal };
    const finalUrl = PROXY_URL ? PROXY_URL + url : url;

    return fetch(finalUrl, options)
        .finally(() => clearTimeout(timer));
}

const RESPONSE_BODY_MAX = 512 * 1024; // 512 KB — подбирается под твои нужды

export function clampStr(s, max = RESPONSE_BODY_MAX) {
    if (typeof s !== 'string') s = String(s ?? '');
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    const note = `\n/* truncated: ${s.length - max} bytes not stored */`;
    return cut + note;
}
