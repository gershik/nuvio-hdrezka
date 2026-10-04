import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate, normalizeMeta, manifestFor, titles } from './generate.mjs';

const raw = { id: 'tt0994314', name: 'Code Geass', type: 'series', poster: 'https://example.test/poster.jpg', background: 'https://example.test/background.jpg', videos: [{ season: 1, episode: 9, id: 'other:9', name: 'Refrain' }] };

test('canonical IMDb identity and episode IDs match TV', () => {
  const meta = normalizeMeta(raw, titles[0]);
  assert.equal(meta.id, 'tt0994314');
  assert.equal(meta.videos[0].id, 'tt0994314:1:9');
  assert.equal(meta.videos[0].title, 'Refrain');
});
test('rejects wrong title rather than corrupting progress identity', () => {
  assert.throws(() => normalizeMeta({ ...raw, id: 'tt0000001' }, titles[0]));
});
test('rejects empty episode lists and missing artwork', () => {
  assert.throws(() => normalizeMeta({ ...raw, videos: [] }, titles[0]));
  assert.throws(() => normalizeMeta({ ...raw, poster: null }, titles[0]));
});
test('does not advertise unsupported generic metadata or stream resources', () => {
  const m = manifestFor(titles);
  assert.deepEqual(m.types, ['series']);
  assert.deepEqual(m.resources.map(r => r.name), ['catalog', 'meta']);
  assert.deepEqual(m.resources[1].idPrefixes, ['tt0994314', 'tmdb:31724']);
  assert.deepEqual(m.catalogs[0].extra, []);
});
test('generates both metadata routes and a canonical catalog', async () => {
  const output = await mkdtemp(join(tmpdir(), 'nuvio-imdb-addon-test-'));
  await generate(output, async () => ({ ok: true, json: async () => ({ meta: raw }) }));
  const get = async path => JSON.parse(await readFile(join(output, path), 'utf8'));
  assert.deepEqual(await get('meta/series/tt0994314.json'), await get('meta/series/tmdb:31724.json'));
  assert.equal((await get('catalog/series/imdb-sync.json')).metas[0].id, 'tt0994314');
});
test('upstream errors fail the build instead of generating broken metadata', async () => {
  await assert.rejects(generate(await mkdtemp(join(tmpdir(), 'nuvio-imdb-addon-test-')), async () => ({ ok: false, status: 503 })), /HTTP 503/);
});
