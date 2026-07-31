import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

async function main() {
  const pure = require('./pure.cjs');
  // Let's inspect the exact string in step 1 of pure.MS
  // We can override yg or check:
  console.log('BS:', pure.BS());
}

main().catch(e => console.error(e));
