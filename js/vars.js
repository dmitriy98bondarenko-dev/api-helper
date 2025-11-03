// vars.js
import {clearScript, state} from './state.js';
import { $, el, showAlert, highlightMissingVars, updateVarsBtn, renderUrlWithVars, } from './ui.js';
import { setGlobalBearer, loadJson, clearLocalStorage, getVal } from './config.js';
import { updateAuthUI, clearAuthUI } from './auth.js';
import { renderTree, updateEnvDropdown, setPinnedIds } from './sidebar.js';
import { openRequest } from './feature.js';
import { highlightJSON, saveSelection, restoreSelection } from './ui.js';
import {clearFullScript, clearTimePickerState} from "./timePicker.js";

// vriables and helpers
export function buildVarMap() {
    const next = {};

    // collection vars
    if (state.COLLECTION_VARS) {
        Object.entries(state.COLLECTION_VARS).forEach(([k, v]) => {
            if (!(k in next)) next[k] = v ?? '';
        });
    }

    // ENV
    const envVals = Array.isArray(state.ENV?.values) ? state.ENV.values : [];
    envVals.filter(v => v && v.key && v.enabled !== false)
        .forEach(v => {
            const val = String(v.value ?? '').trim();
            next[v.key] = val;
        });

    // globals
    if (state.GLOBALS) {
        Object.entries(state.GLOBALS).forEach(([k, v]) => {
            if (!(k in next)) next[k] = v ?? '';
        });
    }

    //  state.VARS
    const target = state.VARS || (state.VARS = {});
    Object.keys(target).forEach(k => delete target[k]);
    Object.assign(target, next);

    return target;
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
            onclick: () => removeVar(key) // remove var from env
        }, '✖');

        // active checkbox if has key and value
        const enabled = !!key && !!val && v.enabled !== false;

        const keyInp = el('input', { value: key, 'data-idx': i, 'data-field': 'key', type: 'text' });
        const valInp = el('input', { value: val, 'data-idx': i, 'data-field': 'value', type: 'text' });
        const chkInp = el('input', { type: 'checkbox', checked: enabled, 'data-idx': i, 'data-field': 'enabled' });

        // checkbox control
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
        tb.querySelectorAll('input').forEach(inp => {
            const handler = () => {
                updateVarsBtnCounter();
                syncRemoveButtons();
                buildVarMap(); // recalculate vars map
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
    // if env empty add 1 row
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

    // update counter
    updateVarsBtnCounter();
    syncRemoveButtons();

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
    refreshAllVarsHighlight();
    highlightMissingVars(document, getEnvVarsOnly());
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

// modal env variables
export function initVarsModal() {
    const varsBtn = $('#varsBtn');
    const varsModal = $('#varsModal');
    const varsCancel = $('#varsCancel');
    const varsSave = $('#varsSave');
    const varsAdd = $('#varsAdd'); // add variable button


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
            refreshAllVarsHighlight();

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
                    tr.remove();
                    updateVarsBtnCounter();
                    syncRemoveButtons();
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
            syncRemoveButtons();             // do not show remove button for only one row

            tr.scrollIntoView({ behavior: 'smooth', block: 'end' });
            keyInp.focus();
        });
    }
    const varsImportBtn = $('#varsImportBtn');
    if (varsImportBtn) {
        varsImportBtn.addEventListener('click', () => {
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
                        showAlert('Invalid JSON format', 'error');
                        return;
                    }

                    // change env on new data
                    state.ENV = { values: json.values };

                    // save to ls
                    saveEnvToLocal();

                    // udate ui
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

// reset local storage
export function initResetModal() {
    let resetBtn = $('#clearStorageBtn');
    const resetModal = $('#resetModal');
    let resetCancel = $('#resetCancel');
    let resetEnvsAuth = $('#resetEnvsAuth');
    let resetFull = $('#resetFull');

    // open reset modal
    if (resetBtn && resetModal) {
        const newResetBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
        resetBtn = newResetBtn;

        resetBtn.addEventListener('click', () => {
            resetModal.hidden = false;
        });
    }

    // close reset modal
    if (resetCancel) {
        const newResetCancel = resetCancel.cloneNode(true);
        resetCancel.parentNode.replaceChild(newResetCancel, resetCancel);
        resetCancel = newResetCancel;

        resetCancel.addEventListener('click', () => {
            resetModal.hidden = true;
        });
    }

    // reset env + auth
    if (resetEnvsAuth) {
        const newResetEnvsAuth = resetEnvsAuth.cloneNode(true);
        resetEnvsAuth.parentNode.replaceChild(newResetEnvsAuth, resetEnvsAuth);
        resetEnvsAuth = newResetEnvsAuth;

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
            refreshVarsUI();

            // delete all requests
            Object.keys(localStorage).forEach(k => {
                if (k.startsWith('pm_req_')) {
                    localStorage.removeItem(k);
                }
            });

            // open current request if exists
            if (state.CURRENT_REQ_ID) {
                const item = state.ITEMS_FLAT.find(x => x.id === state.CURRENT_REQ_ID);
                if (item) openRequest(item, true);
            }

            resetModal.hidden = true;
            showAlert('Environments and authorization reset. Default DEV loaded.', 'success');

            localStorage.setItem('selected_env', envKey);
            document.documentElement.setAttribute('data-env', envKey);
            updateEnvDropdown(envKey);

            renderTree('', { onRequestClick: openRequest });
            highlightMissingVars(document, getEnvVarsOnly());
            updateVarsBtnCounter();
        });
    }

    // full reset
    if (resetFull) {
        const newResetFull = resetFull.cloneNode(true);
        resetFull.parentNode.replaceChild(newResetFull, resetFull);
        resetFull = newResetFull;

        resetFull.addEventListener('click', () => {
            clearLocalStorage(['pm_env_', 'pm_req_'], ['selected_env', 'global_bearer']);
            clearTimePickerState();
            clearFullScript('pre');
            clearFullScript('post');
            localStorage.removeItem('req_history');
            setGlobalBearer('');
            setPinnedIds([]);
            updateAuthUI();

            resetModal.hidden = true;
            updateVarsBtnCounter();
            refreshBodyEditorHighlight();
            highlightMissingVars(document, getEnvVarsOnly());
            showAlert('Full reset completed. Page is reloading…', 'success');

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

    // fallback state.ENV
    const list = Array.isArray(state.ENV?.values) ? state.ENV.values : [];
    let total = 0, active = 0;

    for (const v of list) {
        const key = String(v.key ?? '').trim();
        if (!key) continue;
        total++;
        const val = String(v.value ?? '').trim();
        if (val && v.enabled !== false) active++;
    }

    varsBtn.textContent = `Variables ${active}/${total}`;
}

export function syncRemoveButtons(){
    // count rows
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
                urlDisp.innerHTML = renderUrlWithVars(raw, getEnvVarsOnly());
                highlightMissingVars(urlDisp, getEnvVarsOnly());
            } else {
                openRequest(item, true);
            }
        }
    }
}

// modal for editing single var
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

    // expose globally
    window.openVarEdit = openVarEdit;
}
// json dropdown menu
const varsImportBtn = document.querySelector('#varsImportBtn');
const varsExportBtn = document.querySelector('#varsExportBtn');
const jsonDropdown = document.querySelector('.dropdown');
const jsonMenuBtn  = jsonDropdown?.querySelector('.jsonMenuBtn');
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

