import vm from 'node:vm';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';

async function main() {
  const chunkUrl = 'https://cdn.mkissa.net/all/mk/_app/immutable/chunks/DnMm_so9.js';
  const res = await fetch(chunkUrl, { headers: { 'User-Agent': UA } });
  let chunk = await res.text();

  chunk = chunk.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, '');
  chunk = chunk.replace(/import\s*['"][^'"]+['"];?/g, '');
  chunk = chunk.replace(/import\.meta/g, '({})');
  chunk = chunk.replace(/export\s*\{[^}]*\};?/g, '');
  chunk = chunk.replace(/export\s+default\s+[^;]+;/g, '');
  chunk = chunk.replace(/export\s+(async\s+function|function|const|let|var)\s+/g, '$1 ');

  const stubs = `
    const stub = () => {};
    const gt = () => false, Ee = stub, Oe = stub, Qt = stub, ic = stub, tl = stub, nt = stub, v = stub, se = stub, er = stub, zt = stub, De = stub, Ae = stub, te = stub, b = stub, at = stub, On = stub, $ = stub, c = stub, Q = stub, Yt = stub, k = stub, ss = stub, g = stub, Wt = stub, m = stub, E0 = stub, We = stub, L = stub, rg = stub, ee = stub, we = stub, kr = stub, _ = stub, be = stub, Ye = stub, Xe = stub, de = stub, Ne = stub, ge = stub, pe = stub, Pe = stub, vr = stub, sa = stub, sc = stub, nr = stub, Ar = stub, oc = stub, ar = stub, Ke = stub, Qe = stub, me = stub, rl = stub, Gr = stub, nl = stub, Zn = stub, C0 = stub, al = stub, yn = stub, R0 = stub, ci = stub, jo = stub, Ho = stub, ih = stub, zr = stub, L0 = stub, sh = stub, lc = stub, lf = stub, oh = stub, Ca = stub, cf = stub, N0 = stub, il = stub, ng = stub, bo = stub, So = stub, M0 = stub, P0 = stub, ag = stub, wo = stub, ig = stub, O0 = stub, D0 = stub, $0 = stub, F0 = stub, U0 = stub, B0 = stub, q0 = stub, K0 = stub, z0 = stub, lh = stub, j0 = stub, Bt = stub, H0 = stub, W0 = stub, ch = stub, V0 = stub, G0 = stub, Y0 = stub, X0 = stub, oa = stub;
  `;

  const sandbox = {
    console,
    WebAssembly,
    TextEncoder,
    TextDecoder,
    URL,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    globalThis: {
      location: { hostname: 'mkissa.to', origin: 'https://mkissa.to', href: 'https://mkissa.to/' },
    },
    window: {
      location: { hostname: 'mkissa.to', origin: 'https://mkissa.to', href: 'https://mkissa.to/' },
    },
    document: { currentScript: null },
    navigator: { userAgent: UA },
  };

  const context = vm.createContext(sandbox);
  const script = new vm.Script(stubs + '\n' + chunk + `\n; globalThis.testRes = { mask: Array.from($h("74")), Sf };`);
  script.runInContext(context);

  console.log('Sf:', sandbox.testRes.Sf);
  const mask = Buffer.from(sandbox.testRes.mask);
  console.log('Mask Hex:', mask.toString('hex'));

  // Test calling MS inside sandbox!
  const msScript = new vm.Script(`
    (async () => {
      return await MS({ buildId: "74", keyGroup: "mkissa", refererHost: "mkissa.to", contentLane: "k7" });
    })();
  `);
  const bootToken = await msScript.runInContext(context);
  console.log('Boot Token:', bootToken);
}

main().catch(e => console.error(e));
