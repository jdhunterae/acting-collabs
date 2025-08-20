// --- TMDb domain helpers (via your Netlify proxy) ---
import { API_BASE_URL, INCLUDE_CREW, INCLUDE_ADULT } from './config.js';
import { fetchJSON, getAbortSignal } from './fetcher.js';

// Core API calls
export async function getActorId(name) {
    const url = `${API_BASE_URL}/search/person?query=${encodeURIComponent(name)}&include_adult=${INCLUDE_ADULT ? 'true' : 'false'}`;
    const data = await fetchJSON(url, { signal: getAbortSignal() });

    return data.results?.[0]?.id ?? null;
}

export async function getActorCredits(personId) {
    const url = `${API_BASE_URL}/person/${personId}/combined_credits`;
    const data = await fetchJSON(url, { signal: getAbortSignal() });
    const cast = data.cast || [];

    if (!INCLUDE_CREW) return cast;

    const crew = data.crew || [];

    return [...cast, ...crew];
}

export async function getPersonDetails(personId) {
    const url = `${API_BASE_URL}/person/${personId}`;

    return fetchJSON(url, { signal: getAbortSignal() });
}

// Parsing & formatting helpers
export function parseDateMaybe(s) {
    if (!s) return null;

    const d = new Date(s);

    return isNaN(d.getTime()) ? null : d;
}

export function yearOf(date) {
    return date ? date.getFullYear() : '—';
}

export function titleOf(credit) {
    return credit.title || credit.name || '(untitled)';
}

export function releaseDateOf(credit) {
    return parseDateMaybe(credit.release_date || credit.first_air_date || null);
}

export function roleOf(credit) {
    return credit.character || credit.job || null;
}

export function formatSince(date) {
    if (!date) return 'unknown';

    const diffMs = Date.now() - date;
    if (diffMs < 0) return 'in the future';

    const d = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const y = Math.floor(d / 365.25);
    const m = Math.floor((d % 365.25) / 30.44);

    if (y >= 1) return `${y}y ${m}m ago`;
    if (m >= 1) return `${m}m ago`;

    const w = Math.floor(d / 7);
    if (w >= 1) return `${w}w ago`;

    return `${d}d ago`;
}

export function ageAtDate(birthdayStr, atDate) {
    if (!birthdayStr || !atDate) return null;

    const b = parseDateMaybe(birthdayStr);
    if (!b) return null;

    let age = atDate.getFullYear() - b.getFullYear();
    const hadBirthday = (atDate.getMonth() > b.getMonth()) ||
        (atDate.getMonth() === b.getMonth() && atDate.getDate() >= b.getDate());
    if (!hadBirthday) age -= 1;

    return age;
}
