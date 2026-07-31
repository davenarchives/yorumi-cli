const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

async function main() {
  const chunkUrl = 'https://cdn.mkissa.net/all/mk/_app/immutable/chunks/DnMm_so9.js';
  const res = await fetch(chunkUrl, { headers: { 'User-Agent': UA } });
  const chunk = await res.text();

  console.log('chunk length:', chunk.length);
  console.log('ndIdx:', chunk.indexOf('const nd='));
  console.log('RSIdx:', chunk.indexOf('function RS'));
  console.log('LSIdx:', chunk.indexOf('function LS'));
  console.log('$hIdx:', chunk.indexOf('function $h'));
  console.log('ygIdx:', chunk.indexOf('function yg'));
  console.log('MSIdx:', chunk.indexOf('function MS'));
  console.log('glIdx:', chunk.indexOf('function gl'));
  console.log('hcIdx:', chunk.indexOf('function hc'));
  console.log('HrIdx:', chunk.indexOf('function Hr'));
  console.log('jrIdx:', chunk.indexOf('function jr'));
}

main().catch(e => console.error(e));
