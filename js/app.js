// app.js
import { initTheme, showLoader } from './ui.js';
import { initAuthModal } from './auth.js';
import { DEFAULT_COLLECTION_PATH, DEFAULT_ENV_PATH, AUTO_OPEN_FIRST } from './config.js';
import { bootApp } from './feature.js';
import { initSettingsSidebar } from './settings.js';

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initAuthModal();
    initSettingsSidebar();

    showLoader(true);
    try {
        await bootApp({

            envPath: DEFAULT_ENV_PATH,
            autoOpenFirst: AUTO_OPEN_FIRST,
        });
    } finally {
        showLoader(false);
    }
});
