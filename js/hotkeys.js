// hotkeys.js
import { toggleTheme } from './ui.js';
import { buildVarMap, buildVarsTableBody, updateVarsBtnCounter } from './vars.js';
import { renderTree } from './sidebar.js';
import { openRequest } from './feature.js';
import { highlightMissingVars, showAlert } from './ui.js';
import { state, loadJson } from './state.js';
import {forceSave} from "./config.js";

export const HOTKEYS = [
    {
        group: "Navigation",
        keys: ["Mod+1"],
        description: "Open Folders tab",
        action: (btnFolders) => btnFolders?.click()
    },
    {
        group: "Navigation",
        keys: ["Mod+2"],
        description: "Open History tab",
        action: (btnHistory) => btnHistory?.click()
    },
    {
        group: "Search",
        keys: ["Mod+K"],
        description: "Open search and focus",
        action: (btnSearch, searchWrap, filterInp) => {
            if (searchWrap?.hidden) btnSearch?.click();
            filterInp?.focus();
            filterInp?.select();
        }
    },
    {
        group: "Settings",
        keys: ["Mod+D"],
        description: "Toggle settings sidebar",
        action: (sidebar) => {
            sidebar?.classList.toggle("open");
        }
    },
    {
        group: "Settings",
        keys: ["Mod+G"],
        description: "Toggle light/dark theme",
        action: () => toggleTheme()
    },
    //  env
    {
        group: "Environment",
        keys: ["Mod+L"],
        description: "Switch environment",
        action: () => cycleEnvironment()
    },
    {
        group: "Environment",
        keys: ["Mod+E"],
        description: "Toggle Variables modal",
        action: (toggleVarsModal) => toggleVarsModal?.()
    },
    //  requests
    {
        group: "Requests",
        keys: ["Mod+Enter"],
        description: "Run (Send request)",
        action: (sendBtn) => sendBtn?.click()
    },
    {
        group: "Requests",
        keys: ["Mod+ArrowDown"],
        description: "Next request",
        action: (selectNextRequest) => selectNextRequest?.()
    },
    {
        group: "Requests",
        keys: ["Mod+ArrowUp"],
        description: "Previous request",
        action: (selectPrevRequest) => selectPrevRequest?.()
    },
    {
        group: "Requests",
        keys: ["Mod+P"],
        description: "Pin/Unpin current request",
        action: (togglePinCurrent) => togglePinCurrent?.()
    }
];

export function initHotkeys({ btnFolders, btnHistory, btnSearch, searchWrap, filterInp, btnSettings, sidebar, sendBtn, selectNextRequest, selectPrevRequest, togglePinCurrent, toggleVarsModal}) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const isMod = (e) => (isMac ? e.metaKey : e.ctrlKey);

    const open = () => {
        sidebar?.classList.add('open');
        renderHotkeysList('hotkeysList');
    };
    const close = () => sidebar?.classList.remove('open');

// button settings on sidebar
    btnSettings?.addEventListener('click', (e) => {
        e.preventDefault();
        if (sidebar?.classList.contains('open')) {
            close();
        } else {
            open();
        }
    });


    document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        const inEditable = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
        if (inEditable && !(e.metaKey || e.ctrlKey)) return;

        const { key, code } = e;
        const isKey = (e, ch) =>
            String(e.key).toLowerCase() === ch || e.code === 'Key' + ch.toUpperCase();

        if (isMod(e) && e.key === '1') { e.preventDefault(); btnFolders?.click(); return; }
        if (isMod(e) && e.key === '2') { e.preventDefault(); btnHistory?.click(); return; }

        if (isMod(e) && isKey(e,'k') && !e.shiftKey) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (searchWrap) {
                if (searchWrap.hidden) {
                    btnSearch?.click();
                    filterInp?.focus();
                    filterInp?.select();
                } else {
                    btnSearch?.click();
                }
            }
            return;
        }


        //  mod + d show settings sidebar
        if (isMod(e) && isKey(e,'d')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (sidebar?.classList.contains('open')) {
                close();
            } else {
                open();
            }
            return;
        }
        // requests
        if (isMod(e) && (key === 'Enter' || code === 'Enter')) {
            e.preventDefault();
            //forceSave();
            sendBtn?.click();
            return;
        }
        if (isMod(e) && code === 'ArrowDown') {
            e.preventDefault();
            selectNextRequest?.();
            return;
        }
        if (isMod(e) && code === 'ArrowUp') {
            e.preventDefault();
            selectPrevRequest?.();
            return;
        }
        if (isMod(e) && isKey(e, 'e')) {
            e.preventDefault();
            toggleVarsModal?.();
            return;
        }
        if (isMod(e) && isKey(e,'p')) {
            e.preventDefault();
            togglePinCurrent?.();
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG') {
            e.preventDefault();
            e.stopImmediatePropagation();
            toggleTheme();
            return;
        }
        if (isMod(e) && isKey(e, 'l')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            cycleEnvironment();
            return;
        }
    }, true);
}

