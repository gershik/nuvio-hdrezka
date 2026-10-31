# nuvio-hdrezka

HDRezka streams for Nuvio **and** Stremio.

- **Nuvio**: on-device provider plugin (iOS / Android / Apple TV via Nuvio).
- **Stremio**: addon for TV / desktop / web clients.

Active mirror: **hdrezka.website**.

## Verified locally

```
=== Nuvio plugin: The Matrix (1999) ===
[HDRezka] movie 603 S-E-
[HDRezka] Anubis challenge (difficulty=2)
[OK] 10 streams in 734ms
      360p ...1080p + subtitles (Русский, Українська, English)

=== Nuvio plugin: Breaking Bad S1E1 ===
[OK] 14 streams in 928ms
```

```
=== Stremio addon (local): /stream/movie/tmdb:603.json ===
10 streams returned
=== Stremio addon (local): /stream/series/tmdb:1396:1:1.json ===
14 streams returned
```

## Install as Nuvio plugin

Paste this URL into **Nuvio → Settings → Plugins → Add Repository** and enable **HDRezka**:

```
https://raw.githubusercontent.com/gershik/nuvio-hdrezka/main/manifest.json
```

## Use on Stremio / TV

HDRezka blocks most datacenter IPs (Vercel, Cloudflare Workers, etc.). The most reliable free option is to run the addon on a computer on your home network: that uses the same residential IP that already passed the local test.

### Option A: run the addon on your computer (recommended)

```bash
cd stremio-addon
cp ../providers/hdrezka.cjs providers/hdrezka.cjs
node addon.js
```

The console prints two URLs:
- `http://127.0.0.1:7001/manifest.json` — for Stremio on the same computer
- `http://192.168.x.x:7001/manifest.json` — for Stremio on a TV/phone connected to the same Wi-Fi

In Stremio: **Addons → Add Addon URL** and paste the LAN URL.

### Option B: persistent public tunnel (recommended for TV / away from home)

This uses a tunnel so the TV reaches a stable HTTPS URL. The HDRezka scraper still runs from your home network's IP, so it is not blocked.

```bash
cd stremio-addon
cp .env.example .env
# edit .env and set TUNNEL_PROVIDER plus your details
npm run start:tunnel
```

Two providers are supported:

- **ngrok** (easiest, free static subdomain)
  - Sign up at https://dashboard.ngrok.com, get your authtoken, run `ngrok config add-authtoken <token>`.
  - Claim your free static domain in the dashboard and set `NGROK_DOMAIN` in `.env`.
  - Manifest URL: `https://<your-domain>.ngrok-free.app/manifest.json`

- **Cloudflare Tunnel** (unmetered, but requires a domain you own)
  - Set `CLOUDFLARE_TUNNEL_HOSTNAME` in `.env` (e.g. `hdrezka.yourdomain.com`).
  - Run `./scripts/setup-cloudflare.sh` once, then `npm run start:tunnel`.
  - Manifest URL: `https://<your-hostname>/manifest.json`

### Option C: one-click Vercel deploy (likely blocked)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjustchokingaround%2Fnuvio-hdrezka&root-directory=stremio-addon)

After deploying, copy the URL and add `/manifest.json` in Stremio.
**Caveat:** HDRezka usually returns `403` / access-error 105 from Vercel/datacenter IPs, so streams may fail. If it fails, use Option A or B.

## Files

| Path | What |
|---|---|
| `src/hdrezka/http.js` | fetch wrappers + in-memory cookie jar |
| `src/hdrezka/search.js` | TMDB title/year → HDRezka candidate page |
| `src/hdrezka/extractor.js` | page fetch, Anubis solve, AES/JS deobfuscation, CDN POST |
| `src/hdrezka/anubis.js` | SHA-256 proof-of-work solver |
| `src/hdrezka/index.js` | `getStreams(tmdbId, mediaType, season, episode)` entry |
| `providers/hdrezka.cjs` | Hermes-compatible CommonJS bundle for Nuvio |
| `manifest.json` | Nuvio plugin manifest |
| `build.cjs` | bundle script (`npm run build`) |
| `stremio-addon/addon.js` | Stremio addon interface wrapper + local server |
| `stremio-addon/api/index.js` | Vercel serverless request handler |
| `stremio-addon/vercel.json` | Vercel routing |

## Anubis algorithm

```
hash = SHA-256(challenge.randomData + nonce)
hex  = lower-hex(hash)
assert: hex starts with `difficulty` zero hex chars
```

Submission: `GET /.within.website/x/cmd/anubis/api/pass-challenge?id=<id>&response=<hex>&nonce=<n>&redir=<url>&elapsedTime=<s>`. Server returns `302` with `Set-Cookie: techaro.lol-anubis-auth=<JWT>`.

## Why the old reference didn’t work

`michat88/nuvio-providers` was built for a different HDRezka mirror:

- Dead domains: `hdrezka.ag`, `hdrezka-home.tv`.
- `X-Hdrezka-Android-App` bypass headers now trigger `403` on `hdrezka.website`.
- Search endpoint still works without Anubis; the main work is solving Anubis for page/CDN access.

### Shows split across separate season pages

For TV seasons absent from the initially matched page, the provider examines HDRezka's own linked franchise entries. It accepts an explicitly numbered season title matching the series name, checks its release year against the canonical TMDB season, and verifies the requested episode on the destination page. It sends that page's post ID and local season number to HDRezka, while keeping the catalog season/episode in Nuvio's stream title.

Franchise positions are not treated as seasons: films, spin-offs, and documentaries are excluded. Normal multi-season pages continue using their advertised season tabs, including lazily loaded episode lists. Missing, conflicting, or ambiguous split-season metadata returns no streams rather than guessing. This is a general resolver with no title-specific ID table; unrelated titles without explicit linked season metadata require additional evidence and are not automatically remapped.
