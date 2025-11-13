// location-dom.js

import { showAlert } from "../ui.js";

export const openLocationBtn = document.getElementById("locationBtn");
export const locationModal = document.getElementById("locationModal");
export const closeModalBtn = document.getElementById("closeModalBtn");
export const mapModal = document.getElementById("mapModal");
export const cancelMapBtn = document.getElementById("cancelMapBtn");
export const confirmMapBtn = document.getElementById("confirmMapBtn");
export const coordsText = document.getElementById("coordsText");
export const pickupInput = document.getElementById("pickupInput");
export const dropInput = document.getElementById("dropInput");
export const pickupSuggestions = document.getElementById("pickupSuggestions");
export const dropSuggestions = document.getElementById("dropSuggestions");
export const favoritePickupBtn = document.getElementById("favoritePickup");
export const favoriteDropoffBtn = document.getElementById("favoriteDropoff");
export const clearPickupBtn = pickupInput.closest('.input-group.labeled')?.querySelector('.clear-input-btn');
export const clearDropBtn = dropInput.closest('.input-group.labeled')?.querySelector('.clear-input-btn');
export const pickupIcon = document.getElementById("pickupIcon");
export const dropIcon = document.getElementById("dropIcon");
export const resetLocationsBtn = document.getElementById("resetLocationsBtn");
export const themeToggleSwitch = document.getElementById("themeToggleSwitch");


// ui functions

/**
 * returns svgs path for location icons in suggestion
 */
export function getIconSvgPath(objectType) {
    if (objectType === 'building') {
        return `
            <path d="M20 10H15V5C15 4.4 14.6 4 14 4H5C4.4 4 4 4.4 4 5V20C4 20.6 4.4 21 5 21H14H20C20.6 21 21 20.6 21 20V11C21 10.4 20.6 10 20 10ZM6 6H13V11V19H6V6ZM19 19H15V12H19V19Z" fill="currentColor"/>
            <path opacity="0.6" d="M8 9.00002C7.7 9.00002 7.5 8.90002 7.3 8.70002C7.1 8.50002 7 8.30002 7 8.00002C7 7.70002 7.1 7.50002 7.3 7.30002C7.4 7.20002 7.5 7.10002 7.6 7.10002C8 6.90002 8.4 7.00002 8.7 7.30002C8.9 7.50002 9 7.70002 9 8.00002C9 8.30002 8.9 8.50002 8.7 8.70002C8.5 8.90002 8.3 9.00002 8 9.00002Z" fill="currentColor"/>
            <path opacity="0.6" d="M11 9C10.7 9 10.5 8.9 10.3 8.7C10.1 8.5 10 8.3 10 8C10 7.7 10.1 7.5 10.3 7.3C10.7 6.9 11.3 6.9 11.7 7.3C11.9 7.5 12 7.7 12 8C12 8.3 11.9 8.5 11.7 8.7C11.5 8.9 11.3 9 11 9Z" fill="currentColor"/>
            <path opacity="0.6" d="M8 12C7.7 12 7.5 11.9 7.3 11.7C7.3 11.6 7.2 11.6 7.2 11.6C7.2 11.5 7.1 11.5 7.1 11.4C7 11.3 7 11.3 7 11.2C7 11.1 7 11.1 7 11C7 10.7 7.1 10.5 7.3 10.3C7.7 9.9 8.3 9.9 8.7 10.3C8.9 10.5 9 10.7 9 11C9 11.3 8.9 11.5 8.7 11.7C8.5 11.9 8.3 12 8 12Z" fill="currentColor"/>
            <path opacity="0.6" d="M11 12C10.7 12 10.5 11.9 10.3 11.7C10.1 11.5 10 11.3 10 11C10 10.7 10.1 10.5 10.3 10.3C10.7 9.9 11.3 9.9 11.7 10.3C11.9 10.5 12 10.7 12 11C12 11.3 11.9 11.5 11.7 11.7C11.5 11.9 11.3 12 11 12Z" fill="currentColor"/>
        `;
    }
    // svg for a other location icon
    return `
        <path d="M12 1C7 1 3 5 3 10C3 17.9 11.1 23.2 11.5 23.5C11.5 23.5 11.5 23.5 11.6 23.5H11.7C11.8 23.5 11.8 23.5 11.9 23.6H12H12.1H12.2C12.3 23.6 12.3 23.6 12.4 23.6C12.5 23.6 12.5 23.6 12.6 23.5H12.7C12.7 23.5 12.7 23.5 12.8 23.5C13.1 23.3 21.3 18 21.3 10C21 5 17 1 12 1ZM12 21.4C10.3 20.1 5 15.8 5 10C5 6.1 8.1 3 12 3C15.9 3 19 6.1 19 10C19 15.8 13.7 20.1 12 21.4Z" fill="currentColor"/>
        <path opacity="0.5" d="M12 14C9.8 14 8 12.2 8 10C8 7.8 9.8 6 12 6C14.2 6 16 7.8 16 10C16 12.2 14.2 14 12 14ZM12 8C10.9 8 10 8.9 10 10C10 11.1 10.9 12 12 12C13.1 12 14 11.1 14 10C14 8.9 13.1 8 12 8Z" fill="currentColor"/>
    `;
}

