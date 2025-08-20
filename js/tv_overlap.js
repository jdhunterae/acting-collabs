// --- TV same-episode overlap confirmation ---
import { API_BASE_URL, TV_CHECK } from './config.js';
import { fetchJSON, mapLimit, getAbortSignal } from './fetcher.js';

export async function getTvSeasons(tvId) {
    const data = await fetchJSON(`${API_BASE_URL}/tv/${tvId}`, { signal: getAbortSignal() });
    let seasons = data.seasons || [];

    if (!TV_CHECK.includeSpecials) seasons = seasons.filter(s => (s.season_number ?? 0) > 0);

    seasons.sort((a, b) => TV_CHECK.seasonOrder === 'desc' ? b.season_number - a.season_number : a.season_number - b.season_number);

    if (TV_CHECK.maxSeasons) seasons = seasons.slice(0, TV_CHECK.maxSeasons);

    return seasons.map(s => s.season_number);
}

async function seasonContainsBoth(tvId, seasonNumber, p1, p2) {
    try {
        const agg = await fetchJSON(`${API_BASE_URL}/tv/${tvId}/season/${seasonNumber}/aggregate_credits`, { signal: getAbortSignal() });
        const ids = new Set([...(agg.cast || []).map(x => x.id), ...(agg.crew || []).map(x => x.id)]);

        return ids.has(p1) && ids.has(p2);
    } catch {
        // Some shows may not expose aggregate_credits; fall back to episode scan.
        return true;
    }
}

async function findSharedEpisodeInSeason(tvId, seasonNumber, p1, p2) {
    const season = await fetchJSON(`${API_BASE_URL}/tv/${tvId}/season/${seasonNumber}`, { signal: getAbortSignal() });
    const episodes = season.episodes || [];
    let found = null;

    await mapLimit(episodes, TV_CHECK.episodeConcurrency, async (ep) => {
        if (found || getAbortSignal()?.aborted) return;

        const cred = await fetchJSON(`${API_BASE_URL}/tv/${tvId}/season/${seasonNumber}/episode/${ep.episode_number}/credits`, { signal: getAbortSignal() });
        const ids = new Set([
            ...((cred.cast || []).map(p => p.id)),
            ...((cred.guest_stars || []).map(p => p.id)),
            ...((cred.crew || []).map(p => p.id)),
        ]);

        if (ids.has(p1) && ids.has(p2)) {
            found = {
                season: seasonNumber,
                episode: ep.episode_number,
                air_date: ep.air_date || null,
                name: ep.name || null,
            };
        }
    });

    return found;
}

export async function confirmTvOverlap(tvId, p1, p2) {
    const seasonNumbers = await getTvSeasons(tvId);
    let shared = null;

    await mapLimit(seasonNumbers, TV_CHECK.seasonConcurrency, async (sn) => {
        if (shared || getAbortSignal()?.aborted) return;
        if (!(await seasonContainsBoth(tvId, sn, p1, p2))) return;

        const ep = await findSharedEpisodeInSeason(tvId, sn, p1, p2);
        if (ep) shared = ep;
    });

    return shared;
}
