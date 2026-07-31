import { fetchAllAnimeStreams } from '../src/allanime';

async function main() {
  console.log('Testing fetchAllAnimeStreams("Jujutsu Kaisen", 1)...');
  const streams = await fetchAllAnimeStreams('Jujutsu Kaisen', 1, 'sub');
  console.log('Streams found:', streams.length);
  if (streams.length > 0) {
    console.log('First stream:', streams[0]);
  } else {
    console.log('No streams found!');
  }
}

main().catch(e => console.error(e));
