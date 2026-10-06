/**
 * HDRezka scraping logic.
 *
 * The flow is:
 *   1. Search by title  →  find candidate pages (URL + ID + year)
 *   2. Fetch the page   →  extract the post ID and a translator ID
 *   3. POST to the CDN  →  get an obfuscated URL string
 *   4. Deobfuscate      →  parse `[quality]url,[quality]url` format
 *
 * The obfuscation is not real encryption — it's just base64-encoded
 * "trash" substrings (combinations of `@#$!^`) inserted into the payload.
 * See `deobfuscateStreams` for the decode step.
 *
 * The page and CDN endpoints are gated by Anubis proof-of-work. The search
 * endpoint is not. We solve the Anubis challenge on the first page hit
 * and cache the verification cookie for the rest of the session.
 */

import { BASE_URL, fetchText, postForm, fetchJson, generateFavs } from './http.js';
import { searchHdrezka } from './search.js';
import {
    parseAnubisChallenge,
    solveChallenge,
    submitChallenge,
} from './anubis.js';

/**
 * Fetch a page, transparently solving Anubis on the first attempt.
 * Returns the actual page HTML or throws.
 */
async function fetchPage(url) {
    const html = await fetchText(url);
    const challenge = parseAnubisChallenge(html);
    if (!challenge) return html;
    console.log(`[HDRezka] Anubis challenge (difficulty=${challenge.difficulty})`);
    const t0 = Date.now();
    const solution = await solveChallenge(challenge);
    await submitChallenge(solution, url, t0);
    return await fetchText(url);
}

/**
 * Pull the post ID and a translator ID out of a page HTML.
 *
 * HDRezka inlines a JS call like:
 *   sof.tv.initCDNMoviesEvents(<id>, <translator_id>, ...)
 *   sof.tv.initCDNSeriesEvents(<id>, <translator_id>, ...)
 * The first integer is the post ID; the second is the translator ID.
 *
 * Falls back to the `#translators-list` element if the JS call is missing.
 * Translator ID 238 is special — "Original + subtitles" — and is preferred
 * when present.
 */
export function extractTranslatorAndId(html, mediaType) {
    // Preferred: <input id="post_id" value="...">
    const postIdMatch = html.match(/<input[^>]*id="post_id"[^>]*value="(\d+)"/)
        || html.match(/data-id="(\d+)"/);
    const postId = postIdMatch ? postIdMatch[1] : null;

    // Preferred: original-with-subs translator
    if (html.includes('data-translator_id="238"')) {
        return { postId, translatorId: '238' };
    }

    // Fallback: regex the initCDN*Events call
    const isSeries = mediaType === 'tv' || mediaType === 'anime';
    const fn = isSeries ? 'initCDNSeriesEvents' : 'initCDNMoviesEvents';
    const re = new RegExp(`sof\\.tv\\.${fn}\\(\\s*(\\d+)\\s*,\\s*(\\d+)`);
    const m = html.match(re);
    if (m) {
        return { postId: m[1], translatorId: m[2] };
    }

    // Last resort: pick the first translator in the list
    const listMatch = html.match(/data-translator_id="(\d+)"/);
    if (listMatch) {
        return { postId, translatorId: listMatch[1] };
    }

    return { postId, translatorId: null };
}

/**
 * Pull all translators from the page's `#translators-list`.
 * Returns [{ id, name }]. Typical names are Russian dubs like "Дубляж",
 * "Гоблин", "Многоголосый закадровый", etc.
 */
export function extractTranslators(html) {
    const list = [];
    const re = /data-translator_id="(\d+)"[^>]*>([^<]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        list.push({ id: m[1], name: m[2].trim() });
    }
    return list;
}

