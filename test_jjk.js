import { searchAllAnime, fetchAllAnimeStreams } from './src/allanime.js';
import https from 'https';
import http from 'http';

function checkUrl(url) {
    return new Promise((resolve) => {
        const req = (url.startsWith('https') ? https : http).request(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://allmanga.to'
            }
        }, (res) => {
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.end();
    });
}

async function test() {
    try {
        const results = await searchAllAnime('kakegurui');
        const anime = results.find(r => r.title === 'Kakegurui');
        const showId = anime.session.replace('allanime:', '');
        const streams = await fetchAllAnimeStreams(anime.title, 1, 'sub', showId);
        if(streams.length > 0) {
            console.log("Found stream:", streams[0].url);
            const status = await checkUrl(streams[0].url);
            console.log("HEAD Status:", status);
        } else {
            console.log("No streams found.");
        }
    } catch (e) {
        console.error(e);
    }
}
test();
