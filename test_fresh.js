import { searchAllAnime, fetchAllAnimeStreams } from './src/allanime.js';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';

function checkUrl(url) {
    return new Promise((resolve) => {
        const req = (url.startsWith('https') ? https : http).request(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://allmanga.to',
                'Range': 'bytes=0-100'
            }
        }, (res) => {
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.end();
    });
}

function runMpv(url) {
    return new Promise((resolve) => {
        const args = [
            '--no-video', 
            '--no-ytdl',
            '--referrer=https://allmanga.to',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            url
        ];
        const child = spawn('C:\\Program Files\\MPV Player\\mpv.exe', args);
        child.stdout.on('data', d => process.stdout.write(d.toString()));
        child.stderr.on('data', d => process.stderr.write(d.toString()));
        child.on('close', (code) => {
            console.log("mpv exited with code", code);
            resolve(code);
        });
    });
}

async function test() {
    try {
        const results = await searchAllAnime('dandadan');
        const anime = results.find(r => r.title === 'Dandadan');
        const showId = anime.session.replace('allanime:', '');
        const streams = await fetchAllAnimeStreams(anime.title, 1, 'sub', showId);
        if(streams.length > 0) {
            console.log("Fresh URL:", streams[0].url);
            const status = await checkUrl(streams[0].url);
            console.log("Node Status:", status);
            console.log("Starting MPV...");
            await runMpv(streams[0].url);
        } else {
            console.log("No streams.");
        }
    } catch (e) {
        console.error(e);
    }
}
test();
