import { StreamLink, AnimeSearchResult, Episode } from './types.js';
import { fetchAniDBStreams } from './anidb.js';
import { fetchAllAnimeStreams } from './allanime.js';

import https from 'node:https';
import http from 'node:http';

function isStreamValid(url: string, referer: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (/streamlare\.com/i.test(url)) return resolve(false);

    // For iframe fallbacks (like mp4upload), fetch the HTML and check if the video was deleted
    if (!/\.(m3u8|mkv|mp4)(\?|$)/i.test(url) && !/googlevideo\.com|allanime\.day|wixmp\.com|fast4speed\.rsvp|anidb\.app/i.test(url)) {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 4000);
      fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': referer }, signal: ac.signal })
        .then(async res => {
          clearTimeout(timeout);
          if (!res.ok) return resolve(false);
          const html = await res.text();
          if (/file was deleted|video not found|404 not found|redirecting/i.test(html)) return resolve(false);
          resolve(true);
        })
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
      return;
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': referer,
        'Range': 'bytes=0-100' // Use Range GET to mimic player
      }
    }, (res) => {
      // Valid if not 4xx or 5xx
      if (res.statusCode && res.statusCode < 400) resolve(true);
      else resolve(false);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export const resolveEpisodeStreamUrl = async (
  anime: AnimeSearchResult,
  episode: Episode,
  directPlay: boolean,
  sub: boolean,
  dub: boolean,
  selectStream: boolean = false
): Promise<{ stream: StreamLink; url: string }> => {
  const epNum = episode.episodeNumber;
  const cleanTitle = anime.title.replace(/\(Dub\)/i, '').trim();
  const isAniDB = String(anime.session || '').startsWith('anidb:') || /^\d+$/.test(String(anime.id));
  const isAllAnime = String(anime.session || '').startsWith('allanime:');

  const order: ('sub' | 'dub')[] = [];
  if (sub && !dub) order.push('sub');
  else if (dub && !sub) order.push('dub');
  else order.push('sub', 'dub');

  const allValidStreams: StreamLink[] = [];

  // 1. Primary: Try AniDB scraper directly (fastest, standalone, no backend required)
  for (const audio of order) {
    try {
      const anidbStreams = await fetchAniDBStreams(anime.id, epNum, audio);
      for (const stream of anidbStreams) {
        const streamUrl = stream.directUrl || stream.url;
        if (!selectStream) return { stream, url: streamUrl };
        allValidStreams.push(stream);
      }
    } catch {
      // Try searching for AniDB ID by title if anime was from another provider
      if (!isAniDB) {
        try {
          const { searchAniDB } = await import('./anidb.js');
          const anidbResults = await searchAniDB(cleanTitle);
          if (anidbResults.length > 0) {
            const anidbStreams = await fetchAniDBStreams(anidbResults[0].id, epNum, audio);
            for (const stream of anidbStreams) {
              const streamUrl = stream.directUrl || stream.url;
              if (!selectStream) return { stream, url: streamUrl };
              allValidStreams.push(stream);
            }
          }
        } catch {}
      }
    }
  }

  // 2. Fallback: Try AllAnime provider
  if (allValidStreams.length === 0) {
    const showId = isAllAnime ? anime.session.replace('allanime:', '') : undefined;
    for (const audio of order) {
      try {
        const allAnimeStreams = await fetchAllAnimeStreams(cleanTitle, epNum, audio, showId);
        for (const stream of allAnimeStreams) {
          const streamUrl = stream.directUrl || stream.url;
          if (/googlevideo\.com|allanime\.day|wixmp\.com|fast4speed\.rsvp/i.test(streamUrl) || await isStreamValid(streamUrl, 'https://allmanga.to')) {
            if (!selectStream) return { stream, url: streamUrl };
            allValidStreams.push(stream);
          }
        }
      } catch {}
    }
  }

  // 3. Fallback: Try local backend if running
  if (allValidStreams.length === 0 && !isAllAnime) {
    const backendUrl = `http://localhost:3001/api/anime/stream?id=${anime.id}&episode=${epNum}&source=anidb&nocache=1`;
    try {
      const res = await fetch(backendUrl, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data: any = await res.json();
        const rawUrl: string = data?.m3u8 || data?.url;
        if (rawUrl && !/player\.(videasy|vidsrc|2embed)/.test(rawUrl)) {
          let streamUrl = rawUrl;
          const referer = data.referer || 'https://anidb.app/';
          const streamObj: StreamLink = {
            provider: data.source || 'anidb',
            server: 'anidb-backend',
            url: streamUrl,
            quality: 'Auto',
            audio: 'sub',
            isHls: /\.m3u8/i.test(streamUrl),
            referer
          };
          if (!selectStream) return { stream: streamObj, url: streamUrl };
          allValidStreams.push(streamObj);
        }
      }
    } catch {}
  }

  // 4. Fallback: Try AniNeko provider
  if (allValidStreams.length === 0) {
    try {
      const { fetchAniNekoStreams } = await import('./anineko.js');
      for (const audio of order) {
        const aniNekoStreams = await fetchAniNekoStreams(cleanTitle, epNum, audio);
        for (const stream of aniNekoStreams) {
          const streamUrl = stream.directUrl || stream.url;
          if (!selectStream) return { stream, url: streamUrl };
          allValidStreams.push(stream as StreamLink);
        }
      }
    } catch {}
  }

  if (allValidStreams.length > 0) {
    if (selectStream) {
      const { chooseFromList } = await import('./utils.js');
      const selected = await chooseFromList(
        'Stream Quality / Server',
        allValidStreams,
        (stream) => `[${stream.provider}] ${stream.server || 'Server'} - ${stream.quality} ${String(stream.audio || '').toUpperCase()}`
      );
      return { stream: selected, url: selected.directUrl || selected.url };
    }

    return { stream: allValidStreams[0], url: allValidStreams[0].directUrl || allValidStreams[0].url };
  }

  throw new Error(`No playable stream found for episode ${epNum}`);
};
