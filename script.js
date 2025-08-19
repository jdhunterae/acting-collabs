const actor1Input = document.getElementById('actor1');
const actor2Input = document.getElementById('actor2');
const searchBtn = document.getElementById('searchButton');
const resultDiv = document.getElementById('result');

// BASE URL for the API
const API_BASE_URL = 'https://themoviedb-proxy.netlify.app/api';

// Listen for click on the search button
searchBtn.addEventListener('click', findCollaboration);

async function findCollaboration() {
    const actor1Name = actor1Input.value.trim();
    const actor2Name = actor2Input.value.trim();

    if (!actor1Name || !actor2Name) {
        resultDiv.innerHTML = 'Please enter both actor names.'
        return;
    }

    resultDiv.innerHTML = 'Searching...';

    try {
        // 1. Get the ID for each actor
        const actor1Id = await getActorId(actor1Name);
        const actor2Id = await getActorId(actor2Name);

        if (!actor1Id || !actor2Id) {
            resultDiv.innerHTML = 'Could not find one or both actors. Please check the spelling.';
            return;
        }

        // 2. Get the filmography (credits) for each actor
        const actor1Credits = await getActorCredits(actor1Id);
        const actor2Credits = await getActorCredits(actor2Id);

        // 3. Find the common movies/shows
        const commonCredits = findCommonCredits(actor1Credits, actor2Credits);

        // 4. Display the results
        displayResult(commonCredits, actor1Name, actor2Name);
    } catch (error) {
        resultDiv.innerHTML = 'An error occurred. Please try again later.';
        console.error(error);
    }
}

async function getActorId(name, include_adult = false) {
    const url = `${API_BASE_URL}/search/person?query=${encodeURIComponent(name)}&include_adult=${include_adult ? "true" : "false"}`;
    console.info(`Searching for "${name}": url -> ${url}`);
    const response = await fetch(url);
    const data = await response.json();
    console.info(`Returned id: ${data.results[0]?.id}`);
    return data.results[0]?.id;
}

async function getActorCredits(actorId) {
    const url = `${API_BASE_URL}/person/${actorId}/combined_credits`;
    console.info(`Searching for "${actorId}": url -> ${url}`);
    const response = await fetch(url);
    const data = await response.json();
    console.info(`Returned ${data.cast?.length || 0} credits.`);
    return data.cast || [];
}

function findCommonCredits(credits1, credits2) {
    const ids1 = new Set(credits1.map(credit => credit.id));
    const common = credits2.filter(credit => ids1.has(credit.id));
    // return unique titles
    const uniqueTitles = [...new Set(common.map(credit => credit.title || credit.name))];
    console.info(`Worked on ${uniqueTitles.length} movie(s) together.`);
    return uniqueTitles;
}

function displayResult(commonCredits, name1, name2) {
    if (commonCredits.length > 0) {
        let html = `<strong>Yes.</strong> ${name1} and ${name2} have worked together in:<ul>`;
        commonCredits.forEach(title => {
            html += `<li>${title}</li>`;
        });
        html += '</ul>';
        resultDiv.innerHTML = html;
    } else {
        resultDiv.innerHTML = `<strong>No.</strong> ${name1} and ${name2} have not appeared in a movie or show together.`;
    }
}