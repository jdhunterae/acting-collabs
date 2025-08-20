// ----- CONFIG -----
const API_BASE_URL = 'https://themoviedb-proxy.netlify.app/api';
const INCLUDE_CREW = false;
const INCLUDE_ADULT = false;

// ----- DOM -----
const actor1Input = document.getElementById('actor1');
const actor2Input = document.getElementById('actor2');
const searchBtn = document.getElementById('searchButton');
const resultDiv = document.getElementById('result');

searchBtn.addEventListener('click', findCollaboration);

// ----- UTILITIES -----
const now = () => new Date();

// ---- TV overlap configuration ----
const TV_CHECK = {
    includeSpecials: false,  // exclude season 0 ("Specials")
    maxSeasons: 50,          // safety cap; raise/lower as you like
    seasonOrder: 'desc',     // 'desc' = recent first for snappier UX
};

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

async function getTvSeasons(tvId) {
    const data = await fetchJSON(`${API_BASE_URL}/tv/${tvId}`);
    let seasons = data.seasons || [];
    if (!TV_CHECK.includeSpecials) seasons = seasons.filter(s => (s.season_number ?? 0) > 0);
    seasons.sort((a, b) =>
        TV_CHECK.seasonOrder === 'desc'
            ? b.season_number - a.season_number
            : a.season_number - b.season_number
    );
    if (TV_CHECK.maxSeasons) seasons = seasons.slice(0, TV_CHECK.maxSeasons);
    console.info(`Found ${seasons.length} season(s) of TV #${tvId}`);
    return seasons.map(s => s.season_number);
}

async function seasonContainsBoth(tvId, seasonNumber, p1, p2) {
    try {
        const agg = await fetchJSON(`${API_BASE_URL}/tv/${tvId}/season/${seasonNumber}/aggregate_credits`);
        const ids = new Set([
            ...((agg.cast || []).map(x => x.id)),
            ...((agg.crew || []).map(x => x.id)),
        ]);
        return ids.has(p1) && ids.has(p2);
    } catch (e) {
        console.warn(`aggregate_credits unavailable for S${seasonNumber} of TV ${tvId}`, e);
        return true;
    }
}

async function findSharedEpisodeInSeason(tvId, seasonNumber, p1, p2) {
    const season = await fetchJSON(`${API_BASE_URL}/tv/${tvId}/season/${seasonNumber}`);
    const episodes = season.episodes || [];
    for (const ep of episodes) {
        const cred = await fetchJSON(`${API_BASE_URL}/tv/${tvId}/season/${seasonNumber}/episode/${ep.episode_number}/credits`);
        const ids = new Set([
            ...((cred.cast || []).map(p => p.id)),
            ...((cred.guest_stars || []).map(p => p.id)),
            ...((cred.crew || []).map(p => p.id)),
        ]);
        if (ids.has(p1) && ids.has(p2)) {
            return {
                season: seasonNumber,
                episode: ep.episode_number,
                air_date: ep.air_date || null,
                name: ep.name || null,
            };
        }
    }
    return null;
}

async function confirmTvOverlap(tvId, p1, p2) {
    const seasonNumbers = await getTvSeasons(tvId);

    for (const sn of seasonNumbers) {
        if (!(await seasonContainsBoth(tvId, sn, p1, p2))) continue;
        const ep = await findSharedEpisodeInSeason(tvId, sn, p1, p2);
        if (ep) return ep;
    }

    return null;
}

