// scriptEngine.js (postman)
import { state, resolveVars } from './state.js';
import { buildVarMap } from './vars.js';
import { fetchWithTimeout } from './config.js';

// Content-Type detection
export function detectContentType(body){
    const s = (body||'').trim();
    if (!s) return null;
    try{ JSON.parse(s); return 'application/json'; }catch{}
    if (/^[^=\s&]+=[^=&]*(?:&[^=\s&]+=[^=&]*)*$/.test(s)) return 'application/x-www-form-urlencoded';
    if (/^--?[-\w]+/i.test(s) && /content-disposition/i.test(s)) return 'multipart/form-data';
    return null;
}

// postman scripts
export async function runUserScript(code, ctx){
    const pm = makePmAdapter(ctx);

    // Подгружаем глобальные функции в scope
    const globalFns = Object.entries(state.GLOBALS || {})
        .filter(([k]) => k.endsWith("Fn"))
        .map(([k, v]) => v)
        .join("\n");

    try {
        const fn = new Function('ctx','pm','state', `
            "use strict";
            const console = { 
            log: (...a) => {
                const msg = a.map(x => 
                    typeof x === 'object' ? JSON.stringify(x) : String(x)
                ).join(' ');
                ctx._logs.push(msg);                      
                state.LOGS.push("Postman script: " + msg); 
            }
        };
        ${globalFns}
        ${code}
        `);

        fn(ctx, pm, state);
        await Promise.all(ctx._promises || []);
        if (ctx._logs.length) {
            console.log("Script logs:", ctx._logs);
        }

    } catch (err) {
        console.error("Script execution error:", err);}
}


