/** Resolve explicitly linked season pages; never use franchise order as season order. */
const attrs = (tag) => {
    const out = {};
    for (const m of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)) out[m[1]] = m[3];
    return out;
};
const text = (s) => s.replace(/<[^>]*>/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim();
const norm = (s) => text(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function pageEpisodes(html) {
    const seasons = new Map();
    for (const m of html.matchAll(/<(?:li|a)\b[^>]*>/gi)) {
        const a = attrs(m[0]);
        if (!(a.class || '').split(/\s+/).includes('b-simple_episode__item')) continue;
        const s = Number(a['data-season_id']), e = Number(a['data-episode_id']);
        if (!Number.isInteger(s) || s < 0 || !Number.isInteger(e) || e < 1) continue;
        if (!seasons.has(s)) seasons.set(s, new Set());
        seasons.get(s).add(e);
    }
    return seasons;
}

export function pageSeasons(html) {
    const seasons = new Set(pageEpisodes(html).keys());
    for (const m of html.matchAll(/<(?:li|a)\b[^>]*>/gi)) {
        const a = attrs(m[0]);
        if (!(a.class || '').split(/\s+/).includes('b-simple_season__item')) continue;
        const season = Number(a['data-tab_id']);
        if (Number.isInteger(season) && season >= 0) seasons.add(season);
    }
    return seasons;
}

export function linkedSeasonPages(html, titles, season) {
    if (!Number.isInteger(season) || season < 1) return [];
    const bases = titles.filter(Boolean).map(norm);
    const rows = html.split(/<div\b(?=[^>]*\bclass=["']b-post__partcontent_item(?:\s|["']))/i).slice(1);
    const found = new Map();
    for (const row of rows) {
        const a = attrs('<div ' + row.slice(0, row.indexOf('>') + 1));
        const title = row.match(/<div\b[^>]*class=["']td title["'][^>]*>([\s\S]*?)<\/div>/i);
        const year = row.match(/class=["']td year["'][^>]*>\s*(\d{4})/i);
        const path = (a['data-url'] || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
        if (!/^\/(?:series|animation)\/[^\s<>"']+\/\d+-[^/]+\.html$/.test(path) || !title) continue;
        const n = norm(title[1]);
        // Explicit suffixes only. "Сваты. Жизнь без грима" and films are excluded.
        if (!bases.some((b) => n === b + season || n === b + 'сезон' + season || n === b + 'season' + season || n === b + season + 'сезон')) continue;
        found.set(path, { path, title: text(title[1]), year: year ? Number(year[1]) : null });
    }
    return [...found.values()];
}

export function episodeOnSplitPage(html, season, episode, expectedCount) {
    const seasons = pageEpisodes(html);
    const local = seasons.has(season) ? season : seasons.size === 1 ? [...seasons.keys()][0] : null;
    if (local === null || !seasons.get(local).has(episode)) return null;
    const episodes = seasons.get(local);
    if (expectedCount && (episodes.size > expectedCount || [...episodes].some((e) => e > expectedCount))) return null;
    return local;
}
