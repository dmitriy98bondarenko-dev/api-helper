// settings.js
import { initHotkeys, HOTKEYS } from "./hotkeys.js";
import {bootApp} from "./feature.js";
import {setSelectedCollection} from "./config.js";


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

export function initCollectionDropdown() {
    const dropdown = document.querySelector('#collectionDropdown');
    if (!dropdown) return;

    const current = dropdown.querySelector('.collectionCurrent');
    const list = dropdown.querySelector('.collectionList');

    list.innerHTML = '';
    COLLECTIONS.forEach(col => {
        const opt = document.createElement('div');
        opt.className = 'collectionOption';
        opt.textContent = col.name;
        opt.dataset.value = col.path;
        list.appendChild(opt);
    });
    const sel = getSelectedCollection();  // ← вот этого не хватало

    const selNorm = normalizePath(sel);
    const activeOpt = [...list.querySelectorAll('.collectionOption')]
        .find(opt => normalizePath(opt.dataset.value) === selNorm);

    if (activeOpt) {
        current.innerHTML = activeOpt.textContent + ' <span class="arrow">▼</span>';
    } else {
        current.innerHTML = COLLECTIONS[0].name + ' <span class="arrow">▼</span>';
    }

    current.onclick = () => {
        const open = list.style.display === 'block';
        list.style.display = open ? 'none' : 'block';
        current.querySelector('.arrow').textContent = open ? '▼' : '▲';
    };

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
            list.style.display = 'none';
            const arrow = current.querySelector('.arrow');
            if (arrow) arrow.textContent = '▼';
        }
    });
    list.querySelectorAll('.collectionOption').forEach(opt => {
        opt.onclick = async () => {
            const newPath = opt.dataset.value;
            setSelectedCollection(newPath);
            await bootApp({ collectionPath: newPath, autoOpenFirst: true });

            import('./history.js').then(({ renderHistory }) => renderHistory());
            import('./history.js').then(({ initSidebarNav }) => initSidebarNav());
            import('./settings.js').then(({ initSettingsSidebar }) => initSettingsSidebar());

            list.style.display = 'none';
            current.innerHTML = opt.textContent + ' <span class="arrow">▼</span>';
        };
    });
}