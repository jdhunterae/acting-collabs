import { API_BASE_URL } from './config.js';
import { startNewSearchAbort } from './fetcher.js';
import { getActorId, getActorCredits, getPersonDetails, parseDateMaybe, yearOf, titleOf, releaseDateOf, roleOf, formatSince, ageAtDate } from './tmdb.js';
import { confirmTvOverlap } from './tv_overlap.js';
import { setStatus, setEmpty, displayResultDetailed } from './ui.js';


// ----- DOM -----
const actor1Input = document.getElementById('actor1');
const actor2Input = document.getElementById('actor2');
const searchBtn = document.getElementById('searchButton');
const resultDiv = document.getElementById('result');

// Hook the button and Enter-to-submit behavior
searchBtn.addEventListener('click', findCollaboration);
document.getElementById('searchForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    findCollaboration();
});

async function findCollaboration() {
    const actor1Name = actor1Input.value.trim();
    const actor2Name = actor2Input.value.trim();

    if (!actor1Name || !actor2Name) {
        setEmpty("Please enter both actor names.");
        return;
    }

    // Abort previous search, if any; and start new one
    const signal = startNewSearchAbort();
    searchBtn.disabled = true;

    try {
        // 1) Resolve IDs
        setStatus('Searching... resolving names...');
        const [actor1Id, actor2Id] = await Promise.all([
            getActorId(actor1Name),
            getActorId(actor2Name),
        ]);

        if (!actor1Id || !actor2Id) {
            setEmpty("Could not find one or both actors. Please check the spelling.");
            return;
        }

        // 2) Fetch credits + person details
        setStatus('Searching... gathering credit lists...');
        const [a1Credits, a2Credits, a1Details, a2Details] = await Promise.all([
            getActorCredits(actor1Id),
            getActorCredits(actor2Id),
            getPersonDetails(actor1Id),
            getPersonDetails(actor2Id),
        ]);

        // 3) Intersect by TMDb credit id (movie + tv)
        setStatus('Searching... comparing appearances...');
        const map1 = new Map(a1Credits.map(c => [c.id, c]));
        const prelim = [];

        for (const c2 of a2Credits) {
            const c1 = map1.get(c2.id);
            if (!c1) continue;

            const releaseDate = releaseDateOf(c1) || releaseDateOf(c2);
            prelim.push({
                id: c1.id,
                media_type: c1.media_type || c2.media_type,
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

        // 3b) Validate TV overlaps only if same-episode; movies pass as-is
        setStatus('Searching... comparing tv episodes...');
        const movies = [];
        const tvCandidates = [];
        for (const item of prelim) {
            (item.media_type === 'tv' ? tvCandidates : movies).push(item);
        }

        const tvConfirmed = [];
        for (const tv of tvCandidates) {
            const ep = await confirmTvOverlap(tv.id, actor1Id, actor2Input);
            if (!ep) continue;

            const epDate = parseDateMaybe(ep.air_date);
            tv.releaseDate = epDate || tv.releaseDate;
            tv.year = yearOf(tv.releaseDate);
            tv.a1AgeAt = ageAtDate(a1Details.birthday, tv.releaseDate);
            tv.a2AgeAt = ageAtDate(a2Details.birthday, tv.releaseDate);
            tv.overlap = ep; // {season,episode,air_date,name}
            tvConfirmed.push(tv);
        }

        // 4) Merge, dedupe sort by most recent
        setEmpty('Searching... cleaning results...')
        const merged = [...movies, ...tvConfirmed];
        const uniq = Array.from(new Map(merged.map(x => [x.id + (x.media_type || ''), x])).values())
            .sort((a, b) => {
                const ad = a.releaseDate ? a.releaseDate.getTime() : 0;
                const bd = b.releaseDate ? b.releaseDate.getTime() : 0;
                return bd - ad;
            });

        // 5) Summary stats
        setStatus('Searching... filling results viewer...');
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
    } catch (error) {
        if (signal.aborted) return; // user started a new search—ignore this error
        console.error(err);
        setEmpty('An error occurred. Please try again later.');
    } finally {
        if (!signal.aborted) searchBtn.disabled = false;
    }
}