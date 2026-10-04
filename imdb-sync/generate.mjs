import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Public metadata only. No account state, credentials, streams, or API key.
export const titles = [{ type: 'series', imdb: 'tt0994314', tmdb: '31724' }];
export const root = dirname(fileURLToPath(import.meta.url));

export function normalizeMeta(raw, { type, imdb }) {
  if (raw?.id !== imdb || !raw.name?.trim()) throw new Error('Upstream identity/name mismatch');
  if (!/^tt\d+$/.test(imdb) || !['series', 'movie'].includes(type)) throw new Error('Invalid title');
  const meta = { ...raw, id: imdb, imdb_id: imdb, type };
  meta.trailers = (raw.trailers ?? []).map(t => ({ ...t, name: t.name || `${raw.name} — Trailer`, type: t.type || 'Trailer' }));
  // Nuvio's parser accepts title; Cinemeta often supplies episode names as name.
  meta.videos = (raw.videos ?? []).filter(v => Number.isInteger(v.season) && Number.isInteger(v.episode))
    .map(v => ({ ...v, id: `${imdb}:${v.season}:${v.episode}`, title: v.title || v.name || `Episode ${v.episode}` }));
  if (type === 'series' && !meta.videos.length) throw new Error('Series has no usable episodes');
  if (!meta.poster || !meta.background) throw new Error('Artwork missing');
  return meta;
}

export function manifestFor(items) {
  const types = [...new Set(items.map(t => t.type))];
  return {
    id: 'community.nuvio.imdb-sync', version: '0.1.0', name: 'IMDb Sync Metadata',
    description: 'Code Geass metadata/catalog with the same IMDb identity used by NuvioTV. No streams or account access. More titles can be added to the snapshot.',
    types,
    resources: [
      { name: 'catalog', types },
      { name: 'meta', types, idPrefixes: items.flatMap(t => [t.imdb, ...(t.tmdb ? [`tmdb:${t.tmdb}`] : [])]) },
    ],
    catalogs: types.map(type => ({ type, id: 'imdb-sync', name: `IMDb Sync — ${type === 'series' ? 'Series' : 'Movies'}`, extra: [] })),
    behaviorHints: { configurable: false, configurationRequired: false },
  };
}

export async function generate(output = root, fetchImpl = fetch) {
  const metas = [];
  const write = async (path, data) => {
    const file = resolve(output, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  };
  for (const item of titles) {
    const response = await fetchImpl(`https://v3-cinemeta.strem.io/meta/${item.type}/${item.imdb}.json`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Metadata fetch failed: HTTP ${response.status}`);
    const meta = normalizeMeta((await response.json()).meta, item);
    if (item.imdb === 'tt0994314' && !meta.videos.some(v => v.season === 1 && v.episode === 9)) throw new Error('Code Geass episode 9 missing');
    // Both routes return the TV's canonical ID, so new playback progress uses it.
    await write(`meta/${item.type}/${item.imdb}.json`, { meta });
    if (item.tmdb) await write(`meta/${item.type}/tmdb:${item.tmdb}.json`, { meta });
    metas.push(meta);
  }
  for (const type of [...new Set(titles.map(t => t.type))]) {
    await write(`catalog/${type}/imdb-sync.json`, { metas: metas.filter(m => m.type === type).map(({ id, type, name, poster, background, description }) => ({ id, type, name, poster, background, description })) });
  }
  await write('manifest.json', manifestFor(titles));
  console.log(`Generated ${metas.length} IMDb title(s). No watch-history data used.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generate(process.argv[2] ? resolve(process.argv[2]) : root);
}