function setLoading(isLoading) {
    searchBtn.disabled = isLoading;

    if (isLoading) {
        resultDiv.innerHTML = `<div class="loading"><span class="spinner"></span><span>Searching…</span></div>`;
    }
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
        resultDiv.innerHTML = `<p class="empty">Please enter both actor names.</p>`;
        return;
    }

    setLoading(true);

    try {
        // 1) Find IDs
        const [actor1Id, actor2Id] = await Promise.all([
            getActorId(actor1Name),
            getActorId(actor2Name),
        ]);

        if (!actor1Id || !actor2Id) {
            resultDiv.innerHTML = '<p class="empty">Could not find one or both actors. Please check the spelling.</p>';
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
        const prelim = [];
        for (const c2 of a2Credits) {
            const c1 = map1.get(c2.id);

            if (!c1) continue;

            const releaseDate = releaseDateOf(c1) || releaseDateOf(c2);
            prelim.push({
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

        // 3b) Validate TV overlaps (same episode only)
        const movies = [];
        const tvCandidates = [];
        for (const item of prelim) {
            (item.media_type === 'tv' ? tvCandidates : movies).push(item);
        }

        const tvConfirmed = [];
        for (const tv of tvCandidates) {
            const ep = await confirmTvOverlap(tv.id, actor1Id, actor2Id);
            if (!ep) continue;

            const epDate = parseDateMaybe(ep.air_date);
            tv.releaseDate = epDate || tv.releaseDate;
            tv.year = yearOf(tv.releaseDate);
            tv.a1AgeAt = ageAtDate(a1Details.birthday, tv.releaseDate);
            tv.a2AgeAt = ageAtDate(a2Details.birthday, tv.releaseDate);
            tv.overlap = ep;
            tvConfirmed.push(tv);
        }

        // 4) merge, dedupe, sort by date desc
        const merged = [...movies, ...tvConfirmed];
        const uniq = Array.from(new Map(merged.map(x => [x.id + (x.media_type || ''), x])).values())
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
        resultDiv.innerHTML = '<p class="empty">An error occurred. Please try again later.</p>';
    } finally {
        setLoading(false);
    }
}

// ----- RENDER -----
function displayResultDetailed(payload) {
    const { titles, a1, a2, firstYear, lastSince, count } = payload;

    if (!count) {
        resultDiv.innerHTML = `<p class="emtpy"><strong>No.</strong> ${a1.name} and ${a2.name} have not appeared together.</p>`;
        return;
    }

    let html = `
    <p class="result-summary">
      <strong>Yes.</strong> ${a1.name} and ${a2.name} have worked together ${count} time${count > 1 ? 's' : ''}.
      ${firstYear !== '—' ? ` First: ${firstYear}.` : ''} 
      ${lastSince !== '—' ? ` Most recent: ${lastSince}.` : ''}
    </p>
    <ul class="credit-list">
  `;

    for (const t of titles) {
        const ageBits = [];

        if (t.a1AgeAt != null) ageBits.push(`${a1.name}: ${t.a1AgeAt}`);
        if (t.a2AgeAt != null) ageBits.push(`${a2.name}: ${t.a2AgeAt}`);

        // if ((t.a1AgeAt != null && t.a1AgeAt <= 0) || (t.a2AgeAt != null && t.a2AgeAt <= 0)) continue;

        const mediaLabel =
            t.media_type === 'movie' ? 'Movie'
                : t.media_type === 'tv' ? 'TV'
                    : (t.media_type || '');

        const parts = [];
        if (mediaLabel) parts.push(mediaLabel);
        if ([t.a1Role, t.a2Role].some(Boolean)) parts.push(`roles: ${t.a1Role || '-'} & ${t.a2Role || '-'}`);
        if (ageBits.length) parts.push(`ages at release: ${ageBits.join(' · ')}`);
        const overlapInfo = (t.media_type === 'tv' && t.overlap)
            ? ` · episode: S${t.overlap.season}E${t.overlap.episode}${t.overlap.name ? ` - ${t.overlap.name}` : ''}`
            : '';
        if (overlapInfo) parts.push(overlapInfo);

        html += `
            <li class="credit-item no-poster">
                <div class="meta">
                    <div class="title-row">
                        <span class="title">${t.title}</span>
                        <span class="badge">${t.year ?? '-'}</span>
                    </div>
                    <div class="subtext">${parts.join(' · ')}</div>
                </div>
            </li>
        `;
    }

    html += '</ul>';
    resultDiv.innerHTML = html;
}
