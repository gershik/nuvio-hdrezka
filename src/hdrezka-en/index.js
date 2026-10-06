import { getStreams as extractStreams } from '../hdrezka/extractor.js';

export async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        return await extractStreams(tmdbId, mediaType, season, episode, 'en');
    } catch (error) {
        console.error('[HDRezka English] getStreams failed:', error?.message || error);
        return [];
    }
}
