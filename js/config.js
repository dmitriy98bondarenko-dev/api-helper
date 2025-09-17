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