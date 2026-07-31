import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

async function main() {
  const pure = require('./pure.cjs');
  const bs = pure.BS();
  const bootToken = await pure.MS({
    buildId: "74",
    epoch: bs,
    keyGroup: "mkissa",
    refererHost: "mkissa.to",
    contentLane: "k7"
  });
  console.log('bootToken from pure:', bootToken);
  console.log('Decoded bootToken:', Buffer.from(bootToken, 'base64').toString('utf8'));
}

main().catch(e => console.error(e));