/**
 * hide all suggestion dropdowns
 */
export function hideAllSuggestions() {
    const portal = document.getElementById("suggestionsPortal");
    if (portal) portal.innerHTML = "";

    pickupSuggestions.style.display = "none";
    dropSuggestions.style.display = "none";
}

/**
 * remove focused class from all input groups
 */
export function unfocusAllInputs() {
    pickupInput.closest('.input-group.labeled')?.classList.remove('focused');
    dropInput.closest('.input-group.labeled')?.classList.remove('focused');
}

/**
 * update the filled status class on the input group - needs lat/lon
 */
export function updateInputStatus(input) {
    const group = input.closest('.input-group.labeled');
    const isFilled = input.value.trim().length > 0 && input.dataset.lat && input.dataset.lon;

    if (group) {
        group.classList.toggle('is-filled', isFilled);
    }
}

/**
 * @param {Function} checkIfFavoriteFn - callback to check favorite status
 */
export function updateFavoriteButtons(input, checkIfFavoriteFn) {
    const query = input.value.trim();
    const hasCoords = !!input.dataset.lat && !!input.dataset.lon;

    // clear button visibility
    const clearBtn = input.closest('.input-wrapper')?.querySelector('.clear-input-btn');
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', query.length === 0);
    }

    // favorite button state
    const favoriteBtn = input.closest('.input-row')?.querySelector('.favorite-standalone-btn');

    if (favoriteBtn) {
        // do active based on query length and coords
        favoriteBtn.disabled = !(query.length > 0 && hasCoords);

        if (checkIfFavoriteFn) {
            // use callback to check if address is already in favorites
            const isFavorite = checkIfFavoriteFn(input);
            favoriteBtn.classList.toggle('is-favorited', isFavorite);
            favoriteBtn.classList.toggle('text-yellow-500', isFavorite);
            favoriteBtn.classList.toggle('text-gray-400', !isFavorite);
        } else if (!favoriteBtn.classList.contains('is-favorited')) {
            // if no callback, default to not favorited
            favoriteBtn.classList.remove('text-yellow-500');
            favoriteBtn.classList.add('text-gray-400');
        }
    }
    updateInputStatus(input);
}


// city dropdown

/**
 * close the city selection dropdown
 */
export function closeCityDropdown() {
    const portal = document.getElementById("cityDropdownPortal");
    if (portal) portal.innerHTML = "";

    const wrapper = document.querySelector(".custom-select");
    if (wrapper) wrapper.classList.remove("open");
}

/**
 * open the city selection dropdown
 */
