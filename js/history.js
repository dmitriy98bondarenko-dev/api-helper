//history.js
import { $, el } from './ui.js';
import { openRequest } from './feature.js';
import { state } from './state.js';
import { renderTree } from './sidebar.js';
import { initHotkeys, renderHotkeysList } from "./hotkeys.js";

export function initSidebarNav() {
    const btnFolders   = $('#navFolders');
    const btnHistory   = $('#navHistory');
    const btnSearch    = $('#navSearch');                 // 🔍 кнопка-лупа
    const tree         = $('#tree');
    const historyPane  = $('#historyPane');
    const searchWrap   = document.querySelector('.searchWrap');
    const filterInp    = document.querySelector('#search');

    function activate(btn) {
        [btnFolders, btnHistory].forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    const getFilter = () => (filterInp?.value || '').trim();

    // единая точка применения фильтра к активной вкладке
    function applyFilterToActiveTab() {
        const f = getFilter();
        if (historyPane.hidden) {
            // мы на Folders
            renderTree(f, { onRequestClick: openRequest });
        } else {
            // мы на History
            renderHistory(f);
        }
    }

    // --- переключение вкладок ---
    btnFolders.addEventListener('click', () => {
        activate(btnFolders);
        tree.hidden = false;
        historyPane.hidden = true;
        // запускаем после смены hidden, чтобы не перебили другие слушатели
        requestAnimationFrame(applyFilterToActiveTab);
    });

    btnHistory.addEventListener('click', () => {
        activate(btnHistory);
        tree.hidden = true;
        historyPane.hidden = false;
        requestAnimationFrame(applyFilterToActiveTab);
    });

    // --- кнопка поиска в сайдбаре ---
    btnSearch?.addEventListener('click', () => {
        const active = btnSearch.classList.toggle('active');
        searchWrap.hidden = !active;

        if (active) {
            filterInp?.focus();
            applyFilterToActiveTab();                     // показать уже отфильтрованное
        } else {
            // выключили поиск — сбрасываем
            if (filterInp) filterInp.value = '';
            renderTree('', { onRequestClick: openRequest });
            renderHistory('');
        }
    });

    // --- live-поиск ---
    filterInp?.addEventListener('input', applyFilterToActiveTab);
    // --- горячие клавиши ---
    initHotkeys({
        btnFolders,
        btnHistory,
        btnSearch,
        searchWrap,
        filterInp,
        btnSettings: document.getElementById("navSettings"),
        sidebar: document.getElementById("settingsSidebar")
    });
    renderHotkeysList("hotkeysList");
}

export function addHistoryEntry({ method, url, body, response }) {
    const { status, statusText, headers, bodyText, timeMs } = response || {};

    let list = JSON.parse(localStorage.getItem('req_history') || '[]');
    list.unshift({
        method,
        url,
        body,
        response:response ? {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers || {},
            bodyText: response.bodyText || '',
            url,
            timeMs: response.timeMs || 0
        }: null,
        ts: Date.now()
    });

    list = list.slice(0, 50);
    localStorage.setItem('req_history', JSON.stringify(list));

    const historyPane = document.querySelector('#historyPane');
    if (historyPane && !historyPane.hidden) {
        renderHistory();
    }
}

function groupByTime(list) {
    const now = Date.now();
    const groups = {};

    list.forEach(entry => {
        const diffMs = now - entry.ts;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / (60 * 60000));

        let label = '';

        // 1) Последний час → пишем "just now", "3 min ago" и т.д.
        if (diffHours === 0) {
            if (diffMin === 0) {
                label = 'just now';
            } else {
                label = `${diffMin} min ago`;
            }
        }
        // 2) До 24 часов назад → пишем "1 hour ago", "5 hours ago" и т.д.
        else if (diffHours < 24) {
            label = diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
        }
        // 3) Сегодняшний день → группируем по часам
        else if (diffHours < 48) {
            const d = new Date(entry.ts);
            label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        // 4) Всё что старше → "More than a day ago"
        else {
            label = 'More than a day ago';
        }

        if (!groups[label]) groups[label] = [];
        groups[label].push(entry);
    });

    return groups;
}

function clearHistoryGroup(label) {
    let list = JSON.parse(localStorage.getItem('req_history') || '[]');
    const groups = groupByTime(list);
    delete groups[label];

    const newList = Object.values(groups).flat();

    localStorage.setItem('req_history', JSON.stringify(newList));
    renderHistory();
}


export function renderHistory(filter = '') {
    const historyPane = $('#historyPane');
    let list = JSON.parse(localStorage.getItem('req_history') || '[]');

    if (filter) {
        const f = filter.toLowerCase();
        list = list.filter(entry =>
            entry.url.toLowerCase().includes(f) ||
            entry.method.toLowerCase().includes(f) ||
            String(entry.response?.status || '').includes(f)
        );
    }

    if (!list.length) {
        historyPane.innerHTML = '<div class="muted">No history</div>';
        return;
    }

    historyPane.innerHTML = '';

    // delete btn
    const header = el('div', { class: 'historyHeader' },
        el('span', { class: 'historyHeaderTitle' }, 'History'),
        el('button', {
                class: 'historyClearAll',
                onclick: () => {
                    localStorage.removeItem('req_history');
                    renderHistory();
                }
            },
            el('svg', { class: 'icon-trash' },
                el('use', { href: '#icon-trash' })
            )
        )
    );
    historyPane.append(header);

    // groups
    const groups = groupByTime(list);

    Object.keys(groups).forEach(label => {
        const section = el('div', { class: 'historyGroup' });
        let arrow;


        const titleRow = el('div', {
                class: 'historyGroupTitle',
                onclick: () => {
                    body.hidden = !body.hidden;
                    arrow.classList.toggle('collapsed', body.hidden);
                }
            },
            el('div', { class: 'groupLabel' },
                arrow = el('svg', { class: 'toggleArrow' },
                    el('use', { href: '#icon-caret' })
                ),
                el('span', {}, label)
            ),
            el('button', {
                    type: 'button',
                    class: 'historyClearGroup',
                    onclick: (e) => {
                        e.stopPropagation();
                        clearHistoryGroup(label);
                    }
                },
                el('svg', { class: 'icon-trash' },
                    el('use', { href: '#icon-trash' })
                )
            )
        );


        // requests list
        const body = el('div', { class: 'historyGroupBody' });

        groups[label].forEach(entry => {
            const statusClass = entry.response?.status >= 200 && entry.response?.status < 300
                ? 'ok'
                : (entry.response ? 'err' : '');

            const item = el('div', { class: 'historyItem' },
                el('span', { class: 'historyMethod method-' + entry.method }, entry.method),
                entry.response
                    ? el('span', { class: 'historyStatus ' + statusClass }, entry.response.status)
                    : el('span', { class: 'historyStatus' }, '-'),
                el('span', {
                    class: 'historyUrl',
                    style: 'direction: rtl; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'
                }, entry.url),
                el('span', { class: 'historyTime' }, new Date(entry.ts).toLocaleTimeString())
            );

            // ✅ клик по элементу открывает запрос
            item.addEventListener('click', () => {
                const req = state.ITEMS_FLAT.find(x => x.request?.url?.raw === entry.url);
                if (req) {
                    openRequest(req);
                } else {
                    openRequest({
                        id: 'history-' + entry.ts,
                        request: {
                            method: entry.method,
                            url: entry.url,
                            header: [],
                            body: { raw: entry.body }
                        },
                        response: entry.response ? {
                            ...entry.response,
                            url: entry.url
                        } : null
                    }, true);
                }
            });

            body.append(item);
        });

        section.append(titleRow, body);
        historyPane.append(section);
    });
}
