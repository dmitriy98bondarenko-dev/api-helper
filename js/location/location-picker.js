// location-picker.js

import {
    fetchAddressDetails,
    fetchAddressSuggestions,
    fetchNearestAddress,
    loadCitiesApi,
    UKLON_MIN_CHARS
} from "./location-api.js";

import {
    openLocationBtn, locationModal, closeModalBtn,
    mapModal, cancelMapBtn, confirmMapBtn, coordsText,
    pickupInput, dropInput, pickupSuggestions, dropSuggestions,
    favoritePickupBtn, favoriteDropoffBtn, clearPickupBtn, clearDropBtn,
    pickupIcon, dropIcon, resetLocationsBtn, themeToggleSwitch,
    showAlert, hideAllSuggestions, unfocusAllInputs,
    updateInputStatus, updateFavoriteButtons, renderCityDropdown,
    openCityDropdown, closeCityDropdown,
    showFavoritesAsSuggestions, showSuggestions, updateCoordsUI,
    setupMapIconOnboarding, completeMapIconOnboarding, renderPortalSuggestions
} from "./location-dom.js";

// state variables

let activeInput = null;
let map, marker; // Leaflet objects (L is assumed to be global/available)
let debounceTimer;
let suppressNextAutocomplete = false;
let cityDropdownOpen = false;
let CITIES = [];
let SELECTED_CITY = null;
let sessionToken = crypto.randomUUID();
const MAX_FAVORITES = 5;
const MAP_ONBOARDING_KEY = 'map_icon_onboarded';
// Default to Kyiv center
const KYIV_CENTER_LAT = 50.47138;
const KYIV_CENTER_LON = 30.52067;
let mapOpenedFor = null;

// location setup

/**
 * fun to active or inactive location button animation
 */
function updateLocationBtnStatus() {
    const isPickupFilled = pickupInput && pickupInput.value.trim().length > 0;
    const isDropFilled = dropInput && dropInput.value.trim().length > 0;
    const locationBtn = document.getElementById("locationBtn");

    if (locationBtn) {
        if (isPickupFilled || isDropFilled) {
            locationBtn.classList.add("location-active");
        } else {
            locationBtn.classList.remove("location-active");
        }
    }
}


/**
 * Sets the SELECTED_CITY state and updates UI
 */
function setSelectedCity(city) {
    SELECTED_CITY = city;
}

/**
 * Loads cities from api and sets up the city dropdown
 */
async function loadCities() {
    const cities = await loadCitiesApi();

    if (cities === false) {
        showAlert("Failed to load cities", 'error');
        return;
    }

    CITIES = cities;

    // set kyiv as default
    const kyiv = CITIES.find(c => c.code === "Kyiv" || c.name === "Київ");
    if (kyiv) {
        SELECTED_CITY = kyiv;
    }

    // pass the state manager functions to the ui renderer
    renderCityDropdown(CITIES, SELECTED_CITY, setSelectedCity, cityDropdownOpen, openCityDropdownState);
}

// utility to wrap DOM closeCityDropdown and update local state
function closeCityDropdownState() {
    closeCityDropdown();
    cityDropdownOpen = false;
}

// utility to wrap dom openCityDropdown and update local state
function openCityDropdownState(trigger) {
    cityDropdownOpen = openCityDropdown({
        CITIES,
        setSelectedCity,
        closeCityDropdown: closeCityDropdownState,
        cityDropdownOpen
    });
}

/**
 * extracts a city and location name from a full address string
 */
function extractCity(fullAddress) {
    if (!fullAddress) return "Location";
    const parts = fullAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const len = parts.length;

    if (len >= 3) {
        let potentialCity = parts[len - 2];
        if (potentialCity && /\d{5}/.test(potentialCity.replace(/\s/g, ''))) {
            return len >= 3 ? parts[len - 3] : potentialCity;
        }
        return potentialCity;
    } else if (len > 0) {
        return parts[len - 1];
    }
    return "Location";
}


/**
 * selects address suggestion, updates UI instantly, fetches coords in background
 */
