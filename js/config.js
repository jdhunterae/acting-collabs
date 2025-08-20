// --- Runtime configuration & feature flags ---
export const API_BASE_URL = 'https://themoviedb-proxy.netlify.app/api';

export const INCLUDE_CREW = false; // include crew credits when intersecting (default: cast only)
export const INCLUDE_ADULT = false; // pass include_adult to /search/person

// TV overlap scanning controls (affect speed/accuracy trade-off)
export const TV_CHECK = {
    includeSpecials: false,  // ignore season 0 ("Specials")
    maxSeasons: 50,          // safety cap per show
    seasonOrder: 'desc',     // scan recent seasons first ('desc' | 'asc')
    seasonConcurrency: 4,    // how many seasons to scan at a time
    episodeConcurrency: 6,   // how many episodes to scan at a time
};
