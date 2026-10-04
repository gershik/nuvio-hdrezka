# IMDb Sync Metadata

A static metadata/catalog addon for Nuvio. Hosted directly by GitHub; no Render, server, key, account credentials, or app rebuild. This is installed in **Addons**, not the Nuvio JavaScript **Plugins** section. Your existing HDRezka stream plugin stays unchanged.

Current scope: **Code Geass**, including season 1 episode 9. This is not a global repair for every title's TMDB/IMDb aliases.

## Install

Add this manifest URL in Nuvio's Addons section after these files are published:

`https://raw.githubusercontent.com/gershik/nuvio-hdrezka/main/imdb-sync/manifest.json`

Select Code Geass from the new **IMDb Sync — Series** catalog, or from the TV-synced Continue Watching card. Playback now uses `tt0994314` as the parent ID and `tt0994314:1:9` for episode 9, matching the TV.

The old `tmdb:31724` Continue Watching card will not be automatically migrated/deleted. Avoid starting Code Geass from an unrelated TMDB catalog: an addon cannot override another catalog's identity. If another enabled metadata addon wins provider selection, it may still return a TMDB identity; this addon needs to be selected/prioritized for the title.

## How it works

- `manifest.json`: advertises only the supported Code Geass identifiers, not all shows.
- `catalog/series/imdb-sync.json`: a catalog with the canonical IMDb ID.
- `meta/series/tt0994314.json`: title, artwork, and full episode metadata.
- `meta/series/tmdb:31724.json`: optional compatibility lookup returning the same IMDb identity.
- No `stream` handler: Nuvio continues using your installed stream providers.
- No watch-history or account data is included or modified.

Metadata comes from [Cinemeta](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/meta.md); artwork remains linked to its existing public URLs. This is an independent community addon, not an official Nuvio/Cinemeta release.

## Regenerate / extend

Use Node 20 or later. No packages need installing.

```
node imdb-sync/generate.mjs
node --test imdb-sync/test.mjs
```

To support another title, add its verified IMDb/TMDB mapping to `titles` in `generate.mjs`, then regenerate. All metadata files are snapshots; regeneration refreshes future episode additions and artwork links. Existing snapshots continue working while your Mac is off.
