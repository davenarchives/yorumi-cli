const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const SHOW_ID = 'nHEPcYjjCyXtj9zY8'; // Jujutsu Kaisen

const EPISODE_GQL = "query($showId:String! $translationType:VaildTranslationTypeEnumType! $episodeString:String!){episode(showId:$showId translationType:$translationType episodeString:$episodeString){episodeString sourceUrls}}";

async function testUrl(url, origin, referer) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: origin,
        Referer: referer,
      },
      body: JSON.stringify({
        query: EPISODE_GQL,
        variables: {
          showId: SHOW_ID,
          translationType: 'sub',
          episodeString: '1',
        },
      }),
    });
    const data = await res.json();
    console.log(`[POST ${url} | ${origin}]:`, data.errors ? data.errors[0].message : 'SUCCESS!');
    if (!data.errors) {
      console.log('SourceUrls count:', data.data?.episode?.sourceUrls?.length);
    }
  } catch (err) {
    console.log(`[POST ${url}]: error`, err.message);
  }
}

async function main() {
  await testUrl('https://api.mkissa.net/api', 'https://mkissa.to', 'https://mkissa.to');
  await testUrl('https://api.mkissa.net/api', 'https://allmanga.to', 'https://allmanga.to');
  await testUrl('https://api-t.mkissa.net/api', 'https://mkissa.to', 'https://mkissa.to');
  await testUrl('https://api-t.mkissa.net', 'https://mkissa.to', 'https://mkissa.to');
  await testUrl('https://allanime.day/api', 'https://allanime.day', 'https://allanime.day');
}

main().catch(e => console.error(e));
