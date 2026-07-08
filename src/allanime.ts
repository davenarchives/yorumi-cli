import crypto from 'node:crypto';
import { AnimeSearchResult, StreamLink } from './types.js';

const API_URL = 'https://api.allanime.day/api';
const REFERER = 'https://allmanga.to';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
const EPISODE_HASH = 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec';

const BUILD_ID = '9';
const EPOCH = 4128;
const VERSION = 1;
const TS_BUCKET_MS = 300_000;

const KEY_A = Buffer.from('b1a9a4d051988f1b1b12dbb747439d9bd64b09ea17835600a7eaa4de87c1ad87', 'hex');
const KEY_B = Buffer.from('k7DLdv5SGiuEyGUtcncl5wQOR7r4aenLfDV3AOBKlAU=', 'base64');
const CRYPTO_KEY = Buffer.alloc(32);
for (let i = 0; i < 32; i++) {
  CRYPTO_KEY[i] = KEY_A[i] ^ KEY_B[i];
}

const HEX_MAP: Record<string, string> = {
  '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J',
  '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T',
  '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z', '59': 'a', '5a': 'b', '5b': 'c',
  '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l',
  '55': 'm', '56': 'n', '57': 'o', '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u',
  '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z', '08': '0', '09': '1', '0a': '2', '0b': '3',
  '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9', '15': '-', '16': '.', '67': '_',
  '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$',
  '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%',
};

const cleanSearchQuery = (query: string) =>
  query.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

const toClockUrl = (decoded: string) => {
  const clockPath = decoded.replace('/clock', '/clock.json');
  if (clockPath.startsWith('//')) return `https:${clockPath}`;
  if (clockPath.startsWith('/')) return `https://allanime.day${clockPath}`;
  if (/^https?:\/\//i.test(clockPath)) return clockPath;
  return `https://allanime.day/${clockPath}`;
};

const decodeClockSource = (sourceUrl: string) => {
  const clean = sourceUrl.startsWith('--') ? sourceUrl.slice(2) : sourceUrl;
  let decoded = '';

  for (let i = 0; i < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2);
    decoded += HEX_MAP[pair] ?? pair;
  }

  return decoded.replace(/\\u002F/gi, '/').replace(/\\\|/g, '');
};

const collectSourceUrls = (sourceUrls: any[], audio: string) => {
  const clockUrls: string[] = [];
  const iframeUrls: StreamLink[] = [];

  for (const item of sourceUrls) {
    const sourceUrl = item?.sourceUrl;
    if (typeof sourceUrl !== 'string') continue;

    if (sourceUrl.startsWith('--')) {
      clockUrls.push(toClockUrl(decodeClockSource(sourceUrl)));
      continue;
    }

    if (/^https?:\/\//i.test(sourceUrl)) {
      iframeUrls.push({
        server: String(item.sourceName || 'Unknown'),
        url: sourceUrl,
        quality: 'auto',
        audio,
        provider: 'allmanga',
      });
    }
  }

  return { clockUrls, iframeUrls };
};

const generateAaReq = (queryHash: string) => {
  const ts = Math.floor(Date.now() / TS_BUCKET_MS) * TS_BUCKET_MS;
  const payload = {
    v: VERSION,
    ts,
    epoch: EPOCH,
    buildId: BUILD_ID,
    qh: queryHash,
  };

  const seed = `${EPOCH}:${BUILD_ID}:${queryHash}:${ts}`;
  const nonce = crypto.createHash('sha256').update(seed).digest().subarray(0, 12);

  const plaintext = Buffer.from(JSON.stringify(payload));
  const cipher = crypto.createCipheriv('aes-256-gcm', CRYPTO_KEY, nonce);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = Buffer.concat([
    Buffer.from([VERSION]),
    nonce,
    ciphertext,
    authTag,
  ]);

  return envelope.toString('base64');
};

