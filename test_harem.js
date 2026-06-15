import { searchAllAnime, fetchAllAnimeStreams } from './src/allanime.js';

async function test() {
    const results = await searchAllAnime("labyrinth");
    const show = results.find(r => r.title === "Isekai Meikyuu de Harem wo");
    if (show) {
        const showId = show.session.replace('allanime:', '');
        console.log("Fetching ep 6 for", show.title);
        const streams = await fetchAllAnimeStreams(show.title, 6, 'sub', showId);
        console.log(streams);
    }
}
test();
