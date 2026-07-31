const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const DEFAULT_MASK_HEX = 'f7550cc2edf6db898b6672db5a59d656de6d1238b2e9e43081d455e6cb77e97a';

async function testBootstrap() {
  console.log('Starting testBootstrap...');
  try {
    const buildId = '74';
    const epoch = 6887;
    const ts = Math.floor(Date.now() / 1000);
    const raw = `${epoch}:${buildId}:mkissa:mkissa.to:k7:${ts}`;
    const token = Buffer.from(raw).toString('base64');
    console.log('Token:', token);

    const res = await fetch(`https://api.mkissa.net/client-crypto/v1/bootstrap?buildId=${buildId}&k=k7`, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://mkissa.to/',
        Origin: 'https://mkissa.to',
        'x-build-id': buildId,
        'x-aa-boot': token,
      },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Data:', data);
      if (data && data.partB) {
        const maskHex = DEFAULT_MASK_HEX;
        const partBHex = Buffer.from(data.partB, 'base64').toString('hex');
        let keyHex = '';
        for (let i = 0; i < 64; i += 2) {
          const m = parseInt(maskHex.slice(i, i + 2), 16);
          const p = parseInt(partBHex.slice(i, i + 2), 16);
          keyHex += (m ^ p).toString(16).padStart(2, '0');
        }
        console.log('Successfully fetched live aaKey:', keyHex);
        return true;
      }
    }
  } catch (err) {
    console.error('Bootstrap error:', err.message);
  }
  return false;
}

testBootstrap();