export function openCityDropdown({ CITIES, setSelectedCity, closeCityDropdown, cityDropdownOpen }) {
    if (cityDropdownOpen) {
        closeCityDropdown();
        return false;
    }

    hideAllSuggestions();

    const trigger = document.getElementById("citySelected");
    const modal = locationModal;
    const portal = document.getElementById("cityDropdownPortal");
    const wrapper = trigger.closest(".custom-select");

    if (!modal || !portal || !wrapper) return false;

    trigger.parentElement.classList.add("open");

    const rect = wrapper.getBoundingClientRect();
    const modalRect = modal.getBoundingClientRect();
    const modalStyles = window.getComputedStyle(modal);
    const paddingLeft = parseFloat(modalStyles.paddingLeft);
    const paddingTop = parseFloat(modalStyles.paddingTop);

    const left = rect.left - modalRect.left - paddingLeft;
    const top = rect.bottom - modalRect.top - paddingTop;

    const dropdown = document.createElement("div");
    dropdown.className = "city-dropdown";
    dropdown.style.cssText = `position: absolute; left: ${left}px; top: ${top + 4}px;`;

    CITIES.forEach(city => {
        const div = document.createElement("div");
        div.textContent = city.name;
        div.onclick = (e) => {
            e.stopPropagation();
            setSelectedCity(city);
            trigger.querySelector(".label").textContent = city.name;
            closeCityDropdown();
        };
        dropdown.appendChild(div);
    });

    portal.appendChild(dropdown);
    return true;
}

/**
 * handles city dropdown UI rendering and initial click handler
 */
export function renderCityDropdown(CITIES, SELECTED_CITY, setSelectedCity, cityDropdownOpen, openCityDropdownFn) {
    const trigger = document.getElementById("citySelected");
    if (!trigger) return;

    if (SELECTED_CITY) {
        trigger.querySelector(".label").textContent = SELECTED_CITY.name;
    }

    trigger.onclick = (e) => {
        e.stopPropagation();
        openCityDropdownFn(trigger); // Call external function to manage state
    };
}

// suggestions ui

export function renderPortalSuggestions(listEl, inputEl) {
    const portal = document.getElementById("suggestionsPortal");
    const modal = locationModal;

    portal.innerHTML = "";
    portal.style.pointerEvents = "none";

    const wrapper = inputEl.closest(".input-wrapper");
    const rect = wrapper.getBoundingClientRect();

    const modalRect = modal.getBoundingClientRect();
    const modalStyles = window.getComputedStyle(modal);

    const paddingLeft = parseFloat(modalStyles.paddingLeft);
    const paddingTop = parseFloat(modalStyles.paddingTop);

    const left = rect.left - modalRect.left - paddingLeft;
    const top = rect.bottom - modalRect.top - paddingTop + 6;

    listEl.style.position = "absolute";
    listEl.style.left = left + "px";
    listEl.style.top = top + "px";
    listEl.style.width = rect.width + "px";
    listEl.style.display = "block";
    listEl.style.zIndex = 9999999;
    listEl.style.pointerEvents = "auto";

    portal.appendChild(listEl);
}

/**
 * create the pick on map suggestion element
 */
export function createPickOnMapSuggestion(openMapModalFn) {
    const template = document.getElementById("template-pick-on-map");
    const fragment = template.content.cloneNode(true);
    const pickMapSuggestion = fragment.querySelector(".suggestion-item");

    pickMapSuggestion.onclick = () => {
        openMapModalFn();
    };

    return pickMapSuggestion;
}

/**
 * renders the pick on map button and saved favorite addresses
 */
