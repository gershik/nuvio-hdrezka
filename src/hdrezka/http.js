/**
 * HTTP utilities for HDRezka.
 *
 * The `X-Hdrezka-Android-App` header is the critical trick: HDRezka routes
 * requests with that header through the mobile-app path, which has different
 * (and much weaker) anti-bot protection than the regular CDN endpoint.
 * This is what lets us scrape from a Cloudflare-fronted origin without
 * getting blocked.
 *
 * Cookie jar: simple in-memory map keyed by host. Each request pulls cookies
 * for that host and stores any Set-Cookie responses it gets back. The Anubis
 * solver deposits its JWT cookie here so subsequent page/CDN requests are
 * ungated.
 *
 * Note on X-Real-Ip: HDRezka's Anubis binds JWTs to X-Real-Ip. Set a fixed
 * value here so every request on the session asserts the same IP; the
 * server's JWT restriction is SHA-256(X-Real-Ip). For a Nuvio provider
 * the session, so the user's real IP works equally well — but using a
 * fixed self-asserted value makes the flow robust to mobile network
 * handovers.
 */

const BASE_URL = 'https://hdrezka.website';

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
};

/**
 * In-memory cookie jar. Key: host. Value: cookie name → value map.
 * RFC 6265 §5.3 step 11: the same cookie name appearing twice in a
 * response replaces the previous value. This matters for Anubis: a failed
 * submission sets the cookie to empty Expires=now, and a successful one
 * later sets the JWT — we want the JWT, not the pastes.
 */
const cookieJar = new Map();

function jarGet(host) {
    return cookieJar.get(host) || {};
}

function jarSet(host, cookies) {
    if (!cookies || cookies.length === 0) return;
    const existing = jarGet(host);
    for (const pair of cookies) {
        const eq = pair.indexOf('=');
        if (eq < 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === '') {
            delete existing[name];
        } else {
            existing[name] = value;
        }
    }
    cookieJar.set(host, existing);
}

function jarCookieHeader(host) {
    const cookies = jarGet(host);
    const pairs = Object.entries(cookies).map(([k, v]) => `${k}=${v}`);
    return pairs.length > 0 ? pairs.join('; ') : undefined;
}

function hostFromUrl(url) {
    if (typeof URL !== 'undefined') {
        try {
            return new URL(url).host;
        } catch {
            return '';
        }
    }
    // Hermes-safe fallback for environments without the URL constructor.
    const m = String(url).match(/^https?:\/\/([^/:]+)/);
    return m ? m[1] : '';
}

/**
 * Random hex string of N chars. Used for the `favs` parameter that HDRezka
 * expects as a UUID-like client identifier.
 */
function randomHex(length) {
    let s = '';
    for (let i = 0; i < length; i++) {
        s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
}

/**
 * Random favs parameter in the format HDRezka expects:
 * 8-4-4-4-12 hex chars (UUID-like).
 */
export function generateFavs() {
    return [
        randomHex(8),
        randomHex(4),
        randomHex(4),
        randomHex(4),
        randomHex(12),
    ].join('-');
}

/**
 * Extract "name=value" pairs from Set-Cookie headers.
 */
export function readSetCookies(response) {
    const headers = response && response.headers;
    if (!headers) return [];
    const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    let values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
    values = values.filter((value) => typeof value === 'string' && value);
    if (values.length === 0 && typeof headers.get === 'function') {
        const combined = headers.get('set-cookie');
        if (typeof combined === 'string' && combined) values = [combined];
    }
    const out = [];
    for (const value of values) {
        // Nuvio TV exposes one combined header, while Node returns an array.
        // A comma inside an Expires date is not a cookie boundary.
        for (const cookie of value.split(/,(?=\s*[^=;,\s]+\s*=)/)) {
            const pair = cookie.split(';')[0].trim();
            if (pair.indexOf('=') > 0) out.push(pair);
        }
    }
    return out;
}

export { BASE_URL, HEADERS, cookieJar, jarSet, jarCookieHeader, hostFromUrl };


/**
 * Wrap a fetch() with a timeout so a stalled upstream connection cannot
 * hang the addon request forever (Nuvio/TV clients give up quickly).
 */
async function fetchWithTimeout(url, init, timeoutMs) {
    // Nuvio TV's QuickJS bridge has native HTTP timeouts but no JS timers.
    if (typeof setTimeout !== 'function' || typeof clearTimeout !== 'function'
        || typeof AbortController !== 'function') {
        return fetch(url, init);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * GET a URL and return the response body as text.
 * Throws on non-2xx with the status code attached.
 */
export async function fetchText(url, options = {}) {
    const host = hostFromUrl(url);
    const cookieHeader = jarCookieHeader(host);
    const headers = {
        ...HEADERS,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        ...(options.headers || {}),
    };
    const response = await fetchWithTimeout(
        url,
        {
            headers,
            redirect: options.followRedirects === false ? 'manual' : 'follow',
            ...options,
        },
        options.timeoutMs || 12000
    );
    if (host) {
        jarSet(host, readSetCookies(response));
    }
    if (options.expectRedirect && response.status >= 300 && response.status < 400) {
        return response;
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return await response.text();
}

/**
 * GET a URL and parse the response as JSON.
 */
export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    return JSON.parse(text);
}

/**
 * POST application/x-www-form-urlencoded form data and return JSON.
 * HDRezka's `ajax/get_cdn_series/` endpoint expects this shape.
 */
export async function postForm(path, fields, options = {}) {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
    const body = Object.entries(fields)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
    const host = hostFromUrl(url);
    const cookieHeader = jarCookieHeader(host);
    const response = await fetchWithTimeout(
        url,
        {
            method: 'POST',
            headers: {
                ...HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                ...(cookieHeader ? { Cookie: cookieHeader } : {}),
                ...(options.headers || {}),
            },
            body,
            redirect: 'follow',
            ...options,
        },
        options.timeoutMs || 15000
    );
    if (host) {
        jarSet(host, readSetCookies(response));
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for POST ${url}`);
    }
    return await response.json();
}
