import { fetchAniNekoStreams } from './src/anineko';

async function run() {
    const streams = await fetchAniNekoStreams('naruto', 1, 'sub');
    console.log('Streams:', streams ? Object.keys(streams).length : 0);
    console.log(streams);
}
run().catch(console.error);
