import { getStreams as extractStreams } from '../hdrezka/extractor.js';

export async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        // Let the small English/Original provider finish its CPU-heavy Anubis
        // proof first. Running both proofs simultaneously on a phone/TV makes
        // them contend and finish together, delaying the first visible result.
        await new Promise((resolve) => setTimeout(resolve, 900));
        return await extractStreams(tmdbId, mediaType, season, episode, 'ru');
    } catch (error) {
        console.error('[HDRezka Russian] getStreams failed:', error?.message || error);
        return [];
    }
}
