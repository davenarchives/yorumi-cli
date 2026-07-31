import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const STATIC_QUERY_HASH = 'f4662f4b7510b26795dd53ef824a0bf1740fbbc5d1273fab18222ac831bca8d0';
const SHOW_ID = 'nHEPcYjjCyXtj9zY8'; // Jujutsu Kaisen

async function main() {
  const pure = require('./pure.cjs');
  const aaReq = await pure.t2({ queryHash: STATIC_QUERY_HASH, contentLane: "k7" });
  console.log('Generated aaReq:', aaReq);

  const variables = {
    showId: SHOW_ID,
    translationType: 'sub',
    episodeString: '1',
  };
  const extensions = {
    persistedQuery: { version: 1, sha256Hash: STATIC_QUERY_HASH },
    aaReq,
  };

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    extensions: JSON.stringify(extensions),
  });

  const url = `https://api.mkissa.net/api?${params.toString()}`;
  console.log('Fetching GET', url);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Origin: 'https://mkissa.to',
      Referer: 'https://mkissa.to/',
      Accept: '*/*',
    },
  });

  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

main().catch(e => console.error(e));
