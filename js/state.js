// state.js
export const state = {
    COLLECTION: null,
    ENV: null,
    VARS: {},
    ITEMS_FLAT: [],
    CURRENT_REQ_ID: null,
    CURRENT_OP_EL: null,
    COLLECTION_SCRIPTS: { pre: '', post: '' },
    COLLECTION_VARS: {},
    GLOBALS: {},
    LOGS: [],
    TIME_PICKER_STATE: {}
};
export function resolveVars(str, extra={}) {
    if (typeof str !== 'string') return str;
    return str.replace(/{{\s*([^}]+)\s*}}/g, (_, k) => {
        if (extra && extra[k] != null) return extra[k];
        if (state.VARS[k] != null && state.VARS[k] !== '') return state.VARS[k];
        if (state.COLLECTION_VARS[k] != null && state.COLLECTION_VARS[k] !== '') return state.COLLECTION_VARS[k];
        return '';
    });
}



// load collection and env from json
export async function loadJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
    return res.json();
}
/** script storage helpers */
// save script to state and LS
export function saveScript(type, code, reqId = state.CURRENT_REQ_ID || 'global') {
    if (!['pre', 'post'].includes(type)) return;
    const key = `script_${type}_${reqId}`;
    localStorage.setItem(key, code);
    if (!state.COLLECTION_SCRIPTS) state.COLLECTION_SCRIPTS = { pre: '', post: '' };
    state.COLLECTION_SCRIPTS[type] = code;
}
// load script from LS
export function loadScript(type, reqId = state.CURRENT_REQ_ID || 'global', fallback = '') {
    if (!['pre', 'post'].includes(type)) return fallback;
    const key = `script_${type}_${reqId}`;
    const saved = localStorage.getItem(key);
    return saved ?? fallback;
}

// clear script from LS
export function clearScript(type, reqId = state.CURRENT_REQ_ID || 'global') {
    const key = `script_${type}_${reqId}`;
    localStorage.removeItem(key);
}
