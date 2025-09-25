// vars.js
import { state } from './state.js';
import { $, el, showAlert, highlightMissingVars, updateVarsBtn, renderUrlWithVars, } from './ui.js';
import { setGlobalBearer, loadJson, clearLocalStorage, getVal } from './config.js';
import { updateAuthUI, clearAuthUI } from './auth.js';
import { renderTree, updateEnvDropdown, setPinnedIds } from './sidebar.js';
import { openRequest } from './feature.js';
import { highlightJSON, saveSelection, restoreSelection } from './ui.js';

// ===== Variables & helpers =====

export function buildVarMap() {
    const map = {};

    // defaults
    if (state.COLLECTION?.variable) {
        state.COLLECTION.variable.forEach(v => {
            if (!v) return;
            const key = v.key ?? v.name;
            if (key) map[key] = getVal(v);
        });
    }

    // variables from ENV
    if (state.ENV?.values) {
        state.ENV.values.forEach(v => {
            if (!v) return;
            if (v.enabled === false) return;
            const key = v.key ?? v.name;
            if (key) map[key] = v.value;
        });
    }
    // globals
    if (state.GLOBALS) {
        Object.entries(state.GLOBALS).forEach(([k,v])=>{
            map[k] = v;
        });
    }
    state.VARS = map;
    updateVarsBtnCounter();
    return map;
}

export function buildVarsTableBody() {
    const tb = $('#varsTable tbody');
    tb.innerHTML = '';

    let list = Array.isArray(state.ENV?.values) ? state.ENV.values : [];

    list.forEach((v, i) => {
        const tr = document.createElement('tr');
        tr.classList.add('varRow');
        const key = v.key ?? v.name ?? '';
        const val = getVal(v);
        const delBtn = el('button', {
            class: 'varRemove',
            title: 'Delete',
            onclick: () => removeVar(key) // удаление “старых” переменных как и раньше
        }, '✖');

        // чекбокс активен только если есть и key, и value
        const enabled = !!key && !!val && v.enabled !== false;

        const keyInp = el('input', { value: key, 'data-idx': i, 'data-field': 'key', type: 'text' });
        const valInp = el('input', { value: val, 'data-idx': i, 'data-field': 'value', type: 'text' });
        const chkInp = el('input', { type: 'checkbox', checked: enabled, 'data-idx': i, 'data-field': 'enabled' });

        // автоуправление чекбоксом
              const autoToggle = () => {
                       if (keyInp.value.trim() && valInp.value.trim()) {
                               chkInp.checked = true;
                               chkInp.disabled = false;
                           } else {
                               chkInp.checked = false;
                               chkInp.disabled = true;
                           }
                       updateVarsBtnCounter();
                   };
               keyInp.addEventListener('input', autoToggle);
               valInp.addEventListener('input', autoToggle);

        tr.append(
            el('td', {}, keyInp),
            el('td', {}, valInp),
            el('td', {}, chkInp),
            el('td', {}, delBtn)
        );

        tb.append(tr);
        updateVarsBtnCounter();
        // слушатели для динамического обновления счётчика + VARS + подсветка URL
        tb.querySelectorAll('input').forEach(inp => {
            const handler = () => {
                updateVarsBtnCounter();
                syncRemoveButtons();
                buildVarMap(); // 🔹 пересобираем карту переменных
                const urlDisp = document.querySelector('#urlInpDisplay');
                if (urlDisp) {
                    const raw = document.querySelector('#urlInp')?.value?.trim() || '';
                    urlDisp.innerHTML = renderUrlWithVars(raw, state.VARS);
                    highlightMissingVars(urlDisp, state.VARS);
                }
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        syncRemoveButtons();
    });
    // если окружение пустое — добавим одну пустую обычную строку
    if (!tb.querySelector('tr.varRow')) {
        const tr = document.createElement('tr');
        tr.classList.add('varRow');

        const keyInp = el('input', { 'data-field': 'key', placeholder: 'key', type: 'text' });
        const valInp = el('input', { 'data-field': 'value', placeholder: 'value', type: 'text' });
        const chkInp = el('input', { type: 'checkbox', 'data-field': 'enabled', checked: false, disabled: true });

        const autoToggle = () => {
            const ok = keyInp.value.trim() && valInp.value.trim();
            chkInp.disabled = !ok;
            chkInp.checked = !!ok;
            updateVarsBtnCounter();
        };
        keyInp.addEventListener('input', autoToggle);
        valInp.addEventListener('input', autoToggle);

        const delBtn = el('button', {
            class: 'varRemove',
            title: 'Delete',
            onclick: () => { tr.remove(); updateVarsBtnCounter(); syncRemoveButtons(); }
        }, '✖');

        tr.append(
            el('td', {}, keyInp),
            el('td', {}, valInp),
            el('td', {}, chkInp),
            el('td', {}, delBtn)
        );
        tb.append(tr);
    }

    // обновляем счётчик и видимость крестиков после рендера
    updateVarsBtnCounter();
    syncRemoveButtons();

    // слушатели для динамического обновления счётчика
    tb.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => { updateVarsBtnCounter(); syncRemoveButtons(); });
        inp.addEventListener('change', () => { updateVarsBtnCounter(); syncRemoveButtons(); });
    });

}


