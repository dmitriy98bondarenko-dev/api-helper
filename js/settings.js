// settings.js
import { initHotkeys, HOTKEYS } from "./hotkeys.js";


export function renderHotkeysList(containerId = "hotkeysList") {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = ""; // clear previous content

    // group of groups
    const groups = {};
    HOTKEYS.forEach(hk => {
        if (!groups[hk.group]) groups[hk.group] = [];
        groups[hk.group].push(hk);
    });

    Object.entries(groups).forEach(([group, items]) => {
        const groupEl = document.createElement("div");
        groupEl.className = "hotkeyGroup";

        const title = document.createElement("h5");
        title.textContent = group;
        groupEl.appendChild(title);

        const list = document.createElement("ul");
        list.className = "hotkeyList";

        items.forEach(hk => {
            const li = document.createElement("li");
            li.className = "hotkeyItem";

            const desc = document.createElement("span");
            desc.className = "hotkeyDesc";
            desc.textContent = hk.description;

            const keys = document.createElement("span");
            keys.className = "hotkeyKeys";
            keys.textContent = hk.keys.join(" / ");

            li.append(desc, keys);
            list.appendChild(li);
        });

        groupEl.appendChild(list);
        container.appendChild(groupEl);
    });
}

export function initSettingsSidebar() {
    const sidebar  = document.getElementById('settingsSidebar');
    const btnOpen  = document.getElementById('navSettings');
    const btnClose = sidebar?.querySelector('.closeSettings');

    if (!sidebar || !btnOpen) {
        console.warn("Settings sidebar elements not found");
        return;
    }
    btnOpen.replaceWith(btnOpen.cloneNode(true));
    const newBtnOpen = document.getElementById('navSettings');

    const open  = () => sidebar.classList.add('open');
    const close = () => sidebar.classList.remove('open');

    newBtnOpen.addEventListener('click', (e) => {
        e.preventDefault();
        open();
    });

    btnClose?.addEventListener('click', (e) => {
        e.preventDefault();
        close();
    });

    sidebar.addEventListener('click', (e) => {
        if (e.target === sidebar) close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            e.preventDefault();
            close();
        }
    });
}