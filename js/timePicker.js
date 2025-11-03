import { $, showAlert } from "./ui.js";
import { updatePreScriptDate } from './feature.js';
import { state } from './state.js';

function saveTimePickerState(reqId, data) {
    if (!reqId) return;
    state.TIME_PICKER_STATE[reqId] = data;
    localStorage.setItem(`timePicker_${reqId}`, JSON.stringify(data));
}

function loadTimePickerState(reqId) {
    if (!reqId) return null;
    const saved = localStorage.getItem(`timePicker_${reqId}`);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch {
            return null;
        }
    }
    return null;
}

export function clearTimePickerState(reqId = null) {
    if (reqId) {
        // clear open request
        delete state.TIME_PICKER_STATE[reqId];
        localStorage.removeItem(`timePicker_${reqId}`);
    } else {
        // clear all requests
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('timePicker_')) localStorage.removeItem(k);
        });
        state.TIME_PICKER_STATE = {};
    }
}

let selectedDate = null;
const DATE_OFFSET_MINUTES = 30;

// helpers

function calcDate(value) {
    const now = new Date();
    let targetDate;

    switch (value) {
        case "+1h": targetDate = new Date(now.getTime() + 60 * 60 * 1000); break;
        case "+3h": targetDate = new Date(now.getTime() + 3 * 60 * 60 * 1000); break;
        case "tomorrow": targetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); break;
        case "later": targetDate = new Date(now.getTime() + 48 * 60 * 60 * 1000); break;
        default: targetDate = now; break;
    }

    return {
        date: targetDate,
        offset: targetDate.getTime() - Date.now()
    };
}

