# acting-collabs

Search two actors and see what they actually worked on **together** — across movies and (optionally) TV episodes — using [TMDb](https://www.themoviedb.org/) data.  
Front-end is static (GitHub Pages). API calls are proxied through a tiny Netlify Function so your TMDb key stays private.

> This product uses the TMDb API but is not endorsed or certified by TMDb.

---

## ✨ Features

- **Actor pair search** – Type two names, get verified shared credits.
- **Movies / TV filters** – Choose Movies, TV, or both. TV scanning is heavier and can be toggled off.
- **Same-episode verification for TV** – No more false positives from long-running shows; we confirm that both actors appear in at least one identical episode.
- **Clean single-page UI** – System theme via `prefers-color-scheme`; responsive, keyboard friendly.
- **Live status + cancel** – “Searching…” messages for each step and a Stop button (AbortController) to cancel in-flight scans.
- **Fast + considerate** – Request de-duplication, in-memory + localStorage caching, limited parallelism, and backoff on 429s.

---

## 🧱 Architecture

- **GitHub Pages** hosts the static site (HTML/CSS/JS).
- **Netlify Function** proxies requests to TMDb:
  - Front-end calls: `https://<your-site>.netlify.app/api/...`
  - Function appends `api_key` (or Authorization bearer) from an environment variable and forwards to TMDb `v3`/`v4`.
  - CORS is restricted to your Pages domain (recommended).

```
Browser (GitHub Pages)  →  Netlify Function (/api/\*)  →  TMDb API
```

---

## 📁 Repo layout (front-end)

```
/ (root of GitHub Pages repo)
index.html
styles.css
/js
app.js          # orchestrates a search and rendering
config.js       # API\_BASE\_URL + feature flags
fetcher.js      # caching, de-dup, retry, abort helpers
tmdb.js         # TMDb calls + parsing helpers
tvOverlap.js    # episode-level overlap checker (parallelized)
ui.js           # status messages + results renderer
```

Netlify proxy lives in a **separate repo** (or the same, your choice). Minimal structure:

```
tmdb-proxy/
netlify.toml
netlify/functions/
tmdb.js        # generic proxy; adds API key server-side
public/
index.html     # (optional placeholder)
````

---

## 🚀 Quick start

### 1) Create the Netlify proxy (one-time)

1. Push the proxy repo to GitHub with:

   **`netlify.toml`**
   ```toml
   [functions]
     directory = "netlify/functions"
     node_bundler = "esbuild"

   [build]
     publish = "public"

   [[redirects]]
     from = "/api/*"
     to = "/.netlify/functions/tmdb/:splat"
     status = 200
```

**`netlify/functions/tmdb.js`** (v3 api\_key style)

```js
const TMDB_BASE = "https://api.themoviedb.org/3";

function corsHeaders() {
  return {
    // RECOMMENDED: set this to your GitHub Pages origin
    // "Access-Control-Allow-Origin": "https://<username>.github.io"
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }
  try {
    const apiKey = process.env.TMDB_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: "TMDB_KEY not set" }) };
    }

    // support both /.netlify/functions/tmdb/* and /api/*
    let upstreamPath = event.path
      .replace(/^\/\.netlify\/functions\/tmdb/, "")
      .replace(/^\/api/, "");
    if (!upstreamPath) upstreamPath = "/";

    const url = new URL("https://api.themoviedb.org/3" + upstreamPath);

    // copy query params (multi-value safe)
    const mv = event.multiValueQueryStringParameters || {};
    const qsp = event.queryStringParameters || {};
    if (Object.keys(mv).length) {
      for (const [k, arr] of Object.entries(mv)) for (const v of arr) url.searchParams.append(k, v);
    } else {
      for (const [k, v] of Object.entries(qsp)) if (v != null) url.searchParams.set(k, v);
    }

    url.searchParams.set("api_key", apiKey); // force our key

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    const bodyText = await res.text();
    return { statusCode: res.status, headers: { ...corsHeaders(), "Content-Type": res.headers.get("content-type") || "application/json" }, body: bodyText };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) };
  }
};
```

2. In Netlify:

   * **Add new site → Import from Git** → select the proxy repo.
   * Build command: *(blank or `echo ok`)*; Publish directory: `public`.
   * **Site settings → Environment variables**:

     * `TMDB_KEY = <your v3 API key>`
       *(Alternatively use `TMDB_BEARER` and add an `Authorization: Bearer …` header in the function.)*
   * Deploy. Verify:

     ```
     https://<your-site>.netlify.app/api/search/person?query=Tom%20Hanks&include_adult=false
     ```

### 2) Configure the front-end (GitHub Pages)

1. In `/js/config.js`, set:

   ```js
   export const API_BASE_URL = 'https://<your-netlify-site>.netlify.app/api';
   ```
2. Push to your Pages repo and enable GitHub Pages (e.g., from `main` root or `docs/`).
3. Open your Pages URL, search two actors, and you’re done.

---

## 🧠 How it determines “worked together”

* **Movies**: intersection by TMDb credit ID in `combined_credits.cast` (and optionally crew if enabled).
* **TV**: for each shared show:

  1. Get season numbers (skip “specials”/season 0 by default).
  2. Optionally pre-check season aggregate credits to see if both actors appear at all.
  3. Scan episodes (limited parallelism) until we find at least **one episode** with both actors (cast/guest/crew).
  4. If found, the **episode’s air date** is used for the collaboration date.

Performance techniques:

* Shared in-flight requests, localStorage TTL cache, and concurrency caps (configurable in `TV_CHECK`).
* AbortController to cancel ongoing scans if the user starts a new search or presses **Stop**.

---

## 🔧 Configuration

Edit `js/config.js`:

```js
export const API_BASE_URL = 'https://<netlify>.netlify.app/api';

export const INCLUDE_CREW  = false;  // include crew credits in intersections
export const INCLUDE_ADULT = false;  // pass include_adult to search/person

export const TV_CHECK = {
  includeSpecials: false,
  maxSeasons: 50,
  seasonOrder: 'desc',     // recent first
  seasonConcurrency: 4,    // parallel seasons
  episodeConcurrency: 6,   // parallel episodes
};
```

---

## 🖥️ UI & accessibility

* Matches system theme (`prefers-color-scheme`), no toggle needed.
* Keyboard friendly form controls; visible focus states.
* **ARIA live region** announces search milestones (“resolving names… / gathering credits… / scrubbing TV episodes…”).
* **Filters**: Movies / TV checkboxes; Search button disables if neither is selected.
* Optional **Stop** button cancels in-flight scans.

---

## Nice extras

* Type-ahead suggestions with `<datalist>`.
* Recent searches chips.
* Sort toggle (newest/oldest) or grouping by decade (must re-submit search to reverse order).

---

## Security notes

* TMDb key is **not** shipped to the client. It lives only in Netlify environment variables and is appended server-side by the function.
* Restrict the function’s CORS header to your Pages origin in production:

  ```js
  "Access-Control-Allow-Origin": "https://<username>.github.io"
  ```

---

## Local development

* Static front-end can be opened with any local server (e.g., VS Code Live Server).
* If you want to run the Netlify function locally, install `netlify-cli` in the proxy repo and run `netlify dev`.

---

## License

MIT — see [`LICENSE`](LICENSE).

---

## Credits

* Data powered by [TMDb](https://www.themoviedb.org/).
* Hosted on **GitHub Pages** (front-end) + **Netlify Functions** (API proxy).
