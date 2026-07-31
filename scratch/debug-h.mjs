const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

async function main() {
  const chunkUrl = 'https://cdn.mkissa.net/all/mk/_app/immutable/chunks/DnMm_so9.js';
  const res = await fetch(chunkUrl, { headers: { 'User-Agent': UA } });
  const chunk = await res.text();

  const hIdx = chunk.indexOf('function $h');
  if (hIdx >= 0) {
    console.log('=== $h FUNCTION (chars 1600-2400) ===');
    console.log(chunk.substring(hIdx + 1600, hIdx + 2400));
  }

  // Also print nd array definition
  const ndIdx = chunk.indexOf('const nd=');
  if (ndIdx >= 0) {
    console.log('=== nd ARRAY ===');
    console.log(chunk.substring(ndIdx, ndIdx + 300));
  }
}

main().catch(e => console.error(e));