export function showFavoritesAsSuggestions({ target, input, favorites, deleteFavoriteFn, openMapModalFn, updateLocationBtnStatusFn, saveToLocalStorageFn}) {
    target.innerHTML = "";

    // pick on the map button
    target.appendChild(createPickOnMapSuggestion(openMapModalFn));

    const favoriteTemplate = document.getElementById("template-favorite-item");

    // favorite addresses (reversed for newest first)
    [...favorites].reverse().forEach(fav => {
        const fragment = favoriteTemplate.content.cloneNode(true);
        const div = fragment.querySelector(".suggestion-item");
        const favoriteNameSpan = div.querySelector(".data-favorite-name");
        const addressTextSpan = div.querySelector(".data-address-text");

        const city = fav.city || "—";
        const hasCustomName = fav.customName && fav.customName !== fav.name;

        if (hasCustomName) {
            favoriteNameSpan.textContent = `${fav.customName} • ${city}`;
            addressTextSpan.textContent = fav.name;
            addressTextSpan.classList.remove('hidden-text');
        } else {
            favoriteNameSpan.textContent = fav.name;
            addressTextSpan.textContent = city;
            addressTextSpan.classList.remove('hidden-text');
        }

        // delete handler
        const deleteBtn = div.querySelector(".delete-favorite-btn");
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteFavoriteFn(fav.name);
        };

        // selection handler (coordinates update handled by caller's click logic)
        div.onclick = () => {
            input.value = fav.name;
            input.dataset.lat = fav.lat;
            input.dataset.lon = fav.lng;
            hideAllSuggestions();
            unfocusAllInputs();

            // uodate favorite button state
            const favoriteBtn = input.closest('.input-row')?.querySelector('.favorite-standalone-btn');
            if (favoriteBtn) {
                // if favorite button exists, update its state
                favoriteBtn.classList.add('is-favorited', 'text-yellow-500');
                favoriteBtn.classList.remove('text-gray-400');
                favoriteBtn.disabled = false; // must be enabled to be able to delete
            }

            updateInputStatus(input); // check status
            if (updateLocationBtnStatusFn) {
                updateLocationBtnStatusFn();
            }
            if (saveToLocalStorageFn) {
                saveToLocalStorageFn(input);
            }
        };

        target.appendChild(div);
    });

    renderPortalSuggestions(target, input);
}

/**
 * render search results from api response
 */
export function showSuggestions(addresses, target, input, selectSuggestionFn, openMapModalFn) {
    target.innerHTML = "";

    // pick on map button
    target.appendChild(createPickOnMapSuggestion(openMapModalFn));

    const validAddresses = addresses.filter(addr =>
        addr.object_type === "building" || addr.object_type === "other" || addr.object_type === "point"
    );

    if (validAddresses.length === 0) {
        target.innerHTML += `<div class="suggestion-item no-results">No results found.</div>`;
        renderPortalSuggestions(target, input);
        return;
    }

    const pointType = input.id === 'pickupInput' ? 'pickup' : 'dropoff';

    // search results
    validAddresses.forEach(addr => {
        const item = document.createElement("div");
        item.classList.add("suggestion-item");
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            selectSuggestionFn(addr, pointType);
        });

        const svgHtml = getIconSvgPath(addr.object_type);

        item.innerHTML = `
            <div class="suggestion-row">
                <svg class="suggestion-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${svgHtml}</svg>
                <span class="suggestion-text">
                    <span class="addr-title">${addr.name || addr.original_name || ""}</span>
                    <span class="addr-city">${addr.additional_info ? `, ${addr.additional_info}` : ""}</span>
                </span>
            </div>
        `;
        target.appendChild(item);
    });

    renderPortalSuggestions(target, input);
}

// map ui

/**
 * update coordinates text in map footer
 */
export function updateCoordsUI(marker, coordsTextElement) {
    if (marker) {
        const { lat, lng } = marker.getLatLng();
        coordsTextElement.textContent = `Lat: ${lat.toFixed(5)}, Lon: ${lng.toFixed(5)}`;
    }
}

// onboarding on map button and theme

/**
 * manage the map icon onboarding animation state
 */
export function setupMapIconOnboarding(pickupIcon, dropIcon, MAP_ONBOARDING_KEY) {
    const isMapOnboarded = localStorage.getItem(MAP_ONBOARDING_KEY) === 'true';

    if (!isMapOnboarded) {
        pickupIcon?.classList.add('onboarding-active');
        dropIcon?.classList.add('onboarding-active');
    } else {
        pickupIcon?.classList.add('is-onboarded');
        dropIcon?.classList.add('is-onboarded');
    }
}

/**
 * complete the onboarding process, removing animation and setting final state
 */
export function completeMapIconOnboarding(pickupIcon, dropIcon, MAP_ONBOARDING_KEY) {
    if (pickupIcon?.classList.contains('onboarding-active') || dropIcon?.classList.contains('onboarding-active')) {
        localStorage.setItem(MAP_ONBOARDING_KEY, 'true');

        pickupIcon?.classList.remove('onboarding-active');
        dropIcon?.classList.remove('onboarding-active');

        pickupIcon?.classList.add('is-onboarded');
        dropIcon?.classList.add('is-onboarded');
    }
}

export { showAlert };