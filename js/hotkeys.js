// hotkeys.js
import { toggleTheme } from './ui.js';

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
    // --- Requests ---
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
        keys: ["Mod+E"],
        description: "Toggle Variables modal",
        action: (toggleVarsModal) => toggleVarsModal?.()
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

// кнопка ⚙️
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


        //  Mod + D → toggle settings sidebar
        if (isMod(e) && isKey(e,'d')) {
            e.preventDefault();
            if (sidebar?.classList.contains('open')) {
                close();
            } else {
                open();
            }
            return;
        }
        // --- Requests ---
        if (isMod(e) && (key === 'Enter' || code === 'Enter')) {
            e.preventDefault();
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