const decryptTobeparsed = (blob: string, audio: string) => {
  try {
    const raw = Buffer.from(blob, 'base64');

    if (raw.length > 0 && raw[0] === VERSION) {
      const nonce = raw.subarray(1, 13);
      const ciphertext = raw.subarray(13, raw.length - 16);
      const authTag = raw.subarray(raw.length - 16);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', CRYPTO_KEY, nonce);
      decipher.setAuthTag(authTag);
      
      const plain = decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
      try {
        const parsed = JSON.parse(plain);
        const sourceUrls = Array.isArray(parsed) ? parsed : parsed?.episode?.sourceUrls || [];
        return collectSourceUrls(sourceUrls, audio);
      } catch {
        return { clockUrls: [] as string[], iframeUrls: [] as StreamLink[] };
      }
    }

    const key = crypto.createHash('sha256').update('Xot36i3lK3:v1').digest();
    const iv = Buffer.concat([raw.subarray(1, 13), Buffer.from([0, 0, 0, 2])]);
    const ciphertext = raw.subarray(13, raw.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
    const plain = decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
    const parsed = JSON.parse(plain);
    const sourceUrls = Array.isArray(parsed) ? parsed : parsed?.episode?.sourceUrls || [];
    return collectSourceUrls(sourceUrls, audio);
  } catch {
    return { clockUrls: [] as string[], iframeUrls: [] as StreamLink[] };
  }
};

export async function searchAllAnime(query: string): Promise<AnimeSearchResult[]> {
  try {
    const searchQueryGql = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name availableEpisodes}}}`;
    const searchRes = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, Origin: REFERER },
      body: JSON.stringify({
        query: searchQueryGql,
        variables: {
          search: { allowAdult: false, allowUnknown: false, query: cleanSearchQuery(query) },
          limit: 40,
          page: 1,
          translationType: 'sub',
          countryOrigin: 'ALL',
        },
      }),
      signal: AbortSignal.timeout(5000),
    });

    const searchData: any = await searchRes.json();
    const edges = searchData?.data?.shows?.edges || [];
    return edges.map((edge: any) => {
      const available = edge.availableEpisodes || {};
      const episodes = Math.max(available.sub || 0, available.dub || 0, available.raw || 0, 1);
      return {
        id: `allanime-${edge._id}`,
        title: edge.name,
        session: `allanime:${edge._id}`,
        episodes,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchAllAnimeStreams(title: string, episode: number, audio = 'sub', showId?: string): Promise<StreamLink[]> {
  try {
    let showIdToUse = showId;

    if (!showIdToUse) {
      const matches = await searchAllAnime(title);
      showIdToUse = matches[0]?.session?.replace('allanime:', '');
    }

    if (!showIdToUse) return [];

    const epParams = new URLSearchParams({
      variables: JSON.stringify({
        showId: showIdToUse,
        translationType: audio,
        episodeString: String(episode),
      }),
      extensions: JSON.stringify({
        persistedQuery: { version: 1, sha256Hash: EPISODE_HASH },
        aaReq: generateAaReq(EPISODE_HASH),
      }),
    });

    const epRes = await fetch(`${API_URL}?${epParams.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Origin: REFERER, 'x-build-id': BUILD_ID },
      signal: AbortSignal.timeout(5000),
    });
    const epData: any = await epRes.json();
    const directSources = collectSourceUrls(epData?.data?.episode?.sourceUrls || [], audio);
    const encryptedSources = epData?.data?.tobeparsed ? decryptTobeparsed(epData.data.tobeparsed, audio) : null;

    const clockUrls = [
      ...directSources.clockUrls,
      ...(encryptedSources?.clockUrls || []),
    ];
    let rawLinks = [
      ...directSources.iframeUrls,
      ...(encryptedSources?.iframeUrls || []),
    ];

    await Promise.all(clockUrls.map(async (clock) => {
      try {
        const res = await fetch(clock, {
          headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
          signal: AbortSignal.timeout(5000),
        });
        const data: any = await res.json();
        const links = Array.isArray(data?.links) ? data.links : [];
        for (const link of links) {
          if (!link.link || String(link.link).includes('sk.json')) continue;
          rawLinks.push({
            server: 'AllAnime',
            url: link.link,
            quality: link.resolutionStr || '720p',
            audio,
            provider: 'allmanga',
          });
        }
      } catch {
        // Keep the other clocks/iframe fallbacks.
      }
    }));

    rawLinks = rawLinks.filter((stream) => {
      const url = stream.url.toLowerCase();
      if (url.includes('.m3u8')) return true;
      if (url.includes('.mp4')) return true;
      if (url.includes('googlevideo.com')) return true;
      if (url.includes('wixmp.com')) return true;
      if (url.includes('okcdn.ru')) return true;
      if (url.includes('megaplay.su')) return true;
      // These embeds are supported natively by yt-dlp
      if (url.includes('ok.ru') || url.includes('vk.com') || url.includes('mp4upload')) return true;
      return false;
    });

    rawLinks.sort((a, b) => {
      const score = (stream: StreamLink) => {
        const quality = String(stream.quality || '').toLowerCase();
        let value = 0;
        if (quality.includes('720')) value += 720;
        else if (quality.includes('1080')) value += 710;
        else if (quality.includes('auto')) value += 700;
        else value += Number(quality.replace(/[^\d]/g, '')) || 0;
        if (stream.url.includes('.m3u8')) value += 5000;
        if (stream.url.includes('ok.ru')) value -= 500;
        return value;
      };
      return score(b) - score(a);
    });

    return rawLinks;
  } catch {
    return [];
  }
}