function selectSuggestion(addr, pointType) {
    const input = pointType === "pickup" ? pickupInput : dropInput;

    // Get the exact address name selected by the user
    const selectedAddressName = addr.name || addr.original_name || "—";

    // Determine the city/area info
    const cityName =
        addr.additional_info ||
        addr.city ||
        addr.description ||
        extractCity(selectedAddressName) ||
        "—";

    input.dataset.city = cityName;

    // Update UI immediately
    input.value = selectedAddressName;
    hideAllSuggestions();
    unfocusAllInputs();

    // Clear coords temporarily
    delete input.dataset.lat;
    delete input.dataset.lon;
    activeInput = null;

    updateFavoriteButtons(input, checkIfFavorite);
    updateInputStatus(input);
    updateLocationBtnStatus();

    // Fetch precise coordinates in the background
    if (addr.id) {
        fetchAddressDetails(addr.id, sessionToken)
            .then(detailedAddr => {
                if (detailedAddr?.lat && detailedAddr?.lon) {

                    // Set precise coordinates
                    input.dataset.lat = detailedAddr.lat;
                    input.dataset.lon = detailedAddr.lon;

                    // Check if input value hasn't been changed by the user in the meantime
                    if (input.value.trim() === selectedAddressName) {
                        // Update UI status and save the point to LS
                        updateInputStatus(input);
                        updateFavoriteButtons(input, checkIfFavorite);
                        updateLocationBtnStatus();
                        savePointToLocalStorage(input);
                    }
                }
            })
            .catch(error => console.error("Background coordinate fetch error:", error));
    } else {
        console.error("Selected suggestion is missing 'id'. Cannot fetch details.");
    }
}

// input logic

/**
 * renders suggestions list based on api results or favorites
 */
async function renderAddressSuggestions(query, pointType, suggestionsBox, input) {
    if (!query || query.length < UKLON_MIN_CHARS) {
        // Show favorites if query is empty or too short
        showFavoritesAsSuggestions({
            target: suggestionsBox,
            input,
            favorites: getFavorites(),
            deleteFavoriteFn: (name) => deleteFavorite(name, suggestionsBox, input),
            openMapModalFn: () => openMapModal(input),
            updateLocationBtnStatusFn: updateLocationBtnStatus,
            saveToLocalStorageFn: savePointToLocalStorage
        });
        return;
    }

    const addresses = await fetchAddressSuggestions({
        query,
        pointType,
        selectedCityCode: SELECTED_CITY?.code,
        sessionToken
    });

    if (addresses === false) {
        // Search failed
        suggestionsBox.innerHTML = `<div class="suggestion-item no-results">Search failed.</div>`;
        renderPortalSuggestions(suggestionsBox, input);
        return;
    }

    showSuggestions(addresses, suggestionsBox, input, selectSuggestion, () => openMapModal(input));
}


/**
 * Handles input focus sets active input, updates UI, shows favorites or triggers autocomplete
 */
function handleFocus(input, suggestions) {
    if (suppressNextAutocomplete) {
        suppressNextAutocomplete = false;
        return;
    }
    hideAllSuggestions();
    unfocusAllInputs();

    activeInput = input;
    input.closest('.input-group.labeled')?.classList.add('focused');
    const query = input.value.trim();
    const pointType = input.id === "pickupInput" ? "pickup" : "dropoff";

    renderAddressSuggestions(query, pointType, suggestions, input);
    updateFavoriteButtons(input, checkIfFavorite);
}

/**
 * Handles user input with debounce
 */
function handleInput(input, target) {
    const query = input.value.trim();
    const pointType = input.id === 'pickupInput' ? 'pickup' : 'dropoff';

    // clear coords if user starts typing a new query
    if (query.length > 0) {
        delete input.dataset.lat;
        delete input.dataset.lon;
    }
    updateFavoriteButtons(input, checkIfFavorite);
    updateLocationBtnStatus(); // update when coords are written

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        renderAddressSuggestions(query, pointType, target, input);
    }, 400);

    // if query is empty, show favorites instantly without debounce
    if (query.length === 0) {
        renderAddressSuggestions(query, pointType, target, input);
    }
    checkAndClearLocalStorage(input);
}

/**
 * Clears the input field and related data, then refocuses to show suggestions/favorites
 */
function clearInput(input) {
    input.value = '';
    delete input.dataset.lat;
    delete input.dataset.lon;

    input.focus();

    const target = input.id === 'pickupInput' ? pickupSuggestions : dropSuggestions;
    handleInput(input, target);
    updateLocationBtnStatus(); // update location btn when coords are cleared
    checkAndClearLocalStorage(input);
}

// favorites

/**
 * Retrieves only favorite addresses from localStorage
 */
function getFavorites() {
    const all = JSON.parse(localStorage.getItem("favoriteAddresses") || "[]");
    return all.filter(f => f.type === 'favorite' || (f.lat && f.lng));
}
/**
 * normalizeCoord before saving to localStorage
 */
function normalizeCoord(num) {
    return Number(num).toFixed(5);
}
/**
 * save location details to localStorage
 */