function isAllowedTranslator(name) {
    const lower = normalizeForCompare(name);

    // Explicitly desired options: original track and English dubs.
    const desired = [
        'оригинал', 'original',
        'английск', 'english', 'en',
    ];
    if (desired.some((kw) => lower.includes(kw))) return true;

    // Block other non-Russian language dubs.
    const blocked = [
        'украин', 'україн', 'ukrainian',
        'грузин', 'georgian',
        'белорус', 'білорус', 'belarusian',
        'казах', 'kazakh',
        'армян', 'armenian',
        'азербайджан', 'azerbaijani',
        'литовск', 'литва', 'lithuanian',
        'латыш', 'latvian',
        'эстон', 'estonian',
        'молдав', 'moldovan',
        'таджик', 'tajik',
        'киргиз', 'kyrgyz',
        'узбек', 'uzbek',
        'испан', 'spanish',
        'француз', 'french',
        'немецк', 'german',
        'итальян', 'italian',
        'польск', 'polish',
        'турецк', 'turkish',
        'китайск', 'chinese',
        'японск', 'japanese',
        'корейск', 'korean',
    ];
    if (blocked.some((kw) => lower.includes(kw))) return false;

    // Keep Cyrillic-named dubs (covers Russian voiceovers) and known Latin-named
    // Russian/CIS studios. Unknown Latin-only names are allowed because they may
    // be English dubs like "CP Digital" / "Flarrow Films".
    if (/[\u0400-\u04FF]/.test(name)) return true;

    const knownRussian = new Set([
        'ddv',
        'lostfilm',
        'newstudio',
        'amedia',
        'ideafilm',
        'novafilm',
        'topfilm',
        'hdrezka studio',
    ]);
    if (knownRussian.has(lower)) return true;

    return true;
}

