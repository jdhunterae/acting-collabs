// ----- CONFIG -----
const API_BASE_URL = 'https://themoviedb-proxy.netlify.app/api';
const INCLUDE_CREW = false; // set true if you want crew credits considered too

// ----- DOM -----
const actor1Input = document.getElementById('actor1');
const actor2Input = document.getElementById('actor2');
const searchBtn = document.getElementById('searchButton');
const resultDiv = document.getElementById('result');

searchBtn.addEventListener('click', findCollaboration);

// ----- UTILITIES -----
const now = () => new Date();

function parseDateMaybe(s) {
    // TMDb dates are YYYY-MM-DD; sometimes missing or empty
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function yearOf(date) {
    return date ? date.getFullYear() : '—';
}

function formatSince(date) {
    if (!date) return 'unknown';
    const diffMs = now() - date;
    if (diffMs < 0) return 'in the future';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365.25);
    const months = Math.floor((diffDays % 365.25) / 30.44);
    if (years >= 1) return `${years}y ${months}m ago`;
    if (months >= 1) return `${months}m ago`;
    const weeks = Math.floor(diffDays / 7);
    if (weeks >= 1) return `${weeks}w ago`;
    return `${diffDays}d ago`;
}

function ageAtDate(birthdayStr, atDate) {
    if (!birthdayStr || !atDate) return null;
    const b = parseDateMaybe(birthdayStr);
    if (!b) return null;
    let age = atDate.getFullYear() - b.getFullYear();
    const hasHadBirthday =
        atDate.getMonth() > b.getMonth() ||
        (atDate.getMonth() === b.getMonth() && atDate.getDate() >= b.getDate());
    if (!hasHadBirthday) age -= 1;
    return age;
}

function titleOf(credit) {
    // combined_credits: movies use "title" + "release_date"; TV uses "name" + "first_air_date"
    return credit.title || credit.name || '(untitled)';
}

function releaseDateOf(credit) {
    return parseDateMaybe(credit.release_date || credit.first_air_date || null);
}

function roleOf(credit) {
    return credit.character || credit.job || null;
}

// Simple per-session cache so repeated searches are snappy
const cache = new Map();
async function fetchJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    cache.set(url, data);
    return data;
}

// ----- TMDb (via your Netlify proxy) -----
async function getActorId(name) {
    const url = `${API_BASE_URL}/search/person?query=${encodeURIComponent(name)}&include_adult=false`;
    const data = await fetchJSON(url);
    return data.results?.[0]?.id ?? null; // take top result for now
}

async function getActorCredits(personId) {
    const url = `${API_BASE_URL}/person/${personId}/combined_credits`;
    const data = await fetchJSON(url);
    // You were using cast only; keep that default
    const cast = data.cast || [];
    if (!INCLUDE_CREW) return cast;
    const crew = data.crew || [];
    return [...cast, ...crew];
}

async function getPersonDetails(personId) {
    const url = `${API_BASE_URL}/person/${personId}`; // contains birthday/deathday/etc.
    return fetchJSON(url);
}

// ----- CORE FLOW -----
async function findCollaboration() {
    const actor1Name = actor1Input.value.trim();
    const actor2Name = actor2Input.value.trim();

    if (!actor1Name || !actor2Name) {
        resultDiv.innerHTML = 'Please enter both actor names.';
        return;
    }

    resultDiv.innerHTML = 'Searching…';

    try {
        // 1) Find IDs
        const [actor1Id, actor2Id] = await Promise.all([
            getActorId(actor1Name),
            getActorId(actor2Name),
        ]);

        if (!actor1Id || !actor2Id) {
            resultDiv.innerHTML = 'Could not find one or both actors. Please check the spelling.';
            return;
        }

        // 2) Fetch credits + person details (for birthdays)
        const [a1Credits, a2Credits, a1Details, a2Details] = await Promise.all([
            getActorCredits(actor1Id),
            getActorCredits(actor2Id),
            getPersonDetails(actor1Id),
            getPersonDetails(actor2Id),
        ]);

        // 3) Intersect credits by ID (movie+tv entries are unique by `id`)
        const map1 = new Map(a1Credits.map(c => [c.id, c]));
        const shared = [];
        for (const c2 of a2Credits) {
            if (!map1.has(c2.id)) continue;
            const c1 = map1.get(c2.id);
            const releaseDate = releaseDateOf(c1) || releaseDateOf(c2);
            shared.push({
                id: c1.id,
                media_type: c1.media_type || c2.media_type, // "movie" | "tv"
                title: titleOf(c1) || titleOf(c2),
                releaseDate,
                year: yearOf(releaseDate),
                a1Role: roleOf(c1),
                a2Role: roleOf(c2),
                a1AgeAt: ageAtDate(a1Details.birthday, releaseDate),
                a2AgeAt: ageAtDate(a2Details.birthday, releaseDate),
                poster_path: c1.poster_path || c2.poster_path || null,
            });
        }

        // 4) Deduplicate by id just in case and sort by date desc
        const uniq = Array.from(new Map(shared.map(x => [x.id, x])).values())
            .sort((a, b) => {
                const ad = a.releaseDate ? a.releaseDate.getTime() : 0;
                const bd = b.releaseDate ? b.releaseDate.getTime() : 0;
                return bd - ad;
            });

        // 5) Summary stats
        const mostRecent = uniq[0]?.releaseDate || null;
        const firstCollab = uniq.length ? uniq[uniq.length - 1].releaseDate : null;
        const sinceLast = mostRecent ? formatSince(mostRecent) : '—';

        displayResultDetailed({
            titles: uniq,
            a1: { id: actor1Id, name: actor1Name, birthday: a1Details.birthday || null },
            a2: { id: actor2Id, name: actor2Name, birthday: a2Details.birthday || null },
            firstYear: yearOf(firstCollab),
            lastSince: sinceLast,
            count: uniq.length,
        });

    } catch (err) {
        console.error(err);
        resultDiv.innerHTML = 'An error occurred. Please try again later.';
    }
}

// ----- RENDER -----
function displayResultDetailed(payload) {
    const { titles, a1, a2, firstYear, lastSince, count } = payload;

    if (!count) {
        resultDiv.innerHTML = `<strong>No.</strong> ${a1.name} and ${a2.name} have not appeared together.`;
        return;
    }

    let html = `
    <div style="margin-bottom:0.5rem">
      <strong>Yes.</strong> ${a1.name} and ${a2.name} have worked together ${count} time${count > 1 ? 's' : ''}.
      ${firstYear !== '—' ? ` First: ${firstYear}.` : ''} 
      ${lastSince !== '—' ? ` Most recent: ${lastSince}.` : ''}
    </div>
    <ul>
  `;

    for (const t of titles) {
        const ageBits = [];
        if (t.a1AgeAt != null) ageBits.push(`${a1.name}: ${t.a1AgeAt}`);
        if (t.a2AgeAt != null) ageBits.push(`${a2.name}: ${t.a2AgeAt}`);
        const ageStr = ageBits.length ? ` — ages at release: ${ageBits.join(' · ')}` : '';
        const roles = [t.a1Role, t.a2Role].some(Boolean)
            ? ` — roles: ${t.a1Role || '—'} & ${t.a2Role || '—'}`
            : '';

        html += `<li>${t.title} (${t.year})${roles}${ageStr}</li>`;
    }

    html += '</ul>';
    resultDiv.innerHTML = html;
}
