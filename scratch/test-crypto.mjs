const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

async function main() {
  const chunkUrl = 'https://cdn.mkissa.net/all/mk/_app/immutable/chunks/DnMm_so9.js';
  const res = await fetch(chunkUrl, { headers: { 'User-Agent': UA } });
  const chunk = await res.text();

  const idx = chunk.indexOf('function Pl(){');
  if (idx >= 0) {
    console.log('=== Pl ===');
    console.log(chunk.substring(idx, idx + 800));
  }
}

main().catch(e => console.error(e));