function removeVar(keyToRemove) {
    state.ENV.values = state.ENV.values.filter(x => x.key !== keyToRemove);
    saveEnvToLocal();
    refreshVarsUI();
}

function refreshVarsUI() {
    buildVarsTableBody();
    buildVarMap();
    refreshCurrentRequest();
    highlightMissingVars(document, state.VARS);
    if (typeof updateVarsBtn === 'function') updateVarsBtn();
    updateVarsBtnCounter();
    syncRemoveButtons();
    refreshBodyEditorHighlight();
}

function saveEnvToLocal() {
    const currentEnv = localStorage.getItem('selected_env') || 'dev';
    try {
        localStorage.setItem(`pm_env_${currentEnv}`, JSON.stringify(state.ENV));
    } catch {}
}

// --- Модал Environment Variables ---
export function initVarsModal() {
    const varsBtn = $('#varsBtn');
    const varsModal = $('#varsModal');
    const varsCancel = $('#varsCancel');
    const varsSave = $('#varsSave');
    const varsAdd = $('#varsAdd'); // кнопка Add variable


    if (varsBtn && varsModal) {
        varsBtn.addEventListener('click', () => {
            buildVarsTableBody();
            varsModal.hidden = false;
        });
    }
    if (varsCancel) {
        varsCancel.addEventListener('click', () => {
            varsModal.hidden = true;
        });
    }
    if (varsSave) {
        varsSave.addEventListener('click', () => {
            const rows = Array.from(document.querySelectorAll('#varsTable tbody tr.varRow'));
            state.ENV.values = rows.map(tr => {
                const keyInp = tr.querySelector('input[data-field="key"]');
                const valInp = tr.querySelector('input[data-field="value"]');
                const chk = tr.querySelector('input[data-field="enabled"]');
                if (!keyInp || !valInp) return null;
                const key = keyInp.value.trim();
                if (!key) return null;
                return { key, value: valInp.value, enabled: chk ? chk.checked : true };
            }).filter(Boolean);

            saveEnvToLocal();
            refreshVarsUI();
            refreshCurrentRequest();

            varsModal.hidden = true;
            showAlert('Variables saved', 'success');
        });
    }
    if (varsAdd) {
        varsAdd.addEventListener('click', () => {
            const tb = $('#varsTable tbody');
            const idx = tb.querySelectorAll('tr').length;
            const tr = document.createElement('tr');
            tr.classList.add('varRow');

            const keyInp = el('input', { 'data-idx': idx, 'data-field': 'key', placeholder: 'key', type: 'text' });
            const valInp = el('input', { 'data-idx': idx, 'data-field': 'value', placeholder: 'value', type: 'text' });
            const chkInp = el('input', { type: 'checkbox', 'data-idx': idx, 'data-field': 'enabled', checked: false, disabled: true });

            const autoToggle = () => {
                if (keyInp.value.trim() && valInp.value.trim()) {
                    chkInp.checked = true;
                    chkInp.disabled = false;
                } else {
                    chkInp.checked = false;
                    chkInp.disabled = true;
                }
                updateVarsBtnCounter();
            };
            keyInp.addEventListener('input', autoToggle);
            valInp.addEventListener('input', autoToggle);

            const delBtn = el('button', {
                class: 'clearPinsBtn',
                title: 'Delete',
                onclick: () => {
                    tr.remove();                 // временные строки просто убираем из DOM
                    updateVarsBtnCounter();
                    syncRemoveButtons();         // ← пересчитать видимость крестиков
                }
            }, '✖');

            tr.append(
                el('td', {}, keyInp),
                el('td', {}, valInp),
                el('td', {}, chkInp),
                el('td', {}, delBtn)
            );

            tb.append(tr);
            updateVarsBtnCounter();
            syncRemoveButtons();             // ← показать крестики везде, кроме случая 1 строки

            tr.scrollIntoView({ behavior: 'smooth', block: 'end' });
            keyInp.focus();
        });
    }
    const varsImportBtn = $('#varsImportBtn');
    if (varsImportBtn) {
        varsImportBtn.addEventListener('click', () => {
            // создаём скрытый input[type=file]
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'application/json';

            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const json = JSON.parse(text);

                    if (!Array.isArray(json.values)) {
                        showAlert('Invalid JSON format (no "values" array)', 'error');
                        return;
                    }

                    // заменяем ENV
                    state.ENV = { values: json.values };

                    // сохраняем в LS
                    saveEnvToLocal();

                    // обновляем UI
                    refreshVarsUI();
                    buildVarsTableBody();

                    showAlert(`Imported ${json.values.length} variables`, 'success');
                    jsonDropdown.classList.remove('open');
                    dropdownContent.style.display = 'none';
                } catch (err) {
                    console.error(err);
                    showAlert('Failed to import JSON: ' + err.message, 'error');
                }
            };

            fileInput.click();
        });
    }

}

