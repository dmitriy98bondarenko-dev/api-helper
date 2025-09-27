// curl.js
import { el, $, showAlert } from './ui.js';
import { state, resolveVars } from './state.js';
import { saveReqState} from './config.js';
import { openRequest } from './feature.js';
import { tableToSimpleArray } from './ui.js';
import { detectContentType } from './scriptEngine.js';

// Copy cURL
export function copyCurl(paramsTable, headersTable, getSelectedMethod) {
    const m = getSelectedMethod();
    const params = tableToSimpleArray(paramsTable.tBodies[0]);
    const finalUrl = resolveVars(safeBuildUrl($('#urlInp').value.trim(), params));
    const hdrsArr = tableToSimpleArray(headersTable.tBodies[0]).filter(h=>h.enabled!==false);
    const hdrs = Object.fromEntries(hdrsArr.map(p=>[p.key, resolveVars(p.value)]));

    const authTypeEl = $('#authType');
    const authTokenEl = $('#authTokenInp');
    const authType = authTypeEl?.value || 'bearer';
    const authToken = resolveVars((authTokenEl?.textContent.trim() || ''));

    if (!Object.keys(hdrs).some(h=>h.toLowerCase()==='authorization')) {
        if (authType==='bearer' && authToken) hdrs['Authorization']='Bearer '+authToken;
        else if (getGlobalBearer()) hdrs['Authorization'] = 'Bearer ' + getGlobalBearer();
    }

    if (!Object.keys(hdrs).some(h=>h.toLowerCase()==='content-type')) {
        const ct = detectContentType($('#bodyRawArea').textContent || '');
        if (ct) hdrs['Content-Type'] = ct;
    }

    const body = (m==='GET' || m==='HEAD') ? '' : resolveVars($('#bodyRawArea').textContent || '');
    const hdrStr = Object.entries(hdrs).filter(([k])=>k).map(([k,v])=>` -H '${k}: ${String(v).replace(/'/g,"'\\''")}'`).join('');
    const bodyStr = body ? ` --data '${String(body).replace(/'/g,"'\\''")}'` : '';
    const cmd = `curl -X ${m}${hdrStr}${bodyStr} '${finalUrl.replace(/'/g,"'\\''")}'`;

    navigator.clipboard.writeText(cmd);
    showAlert('cURL copied', 'success');
}
export function safeBuildUrl(url, queryArr){
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


// Import cURL
export function openCurlImportModal() {
    if ($('#curlImportModal')) return;

    const textarea = el('textarea', {
        id: 'curlImportInput',
        class: 'code-editor',
        style: 'width:100%;height:200px;',
        placeholder: 'Enter cURL command'
    });

    const modal = el('div', { id: 'curlImportModal', class: 'modal' },
        el('div', { class: 'modal-content' },
            el('h3', {}, 'Import cURL'),
            textarea,
            el('div', { class: 'modal-actions' },
                el('button', {
                    class: 'btn',
                    onclick: () => {
                        parseAndApplyCurl($('#curlImportInput').value);
                        closeCurlImportModal();
                    }
                }, 'Import'),
                el('button', { class: 'btn secondary', onclick: closeCurlImportModal }, 'Cancel'),
                el('button', {
                    class: 'btn secondary',
                    onclick: async () => {
                        try {
                            const text = await navigator.clipboard.readText();
                            $('#curlImportInput').value = text;
                        } catch {
                            showAlert('Clipboard read failed', 'error');
                        }
                    }
                }, 'Paste')
            )
        )
    );

    document.body.appendChild(modal);
}

export function closeCurlImportModal() {
    $('#curlImportModal')?.remove();
}

export function parseAndApplyCurl(cmd) {
    if (!cmd.trim()) return;

    const parts = cmd.match(/'[^']*'|"[^"]*"|\S+/g) || [];
    let method = 'GET', url = '', body = '';
    const headers = [];
    const params = [];

    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];

        if (p === '-X' && parts[i+1]) {
            method = parts[++i].replace(/['"]/g, '').toUpperCase();
        }
        else if ((p === '-H' || p === '--header') && parts[i+1]) {
            const h = parts[++i].replace(/^['"]|['"]$/g, '');
            const [k, v] = h.split(/:\s*/);
            if (k) headers.push({ key: k, value: v || '', enabled: true });
        }
        else if ((p === '--data' || p === '-d' || p === '--data-raw') && parts[i+1]) {
            body = parts[++i].replace(/^['"]|['"]$/g, '');
        }
        else if (p.startsWith('http')) {
            url = p.replace(/^['"]|['"]$/g, '');
        }
    }

    // query-параметры из URL
    try {
        const u = new URL(url);
        u.searchParams.forEach((v, k) => {
            params.push({ key: k, value: v, enabled: true });
        });
        url = u.origin + u.pathname; // очищаем search → отдельно в params
    } catch {}

    // Authorization → переносим в authTab
    let auth = null;
    const idx = headers.findIndex(h => h.key.toLowerCase() === 'authorization');
    if (idx >= 0) {
        const val = headers[idx].value;
        if (/^bearer\s+/i.test(val)) {
            auth = { type: 'bearer', token: val.replace(/^bearer\s+/i, '') };
            headers.splice(idx, 1); // убираем из headers
        }
    }

    // берём текущий item
    const item = state.ITEMS_FLAT.find(x => x.id === state.CURRENT_REQ_ID);
    if (!item) {
        showAlert('No request selected to import cURL', 'error');
        return;
    }

    // обновляем сам item.request
    item.request.method = method;
    item.request.url = url;
    item.request.header = headers.map(h => ({
        key: h.key, value: h.value, disabled: !h.enabled
    }));
    item.request.body = body ? { raw: body } : {};
    if (auth) item.request.auth = auth;

    // сохраняем в localStorage
    const patch = { method, url, params, headers, body, auth };
    saveReqState(item.id, patch);

    // перерисовка
    openRequest(item);

    showAlert('cURL imported successfully', 'success');
}
