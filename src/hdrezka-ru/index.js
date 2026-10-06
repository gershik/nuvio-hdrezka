import { getStreams as extractStreams } from '../hdrezka/extractor.js';

export async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        return await extractStreams(tmdbId, mediaType, season, episode, 'ru');
    } catch (error) {
        console.error('[HDRezka Russian] getStreams failed:', error?.message || error);
        return [];
    }
}
