import assert from 'node:assert/strict';
import test from 'node:test';
import { readSetCookies, fetchText, cookieJar } from '../src/hdrezka/http.js';
import { submitChallenge } from '../src/hdrezka/anubis.js';

const verification = 'techaro.lol-anubis-cookie-verification-d82=test';
const auth = 'techaro.lol-anubis-auth-d82=real-token';
const combined = `${verification}; Expires=Wed, 28 Oct 2026 12:00:00 GMT; Path=/, ${auth}; Path=/; HttpOnly`;

test('reads both Nuvio combined headers and native cookie arrays', () => {
    assert.deepEqual(readSetCookies({ headers: { get: () => combined } }), [verification, auth]);
    assert.deepEqual(readSetCookies({ headers: { getSetCookie: () => [undefined, `${verification}; Path=/`, `${auth}; Path=/`] } }), [verification, auth]);
    assert.deepEqual(readSetCookies({ headers: { get: () => null } }), []);
});

test('Nuvio TV without JS timers can fetch and retain the actual auth cookie', async () => {
    const saved = { fetch, setTimeout, clearTimeout, AbortController };
    try {
        globalThis.setTimeout = undefined;
        globalThis.clearTimeout = undefined;
        globalThis.AbortController = undefined;
        cookieJar.clear();
        globalThis.fetch = async () => ({ ok: true, headers: { get: () => combined }, text: async () => 'page' });
        assert.equal(await fetchText('https://hdrezka.website/page'), 'page');
        assert.equal(cookieJar.get('hdrezka.website')['techaro.lol-anubis-auth-d82'], 'real-token');
        cookieJar.clear();
        globalThis.fetch = async () => ({ status: 302, headers: { get: () => combined } });
        assert.equal(await submitChallenge({ id: 'challenge', nonce: '1', response: 'hash' }, 'https://hdrezka.website/page', Date.now()), auth);
        assert.equal(cookieJar.get('hdrezka.website')['techaro.lol-anubis-auth-d82'], 'real-token');
        globalThis.fetch = async () => ({ status: 500, headers: { get: () => null } });
        await assert.rejects(submitChallenge({ id: 'challenge', nonce: '1', response: 'hash' }, 'https://hdrezka.website/page', Date.now()), /Anubis verification failed \(HTTP 500\)/);
    } finally {
        Object.assign(globalThis, saved);
        cookieJar.clear();
    }
});
