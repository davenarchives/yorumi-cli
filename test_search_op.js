import { gogoAnimeScraper } from './src/gogoanime.js';
import { searchAllAnime } from './src/allanime.js';

async function run() {
  console.log('Searching GogoAnime for "one piece"...');
  const gogoResults = await gogoAnimeScraper.search('one piece');
  console.log(`GogoAnime found ${gogoResults.length} results.`);
  
  console.log('Searching AllAnime for "one piece"...');
  const allAnimeResults = await searchAllAnime('one piece');
  console.log(`AllAnime found ${allAnimeResults.length} results.`);
  console.log(allAnimeResults.map(r => r.title));
}

run().catch(console.error);
