// settings.js
import { initHotkeys, HOTKEYS } from "./hotkeys.js";


export function renderHotkeysList(containerId = "hotkeysList") {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = ""; // очистка

    // Группируем по group
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

document.addEventListener('DOMContentLoaded', () => {
    const sidebar  = document.getElementById('settingsSidebar');
    const btnOpen  = document.getElementById('navSettings');
    const content  = sidebar?.querySelector('.settingsContent');
    const btnClose = sidebar?.querySelector('.closeSettings');

    if (!sidebar || !btnOpen) return;

    const open  = () => sidebar.classList.add('open');
    const close = () => sidebar.classList.remove('open');

    // открыть по кнопке ⚙️
    btnOpen.addEventListener('click', (e) => {
        e.preventDefault();
        open();
    });

    // закрыть по крестику
    btnClose?.addEventListener('click', (e) => {
        e.preventDefault();
        close();
    });

    // закрыть по клику на фон (строго по overlay)
    sidebar.addEventListener('click', (e) => {
        // если кликнули на сам .settingsSidebar, а не на .settingsContent
        if (!content.contains(e.target)) {
            close();
        }
    });

    // Esc → закрыть
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            e.preventDefault();
            close();
        }
    });

    // hotkeys
    initHotkeys({
        btnFolders: document.getElementById('navFolders'),
        btnHistory: document.getElementById('navHistory'),
        btnSearch : document.getElementById('navSearch'),
        searchWrap: document.querySelector('.searchWrap'),
        filterInp : document.querySelector('#search'),
        btnSettings: btnOpen,
        sidebar
    });
});

