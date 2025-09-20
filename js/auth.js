// js/auth.js
import { $, showAlert } from './ui.js';
import { getGlobalBearer, setGlobalBearer } from './config.js';

export function updateAuthUI() {
    const authBtn = $('#authBtn');
    if (!authBtn) return;

    const hasToken = !!getGlobalBearer();
    if (hasToken) {
        authBtn.classList.add('active');
        authBtn.innerHTML = `Authorized <svg class="lockIcon" viewBox="0 0 24 24">
            <path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
            <path d="M6 9V7a6 6 0 1 1 12 0v2h1a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h1zm2 0h8V7a4 4 0 1 0-8 0v2z"/>
        </svg>`;
    } else {
        authBtn.classList.remove('active');
        authBtn.innerHTML = `Authorize <svg class="lockIcon" viewBox="0 0 24 24">
            <path d="M16 4a4 4 0 0 0-8 0v2h2V4a2 2 0 1 1 4 0v5h2V4z"/>
            <rect x="5" y="9" width="14" height="12" rx="2" ry="2"/>
            <circle cx="12" cy="15" r="2"/>
        </svg>`;
    }
}

export function initAuthModal() {
    const authBtn = $('#authBtn');
    const authModal = $('#authModal');
    const authCancel = $('#authCancel');
    const authSave = $('#authSave');
    const authClear = $('#authClear');
    const authTokenInp = $('#authToken');

    if (!authBtn || !authModal) return;

    // при открытии модалки
    authBtn.addEventListener('click', () => {
        authModal.hidden = false;
        authTokenInp.value = getGlobalBearer() || '';
    });

    if (authCancel) {
        authCancel.addEventListener('click', () => {
            authModal.hidden = true;
        });
    }

    if (authSave) {
        authSave.addEventListener('click', () => {
            const token = authTokenInp.value.trim();
            setGlobalBearer(token);
            authModal.hidden = true;
            showAlert('Token saved', 'success');
            updateAuthUI();

            // 👉 синхронизируем с вкладкой Authorization
            const authTokenField = document.querySelector('#authTokenInp');
            if (authTokenField) authTokenField.value = token;
        });
    }

    if (authClear) {
        authClear.addEventListener('click', () => {
            setGlobalBearer('');
            authTokenInp.value = '';
            showAlert('Token cleared', 'success');
            updateAuthUI();

            // 👉 чистим и на вкладке Authorization
            const authTokenField = document.querySelector('#authTokenInp');
            if (authTokenField) authTokenField.value = '';
        });
    }

    // обновить состояние сразу при загрузке
    updateAuthUI();
}
export function clearAuthUI() {
    const authTokenInp = $('#authToken'); // модалка
    if (authTokenInp) authTokenInp.value = '';

    const authTokenField = document.querySelector('#authTokenInp'); // вкладка
    if (authTokenField) authTokenField.value = '';
}
