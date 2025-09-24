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

export function flattenItems(node, path = []) {
    if (!node) return;
    if (Array.isArray(node)) {
        node.forEach(n => flattenItems(n, path));
        return;
    }
    if (node.item) {
        const newPath = node.name ? path.concat(stripPrefixFolder(node.name)) : path;
        node.item.forEach(child => flattenItems(child, newPath));
        return;
    }
    if (node.request) {
        const method = (node.request.method || 'GET').toUpperCase();
        const urlRaw = normalizeUrl(node.request.url);

        // стабильный ID (метод + путь + url)
        const stableId = `${path.join('/')}_${method}_${urlRaw}`;

        state.ITEMS_FLAT.push({
            id: stableId,
            path: path.join(' / '),
            name: node.name || '(untitled)',
            request: node.request,
            event: node.event || []
        });
    }
}

// === общий заголовок папки
function makeFolderHeader({ title, controls, nodeEl }) {
    const header = el(
        'div',
        {
            class: 'folder',
            onclick: () => {
                nodeEl.classList.toggle('collapsed'); // только класс, без подмены SVG
            }
        },
        makeArrow(),                                // ← стрелка всегда слева
        el('span', { class: 'folderTitle' }, title),
        el('div', { class: 'folderControls' }, controls || null) // всё справа
    );
    return header;
}

export function renderTree(filter = '', { onRequestClick } = {}) {
    const tree = $('#tree');
    tree.innerHTML = '';

    const q = (filter || '').toLowerCase();
    const match = (s) => (s || '').toLowerCase().includes(q);
// ==== 1. Загружаем пины ====
    const pinnedIds = getPinnedIds();

// ==== 2. Если есть пины — рендерим ====
    if (pinnedIds.length) {
        const sec = el('div', { class: 'node' });

        const clearBtn = el('button', {
            class: 'clearPinsBtn',
            title: 'Unpin all',
            onclick: (e) => {
                e.stopPropagation();
                setPinnedIds([]); // очистить LS
                renderTree(filter, { onRequestClick });
            }
        }, '✖');

        const folderHeader = makeFolderHeader({
            title: 'Pins',
            controls: clearBtn,
            nodeEl: sec
        });


        sec.append(folderHeader);

        const content = el('div', { class: 'folderContent' });

        pinnedIds.forEach(id => {
            const it = state.ITEMS_FLAT.find(x => x.id === id);
            if (!it) return; // вдруг в коллекции нет

            const method = (it.request.method || 'GET').toUpperCase();
            const urlRaw = normalizeUrl(it.request.url);
            const urlResolved = resolveVars(urlRaw);
            const displayPath = pathOnly(urlResolved || urlRaw);

            const row = el(
                'div',
                {
                    class: 'op ' + method,
                    'data-req-id': it.id,
                    onclick: (e) => {
                        onRequestClick && onRequestClick(it);
                        setActiveRow(e.currentTarget);
                    },
                    title: (it.name ? it.name + ' • ' : '') + (urlResolved || urlRaw || '')
                },
                el('div', { class: 'op-method' }, method),
                el('div', { class: 'op-path' },  it.name || displayPath || '(untitled)'),
                makePinBtn(() => {
                    removePin(it.id);
                    renderTree(filter, { onRequestClick });
                }, true)
            );

            content.append(row);
        });

        sec.append(content);
        tree.append(sec);
    }

    // ==== 3. Группировка по папкам ====
    const groups = {};
    state.ITEMS_FLAT.forEach(it => {
        if (pinnedIds.includes(it.id)) return;

        const folder = it.path || 'ROOT';
        const urlRaw = normalizeUrl(it.request.url);
        const urlResolved = resolveVars(urlRaw);
        const urlPath = pathOnly(urlResolved || urlRaw);
        const folderShort = (folder.split(' / ').pop() || folder);

        if (q && !(
            match(it.name) ||
            match(folder) ||
            match(folderShort) ||
            match(urlRaw) ||
            match(urlPath)
        )) return;

        if (!groups[folder]) groups[folder] = [];
        groups[folder].push(it);
    });

    // ==== 4. Рендер групп ====
    Object.entries(groups).forEach(([folder, items]) => {
        const sec = el('div', { class: 'node' });

        const folderHeader = makeFolderHeader({
            title: folder === 'ROOT' ? 'No folder' : stripPrefixFolder(folder),
            nodeEl: sec
        });

        sec.append(folderHeader);

        const content = el('div', { class: 'folderContent' });

        items.forEach(it => {
            const urlRaw = normalizeUrl(it.request.url);
            const urlResolved = resolveVars(urlRaw);
            const method = (it.request.method || 'GET').toUpperCase();
            const displayPath = pathOnly(urlResolved || urlRaw);

            const row = el(
                'div',
                {
                    class: 'op ' + method,
                    'data-req-id': it.id,
                    onclick: (e) => {
                        onRequestClick && onRequestClick(it);
                        setActiveRow(e.currentTarget);
                    },
                    title: (it.name ? it.name + ' • ' : '') + (urlResolved || urlRaw || '')
                },
                el('div', { class: 'op-method' }, method),
                el('div', { class: 'op-path' },  it.name || displayPath || '(untitled)'),
                makePinBtn(() => {
                    addPin(it);
                    renderTree(filter, { onRequestClick });
                })
            );

            content.append(row);
        });

        sec.append(content);
        tree.append(sec);
    });

    if (!tree.children.length) {
        const emptyWrap = el('div', { class: 'empty-state' },
            el('img', {
                src: './icons/empty_light.png',
                class: 'empty-img light'
            }),
            el('img', {
                src: './icons/empty_dark.png',
                class: 'empty-img dark'
            }),
            el('div', { class: 'empty-text' }, 'Nothing found')
        );
        tree.append(emptyWrap);
    }

}

// ==== Helpers ====
/* const ARROW_RIGHT = `<svg width="12" height="12" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6z"/></svg>`;
const ARROW_DOWN = `<svg width="12" height="12" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6z"/></svg>`;
*/
const ARROW_CHEVRON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">

  <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const PIN_ICON    = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M14 2v2h1v5l4 4v2h-6v7l-2-1-2 1v-7H3v-2l4-4V4h1V2h6z"/></svg>`;

// ==== Pins utils ====
function getPinnedIds() {
    try {
        return JSON.parse(localStorage.getItem('pinnedRequests') || '[]');
    } catch {
        return [];
    }
}

export function setPinnedIds(ids) {
    localStorage.setItem('pinnedRequests', JSON.stringify(ids));
}

function addPin(item) {
    let ids = getPinnedIds();
    if (!ids.includes(item.id)) {
        ids.push(item.id);
        setPinnedIds(ids);
    }
}

function removePin(id) {
    let ids = getPinnedIds();
    ids = ids.filter(p => p !== id);
    setPinnedIds(ids);
}

// ==== UI helpers ====
function makeArrow() {
    const wrapper = el('span', { class: 'arrowIcon' });
    wrapper.innerHTML = ARROW_CHEVRON;
    return wrapper;
}

function makePinBtn(onClick, active = false) {
    const btn = el('button', {
        class: 'pinBtn' + (active ? ' active' : ''),
        onclick: (e) => { e.stopPropagation(); onClick(); }
    });

    if (active) {
        btn.textContent = '✖';
    } else {
        btn.innerHTML = PIN_ICON;
    }

    return btn;
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