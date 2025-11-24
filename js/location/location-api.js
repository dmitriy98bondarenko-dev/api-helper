// location-api.js
import { fetchWithTimeout, buildApiUrl } from "../config.js";


// api setup
const REQUEST_TIMEOUT_MS = 15000;
export const UKLON_MIN_CHARS = 2;
const UKLON_AUTOCOMPLETE_API_URL = "https://rider.dev.uklon.com.ua/api/v1/addresses/autocomplete";
const UKLON_DETAILS_API_BASE = "https://rider.dev.uklon.com.ua/api/v1/addresses/";
const UKLON_NEAREST_API_URL = "https://rider.dev.uklon.com.ua/api/v2/addresses/nearest";

/**
 * detects locale based on query (Cyrillic -> uk, else en)
 */
function getLocaleFromQuery(query) {
    if (!query) return 'uk';
    const cyrillicRegex = /[а-яА-ЯёЁіІїЇєЄґҐ]/;
    return cyrillicRegex.test(query) ? 'uk' : 'en';
}

/**
 * load cities from api
 */
export async function loadCitiesApi() {
    try {
        const url = buildApiUrl("https://driver.dev.uklon.com.ua/api/v1/countries");

        const res = await fetch(url, {
            method: "GET",
            headers: { "locale": "UA" }
        });

        const data = await res.json();
        const ua = data.find(c => c.code === "UA");

        if (!ua || !ua.cities) {
            throw new Error("Failed to find UA cities in response");
        }

        return ua.cities;
    } catch (err) {
        console.error("Failed to load cities:", err);
        return false;
    }
}


/**
 * get full address details by id, including coordinates from centroid
 */
export async function fetchAddressDetails(id, sessionToken) {
    const url = new URL(UKLON_DETAILS_API_BASE + id);
    url.searchParams.set("include_geo", "true");
    url.searchParams.set("session_token", sessionToken);

    try {
        const res = await fetchWithTimeout(url.toString());
        if (!res.ok) throw new Error(`Details API error: ${res.status}`);
        const data = await res.json();

        if (data?.detail?.centroid) {
            const { latitude: lat, longitude: lon } = data.detail.centroid;
            return {
                lat,
                lon,
                name: data.detail.name || data.detail.description || ""
            };
        }
        console.warn("Address details fetched, but missing coordinates:", data);
        return null;
    } catch (err) {
        console.error("Fetch Address Details error:", err);
        return null;
    }
}

/**
 * fetches address suggestions from autocomplete api
 */
export async function fetchAddressSuggestions({ query, pointType, selectedCityCode, sessionToken }) {
    if (!query) return null;

    const detectedLocale = getLocaleFromQuery(query);
    const url = new URL(UKLON_AUTOCOMPLETE_API_URL);

    url.searchParams.set("point_type", pointType);
    url.searchParams.set("count", 15);
    url.searchParams.set("include_geo", "false");
    url.searchParams.set("search", query);
    url.searchParams.set("locale", detectedLocale);
    url.searchParams.set("session_token", sessionToken);

    try {
        const res = await fetchWithTimeout(url.toString(), {
            method: "GET",
            headers: {
                "city": selectedCityCode || "Kyiv",
                "locale": detectedLocale,
            }
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        return data?.details || [];
    } catch (err) {
        console.error("Fetch error:", err);
        return false; // Return false to indicate a search failure
    }
}

/**
 * get nearest address from api
 */
export async function fetchNearestAddress({ lat, lng, selectedCityCode, sessionToken }) {
    const url = new URL(UKLON_NEAREST_API_URL);
    url.searchParams.set("total", 1);
    url.searchParams.set("lat", lat.toFixed(5));
    url.searchParams.set("lng", lng.toFixed(5));
    url.searchParams.set("radius", 50.0);
    url.searchParams.set("locale", "uk");
    url.searchParams.set("session_token", sessionToken);

    const cityHeader = selectedCityCode || "Kyiv";

    try {
        const res = await fetchWithTimeout(url.toString(), {
            method: "GET",
            headers: { "city": cityHeader, "locale": "uk" }
        });
        if (!res.ok) throw new Error(`Nearest API error: ${res.status}`);
        const data = await res.json();

        const nearestDetail = data?.details?.[0];

        if (nearestDetail?.centroid) {
            const { latitude: centroidLat, longitude: centroidLon } = nearestDetail.centroid;
            const addressName = nearestDetail.name || nearestDetail.description || `${centroidLat.toFixed(5)}, ${centroidLon.toFixed(5)}`;
            return { addressName, lat: centroidLat, lon: centroidLon };
        }
        return null;
    } catch (err) {
        console.error("Fetch Nearest Address error:", err);
        return null;
    }
}