export function renderHotkeysList(containerId = "hotkeysList") {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

    function prettyKey(k) {
        const lower = k.toLowerCase();
        if (lower === "mod") return isMac ? "⌘" : "Ctrl";
        if (lower === "shift") return "⇧";
        if (lower === "alt") return isMac ? "⌥" : "Alt";
        if (lower === "enter") return "⏎";
        if (lower === "esc" || lower === "escape") return "Esc";
        return k.toUpperCase();
    }

    const groups = {};
    HOTKEYS.forEach(h => {
        if (!groups[h.group]) groups[h.group] = [];
        groups[h.group].push(h);
    });

    Object.keys(groups).forEach(group => {
        const groupEl = document.createElement("div");
        groupEl.className = "hotkeyGroup";

        const title = document.createElement("h5");
        title.textContent = group;
        groupEl.appendChild(title);

        const ul = document.createElement("ul");
        groups[group].forEach(h => {
            const li = document.createElement("li");

            const desc = document.createElement("span");
            desc.textContent = h.description + ": ";

            const keys = document.createElement("span");
            keys.className = "hotkeyKeys";
            h.keys[0].split("+").forEach((k, i, arr) => {
                const kbd = document.createElement("kbd");
                kbd.textContent = prettyKey(k);
                keys.appendChild(kbd);
                if (i < arr.length - 1) {
                    const sep = document.createTextNode(" + ");
                    keys.appendChild(sep);
                }
            });

            li.appendChild(desc);
            li.appendChild(keys);
            ul.appendChild(li);
        });

        groupEl.appendChild(ul);
        container.appendChild(groupEl);
    });
}


async function cycleEnvironment() {
    const order = ["dev", "staging", "prod"];
    let current = localStorage.getItem('selected_env') || 'dev';
    let idx = order.indexOf(current);
    let next = order[(idx + 1) % order.length];

    let newPath;
    if (next === 'dev') newPath = './data/dev_environment.json';
    if (next === 'staging') newPath = './data/staging_enviroment.json';
    if (next === 'prod') newPath = './data/prod_environment.json';

    let savedEnv = null;
    try {
        const raw = localStorage.getItem(`pm_env_${next}`);
        if (raw) savedEnv = JSON.parse(raw);
    } catch {}

    if (savedEnv && Array.isArray(savedEnv.values)) {
        state.ENV = savedEnv;
    } else {
        try {
            const newEnv = await loadJson(newPath);
            state.ENV = newEnv;
            localStorage.setItem(`pm_env_${next}`, JSON.stringify(newEnv));
        } catch (err) {
            showAlert(`Failed to load environment: ${next}`, 'error');
            state.ENV = { values: [] };
            localStorage.setItem(`pm_env_${next}`, JSON.stringify(state.ENV));
        }
    }

    localStorage.setItem('selected_env', next);

    buildVarMap();
    renderTree('', { onRequestClick: openRequest });
    highlightMissingVars(document, state.VARS);
    updateVarsBtnCounter();

    const varsModal = document.getElementById('varsModal');
    if (varsModal && !varsModal.hidden) buildVarsTableBody();

    const envCurrent = document.querySelector('#envDropdown .envCurrent');
    if (envCurrent) {
        envCurrent.innerHTML = next.toUpperCase() + ' <span class="arrow">▼</span>';
        envCurrent.className = 'envCurrent ' + next;
    }

    document.documentElement.setAttribute('data-env', next);
    showAlert(`Environment switched: ${next.toUpperCase()}`, 'success');

    if (state.CURRENT_REQ_ID) {
        const item = state.ITEMS_FLAT.find(x => x.id === state.CURRENT_REQ_ID);
        if (item) openRequest(item, true);
    }
}
