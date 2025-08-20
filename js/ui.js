// --- UI helpers: status text and styled results (no posters) ---
export function setStatus(text) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
    <div class="loading">
      <span class="spinner"></span>
      <span>${text}</span>
    </div>`;
}

export function setEmpty(text) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
    <div class="empty">
      <p>${text}</p>
    </div>`;
}

export function clearStatus() {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '';
}

// Styled renderer that matches your CSS (no posters).
export function displayResultDetailed(payload) {
    const resultDiv = document.getElementById('result');
    const { titles, a1, a2, firstYear, lastSince, count } = payload;

    if (!count) {
        resultDiv.innerHTML = `<p class="empty"><strong>No.</strong> ${a1.name} and ${a2.name} have not appeared together.</p>`;
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

        const mediaLabel =
            t.media_type === 'movie' ? 'Movie' :
                t.media_type === 'tv' ? 'TV' :
                    (t.media_type || '');

        const parts = [];
        if (mediaLabel) parts.push(mediaLabel);
        if ([t.a1Role, t.a2Role].some(Boolean)) parts.push(`roles: ${t.a1Role || '—'} & ${t.a2Role || '—'}`);
        if (ageBits.length) parts.push(`ages at release: ${ageBits.join(' · ')}`);
        if (t.media_type === 'tv' && t.overlap) {
            parts.push(`episode: S${t.overlap.season}E${t.overlap.episode}${t.overlap.name ? ` – ${t.overlap.name}` : ''}`);
        }

        html += `
      <li class="credit-item no-poster">
        <div class="meta">
          <div class="title-row">
            <span class="title">${t.title}</span>
            <span class="badge">${t.year ?? '—'}</span>
          </div>
          <div class="subtext">${parts.join(' • ')}</div>
        </div>
      </li>
    `;
    }
    html += `</ul>`;

    resultDiv.innerHTML = html;
}
