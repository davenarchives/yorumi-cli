import { searchAllAnime, fetchAllAnimeStreams } from './src/allanime.js';

async function test() {
    try {
        const results = await searchAllAnime('dandadan');
        const anime = results.find(r => r.title === 'Dandadan');
        if (!anime) {
            console.log("Not found.");
            return;
        }
        console.log(`Found: ${anime.title} | ID: ${anime.session}`);
        const showId = anime.session.replace('allanime:', '');
        const streams = await fetchAllAnimeStreams(anime.title, 1, 'sub', showId);
        console.log("Streams found:", streams.length);
        for (const s of streams) {
            console.log(`[${s.quality}] ${s.server}: ${s.url}`);
        }
    } catch (e) {
        console.error(e);
    }
}
test();
