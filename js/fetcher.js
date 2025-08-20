// --- Fetch layer: caching, de-dup, retry, and abort between searches ---
const memoryCache = new Map(); // session cache
const inflight = new Map();    // share in-flight requests
const LS_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

let currentAbort = null;
export function startNewSearchAbort() {
    if (currentAbort) currentAbort.abort();

    currentAbort = new AbortController();

    return currentAbort.signal;
}

export function getAbortSignal() {
    return currentAbort?.signal ?? undefined;
}

// localStorage helpers (best-effort; failures are fine)
function lsGet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const { t, d } = JSON.parse(raw);
        if (Date.now() - t > LS_TTL_MS) { localStorage.removeItem(key); return null; }

        return d;
    } catch { return null; }
}

function lsSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch { }
}

// Shared JSON fetch with de-dup, LS+memory cache, and simple 429 backoff.
export async function fetchJSON(url, { useLS = true, signal } = {}) {
    const key = url;

    if (memoryCache.has(key)) return memoryCache.get(key);
    if (useLS) {
        const hit = lsGet(key);
        if (hit) { memoryCache.set(key, hit); return hit; }
    }
    if (inflight.has(key)) return inflight.get(key);

    const p = (async () => {
        let res;
        for (let attempt = 0; attempt < 2; attempt++) {
            res = await fetch(url, { signal });
            if (res.status !== 429) break;
            const ra = parseInt(res.headers.get('Retry-After') || '1', 10);
            await new Promise(r => setTimeout(r, Math.min(3000, ra * 1000)));
        }

        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

        const data = await res.json();
        memoryCache.set(key, data);

        if (useLS) lsSet(key, data);

        inflight.delete(key);
        return data;
    })();

    inflight.set(key, p);

    return p;
}

// Limit concurrency across an array of tasks.
export async function mapLimit(items, limit, task) {
    const results = new Array(items.length);
    let i = 0;
    const workers = Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (i < items.length) {
            const idx = i++;
            results[idx] = await task(items[idx], idx);
        }
    });

    await Promise.all(workers);

    return results;
}