//  contexts
export function makePreCtx({method, url, params, headers, body}){
    const ctx = {
        _logs: [], _promises: [], vars: {...state.VARS}, setVar: (k,v)=>{ state.VARS[k]=v; },
        request: { method, url, params: JSON.parse(JSON.stringify(params)), headers: JSON.parse(JSON.stringify(headers)), body },
        setHeader: (k,v)=>{ ctx.request.headers[k]=v; },
        setParam: (k,v)=>{ const p=ctx.request.params.find(x=>x.key===k); if(p) p.value=v; else ctx.request.params.push({key:k,value:v}); },
        setBody: v=>{ ctx.request.body = v; }, setMethod: m=>{ ctx.request.method = String(m||'GET').toUpperCase(); }, setUrl: u=>{ ctx.request.url = String(u||''); },
        log: (...a)=>ctx._logs.push(a.map(String).join(' '))
    };
    return ctx;
}
// ===== Request UI (сокращённо — ядро сохранено) =====
export function makePostCtx({request, response, error}){
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

// pm adapter
export function makePmAdapter(ctx) {
    // ---- ENV helpers ----
    const setEnv = (key, value) => {
        state.VARS[key] = value;
        if (!state.ENV) state.ENV = { values: [] };
        if (!Array.isArray(state.ENV.values)) state.ENV.values = [];
        const row = state.ENV.values.find(v => v.key === key);
        if (row) { row.value = value; row.enabled = true; }
        else { state.ENV.values.push({ key, value, enabled: true }); }
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

    // ---- Response facade (для post-сценариев) ----
    const response = {
        code: ctx.response?.status ?? 0,
        text: () => ctx.response?.bodyText ?? '',
        json: () => {
            const t = ctx.response?.bodyText ?? '';
            try { return JSON.parse(t); }
            catch (e) { throw new Error('pm.response.json() parse error: ' + e.message); }
        }
    };

     //  Headers API (как в Postman)
    // ---- Headers API (как в Postman) ----
    if (!Array.isArray(ctx.request.headers)) ctx.request.headers = [];

    const headerAPI = {
        add({ key, value }) {
            if (!key) return;
            // ищем существующий хедер (case-insensitive)
            const idx = ctx.request.headers.findIndex(h => String(h.key).toLowerCase() === String(key).toLowerCase());
            if (idx >= 0) {
                ctx.request.headers[idx].value = value;
                ctx.request.headers[idx].enabled = true;
            } else {
                ctx.request.headers.push({ key, value, enabled: true });
            }
        },
        set(key, value) { this.add({ key, value }); },
        upsert(h) { this.add(h); },
        remove(key) {
            if (!key) return;
            ctx.request.headers = ctx.request.headers.filter(
                h => String(h.key).toLowerCase() !== String(key).toLowerCase()
            );
        },
        get(key) {
            const row = ctx.request.headers.find(h => String(h.key).toLowerCase() === String(key).toLowerCase());
            return row ? { key: row.key, value: row.value } : undefined;
        },
        toJSON() {
            return ctx.request.headers.map(h => ({ key: h.key, value: h.value }));
        }
    };

    // ---- pm facade ----
    return {
        environment: { set: setEnv, get: getEnv, unset: (key) => {
                if (!Array.isArray(state.ENV?.values)) state.ENV.values = [];
                const idx = state.ENV.values.findIndex(v => v.key === key);
                if (idx >= 0) state.ENV.values.splice(idx, 1);
                delete state.VARS[key];
                buildVarMap();
            }},
        variables: { get: getEnv, set: setEnv },
        globals: {
            get: (key) => state.GLOBALS[key] ?? undefined,
            set: (key, value) => { state.GLOBALS[key] = value; },
            unset: (key) => { delete state.GLOBALS[key]; }
        },
        collectionVariables: {
            get: (key) => state.COLLECTION_VARS[key],
            set: (key, value) => {
                // 1) Запоминаем в collectionVariables
                state.COLLECTION_VARS[key] = value;
                state.VARS[key] = value;
                buildVarMap();

                // 2) Дублируем в environment (LS → pm_env_dev / staging / prod)
                if (!state.ENV) state.ENV = { values: [] };
                if (!Array.isArray(state.ENV.values)) state.ENV.values = [];
                const row = state.ENV.values.find(v => v.key === key);
                if (row) {
                    row.value = value;
                    row.enabled = true;
                } else {
                    state.ENV.values.push({ key, value, enabled: true });
                }

                try {
                    const currentEnv = localStorage.getItem('selected_env') || 'dev';
                    localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
                } catch (e) {
                    console.warn("Failed to persist env var", e);
                }
            },
            unset: (key) => {
                delete state.COLLECTION_VARS[key];
                delete state.VARS[key];

                if (Array.isArray(state.ENV?.values)) {
                    const idx = state.ENV.values.findIndex(v => v.key === key);
                    if (idx >= 0) state.ENV.values.splice(idx, 1);
                }

                buildVarMap();

                try {
                    const currentEnv = localStorage.getItem('selected_env') || 'dev';
                    localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
                } catch {}
            }
        },

        request: {
            get method(){ return ctx.request.method; },
            set method(v){ ctx.request.method = String(v || 'GET').toUpperCase(); },
            get url(){ return ctx.request.url; },
            set url(v){ ctx.request.url = String(v || ''); },
            headers: headerAPI,
            body: {
                raw(){ return ctx.request.body; },
                setRaw(v){ ctx.request.body = v; }
            }
        },

        response,

        // --- pm.sendRequest:
        sendRequest: async (req, cb) => {
            let url = req.url;
            let method = req.method || 'GET';
            let headers = {};
            if (Array.isArray(req.header)) {
                // стандартный формат Postman (массив объектов)
                headers = Object.fromEntries(req.header.map(h => [h.key, h.value]));
            } else if (req.header && typeof req.header === "object") {
                // если в скрипте передали как объект { "Content-Type": "application/json" }
                headers = req.header;
            }
            let body;
            // --- нормализация ключей заголовков ---
            const normalized = {};
            Object.entries(headers).forEach(([k, v]) => {
                if (!k) return;
                const keyLower = String(k).toLowerCase();
                // приведение "content-type" → "Content-Type"
                if (keyLower === "content-type") {
                    normalized["Content-Type"] = v;
                } else if (keyLower === "authorization") {
                    normalized["Authorization"] = v;
                } else {
                    normalized[k] = v;
                }
            });
            headers = normalized;

            if (req.body) {
                if (req.body.mode === 'raw' && typeof req.body.raw !== 'undefined') {
                    body = req.body.raw;
                } else if (typeof req.body === 'string') {
                    body = req.body;
                } else if (typeof req.body === 'object' && !req.body.mode) {
                    body = JSON.stringify(req.body);
                    if (!headers['Content-Type'] && !headers['content-type']) {
                        headers['Content-Type'] = 'application/json';
                    }
                }
            }

            if (typeof url === 'string') url = resolveVars(url);

            try {
                const res = await fetchWithTimeout(url, { method, headers, body });
                const text = await res.text();

                const resObj = {
                    code: res.status,
                    status: res.statusText || String(res.status),
                    headers: Object.fromEntries(res.headers.entries()),
                    text: () => text,
                    json: () => { try { return JSON.parse(text); } catch (e) { throw e; } }
                };

                ctx._logs.push(`pm.sendRequest → ${method} ${url} [${res.status}]`);
                if (typeof cb === 'function') cb(null, resObj);
                return resObj;
            } catch (err) {
                console.error("pm.sendRequest error:", err);
                ctx._logs.push(`pm.sendRequest error: ${err.message}`);
                if (typeof cb === 'function') cb(err);
                throw err;
            }
        },



        // простенькие тест-хелперы, чтобы не падало
        test: (name, fn) => {
            try { fn(); ctx._logs.push(`Test passed: ${name}`); }
            catch (err) { ctx._logs.push(`Test failed: ${name} - ${err.message}`); }
        },
        expect: (val) => ({
            to: {
                equal: (exp) => { if (val !== exp) throw new Error(`Expected ${val} to equal ${exp}`); },
                notEqual: (exp) => { if (val === exp) throw new Error(`Expected ${val} not to equal ${exp}`); }
            }
        })
    };
}