function normalizeForCompare(str) {
    return str
        .toLowerCase()
        .replace(/[\u0301\u0300\u0306]/g, '')
        .replace(/[\"'()]/g, '')
        .trim();
}

/**
 * The string HDRezka returns in `url` is a base64 payload with two layers
 * of obfuscation:
 *   1. The string is split by `//_//`. We join those pieces back.
 *   2. It contains base64-encoded "trash" substrings — base64 of 2- or
 *      3-character strings drawn from `@#$!^`. We strip those.
 *   3. The remainder is a base64-encoded payload of the form
 *      `[quality]url,[quality]url` (or ` or `-joined alternates).
 */
export function deobfuscateStreams(obfuscated) {
    if (!obfuscated) throw new Error('STAGE5_NO_STREAMS empty obfuscated url');

    let decoded = '';

    // CDN can return stream list in two shapes:
    //   1) plain:     "[360p]url,[480p]url,..."
    //   2) obfuscated: "#h...//_//...base64+trash..."
    // If it already looks like the plain shape, skip base64/trash decoding.
    const looksPlain = obfuscated.trim().startsWith('[') && obfuscated.includes(']http');

    if (looksPlain) {
        decoded = obfuscated;
    } else {
        // Strip the leading `#h` marker and rejoin around `//_//`.
        let stripped = obfuscated.replace('#h', '').split('//_//').join('');

        // Build the set of base64-encoded trash strings.
        const trashChars = ['@', '#', '!', '^', '$'];
        const trashSet = new Set();
        for (let len = 2; len <= 3; len++) {
            const buckets = Array.from({ length: len }, () => trashChars);
            // cartesian product
            let combos = [''];
            for (const bucket of buckets) {
                const next = [];
                for (const prefix of combos) {
                    for (const c of bucket) {
                        next.push(prefix + c);
                    }
                }
                combos = next;
            }
            for (const combo of combos) {
                trashSet.add(encodeBase64(combo));
            }
        }

        // Strip each trash substring. Replace longest first so we don't
        // accidentally eat a prefix of a longer one.
        const sortedTrash = Array.from(trashSet).sort((a, b) => b.length - a.length);
        for (const t of sortedTrash) {
            stripped = stripped.split(t).join('');
        }

        // The remainder is base64 → UTF-8 `[quality]url,[quality]url[,...]`
        try {
            decoded = decodeBase64Utf8(stripped);
        } catch {
            decoded = stripped;
        }
    }

    const out = [];
    const re = /\[([^\]]+)\]([^,]+)/g;
    let m;
    while ((m = re.exec(decoded)) !== null) {
        const quality = m[1].trim();
        // A quality entry may contain alternates (`url1 or url2`).
        // Prefer the direct `.mp4` URL; ignore the `:hls:manifest.m3u8` one.
        const url = m[2]
            .split(/\s+or\s+/)
            .map((u) => u.trim())
            .find((u) => u.startsWith('http') && !u.includes(':hls:'));
        if (url) {
            out.push({ quality, url });
        }
    }
    if (out.length === 0) {
        throw new Error(`STAGE5_NO_STREAMS raw=${obfuscated.slice(0, 80)} decoded=${decoded.slice(0, 80)}`);
    }
    return out;
}

/**
 * Parse the `subtitle` field of the CDN response.
 * Format (post-deobfuscation): `[lang]url,[lang]url[,...]`
 */
export function parseSubtitles(obfuscated) {
    if (!obfuscated) return [];

    let decoded;
    const looksPlain = obfuscated.trim().startsWith('[') && obfuscated.includes(']http');
    if (looksPlain) {
        decoded = obfuscated;
    } else {
        const stripped = obfuscated.replace('#h', '').split('//_//').join('');
        try {
            decoded = decodeBase64Utf8(stripped);
        } catch {
            decoded = stripped;
        }
    }

    const out = [];
    const re = /\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/g;
    let m;
    while ((m = re.exec(decoded)) !== null) {
        out.push({ language: m[1].trim(), url: m[2] });
    }
    return out;
}

/**
 * The translateName field from the CDN response is a JSON-encoded array of
 * `{translator_id, translator_name, premium}` objects. We accept this and
 * prefer the lowest-id non-premium translator when the user has not pinned
 * one.
 */
export function parseTranslatorsMeta(rawJson) {
    if (!rawJson) return null;
    try {
        const parsed = JSON.parse(rawJson);
        if (!Array.isArray(parsed)) return null;
        return parsed.map((t) => ({
            id: t.translator_id,
            name: t.translator_name,
            premium: !!t.premium,
        }));
    } catch {
        return null;
    }
}

/**
 * Main entry: given a TMDB ID and media type, return a list of stream URLs.
 *
 * Pipes:
 *   TMDB (title, year) → searchHdrezka → page → translator_id → POST streams
 *
 * For TV shows we also accept season/episode.
 */
export async function getStreams(tmdbId, mediaType, season, episode, languageGroup = 'all') {
    // 1. Some Nuvio sources pass internal/external IDs like
    //    "meteor:media:imdb:tt0434706". Resolve those to a numeric TMDB ID.
    const resolved = await resolveTmdbId(tmdbId, mediaType);
    tmdbId = resolved.id;
    mediaType = resolved.mediaType;

    // The TMDB /find endpoint already gave us title/year for IMDb IDs.
    // Only fetch details when we only have a numeric TMDB ID.
    const tmdb = resolved.title
        ? resolved
        : await fetchTmdb(tmdbId, mediaType);
    const title = tmdb.title;
    const year = tmdb.year;
    if (!title) throw new Error(`STAGE1_NO_TITLE (tmdb=${tmdbId})`);

    // 2. Search HDRezka. Search by localized and original titles so that
    //    Russian films like "Брат" are matched correctly.
    const candidates = await searchHdrezka(title, tmdb.originalTitle, year, mediaType);
    if (candidates.length === 0) throw new Error(`STAGE2_NO_CANDIDATES title=${title}`);

    const best = candidates[0];
    const pageUrl = best.url.startsWith('http')
        ? best.url
        : `${BASE_URL}${best.url.startsWith('/') ? '' : '/'}${best.url}`;

    // 3. Load the page to harvest the translator list and post ID.
    const html = await fetchPage(pageUrl);
    const { postId, translatorId: defaultTranslatorId } = extractTranslatorAndId(html, mediaType);
    if (!postId) throw new Error('STAGE3_NO_POST_ID');

    let translators = extractTranslators(html).filter((t) => isAllowedTranslator(t.name));
    if (translators.length === 0 && defaultTranslatorId) {
        translators = [{ id: defaultTranslatorId, name: 'Дубляж' }];
    }
    if (translators.length === 0) throw new Error('STAGE3_NO_TRANSLATOR');
    translators = translators.map((translator) => ({
        ...translator,
        name: isOriginalTranslator(translator.name) ? 'Original' : translator.name,
        isOriginal: isOriginalTranslator(translator.name),
    })).filter((translator) => translatorMatchesGroup(translator, languageGroup));
    if (translators.length === 0) return [];

    const favs = generateFavs();
    const isTv = mediaType === 'tv' || mediaType === 'anime';
    const baseForm = {
        id: postId,
        action: isTv ? 'get_stream' : 'get_movie',
    };
    if (isTv) {
        baseForm.season = season;
        baseForm.episode = episode;
    }

    const out = [];
    const seenKeys = new Set();
    // Query every allowed translator in parallel so a slow CDN response
    // for one of them does not serialize the whole request.
    const rows = await Promise.all(translators.map(async (translator) => {
        let cdn;
        try {
            cdn = await postForm('/ajax/get_cdn_series/', {
                ...baseForm,
                translator_id: translator.id,
                favs,
            });
        } catch (e) {
            console.error(`[HDRezka] CDN failed for translator ${translator.name}: ${e.message}`);
            return [];
        }

        if (!cdn.success || !cdn.url || Number(cdn.premium_content) === 1) return [];

        const streams = deobfuscateStreams(cdn.url);
        const subs = parseSubtitles(cdn.subtitle);
        const cleanSubs = subs.map((s) => ({
            id: s.url,
            language: s.language,
            lang: s.language,
            label: s.language,
            url: s.url,
            type: 'vtt',
            hasCorsRestrictions: false,
        }));

        const translatorRows = [];
        for (const s of streams) {
            if (!s.url || s.url === 'null' || s.url.includes(':hls:')) continue;
            const quality = s.quality.replace(/<[^>]+>/g, '').trim();
            if (/\b(?:2k|4k|ultra|prem(?:ium)?)\b/i.test(quality)) continue;

            const dedupeKey = `${translator.name}|${quality}`;
            if (seenKeys.has(dedupeKey)) continue;
            seenKeys.add(dedupeKey);

            translatorRows.push({
                name: `HDRezka · ${translator.name}`,
                title: formatStreamTitle(
                    title,
                    year,
                    mediaType,
                    season,
                    episode,
                    `${quality} · ${translator.name}`
                ),
                url: s.url,
                quality,
                headers: {
                    Referer: pageUrl,
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                subtitles: cleanSubs.length > 0 ? cleanSubs : undefined,
                type: 'mp4',
                isOriginal: translator.isOriginal,
            });
        }
        return translatorRows;
    }));
    for (const rowList of rows) out.push(...rowList);


    out.sort((a, b) => {
        if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
        const aq = parseQualityValue(a.quality);
        const bq = parseQualityValue(b.quality);
        if (aq !== bq) return bq - aq;
        return a.name.localeCompare(b.name);
    });

    // Nuvio sorts by the bold `name`, so encode translator priority first and
    // quality second. This keeps every Original option above dubbed streams.
    const uniqueQualities = [...new Set(out.map((s) => s.quality))].sort(
        (a, b) => parseQualityValue(b) - parseQualityValue(a)
    );
    const padLen = Math.max(2, String(uniqueQualities.length).length);
    const qualityRank = new Map(
        uniqueQualities.map((q, i) => [q, String(i + 1).padStart(padLen, '0')])
    );
    for (const s of out) {
        const translatorRank = s.isOriginal ? '00' : '01';
        const quality = qualityRank.get(s.quality);
        s.name = `${translatorRank}.${quality} ${s.name}`;
        delete s.isOriginal;
    }

    return out;
}

function parseQualityValue(q) {
    if (/\b4k\b/i.test(q)) return 2160;
    if (/\b2k\b/i.test(q)) return 1440;
    const m = q.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

function isOriginalTranslator(name) {
    return /(?:оригинал|original)/i.test(name || '');
}

function isEnglishTranslator(name) {
    return /(?:английск|english|\ben\b)/i.test(name || '');
}

function translatorMatchesGroup(translator, languageGroup) {
    if (languageGroup === 'en') {
        return translator.isOriginal || isEnglishTranslator(translator.name);
    }
    if (languageGroup === 'ru') {
        return !translator.isOriginal && !isEnglishTranslator(translator.name);
    }
    return true;
}

function formatStreamTitle(title, year, mediaType, season, episode, quality) {
        const base = `${title}${year ? ` (${year})` : ''} ${quality}`;
    if (mediaType === 'tv' || mediaType === 'anime') {
        return `${base} S${season}E${episode}`;
    }
    return base;
}

/**
 * Convert non-numeric IDs (e.g. "meteor:media:imdb:tt0434706") to a numeric
 * TMDB ID. Plain numeric IDs are returned as-is.
 */
async function resolveTmdbId(rawId, mediaType) {
    const idStr = String(rawId).trim();

    if (/^\d+$/.test(idStr)) {
        return { id: idStr, mediaType };
    }

    const imdbMatch = idStr.match(/tt\d+/i);
    if (!imdbMatch) {
        throw new Error(`Unsupported TMDB/ID format: ${rawId}`);
    }
    const imdbId = imdbMatch[0];

    const apiKey = '439c478a771f35c05022f9feabcca01c';
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
    const data = await fetchJson(url);

    const pick = (result, type) => {
        const isTv = type === 'tv';
        const title = isTv ? result.name : result.title;
        const originalTitle = isTv ? result.original_name : result.original_title;
        const date = isTv ? result.first_air_date : result.release_date;
        return {
            id: String(result.id),
            mediaType: type,
            title,
            originalTitle: originalTitle || title,
            year: date ? parseInt(date.substring(0, 4), 10) : null,
        };
    };

    const preferTv = mediaType === 'tv' || mediaType === 'anime';
    let chosen = null;
    if (preferTv) {
        if (data.tv_results && data.tv_results.length > 0) {
            chosen = pick(data.tv_results[0], data.tv_results[0].media_type || 'tv');
        } else if (data.movie_results && data.movie_results.length > 0) {
            chosen = pick(data.movie_results[0], 'movie');
        }
    } else {
        if (data.movie_results && data.movie_results.length > 0) {
            chosen = pick(data.movie_results[0], 'movie');
        } else if (data.tv_results && data.tv_results.length > 0) {
            chosen = pick(data.tv_results[0], data.tv_results[0].media_type || 'tv');
        }
    }

    if (!chosen) {
        throw new Error(`IMDb ${imdbId} not found on TMDB`);
    }

    return chosen;
}

/**
 * Fetch basic metadata (title, year) from TMDB.
 * We use a public dev key here. Replace with your own in production.
 */
async function fetchTmdb(tmdbId, mediaType) {
    const apiKey = '439c478a771f35c05022f9feabcca01c'; // public dev key
    const path = mediaType === 'tv' || mediaType === 'anime' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${apiKey}`;
    try {
        const data = await fetchJson(url);
        const isTv = mediaType === 'tv' || mediaType === 'anime';
        const title = isTv ? data.name : data.title;
        const originalTitle = isTv ? data.original_name : data.original_title;
        const date = isTv ? data.first_air_date : data.release_date;
        const year = date ? parseInt(date.substring(0, 4), 10) : null;
        return {
            title,
            originalTitle: originalTitle || title,
            originalLanguage: data.original_language || null,
            year,
        };
    } catch (e) {
        console.error('[HDRezka] TMDB lookup failed:', e.message);
        return { title: null, originalTitle: null, originalLanguage: null, year: null };
    }
}

// ---- Base64 helpers (Hermes-compatible via atob/btoa) -----------------------

function encodeBase64(str) {
    if (typeof btoa !== 'undefined') {
        return btoa(str);
    }
    // Node fallback; won't run in Nuvio's Hermes runtime.
    return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Decode a base64 string into a UTF-8 text. Works on Hermes even when
 * `atob` or `TextDecoder` are unavailable by using a tiny manual decoder.
 */
function decodeBase64Utf8(str) {
    let bytes;
    if (typeof atob !== 'undefined') {
        const raw = atob(str);
        bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    } else if (typeof Buffer !== 'undefined') {
        bytes = Buffer.from(str, 'base64');
    } else {
        // Pure JS base64 decode.
        const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const out = [];
        let b = 0;
        let bits = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str.charAt(i);
            if (c === '=') break;
            const v = map.indexOf(c);
            if (v === -1) continue;
            b = (b << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.push((b >> bits) & 0xff);
            }
        }
        bytes = new Uint8Array(out);
    }

    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(bytes);
    }
    // Manual UTF-8 decode.
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const c = bytes[i];
        if (c < 0x80) out += String.fromCharCode(c);
        else if ((c & 0xe0) === 0xc0) {
            out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
            i += 1;
        } else if ((c & 0xf0) === 0xe0) {
            out += String.fromCharCode(
                ((c & 0x0f) << 12) |
                ((bytes[i + 1] & 0x3f) << 6) |
                (bytes[i + 2] & 0x3f),
            );
            i += 2;
        } else if ((c & 0xf8) === 0xf0) {
            let code =
                ((c & 0x07) << 18) |
                ((bytes[i + 1] & 0x3f) << 12) |
                ((bytes[i + 2] & 0x3f) << 6) |
                (bytes[i + 3] & 0x3f);
            code -= 0x10000;
            out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
            i += 3;
        }
    }
    return out;
}