function savePointToLocalStorage(input) {
    const key = input.id === 'pickupInput' ? 'pickup_point' : 'dropoff_point';
    const name = input.value.trim();
    const lat = input.dataset.lat;
    const lng = input.dataset.lon;

    if (name && lat && lng) {
        localStorage.setItem(key, JSON.stringify({
            lat: normalizeCoord(lat),
            lng: normalizeCoord(lng),
            name: name
        }));
    } else {
        localStorage.removeItem(key);
    }
}
/**
 * save the favorites array to localStorage
 */
function saveFavorites(arr) {
    localStorage.setItem("favoriteAddresses", JSON.stringify(arr));
}

/**
 * checks if the current input value (name and coords lat, lon) is a saved favoritee
 */
function checkIfFavorite(input) {
    const address = input.value.trim();
    if (!address || !input.dataset.lat || !input.dataset.lon) return false;

    const favorites = getFavorites();
    const lat = input.dataset.lat;
    const lng = input.dataset.lon;

    // check if an entry with the same name, lat, and lon exists
    return favorites.some(f => f.name === address && f.lat === lat && f.lng === lng);
}

/**
 * adds or removes the current address to/from favorites
 */
function toggleFavorite(input, customName) {
    const address = input.value.trim();
    const lat = input.dataset.lat;
    const lng = input.dataset.lon;

    if (!address || !lat || !lng) {
        showAlert("Enter address and select it from suggestions or map first!", "error");
        return;
    }

    let favorites = getFavorites();
    const name = customName || address;

    const existsIndex = favorites.findIndex(f => f.name === address);

    if (existsIndex !== -1) {
        favorites.splice(existsIndex, 1);
    } else {
        if (favorites.length >= MAX_FAVORITES) {
            favorites.shift();
        }
        const city = input.dataset.city || extractCity(address);
        favorites.push({
            name: address,
            customName: name,
            lat,
            lng,
            city,
            type: 'favorite'
        });

    }

    saveFavorites(favorites);

    const targetSuggestions = input === pickupInput ? pickupSuggestions : dropSuggestions;
    if (activeInput === input && input.value.trim().length < UKLON_MIN_CHARS) {
        renderAddressSuggestions(input.value.trim(), input === pickupInput ? 'pickup' : 'dropoff', targetSuggestions, input);
    }
    updateFavoriteButtons(input, checkIfFavorite);
}

/**
 * delete a specific favorite entry and updates the list
 */
function deleteFavorite(addressName, targetSuggestions, input) {
    let favorites = getFavorites();
    favorites = favorites.filter(f => f.name !== addressName);
    saveFavorites(favorites);

    if (activeInput === input) {
        hideAllSuggestions();
        renderAddressSuggestions(input.value.trim(), input === pickupInput ? 'pickup' : 'dropoff', targetSuggestions, input);
    }

    updateFavoriteButtons(input, checkIfFavorite);
}

// map modal logic

/**
 * initializes the Leaflet map
 */
