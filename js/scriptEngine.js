// scriptEngine.js (postman)
import { state, resolveVars } from './state.js';
import {buildVarMap, updateVarsBtnCounter} from './vars.js';
import { fetchWithTimeout } from './config.js';

// detection content type
export function detectContentType(body){
    const s = (body||'').trim();
    if (!s) return null;
    try{ JSON.parse(s); return 'application/json'; }catch{}
    if (/^[^=\s&]+=[^=&]*(?:&[^=\s&]+=[^=&]*)*$/.test(s)) return 'application/x-www-form-urlencoded';
    if (/^--?[-\w]+/i.test(s) && /content-disposition/i.test(s)) return 'multipart/form-data';
    return null;
}
function safeParse(s) {
    try { return s ? JSON.parse(s) : null; }
    catch { return null; }
}

// postman scripts
export async function runUserScript(code, ctx) {
    const pm = makePmAdapter(ctx);

    // get functions from global env
    const globalFns = Object.entries(state.GLOBALS || {})
        .filter(([k]) => k.endsWith("Fn"))
        .map(([k, v]) => v)
        .join("\n");

    const collectionFns = Object.entries(state.COLLECTION_VARS || {})
        .filter(([k, v]) => k.endsWith("Fn") && typeof v === "string" && v.trim())
        .map(([k, v]) => v)
        .join("\n");

    try {
        //console.log("[runUserScript] START");

        // async api interception (Monkey-Patching)
        // creating wrapper functions for automatic Promise registration


        // wrapper for setTimeout/setInterval
        const wrappedSetTimeout = (fn, delay, ...args) => {
            const p = new Promise(resolve => {
                globalThis.setTimeout(() => {
                    try {
                        if (typeof fn === 'function') fn(...args);
                    } catch(e) {
                        // log error, but do not reject the Promise
                        ctx._logs.push("[ERROR] Async task error: " + (e?.message || String(e)));
                    }
                    resolve();
                }, delay);
            });

            // register promise for stabilization/cleanup
            ctx._promises.push(p);
            p.finally(() => {
                const idx = ctx._promises.indexOf(p);
                if (idx >= 0) ctx._promises.splice(idx, 1);
            });

            // return a mock ID compatible with native setTimeout
            return 1;
        };
        const wrappedSetInterval = (fn, delay, ...args) => {
            // same for setInterval (stubbed for simplicity, as it's rarely used in Postman context)
            return globalThis.setInterval(fn, delay, ...args);
        };

        // wrapper for fetch (if fareEstimateFn utilizes the native API).
        const wrappedFetch = (url, options) => {
            // use native fetch if available
            const p = fetchWithTimeout(url, options)
                .catch(err => {
                    ctx._logs.push(`[ERROR] fetch error: ${err.message}`);
                    throw err; // promise rejection if fetch fails
                });

            // register promise in context for stabilization cycle
            ctx._promises.push(p);
            p.finally(() => {
                const idx = ctx._promises.indexOf(p);
                if (idx >= 0) ctx._promises.splice(idx, 1);
            });

            return p;
        };


        // initializing sandbox with function overrides
        // pass wrappers as arguments to override global functions
        const asyncFn = new Function('ctx', 'pm', 'state', 'setTimeout', 'setInterval', 'fetch', `
            "use strict";
            
            // change console.log to ctx._logs
            const console = { 
                log: (...a) => {
                    const msg = a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ');
                    ctx._logs.push(msg);
                },
                warn: (...a) => ctx._logs.push("[WARN] " + a.join(" ")),
                error: (...a) => ctx._logs.push("[ERROR] " + a.join(" "))
            };
            
            // injecting postman defined functions
            ${globalFns}
            ${collectionFns}
            
            // execute scripts, which may contain await
            return (async () => { ${code} })();
        `);

        // execution and stabilisation
        // passing the patched wrappers for execution

        // wait for the main script Promise to complete
        const scriptExecutionPromise = asyncFn(
            ctx,
            pm,
            state,
            wrappedSetTimeout,
            wrappedSetInterval,
            wrappedFetch // passing the wrappers
        );
        await scriptExecutionPromise;

        // stabilization process
        let round = 0;
        const MAX_ROUNDS = 20;
        let activePromisesExist = true;
        const STABILIZATION_WAIT_MS = 10;

        while (activePromisesExist && round < MAX_ROUNDS) {
            round++;
            const pendingCount = ctx._promises.length;

            if (pendingCount > 0) {
                // if activity found waiting for all active promises
                const current = [...ctx._promises];
                ctx._promises.length = 0;

                // wait completion of all active Promises
                await Promise.allSettled(current);

                // continue loop immediately to check if resolved Promises spawned new tasks
            } else {
                // short pause to allow the event Loop to process microtasks
                await new Promise(r => globalThis.setTimeout(r, STABILIZATION_WAIT_MS));

                // check if any new Promises were created during the short pause
                activePromisesExist = ctx._promises.length > 0;
                if (!activePromisesExist) {
                    break; // no more active promises, break the loop
                }
            }
        }

        if (round >= MAX_ROUNDS) {
            console.warn("Breaking due to maximum stabilization rounds reached");
        }

        //if (ctx._logs.length) console.log("Script logs:", ctx._logs);

        ctx._allDone = true;

    } catch (err) {
        ctx._logs.push("Script execution error: " + (err?.message || String(err)));
    }
}
// fix script engine without promises


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
// request ui
export function makePostCtx({request, response, error}){
    const ctx = {
        _logs: [],
        _promises: [],
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
    // env helpers
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

    // response facade for post request
    const response = {
        code: ctx.response?.status ?? 0,
        text: () => ctx.response?.bodyText ?? '',
        json: () => {
            const t = ctx.response?.bodyText ?? '';
            try { return JSON.parse(t); }
            catch (e) { throw new Error('pm.response.json() parse error: ' + e.message); }
        }
    };

     //  headers like in postman
    if (!Array.isArray(ctx.request.headers)) ctx.request.headers = [];

    const headerAPI = {
        add({ key, value }) {
            if (!key) return;
            // search headers + case insensitive
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

    // pm facade
    return {
        environment: { set: setEnv, get: getEnv, unset: (key) => {
                if (!Array.isArray(state.ENV?.values)) state.ENV.values = [];
                const idx = state.ENV.values.findIndex(v => v.key === key);
                if (idx >= 0) state.ENV.values.splice(idx, 1);
                delete state.VARS[key];
                buildVarMap();
            }},
        variables: {
            get: getEnv,
            set: setEnv,
            // replace in string(for scriipts)
            replaceIn: (str) => {
                if (typeof str !== "string") return str;

                return str.replace(/\{\{\s*([^}]+)\s*\}\}/g, (m, name) => {
                    const val = getEnv(name) || state.COLLECTION_VARS[name] || state.GLOBALS[name];
                    if (val) return val;

                    // generator guid
                    if (name === "$randomUUID") {
                        return (crypto.randomUUID ? crypto.randomUUID() :
                            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                                return v.toString(16);
                            }));
                    }
                    return m;
                });
            }
        },
        globals: {
            get: (key) => state.GLOBALS[key] ?? undefined,
            set: (key, value) => { state.GLOBALS[key] = value; },
            unset: (key) => { delete state.GLOBALS[key]; }
        },
        collectionVariables: {
            get: (key) => {
                if (key === "fareEstimatePayloadAdditional") {
                    const safeParse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
                    const norm = (n) => Number(Number(n).toFixed(5));
                    const ensureString = (v) => (typeof v === "string") ? v : JSON.stringify(v ?? {});
                    const ensureParsed = (s) => { try { return JSON.parse(ensureString(s)); } catch { return {}; } };

                    // get points from localStorage
                    const pickup  = safeParse(localStorage.getItem("pickup_point"));
                    const dropoff = safeParse(localStorage.getItem("dropoff_point"));

                    // read original payload in collection
                    const base = ensureParsed(state.COLLECTION_VARS[key]);
                    const origPoints = Array.isArray(base?.route?.points) ? base.route.points : [];

                    // geb base route points and copy to new array
                    const points = [...origPoints];

                    // check if has custom pickup point, set it to first point
                    if (pickup?.lat != null && pickup?.lng != null) {
                        if (points.length > 0) points[0] = {
                            lat: norm(pickup.lat),
                            lng: norm(pickup.lng),
                            name: pickup.name || points[0]?.name || "Pickup Point"
                        };
                        else points.push({
                            lat: norm(pickup.lat),
                            lng: norm(pickup.lng),
                            name: pickup.name || "Pickup Point"
                        });
                    }

                    // check if has custom dropoff point, set it to second point
                    if (dropoff?.lat != null && dropoff?.lng != null) {
                        if (points.length > 1) points[1] = {
                            lat: norm(dropoff.lat),
                            lng: norm(dropoff.lng),
                            name: dropoff.name || points[1]?.name || "Dropoff Point"
                        };
                        else points.push({
                            lat: norm(dropoff.lat),
                            lng: norm(dropoff.lng),
                            name: dropoff.name || "Dropoff Point"
                        });
                    }

                    // if no points left, return original payload
                    if (points.length === 0) {
                        const orig = state.COLLECTION_VARS[key];
                        return ensureString(orig);
                    }

                    // set new route points in base payload
                    base.route = { ...(base.route || {}), points };
                    base.fare_id = base.fare_id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
                    base.include_route_info = (base.include_route_info !== false);

                    return JSON.stringify(base);
                }

                // fallback to other vars
                const val = state.COLLECTION_VARS[key];
                return (typeof val === "string") ? val : JSON.stringify(val ?? "");
            },

            // sync wrapper, returning/registering promise
            set: (key, value) => {
                const p = (async () => {
                    try {
                        state.COLLECTION_VARS[key] = value;
                        state.VARS[key] = value;
                        buildVarMap();

                        if (!state.ENV) state.ENV = { values: [] };
                        if (!Array.isArray(state.ENV.values)) state.ENV.values = [];
                        const row = state.ENV.values.find(v => v.key === key);
                        if (row) {
                            row.value = value;
                            row.enabled = true;
                        } else {
                            state.ENV.values.push({ key, value, enabled: true });
                        }

                        const currentEnv = localStorage.getItem('selected_env') || 'dev';
                        localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));

                        // short pause for stabilization ls/ui
                        await new Promise(r => setTimeout(r, 25));
                    } catch (err) {
                        console.warn("collectionVariables.set error:", err);
                    }
                })();

                // register promise and runUserScript will wait for it to complete
                if (ctx && Array.isArray(ctx._promises)) ctx._promises.push(p);
                return p;
            },

            unset: (key) => {
                try {
                    delete state.COLLECTION_VARS[key];
                    delete state.VARS[key];
                    if (Array.isArray(state.ENV?.values)) {
                        const idx = state.ENV.values.findIndex(v => v.key === key);
                        if (idx >= 0) state.ENV.values.splice(idx, 1);
                    }
                    buildVarMap();
                    const currentEnv = localStorage.getItem('selected_env') || 'dev';
                    localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
                } catch (err) {
                    console.warn("collectionVariables.unset error:", err);
                }
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

        // pm.sendRequest (awaitable, adds promise to ctx)
        sendRequest: async (req, cb) => {
            // wrap each sendRequest call in a Promise and add it to the context
            const outerPromise = (async () => {
                let url = req.url;
                let method = req.method || 'GET';
                let headers = {};
                if (Array.isArray(req.header)) {
                    headers = Object.fromEntries(req.header.map(h => [h.key, h.value]));
                } else if (req.header && typeof req.header === "object") {
                    headers = req.header;
                }

                // normalize headers
                const normalized = {};
                Object.entries(headers).forEach(([k, v]) => {
                    if (!k) return;
                    const keyLower = String(k).toLowerCase();
                    if (keyLower === "content-type") normalized["Content-Type"] = v;
                    else if (keyLower === "authorization") normalized["Authorization"] = v;
                    else normalized[k] = v;
                });
                headers = normalized;

                let body;
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

                    // reset needAuth if got 401
                    if (res.status === 401) {
                        console.warn("pm.sendRequest detected 401, resetting needAuth");
                        try {
                            const currentEnv = localStorage.getItem('selected_env') || 'dev';
                            if (!state.ENV) state.ENV = { values: [] };
                            if (!Array.isArray(state.ENV.values)) state.ENV.values = [];
                            let row = state.ENV.values.find(v => v.key === 'needAuth');
                            if (row) {
                                row.value = 'true';
                                row.enabled = true;
                            } else {
                                state.ENV.values.push({ key: 'needAuth', value: 'true', enabled: true });
                            }
                            localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
                            state.COLLECTION_VARS.needAuth = "true";
                            buildVarMap();
                            updateVarsBtnCounter();
                        } catch (e) {
                            console.error("Failed to reset needAuth on 401:", e);
                        }
                    }

                    // build response object
                    const resObj = {
                        code: res.status,
                        status: res.statusText || String(res.status),
                        headers: Object.fromEntries(res.headers.entries()),
                        text: () => text,
                        json: () => {
                            try { return JSON.parse(text); }
                            catch (e) {
                                console.warn("pm.sendRequest JSON parse error:", e.message, text);
                                return { raw: text };
                            }
                        }
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
            })();

            // add to the context's active Promises list
            if (ctx && Array.isArray(ctx._promises)) {
                ctx._promises.push(outerPromise);
                outerPromise.finally(() => {
                    const idx = ctx._promises.indexOf(outerPromise);
                    if (idx >= 0) ctx._promises.splice(idx, 1);
                });
            }

            return outerPromise;
        },

        // test helpers
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