// --- Reset Local Storage ---
export function initResetModal() {
    const resetBtn = $('#clearStorageBtn');
    const resetModal = $('#resetModal');
    const resetCancel = $('#resetCancel');
    const resetEnvsAuth = $('#resetEnvsAuth');
    const resetFull = $('#resetFull');

    if (resetBtn && resetModal) {
        resetBtn.addEventListener('click', () => resetModal.hidden = false);
    }
    if (resetCancel) {
        resetCancel.addEventListener('click', () => resetModal.hidden = true);
    }

    if (resetEnvsAuth) {
        resetEnvsAuth.addEventListener('click', async () => {
            clearLocalStorage(['pm_env_'], ['selected_env', 'global_bearer']);
            setGlobalBearer('');
            updateAuthUI();
            clearAuthUI();

            const envKey = 'dev';
            const defaultPath = './data/dev_environment.json';

            try {
                const defaultEnv = await loadJson(defaultPath);
                state.ENV = defaultEnv;
                localStorage.setItem(`pm_env_${envKey}`, JSON.stringify(defaultEnv));
            } catch {
                state.ENV = { values: [] };
                showAlert('Default DEV environment file not found, using empty ENV', 'error');
            }

            state.VARS = {};
            buildVarMap();
            updateVarsBtnCounter();
            refreshCurrentRequest();
            refreshBodyEditorHighlight();
            highlightMissingVars(document, state.VARS);

            resetModal.hidden = true;
            showAlert('Environments and authorization reset. Default DEV loaded.', 'success');

            localStorage.setItem('selected_env', envKey);
            document.documentElement.setAttribute('data-env', envKey);
            updateEnvDropdown(envKey);

            renderTree('', { onRequestClick: openRequest });
            highlightMissingVars(document, state.VARS);
            updateVarsBtnCounter();
        });
    }

    if (resetFull) {
        resetFull.addEventListener('click', () => {
            clearLocalStorage(['pm_env_', 'pm_req_'], ['selected_env', 'global_bearer']);
            localStorage.removeItem('req_history');
            setGlobalBearer('');
            setPinnedIds([]);
            updateAuthUI();

            resetModal.hidden = true;
            updateVarsBtnCounter();
            refreshBodyEditorHighlight();
            highlightMissingVars(document, state.VARS);
            showAlert('Full reset completed. Please reload the page…', 'success');

            setTimeout(() => location.reload(), 500);
        });
    }
}
export function updateVarsBtnCounter() {
    const varsBtn = $('#varsBtn');
    if (!varsBtn) return;

    const varsModal = $('#varsModal');
    const tb = $('#varsTable tbody');

    const canUseDom =
        !!varsModal &&
        varsModal.hidden === false &&
        !!tb &&
        !!tb.querySelector('tr.varRow');

    if (canUseDom) {
        const rows = Array.from(tb.querySelectorAll('tr.varRow'));
        let total = 0, active = 0;

        rows.forEach(tr => {
            const key = tr.querySelector('input[data-field="key"]')?.value.trim() || '';
            const val = tr.querySelector('input[data-field="value"]')?.value.trim() || '';
            const chk = tr.querySelector('input[data-field="enabled"]');

            if (chk) {
                const ok = !!(key && val);
                chk.disabled = !ok;
                if (!ok) chk.checked = false;
            }

            if (key) {
                total++;
                if (val && chk && chk.checked) active++;
            }
        });

        varsBtn.textContent = `Variables ${active}/${total}`;
        return;
    }

    // fallback: считаем по state.ENV, когда модалка закрыта/не готова
    const list = Array.isArray(state.ENV?.values) ? state.ENV.values : [];
    let total = 0, active = 0;

    for (const v of list) {
        const key = (v.key ?? '').trim();
        if (!key) continue;
        total++;
        const val = (v.value ?? '').trim();
        if (val && v.enabled !== false) active++;
    }

    varsBtn.textContent = `Variables ${active}/${total}`;
}