function initMap(initialCoords) {
    const isDark = document.body.dataset.theme === "dark";
    const layerUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    map = L.map("map", { // L is global from Leaflet script tag
        center: initialCoords,
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
    });

    L.tileLayer(layerUrl, { maxZoom: 19, crossOrigin: true }).addTo(map);

    // Custom pin marker
    const customIcon = L.divIcon({
        className: "custom-pin",
        html: `
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M38 18C38 10.2 31.8 4 24 4C16.2 4 10 10.2 10 18C10 25 15.2 30.8 22 31.8V40C22 41.2 22.8 42 24 42C25.2 42 26 41.2 26 40V31.8C32.8 30.8 38 25 38 18ZM24 28C18.4 28 14 23.6 14 18C14 12.4 18.4 8 24 8C29.6 8 34 12.4 34 18C34 23.6 29.6 28 24 28Z" fill="#33CCA1"/>
            <path d="M24 22C26.2091 22 28 20.2091 28 18C28 15.7909 26.2091 14 24 14C21.7909 14 20 15.7909 20 18C20 20.2091 21.7909 22 24 22Z" fill="#33CCA1"/>
            <ellipse cx="24" cy="42" rx="10" ry="2" fill="#33CCA1" fill-opacity="0.2"/>
            </svg>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 42]
    });

    marker = L.marker(initialCoords, { draggable: true, icon: customIcon }).addTo(map);

    marker.on("dragend", updateCoordsAndUI);
    map.on("click", e => { marker.setLatLng(e.latlng); updateCoordsAndUI(); });

    setTimeout(() => {
        map.invalidateSize();
        if (map._onResize) map._onResize();
        updateCoordsAndUI();
    }, 500);
}

/**
 * utility to update coordinates state and UI
 */
function updateCoordsAndUI() {
    updateCoordsUI(marker, coordsText);
}


/**
 * open the map modal, centering the map on the last known coordinates or city center
 */
function openMapModal(input) {
    activeInput = input;
    mapOpenedFor = input;
    locationModal.style.display = "none";
    mapModal.style.display = "flex";
    hideAllSuggestions();

    // Complete onboarding when map button is used
    completeMapIconOnboarding(pickupIcon, dropIcon, MAP_ONBOARDING_KEY);

    setTimeout(() => {
        let defaultCoords = [KYIV_CENTER_LAT, KYIV_CENTER_LON];

        if (SELECTED_CITY?.admin_center?.location) {
            const loc = SELECTED_CITY.admin_center.location;
            defaultCoords = [loc.lat, loc.lng];
        }

        const lat = activeInput.dataset.lat ? parseFloat(activeInput.dataset.lat) : defaultCoords[0];
        const lon = activeInput.dataset.lon ? parseFloat(activeInput.dataset.lon) : defaultCoords[1];
        const targetCoords = [lat, lon];

        if (!map) {
            initMap(targetCoords);
        } else {
            map.invalidateSize();
            map.setView(targetCoords, map.getZoom() || 15);
            marker.setLatLng(targetCoords);
            updateCoordsAndUI();
        }
    }, 200);
}

/**
 * update the Leaflet map tile layer when theme changes
 */
function updateMapTheme() {
    if (!map) return;

    const isDark = document.body.dataset.theme === "dark";
    const layerUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) map.removeLayer(layer);
    });

    L.tileLayer(layerUrl, { maxZoom: 19, crossOrigin: true }).addTo(map);

    setTimeout(() => map.invalidateSize(), 100);
}

function resetAllLocations() {
    pickupInput.value = '';
    dropInput.value = '';

    delete pickupInput.dataset.lat;
    delete pickupInput.dataset.lon;
    delete dropInput.dataset.lat;
    delete dropInput.dataset.lon;

    // clear coords from localStorage
    localStorage.removeItem("pickup_point");
    localStorage.removeItem("dropoff_point");

    const trigger = document.getElementById("citySelected");
    const kyiv = CITIES.find(c => c.code === "Kyiv" || c.name === "Київ");
    if (kyiv) {
        SELECTED_CITY = kyiv;
        if (trigger) trigger.querySelector(".label").textContent = kyiv.name
    }

    hideAllSuggestions();
    unfocusAllInputs();

    updateInputStatus(pickupInput);
    updateInputStatus(dropInput);
    updateFavoriteButtons(pickupInput, checkIfFavorite);
    updateFavoriteButtons(dropInput, checkIfFavorite);

    updateLocationBtnStatus(); // update location btn when coords are cleared
}
/**
* universal function to check and clear localStorage for points
 * */
function checkAndClearLocalStorage(input) {
    const key = input.id === 'pickupInput' ? 'pickup_point' : 'dropoff_point';
    const isInputEmpty = input.value.trim().length === 0;

    if (isInputEmpty) {
        localStorage.removeItem(key);
    }
}
// modal and event listeners

openLocationBtn.onclick = async () => {
    locationModal.style.display = "flex";

    if (CITIES.length === 0) {
        await loadCities();
    }
};
closeModalBtn.onclick = () => {
    locationModal.style.display = "none";
    activeInput = null;
    mapOpenedFor = null;
    unfocusAllInputs();
    hideAllSuggestions();
};

cancelMapBtn.onclick = () => {
    mapModal.style.display = "none";
    locationModal.style.display = "flex";
    activeInput = null;
    mapOpenedFor = null;
    unfocusAllInputs();
    hideAllSuggestions();
};

if (pickupIcon) pickupIcon.addEventListener("click", () => openMapModal(pickupInput));
if (dropIcon) dropIcon.addEventListener("click", () => openMapModal(dropInput));

// input focus handlers
pickupInput.addEventListener("focus", () => handleFocus(pickupInput, pickupSuggestions));
dropInput.addEventListener("focus", () => handleFocus(dropInput, dropSuggestions));
pickupInput.addEventListener("blur", () => setTimeout(() => updateInputStatus(pickupInput), 100));
dropInput.addEventListener("blur", () => setTimeout(() => updateInputStatus(dropInput), 100));
pickupInput.addEventListener("input", () => handleInput(pickupInput, pickupSuggestions));
dropInput.addEventListener("input", () => handleInput(dropInput, dropSuggestions));

// clear button setup
if (clearPickupBtn) clearPickupBtn.onclick = () => clearInput(pickupInput);
if (clearDropBtn) clearDropBtn.onclick = () => clearInput(dropInput);

// favorite button setup
if (favoriteDropoffBtn) {
    favoriteDropoffBtn.addEventListener("click", () => toggleFavorite(dropInput));
}
if (favoritePickupBtn) {
    favoritePickupBtn.addEventListener("click", () => toggleFavorite(pickupInput));
}

// reset locations button
if (resetLocationsBtn) {
    resetLocationsBtn.addEventListener("click", resetAllLocations);
}

// map confirmation
confirmMapBtn.onclick = async () => {
    const { lat: pinLat, lng: pinLng } = marker.getLatLng();
    let finalAddress = `${pinLat.toFixed(5)}, ${pinLng.toFixed(5)}`;
    let finalLat = pinLat;
    let finalLon = pinLng;

    const nearestResult = await fetchNearestAddress({
        lat: pinLat,
        lng: pinLng,
        selectedCityCode: SELECTED_CITY?.code,
        sessionToken
    });

    if (nearestResult) {
        finalAddress = nearestResult.addressName;
        finalLat = nearestResult.lat;
        finalLon = nearestResult.lon;
    }

    if (activeInput) {
        activeInput.value = finalAddress;
        activeInput.dataset.lat = finalLat;
        activeInput.dataset.lon = finalLon;
    }

    mapModal.style.display = "none";
    locationModal.style.display = "flex";

    if (activeInput) {
        suppressNextAutocomplete = true;
        activeInput.focus();

        const suggestionsBox =
            activeInput.id === "pickupInput" ? pickupSuggestions : dropSuggestions;

        const query = activeInput.value.trim();
        const pointType = activeInput.id === "pickupInput" ? "pickup" : "dropoff";

        renderAddressSuggestions(query, pointType, suggestionsBox, activeInput);
        updateFavoriteButtons(activeInput, checkIfFavorite);
    }
    // save last known coords to localStorage
    if (activeInput) {
        savePointToLocalStorage(activeInput);
    }
    mapOpenedFor = null;
    updateLocationBtnStatus(); // update location btn when confirmed coords on map modal
};

// theme switcher
if (themeToggleSwitch) {
    themeToggleSwitch.addEventListener("change", (e) => {
        document.body.dataset.theme = e.target.checked ? "dark" : "light";
        updateMapTheme();
    });
}

// global click listener to close suggestions/dropdowns
document.addEventListener("click", (e) => {
    const isCitySelect = e.target.closest(".custom-select");
    if (!isCitySelect) {
        closeCityDropdownState();
    }

    const insidePickup = e.target.closest("#pickupInput");
    const insideDrop = e.target.closest("#dropInput");
    const insideSuggestions = e.target.closest("#suggestionsPortal");

    if (!insidePickup && !insideDrop && !insideSuggestions) {
        hideAllSuggestions();
        unfocusAllInputs();
    }
});


function initFromLocalStorage() {
    const pickup = JSON.parse(localStorage.getItem("pickup_point") || "null");
    const dropoff = JSON.parse(localStorage.getItem("dropoff_point") || "null");

    // pickup point in ls
    if (pickup && pickup.lat && pickup.lng) {
        pickupInput.value = pickup.name || `${pickup.lat}, ${pickup.lng}`;
        pickupInput.dataset.lat = pickup.lat;
        pickupInput.dataset.lon = pickup.lng;

        // optional if it has
        const city = pickupInput.dataset.city || extractCity(pickup.name);
        if (city) pickupInput.dataset.city = city;

        updateInputStatus(pickupInput);
        updateFavoriteButtons(pickupInput, checkIfFavorite);
    }

    // dropoff point in ls
    if (dropoff && dropoff.lat && dropoff.lng) {
        dropInput.value = dropoff.name || `${dropoff.lat}, ${dropoff.lng}`;
        dropInput.dataset.lat = dropoff.lat;
        dropInput.dataset.lon = dropoff.lng;

        const city = dropInput.dataset.city || extractCity(dropoff.name);
        if (city) dropInput.dataset.city = city;

        updateInputStatus(dropInput);
        updateFavoriteButtons(dropInput, checkIfFavorite);
    }

    updateLocationBtnStatus();
}

// initialization

document.addEventListener('DOMContentLoaded', () => {
    initFromLocalStorage();
    setupMapIconOnboarding(pickupIcon, dropIcon, MAP_ONBOARDING_KEY);
    // Initial UI state update
    updateFavoriteButtons(pickupInput, checkIfFavorite);
    updateFavoriteButtons(dropInput, checkIfFavorite);
    updateLocationBtnStatus(); // check location btn status on page load
});