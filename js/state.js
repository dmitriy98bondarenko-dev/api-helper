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
    GLOBALS: {}
};
export function resolveVars(str, extra={}) {
    if(typeof str!=='string') return str;
    return str.replace(/{{\s*([^}]+)\s*}}/g,(_,k)=>{
        if (extra && extra[k] != null) return extra[k];
        if (state.VARS[k] != null && state.VARS[k] !== '') return state.VARS[k];
        return '';
    });
}


// ====== Загрузка коллекции/окружения и старт ======
export async function loadJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
}
