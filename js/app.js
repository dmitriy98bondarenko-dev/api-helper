// app.js (точка входа)
import { initThemeUI, showLoader } from './ui.js';
import { initAuthModal } from './auth.js';
import { DEFAULT_COLLECTION_PATH, DEFAULT_ENV_PATH, AUTO_OPEN_FIRST } from './config.js';
import { bootApp } from './feature.js';

document.addEventListener('DOMContentLoaded', async () => {
    initThemeUI();       // тема и переключатель
    initAuthModal();     // 👉 инициализация Authorize модалки

    showLoader(true);
    try {
        await bootApp({
            collectionPath: DEFAULT_COLLECTION_PATH,
            envPath: DEFAULT_ENV_PATH,
            autoOpenFirst: AUTO_OPEN_FIRST,
        });
    } finally {
        showLoader(false);
    }
});
