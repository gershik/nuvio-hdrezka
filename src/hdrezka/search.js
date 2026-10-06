/**
 * HDRezka search.
 *
 * The search endpoint returns HTML (not JSON) where each result is wrapped:
 *   <a href="<url>"><span class="enty"><title></span> (<year>)</a>
 *
 * We parse it with regex; the HTML is small and well-structured, so we
 * don't need cheerio for this step.
 */

import { BASE_URL, fetchText } from './http.js';

/**
 * Search HDRezka for `title` and `originalTitle` (and with the year appended)
 * and return a list of candidate results.
 *
 * Searching with the year is essential for short/common titles like "Брат", where
 * a plain "Брат" query returns unrelated newer titles.
 *
 * Each result: { id, url, title, year, type: 'movie' | 'tv' }.
 */
export async function searchHdrezka(title, originalTitle, year, mediaType) {
    const seenUrls = new Set();
    const all = [];

    const baseQueries = [
        originalTitle,
        title,
    ].filter(Boolean);

    const primaryQueries = [];
    for (const q of baseQueries) {
        primaryQueries.push(year ? `${q} ${year}` : q);
    }

    // Localized and original titles are often identical. Avoid issuing the
    // same HDRezka request two or four times on every lookup.
    const uniquePrimary = [...new Set(primaryQueries)];

    const fetchQueries = async (queries) => {
        return await Promise.all(queries.map(async (query) => {
            const url = `${BASE_URL}/engine/ajax/search.php?q=${encodeURIComponent(query)}`;
            try {
                const html = await fetchText(url, {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Referer': `${BASE_URL}/`,
                    },
                });
                return parseSearchHtml(html);
            } catch (e) {
                console.error(`[HDRezka] search failed for "${query}": ${e.message}`);
                return [];
            }
        }));
    };

    let resultGroups = await fetchQueries(uniquePrimary);
    // Some obscure titles are indexed only without the year. Use the broader
    // searches only as a fallback instead of paying for them every time.
    if (resultGroups.every((group) => group.length === 0) && year) {
        resultGroups = await fetchQueries([...new Set(baseQueries)]);
    }

    for (const candidates of resultGroups) {
        for (const c of candidates) {
            if (!seenUrls.has(c.url)) {
                seenUrls.add(c.url);
                all.push(c);
            }
        }
    }

    return rankCandidates(all, { title, originalTitle, year, mediaType });
}

function parseSearchHtml(html) {
    const candidates = [];
    const re =
        /<a href="([^"]+)"><span class="enty">([^<]+)<\/span>[^<]*?\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const itemUrl = m[1];
        const itemTitle = m[2].trim();
        const itemYearRaw = m[3].trim();

        const yearMatch = itemYearRaw.match(/(\d{4})/);
        const itemYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
        const itemType = itemUrl.includes('/series/') || itemUrl.includes('/animation/')
            ? 'tv'
            : itemUrl.includes('/films/')
              ? 'movie'
              : null;

        const idMatch = itemUrl.match(/\/(\d+)-[^/]+\.html$/);
        candidates.push({
            id: idMatch ? idMatch[1] : null,
            url: itemUrl,
            title: itemTitle,
            year: itemYear,
            type: itemType,
        });
    }
    return candidates;
}

function rankCandidates(candidates, { title, originalTitle, year, mediaType }) {
    if (candidates.length === 0) return [];

    const norm = (s) =>
        (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

    const targetType = mediaType === 'tv' || mediaType === 'anime' ? 'tv' : 'movie';
    const normalizedTargets = [title, originalTitle]
        .filter(Boolean)
        .map(norm)
        .filter(Boolean);

    const scored = candidates.map((c) => {
        let score = 0;
        if (c.type === targetType) score += 10;
        if (year && c.year === year) score += 50;

        const normalizedTitle = norm(c.title);
        for (const t of normalizedTargets) {
            if (normalizedTitle === t) {
                score += 40;
                break;
            }
            if (normalizedTitle.includes(t) || t.includes(normalizedTitle)) {
                score += 8;
            }
        }
        return { c, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.c);
}
