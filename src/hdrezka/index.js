/**
 * Nuvio Provider entry point.
 *
 * Nuvio calls `getStreams(tmdbId, mediaType, season, episode)` with a TMDB
 * ID and expects back an array of stream descriptors.
 *
 * Note: when this gets bundled for Nuvio, the build script transpiles
 * async/await into generator functions for Hermes compatibility. For local
 * Node testing, async/await works as-is.
 */

import { getStreams as extractStreams } from './extractor.js';

export async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        console.log(`[HDRezka] ${mediaType} ${tmdbId} S${season ?? '-'}E${episode ?? '-'}`);
        const streams = await extractStreams(tmdbId, mediaType, season, episode);
        if (streams.length > 0) return streams;
        return [];
    } catch (error) {
        const msg = `${error.message || error}`.replace(/\s+/g, ' ').trim();
        console.error('[HDRezka] getStreams failed:', msg);
        return [];
    }
}