/** Generates JS constant string for futureDate based on offset. */
function generateConstString(offsetMs) {
    const absOffsetMs = Math.abs(offsetMs);
    const seconds = Math.floor(absOffsetMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    let constString = `const futureDate = new Date(Date.now()`;

    if (minutes > 0) {
        constString += ` + ${minutes} * 60 * 1000`;
    }
    if (remainingSeconds > 0) {
        constString += ` + ${remainingSeconds} * 1000`;
    }

    if (minutes === 0 && remainingSeconds === 0) {
        constString += ` + 0`;
    }

    constString += `);`;
    return constString;
}

function getMinAllowedTime(offsetMinutes = DATE_OFFSET_MINUTES) {
    const now = new Date();
    const minTime = new Date(now.getTime() + offsetMinutes * 60 * 1000);
    minTime.setSeconds(0, 0);
    return minTime;
}

// dynamic positioning logic

function positionElementNearToggle(element, timeToggle) {
    // show momentarily to measure correctly
    element.style.visibility = 'hidden';
    element.style.display = 'block';
    element.style.left = '0';
    element.style.right = 'auto';

    const toggleRect = timeToggle.getBoundingClientRect();
    const dropdownWidth = element.offsetWidth;
    const windowWidth = window.innerWidth;
    const offset = 6;

    let leftPos = toggleRect.right - dropdownWidth;

    // if dropdown overflows the right edge of the viewport
    if (toggleRect.right > windowWidth - 8) {
        leftPos = windowWidth - dropdownWidth - 8;
    }

    // if dropdown overflows the left edge of the viewport
    if (leftPos < 8) {
        leftPos = 8;
    }

    // apply the exact position
    element.style.position = 'fixed';
    element.style.top = `${Math.round(toggleRect.bottom + offset)}px`;
    element.style.left = `${Math.round(leftPos)}px`;
    element.style.right = 'auto';
    element.style.visibility = 'visible';
    element.style.display = '';

    // final adjustment to perfectly align the right edge
    const rectAfter = element.getBoundingClientRect();
    const diff = (rectAfter.right - toggleRect.right);
    if (Math.abs(diff) > 1) {
        element.style.left = `${leftPos - diff}px`;
    }
}

// main calendar initialization

export function initTimePicker(reqId = null, preScriptText = '') {
    const timeToggle = document.getElementById("timeToggle");
    const timeDropdown = document.getElementById("timeDropdown");
    const calendarModal = document.getElementById("calendarModal");
    const datePicker = document.getElementById("datePicker");
    const timePicker = document.getElementById("timePicker");
    const saveBtn = document.getElementById("saveBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const customDateOption = document.getElementById("customDateOption");

    timeDropdown.classList.add('hidden');
    calendarModal.classList.add('hidden');
    if (!timeDropdown || !calendarModal) return;
    if (!reqId) return;


    // auto detect future date from scripts
    function detectFutureDateFromScript() {
        const pre = preScriptText || state?.COLLECTION_SCRIPTS?.pre || "";
        // search for expression even inside new Date()
        const match = pre.match(/new\s+Date\s*\(\s*Date\.now\(\)\s*\+\s*([^)]+)\)/)
            || pre.match(/Date\.now\(\)\s*\+\s*([\d\s\+\*\(\)]+)/);

        if (!match) return null;

        try {
            const offsetExpr = match[1];
            // safely evaluate (math only)
            const offsetMs = Function(`"use strict"; return (${offsetExpr});`)();
            return new Date(Date.now() + offsetMs);
        } catch {
            return null;
        }
    }

    // initial mode

    let initialMode = null;
    let initialDate = null;

    const savedState = loadTimePickerState(reqId) || state.TIME_PICKER_STATE[reqId];
    if (savedState) {
        selectedDate = savedState.date ? new Date(savedState.date) : null;
        initialMode = savedState.mode;
        initialDate = selectedDate;
    } else {
        const scriptDate = detectFutureDateFromScript();
        if (scriptDate) {
            const diff = scriptDate.getTime() - Date.now();

            const hours = diff / (60 * 60 * 1000);
            if (hours < 1.5) initialMode = "+1h";
            else if (hours < 4) initialMode = "+3h";
            else if (hours < 30) initialMode = "tomorrow";
            else if (hours < 72) initialMode = "later";
            else initialMode = "custom";


            initialDate = scriptDate;
            selectedDate = scriptDate;

            // save the detected date to LS/state
            saveTimePickerState(reqId, {
                date: initialDate.toISOString(),
                mode: initialMode
            });
        } else {
            initialMode = "now";
        }
    }

    // hilhting the selected mode
    timeDropdown.querySelectorAll("li").forEach(x => x.classList.remove("active"));
    if (initialMode === "custom") {
        customDateOption.classList.add("active");
    } else {
        const li = timeDropdown.querySelector(`[data-value="${initialMode}"]`);
        if (li) li.classList.add("active");
    }

    // if date exists, set it in the calendar fields
    if (initialDate) {
        const local = new Date(initialDate);
        datePicker.value = local.toISOString().split("T")[0];
        timePicker.value = local.toTimeString().slice(0, 5);
    }

    if (!timeToggle || !timeDropdown || !calendarModal) return;

    if (timeDropdown) {
        timeDropdown.style.position = 'fixed';
        document.body.appendChild(timeDropdown);
    }
    if (calendarModal) {
        calendarModal.style.position = 'fixed';
        document.body.appendChild(calendarModal);
    }

    // additional functions
    function syncCalendar(date) {
        const local = new Date(date);
        datePicker.value = local.toISOString().split("T")[0];
        timePicker.value = local.toTimeString().slice(0, 5);
    }

    function setMinDateTimeConstraints() {
        const minAllowedTime = getMinAllowedTime();
        const minDate = minAllowedTime.toISOString().split("T")[0];
        const minTime = minAllowedTime.toTimeString().slice(0, 5);

        datePicker.min = minDate;
        timePicker.min = (datePicker.value === minDate) ? minTime : "00:00";

        const currentPickerDateTime = new Date(`${datePicker.value}T${timePicker.value}`);
        if (isNaN(currentPickerDateTime.getTime()) || currentPickerDateTime.getTime() < minAllowedTime.getTime()) {
            syncCalendar(minAllowedTime);
        }
    }

    function updateSelectedTime(date, mode, text) {
        selectedDate = date;

        timeDropdown.querySelectorAll("li").forEach(x => x.classList.remove("active"));
        if (mode === "custom") customDateOption.classList.add("active");
        else timeDropdown.querySelector(`[data-value="${mode}"]`)?.classList.add("active");

        const offset = selectedDate ? selectedDate.getTime() - Date.now() : 0;
        const constString = selectedDate ? generateConstString(offset) : '';
        updatePreScriptDate(constString);

        const activeId = state?.CURRENT_REQ_ID || reqId;
        if (activeId) {
            saveTimePickerState(activeId, {
                date: date ? date.toISOString() : null,
                mode
            });
        }
    }

    // event listeners

    if (timeToggle.dataset.listenersInitialized !== 'true') {
        // add checkmark icons to all quick-select options
        timeDropdown.querySelectorAll("li:not(#customDateOption)").forEach(li => {
            if (!li.querySelector('svg')) {
                li.insertAdjacentHTML(
                    "beforeend",
                    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>`
                );
            }
        });

        timeToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            calendarModal.classList.add("hidden");

            const open = !timeDropdown.classList.contains("hidden");
            if (!open) {
                timeDropdown.classList.remove("hidden");
                void timeDropdown.offsetWidth; // Force reflow for immediate positioning
                positionElementNearToggle(timeDropdown, timeToggle);
            } else {
                timeDropdown.classList.add("hidden");
            }
        });

        timeDropdown.querySelectorAll("li:not(#customDateOption)").forEach(li => {
            li.addEventListener("click", () => {
                const val = li.dataset.value;
                if (val === "now") updateSelectedTime(null, "now", "Now");
                else {
                    const { date } = calcDate(val);
                    updateSelectedTime(date, val, "Custom time");
                }
                timeDropdown.classList.add("hidden");
            });
        });

        customDateOption.addEventListener("click", (e) => {
            e.stopPropagation();
            timeDropdown.classList.add("hidden");
            calendarModal.classList.remove("hidden");
            void calendarModal.offsetWidth; // Force reflow for immediate positioning
            positionElementNearToggle(calendarModal, timeToggle);

            const initDate = selectedDate || getMinAllowedTime();
            syncCalendar(initDate);
            setMinDateTimeConstraints();
        });

        datePicker.addEventListener('change', setMinDateTimeConstraints);
        saveBtn.addEventListener("click", () => {
            const selected = new Date(`${datePicker.value}T${timePicker.value}`);
            const minAllowedTime = getMinAllowedTime();
            if (selected.getTime() < minAllowedTime.getTime()) {
                showAlert(`Time must be at least ${DATE_OFFSET_MINUTES} minutes from now.`, 'error');
                return;
            }
            updateSelectedTime(selected, "custom", "Custom time");
            calendarModal.classList.add("hidden");
        });
        cancelBtn.addEventListener("click", () => calendarModal.classList.add("hidden"));

        // click outside to close
        document.addEventListener("click", (e) => {
            if (!calendarModal.classList.contains("hidden") &&
                !calendarModal.contains(e.target) &&
                !timeToggle.contains(e.target)) calendarModal.classList.add("hidden");

            if (!timeDropdown.classList.contains("hidden") &&
                !timeDropdown.contains(e.target) &&
                !timeToggle.contains(e.target)) timeDropdown.classList.add("hidden");
        });

        // reposition on scroll/resize
        window.addEventListener("scroll", () => {
            if (!timeDropdown.classList.contains("hidden")) positionElementNearToggle(timeDropdown, timeToggle);
            if (!calendarModal.classList.contains("hidden")) positionElementNearToggle(calendarModal, timeToggle);
        });
        window.addEventListener("resize", () => {
            if (!timeDropdown.classList.contains("hidden")) positionElementNearToggle(timeDropdown, timeToggle);
            if (!calendarModal.classList.contains("hidden")) positionElementNearToggle(calendarModal, timeToggle);
        });

        timeToggle.dataset.listenersInitialized = 'true';
    }
}

// Helper: save a reference to the button to avoid losing it between requests
function getTimeToggle() {
    if (window._timeToggleEl && window._timeToggleEl.isConnected) return window._timeToggleEl;
    const el = document.getElementById('timeToggle');
    if (el) window._timeToggleEl = el;
    return el;
}

export function initCalendarVisibility(timeToggleArg, sendGroup) {
    const timeToggle = timeToggleArg || getTimeToggle();
    if (!timeToggle || !sendGroup) return;
    window._timeToggleEl = timeToggle;

    function checkCalendarVisibility() {
        const urlInp = document.getElementById('urlInp');
        if (!urlInp) return;

        const urlVal = (urlInp.value || '').trim();
        const methodEl = document.querySelector('.methodDropdown');
        const method = methodEl?.dataset?.value?.toUpperCase?.() || 'GET';

        // strict check for required URL and Method
        const isExactMatch =
            method === 'POST' &&
            urlVal === '{{riderGatewayHost}}/api/v1/orders';

        if (isExactMatch) {
            // show and move to sendGroup
            timeToggle.style.display = '';
            if (!sendGroup.contains(timeToggle)) {
                sendGroup.appendChild(timeToggle);
            }
        } else {
            // hide and move to body
            timeToggle.style.display = 'none';
            if (timeToggle.parentElement !== document.body) {
                document.body.appendChild(timeToggle);
            }
        }
    }

    // reset previous observer
    if (timeToggle._urlObserver) timeToggle._urlObserver.disconnect();

    // check for URL and method changes
    const urlDisplay = document.getElementById('urlInpDisplay');
    if (urlDisplay) {
        const obs = new MutationObserver(checkCalendarVisibility);
        obs.observe(urlDisplay, { childList: true, subtree: true, characterData: true });
        timeToggle._urlObserver = obs;
    }

    document.getElementById('urlInpDisplay')?.addEventListener('input', checkCalendarVisibility);

    // check for method change
    const methodDropdown = document.querySelector('.methodDropdown');
    if (methodDropdown) {
        methodDropdown.addEventListener('click', () => {
            setTimeout(checkCalendarVisibility, 50);
        });
    }

    // initial check after card load
    checkCalendarVisibility();
}
export function clearFullScript(type = 'pre', reqId = null) {
    if (reqId) {
        if (state.COLLECTION_SCRIPTS?.[type]) {
            delete state.COLLECTION_SCRIPTS[type][reqId];
        }

        localStorage.removeItem(`${type}Script_${reqId}`);
        localStorage.removeItem(`script_${type}_${reqId}`);
        localStorage.removeItem(`${type}Script_global`);
        localStorage.removeItem(`script_${type}_global`);
    } else {
        Object.keys(localStorage).forEach(k => {
            if (
                k.startsWith(`${type}Script_`) ||
                k.startsWith(`script_${type}_`)
            ) {
                localStorage.removeItem(k);
            }
        });

        if (state.COLLECTION_SCRIPTS) {
            if (typeof state.COLLECTION_SCRIPTS[type] === 'object') {
                state.COLLECTION_SCRIPTS[type] = {};
            } else {
                state.COLLECTION_SCRIPTS[type] = '';
            }
        }
    }
}

