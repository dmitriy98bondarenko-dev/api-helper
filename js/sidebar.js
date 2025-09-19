//sidebar.js
import { $, el } from './ui.js';
import { resolveVars, state } from './state.js';


// ===== Sidebar =====
export function setActiveRow(elm){
    if (state.CURRENT_OP_EL) state.CURRENT_OP_EL.classList.remove('active');
    state.CURRENT_OP_EL = elm;
    if (state.CURRENT_OP_EL) state.CURRENT_OP_EL.classList.add('active');
}

export function stripPrefixFolder(name){
    return String(name||'').replace(/^DriverGateway\s*\/\s*/i,'') || 'No folder';
}

export function flattenItems(node, path=[]){
    if(!node) return;
    if(Array.isArray(node)){ node.forEach(n=>flattenItems(n, path)); return; }
    if(node.item){ const newPath = node.name ? path.concat(stripPrefixFolder(node.name)) : path; node.item.forEach(child=>flattenItems(child, newPath)); return; }
    if(node.request){
        state.ITEMS_FLAT.push({
            id: crypto.randomUUID(),
            path: path.join(' / '),
            name: node.name || '(untitled)',
            request: node.request,
            event: node.event || []
        });
    }

}

export function renderTree(filter = '', { onRequestClick } = {}) {
    const tree = $('#tree');
    tree.innerHTML = '';

    const q = (filter || '').toLowerCase();
    const match = s => (s || '').toLowerCase().includes(q);

    const groups = {};
    state.ITEMS_FLAT.forEach(it => {
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
            const row = el('div', {
                    class: 'op ' + method,
                    'data-req-id': it.id,
                    onclick: (e) => { onRequestClick(it); setActiveRow(e.currentTarget); },
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

export function normalizeUrl(u){
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

export function pathOnly(u){
    if(!u) return '';
    try{
        const full = resolveVars(u);
        const isAbs = /^https?:\/\//i.test(full);
        const urlObj = new URL(isAbs ? full : (location.origin + (full.startsWith('/')?full:'/'+full)));
        return urlObj.pathname || '/';
    }catch{ return String(u).replace(/^https?:\/\/[^/]+/i,'') || '/'; }
}
export function updateEnvDropdown(envKey) {
    const envCurrent = $('#envDropdown .envCurrent');
    if (envCurrent) {
        envCurrent.innerHTML = envKey.toUpperCase() + ' <span class="arrow">▼</span>';
        envCurrent.className = 'envCurrent ' + envKey;
    }
    import('./vars.js').then(({ updateVarsBtnCounter }) => {
        updateVarsBtnCounter();
    });
}