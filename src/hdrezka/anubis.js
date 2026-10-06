/**
 * Anubis proof-of-work solver.
 *
 * Anubis is an open-source anti-bot (https://github.com/TecharoHQ/anubis). It
 * gates certain endpoints on HDRezka's new domain (`hdrezka-home.tv`) with
 * a SHA-256 challenge: find a nonce such that
 *     SHA-256(challenge.randomData + nonce).hex()
 * starts with `difficulty` zero hex characters.
 *
 * Format reverse-engineered from the minified main.mjs shipped by Anubis:
 *     GET /.within.website/x/cmd/anubis/api/pass-challenge
 *         ?id=<challenge_id>
 *         &response=<hex_sha256>
 *         &nonce=<nonce>
 *         &redir=<original_url>
 *         &elapsedTime=<seconds>
 * The server validates the PoW, sets an `*anubis-cookie-verification` cookie
 * via 302 redirect, and bounces to `redir`.
 */

import { HEADERS, BASE_URL, jarSet, hostFromUrl, cookieJar } from './http.js';
import { sha256Hex } from './sha256.js';

const ANUBIS_BASE = '/.within.website/x/cmd/anubis';
const PASS_PATH = `${ANUBIS_BASE}/api/pass-challenge`;

// SHA-256 is implemented in pure JS (no crypto.subtle / TextEncoder)
// so it runs inside Nuvio's Hermes runtime.

/**
 * Parse the challenge JSON embedded in the Anubis challenge page.
 * Returns null if the page is not an Anubis challenge.
 */
export function parseAnubisChallenge(html) {
    const match = html.match(
        /<script id="anubis_challenge" type="application\/json">([\s\S]+?)<\/script>/,
    );
    if (!match) return null;
    try {
        const obj = JSON.parse(match[1]);
        return obj.challenge;
    } catch {
        return null;
    }
}

/**
 * Solve the PoW. Find `nonce` such that
 *     SHA-256(challenge.randomData + nonce).hex()
 * starts with `difficulty` zero hex chars.
 */
export async function solveChallenge(challenge) {
    const difficulty = challenge.difficulty;
    const target = '0'.repeat(difficulty);
    const base = challenge.randomData;
    let nonce = 0;
    while (true) {
        const hash = await sha256Hex(base + nonce.toString());
        if (hash.startsWith(target)) {
            return {
                id: challenge.id,
                nonce: nonce.toString(),
                response: hash,
                difficulty,
            };
        }
        nonce++;
    }
}

/**
 * Submit the solution and capture the verification cookie.
 * Returns the cookie string (e.g. "name=value") to send on subsequent requests.
 */
export async function submitChallenge({ id, nonce, response, difficulty }, redirUrl, t0) {
    const elapsedTime = ((Date.now() - t0) / 1000).toFixed(3);
    const parts = [
        `id=${encodeURIComponent(id)}`,
        `nonce=${encodeURIComponent(nonce)}`,
        `response=${encodeURIComponent(response)}`,
        `redir=${encodeURIComponent(redirUrl)}`,
        `elapsedTime=${encodeURIComponent(elapsedTime)}`,
    ];
    const url = `${BASE_URL}${PASS_PATH}?${parts.join('&')}`;

    const host = hostFromUrl(redirUrl);
    // Anubis 1.27 suffixes cookie names per deployment (for example
    // `techaro.lol-anubis-cookie-verification-d82da6a5`). Do not hard-code
    // the old unsuffixed name.
    const jar = cookieJar.get(host) || {};
    const verificationEntry = Object.entries(jar).find(([name]) =>
        name.includes('anubis-cookie-verification')
    );
    const testCookie = verificationEntry
        ? `${verificationEntry[0]}=${verificationEntry[1]}`
        : null;
    const headers = {
        ...HEADERS,
        ...(testCookie ? { Cookie: testCookie } : {}),
    };
    const res = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
    });
    // The flow is: 302 redirect with Set-Cookie. We need the cookie, not the

    // redirect target.
    const setCookies = res.headers.getSetCookie?.() || [];
    if (setCookies.length === 0) {
        // Fallback: parse a single Set-Cookie header
        const header = res.headers.get('set-cookie');
        if (header) setCookies.push(header);
    }

    const verify = setCookies.find((c) => /anubis-auth(?:-[^=;]+)?=/.test(c));
    if (!verify) {
        throw new Error(`Anubis verification failed (HTTP ${res.status})`);
    }
    // Store the cookie in the shared jar so subsequent requests on the
    // same host send it back.
    const cookie = verify.split(';')[0];
    jarSet(hostFromUrl(redirUrl), [cookie]);
    return cookie;
}