export function syncRemoveButtons(){
    // считаем только реальные строки с переменными, без футеров и т.п.
    const rows = Array.from(document.querySelectorAll('#varsTable tbody tr.varRow'));
    const show = rows.length > 1;
    rows.forEach(tr => {
        const btn = tr.querySelector('button.varRemove');
        if (!btn) return;
        btn.style.visibility = show ? 'visible' : 'hidden';
        btn.disabled = !show;
    });
}

function refreshCurrentRequest() {
    if (state.CURRENT_REQ_ID) {
        const item = state.ITEMS_FLAT.find(x => x.id === state.CURRENT_REQ_ID);
        if (item) {
            const urlDisp = document.querySelector('#urlInpDisplay');
            if (urlDisp) {
                const raw = document.querySelector('#urlInp')?.value?.trim() || '';
                urlDisp.innerHTML = renderUrlWithVars(raw, state.VARS);
                highlightMissingVars(urlDisp, state.VARS);
            } else {
                openRequest(item, true);
            }
        }
    }
}

// --- Modal for editing single variable ---
export function initVarEditModal() {
    const modal = $('#varEditModal');
    const inp   = $('#varEditValue');
    const cancel= $('#varEditCancel');
    const save  = $('#varEditSave');
    let currentKey = null;

    function openVarEdit(key) {
        currentKey = key;
        const row = (state.ENV?.values||[]).find(v => v.key === key);
        inp.value = row?.value || '';
        modal.querySelector('h3').textContent = `Edit variable: ${key}`;
        modal.hidden = false;
        inp.focus();
    }

    function close() {
        modal.hidden = true;
        currentKey = null;
    }

    cancel.addEventListener('click', close);

    save.addEventListener('click', () => {
        if (!currentKey) return;
        const val = inp.value.trim();

        if (!state.ENV) state.ENV = { values: [] };
        if (!Array.isArray(state.ENV.values)) state.ENV.values = [];

        let row = state.ENV.values.find(v => v.key === currentKey);
        if (row) {
            row.value = val;
            row.enabled = true;
        } else {
            state.ENV.values.push({ key: currentKey, value: val, enabled: true });
        }

        saveEnvToLocal();
        refreshVarsUI();
        close();
        showAlert(`Variable ${currentKey} updated`, 'success');
    });

    // expose globally, чтобы вызывать из feature.js
    window.openVarEdit = openVarEdit;
}
// --- JSON dropdown menu ---
const varsImportBtn = document.querySelector('#varsImportBtn');
const varsExportBtn = document.querySelector('#varsExportBtn');
const jsonDropdown = document.querySelector('.dropdown');
const jsonMenuBtn  = jsonDropdown?.querySelector('.jsonMenuBtn'); // берем именно внутри dropdown
const dropdownContent = jsonDropdown?.querySelector('.dropdown-content');

if (jsonDropdown && jsonMenuBtn && dropdownContent) {
    jsonMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        jsonDropdown.classList.toggle('open');
        dropdownContent.style.display = jsonDropdown.classList.contains('open') ? 'flex' : 'none';
    });

    document.addEventListener('click', (e) => {
        if (!jsonDropdown.contains(e.target)) {
            jsonDropdown.classList.remove('open');
            dropdownContent.style.display = 'none';
        }
    });
}

// --- Export JSON ---
if (varsExportBtn) {
    varsExportBtn.addEventListener('click', () => {
        const currentEnv = localStorage.getItem('selected_env') || 'dev';
        const env = { values: state.ENV?.values || [] };
        const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentEnv}_environment.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        showAlert(`Exported ${currentEnv}_environment.json`, 'success');
        jsonDropdown.classList.remove('open');
        dropdownContent.style.display = 'none';
    });
}

// --- Modal close buttons ---
document.querySelectorAll('.modalClose').forEach(btn => {
    btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal) modal.hidden = true;
    });
});

// Highlight Request Body
export function refreshBodyEditorHighlight() {
    const bodyEditor = document.querySelector('#bodyRawArea');
    if (!bodyEditor) return;

    const raw = bodyEditor.textContent || '';
    const offset = saveSelection(bodyEditor);
    bodyEditor.innerHTML = highlightJSON(raw);
    restoreSelection(bodyEditor, offset);
}