// export json
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

// modal close buttons
document.querySelectorAll('.modalClose').forEach(btn => {
    btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal) modal.hidden = true;
    });
});

// highlight request body
export function refreshBodyEditorHighlight() {
    const bodyEditor = document.querySelector('#bodyRawArea');
    if (!bodyEditor) return;

    const raw = bodyEditor.dataset.raw || bodyEditor.textContent || '';
    const offset = saveSelection(bodyEditor);

    let highlighted = highlightJSON(raw);

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = highlighted;
    highlightMissingVars(tempDiv, getEnvVarsOnly());
    bodyEditor.innerHTML = tempDiv.innerHTML;

    restoreSelection(bodyEditor, offset);
}


export function toggleVarsModal() {
    const modal = document.querySelector('#varsModal');
    if (!modal) return;
    if (modal.hidden) {
        buildVarsTableBody();
        modal.hidden = false;
    } else {
        modal.hidden = true;
    }
}


export function refreshAllVarsHighlight() {
    const envMap = getEnvVarsOnly();

    // URL
    const urlDisp = document.querySelector('#urlInpDisplay');
    if (urlDisp) {
        const rawUrl = document.querySelector('#urlInp')?.value?.trim() || '';
        urlDisp.innerHTML = renderUrlWithVars(rawUrl, envMap);
        highlightMissingVars(urlDisp, envMap);
    }

    // Headers
    document.querySelectorAll('#paneHeaders .kvValue').forEach(valCell => {
        const rawText = valCell.textContent.trim();
        if (/{{\s*[^}]+\s*}}/.test(rawText)) {
            valCell.innerHTML = renderUrlWithVars(rawText, envMap);
        }
        highlightMissingVars(valCell, envMap);
    });

    // Body
    refreshBodyEditorHighlight();
}
export function getEnvVarsOnly() {
    return Object.fromEntries(
        (state.ENV?.values || [])
            .filter(v => v.enabled !== false)
            .map(v => [v.key, String(v.value || '').trim()])
    );
}
