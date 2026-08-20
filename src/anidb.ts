import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AnimeSearchResult, Episode, StreamLink } from './types.js';

const execFileAsync = promisify(execFile);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://anidb.app/';

export async function fetchAnidbText(url: string, referer = REFERER, timeoutSeconds = 6): Promise<string> {
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  try {
    const { stdout } = await execFileAsync(curlCmd, [
      '-sL',
      '-A', USER_AGENT,
      '-e', referer,
      '--connect-timeout', '3',
      '--max-time', String(timeoutSeconds),
      url
    ], { encoding: 'utf8', timeout: (timeoutSeconds + 2) * 1000 });

    if (stdout && stdout.trim().length > 0) {
      return stdout;
    }
  } catch {
    // Fall back to native fetch
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: referer,
    },
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
  });

  if (!res.ok) throw new Error(`AniDB request failed ${res.status}: ${url}`);
  return res.text();
}

export function cleanHtmlEntities(str: string): string {
  if (!str) return '';
  let decoded = String(str);
  // Multi-pass to handle nested/double-encoded entities (e.g. &amp;#039; -> &#039; -> ')
  for (let pass = 0; pass < 3; pass += 1) {
    const prev = decoded;
    decoded = decoded
      .replace(/&amp;/gi, '&')
      .replace(/&#0*39;|&apos;|&#x27;/gi, "'")
      .replace(/&quot;|&#0*34;|&#x22;/gi, '"')
      .replace(/&lt;|&#0*60;|&#x3c;/gi, '<')
      .replace(/&gt;|&#0*62;|&#x3e;/gi, '>')
      .replace(/&nbsp;|&#0*160;/gi, ' ')
      .replace(/&ndash;|&#8211;/gi, '–')
      .replace(/&mdash;|&#8212;/gi, '—')
      .replace(/&hellip;|&#8230;/gi, '…')
      .replace(/&#(\d+);/g, (_, dec) => {
        try {
          return String.fromCodePoint(Number(dec));
        } catch {
          return _;
        }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        try {
          return String.fromCodePoint(parseInt(hex, 16));
        } catch {
          return _;
        }
      });
    if (decoded === prev) break;
  }
  return decoded.trim();
}

export async function searchAniDB(query: string): Promise<AnimeSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: AnimeSearchResult[] = [];
  const seenIds = new Set<string>();

  const addResult = (slug: string, id: string, title: string, year?: string | number, type?: string) => {
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    results.push({
      id: Number(id) || id,
      title: cleanHtmlEntities(title),
      name: cleanHtmlEntities(title),
      session: `anidb:${id}`,
      year: year ? Number(year) || year : undefined,
    });
  };

  // 1. Try search suggestions first
  try {
    const suggUrl = `https://anidb.app/search/suggestions?q=${encodeURIComponent(trimmed)}`;
    const html = await fetchAnidbText(suggUrl, REFERER, 4);

    const regex = /href=["'](?:https?:\/\/anidb\.app)?\/anime\/([a-z0-9-]+-(\d+))["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html))) {
      const slug = m[1];
      const id = m[2];
      const inner = m[3];
      const textWithoutImg = inner.replace(/<img[^>]*>/gi, '');
      const titleMatch = textWithoutImg.match(/<p[^>]*>([^<]+)<\/p>/i) || inner.match(/alt=["']([^"']+)["']/i);
      const yearMatch = textWithoutImg.match(/\b(19\d{2}|20\d{2})\b/);
      const title = titleMatch ? titleMatch[1] : slug.replace(/-\d+$/, '').replace(/-/g, ' ');
      addResult(slug, id, title, yearMatch ? yearMatch[1] : undefined);
    }
  } catch {}

  // 2. If suggestions were empty or few, query browse
  if (results.length === 0) {
    try {
      const browseUrl = `https://anidb.app/browse?q=${encodeURIComponent(trimmed)}`;
      const html = await fetchAnidbText(browseUrl, REFERER, 5);

      const regex = /href=["'](?:https?:\/\/anidb\.app)?\/anime\/([a-z0-9-]+-(\d+))["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(html))) {
        const slug = m[1];
        const id = m[2];
        const inner = m[3];
        const textWithoutImg = inner.replace(/<img[^>]*>/gi, '');
        const titleMatch = textWithoutImg.match(/<p[^>]*>([^<]+)<\/p>/i) || inner.match(/alt=["']([^"']+)["']/i) || inner.match(/title=["']([^"']+)["']/i);
        const yearMatch = textWithoutImg.match(/\b(19\d{2}|20\d{2})\b/);
        const title = titleMatch ? titleMatch[1] : slug.replace(/-\d+$/, '').replace(/-/g, ' ');
        addResult(slug, id, title, yearMatch ? yearMatch[1] : undefined);
      }
    } catch {}
  }

  return results;
}

export async function getAniDBEpisodes(animeId: string | number): Promise<Episode[]> {
  const numericId = String(animeId).replace(/^anidb:/, '').replace(/^[a-z0-9-]+-(\d+)$/i, '$1');
  const url = `https://anidb.app/api/frontend/anime/${numericId}/episodes`;
  const raw = await fetchAnidbText(url, REFERER, 5);

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON from AniDB episodes API: ${raw.slice(0, 100)}`);
  }

  const rawEpisodes: any[] = Array.isArray(data) ? data : Array.isArray(data?.episodes) ? data.episodes : [];
  if (rawEpisodes.length === 0) {
    throw new Error(`No episodes found for AniDB anime ID ${numericId}`);
  }

  return rawEpisodes.map((ep) => {
    const num = Number(ep.number ?? ep.episode ?? 1);
    return {
      id: String(ep.id),
      session: `anidb:${numericId}`,
      episodeNumber: Number.isFinite(num) ? num : 1,
      title: ep.title ? cleanHtmlEntities(ep.title) : `Episode ${num}`,
    };
  });
}

function parseMasterPlaylist(masterBody: string, masterUrl: string): Array<{ quality: string; url: string }> {
  const variants: Array<{ quality: string; url: string }> = [];
  const seen = new Set<string>();
  const lines = String(masterBody || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

    const resolution = line.match(/RESOLUTION=\d+x(\d+)/i)?.[1];
    const bandwidth = Number(line.match(/BANDWIDTH=(\d+)/i)?.[1] || 0);
    let nextUrl = '';
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate || candidate.startsWith('#')) continue;
      nextUrl = candidate;
      break;
    }
    if (!nextUrl || /EXT-X-I-FRAME/i.test(nextUrl)) continue;

    const url = /^https?:\/\//i.test(nextUrl) ? nextUrl : new URL(nextUrl, masterUrl).href;
    if (seen.has(url)) continue;
    seen.add(url);

    const fallbackQuality = bandwidth >= 5_000_000 ? '1080p' : bandwidth >= 2_500_000 ? '720p' : bandwidth >= 1_000_000 ? '480p' : '360p';
    variants.push({ quality: resolution ? `${resolution}p` : fallbackQuality, url });
  }

  return variants.sort((a, b) => {
    const qualityA = Number(String(a.quality || '').replace(/[^\d]/g, '')) || 0;
    const qualityB = Number(String(b.quality || '').replace(/[^\d]/g, '')) || 0;
    return qualityB - qualityA;
  });
}

export async function fetchAniDBStreams(
  animeId: string | number,
  episodeNumber: number,
  mode: 'sub' | 'dub' = 'sub'
): Promise<StreamLink[]> {
  const numericId = String(animeId).replace(/^anidb:/, '').replace(/^[a-z0-9-]+-(\d+)$/i, '$1');
  const episodes = await getAniDBEpisodes(numericId);
  const targetEp = episodes.find((e) => e.episodeNumber === episodeNumber) || episodes[0];

  if (!targetEp) {
    throw new Error(`Episode ${episodeNumber} not found for AniDB anime ID ${numericId}`);
  }

  const epId = targetEp.id;
  const langUrl = `https://anidb.app/api/frontend/episode/${epId}/languages`;
  const rawLang = await fetchAnidbText(langUrl, REFERER, 5);

  let langData: any;
  try {
    langData = JSON.parse(rawLang);
  } catch {
    throw new Error(`Invalid JSON from AniDB languages API: ${rawLang.slice(0, 100)}`);
  }

  const languages: any[] = Array.isArray(langData) ? langData : Array.isArray(langData?.languages) ? langData.languages : [];
  if (languages.length === 0) {
    throw new Error(`No language streams available for episode ID ${epId}`);
  }

  const desiredCode = mode === 'dub' ? 'eng' : 'jpn';
  const langEntry = languages.find((l) => String(l.code).toLowerCase() === desiredCode)
    || languages.find((l) => String(l.code).toLowerCase() === (mode === 'dub' ? 'dub' : 'sub'))
    || languages[0];

  let embedUrl = langEntry?.embed_url;
  if (!embedUrl) {
    throw new Error(`No embed URL found for ${mode} in episode ${episodeNumber}`);
  }
  embedUrl = embedUrl.replace(/\\\//g, '/').replace(/\\/g, '');

  const embedHtml = await fetchAnidbText(embedUrl, REFERER, 5);
  const m3u8Match = embedHtml.match(/file:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
    || embedHtml.match(/(?:file|src)\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i)
    || embedHtml.match(/['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i);

  if (!m3u8Match) {
    throw new Error(`No m3u8 stream found in AniDB embed page (${embedUrl})`);
  }

  const masterM3u8 = m3u8Match[1].replace(/\\\//g, '/').replace(/\\/g, '');
  const streams: StreamLink[] = [
    {
      quality: 'Auto',
      audio: mode,
      provider: 'anidb',
      server: 'anidb-hls',
      url: masterM3u8,
      directUrl: masterM3u8,
      isHls: true,
      referer: 'https://anidb.app/',
    },
  ];

  // Try parsing quality variants
  try {
    const masterBody = await fetchAnidbText(masterM3u8, 'https://anidb.app/', 4);
    const variants = parseMasterPlaylist(masterBody, masterM3u8);
    for (const v of variants) {
      streams.push({
        quality: v.quality,
        audio: mode,
        provider: 'anidb',
        server: 'anidb-hls',
        url: v.url,
        directUrl: v.url,
        isHls: true,
        referer: 'https://anidb.app/',
      });
    }
  } catch {
    // If master manifest fetch fails, the master URL still plays fine directly in mpv
  }

  return streams;
}
