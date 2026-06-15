import { StreamLink, AnimeSearchResult, Episode, PlayableStreamPayload } from './types.js';
import { GogoAnimeScraper } from './gogoanime.js';
import { fetchAllAnimeStreams } from './allanime.js';
import https from 'node:https';
import http from 'node:http';

const gogoScraper = new GogoAnimeScraper();

function isStreamValid(url: string, referer: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (/ok\.ru|streamlare\.com/i.test(url)) return resolve(false);

    // For iframe fallbacks (like mp4upload), fetch the HTML and check if the video was deleted
    if (!/\.(m3u8|mp4|mkv)(\?|$)/i.test(url) && !/googlevideo\.com|allanime\.day|wixmp\.com/i.test(url)) {
      fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': referer } })
        .then(async res => {
          if (!res.ok) return resolve(false);
          const html = await res.text();
          if (/file was deleted|video not found|404 not found|redirecting/i.test(html)) return resolve(false);
          resolve(true);
        })
        .catch(() => resolve(false));
      return;
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Range': 'bytes=0-100' // Use Range GET to mimic player
      }
    }, (res) => {
      // Valid if not 4xx or 5xx
      if (res.statusCode && res.statusCode < 400) resolve(true);
      else resolve(false);
    });
    req.on('error', () => resolve(false));
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
  const isAllAnime = anime.session.startsWith('allanime:');
  const cleanTitle = anime.title.replace(/\(Dub\)/i, '').trim();
  const epNum = episode.episodeNumber;

  const order = [];
  if (sub && !dub) order.push('sub');
  else if (dub && !sub) order.push('dub');
  else order.push('sub', 'dub');

  const allValidStreams: StreamLink[] = [];

  for (const audio of order) {
      const knownSlug = (!isAllAnime) ? (audio === 'dub' ? `${anime.id}-dub` : String(anime.id)) : null;
      
      try {
          const gogoSources = await gogoScraper.getStreams({
              titles: [anime.title, anime.name, anime.englishName, anime.nativeName].filter(Boolean) as string[],
              episodeNumber: epNum,
              knownSlug: knownSlug ?? undefined,
              episodeSession: isAllAnime ? undefined : episode.session
          });
          
          if (gogoSources.length > 0) {
              const stream: StreamLink = {
                  quality: 'auto',
                  audio,
                  provider: 'gogoanime',
                  server: String(gogoSources[0].sourceName),
                  url: String(gogoSources[0].sourceUrl),
                  directUrl: String(gogoSources[0].sourceUrl),
                  isHls: false
              };
              if (!selectStream) return { stream, url: stream.url };
              allValidStreams.push(stream);
          }
      } catch (e) {}

      try {
          const showId = isAllAnime ? anime.session.replace('allanime:', '') : undefined;
          const allAnimeStreams = await fetchAllAnimeStreams(cleanTitle, epNum, audio, showId);
          if (allAnimeStreams.length > 0) {
              for (const stream of allAnimeStreams) {
                  if (/googlevideo\.com|allanime\.day/i.test(stream.url) || await isStreamValid(stream.url, 'https://allmanga.to')) {
                      if (!selectStream) return { stream, url: stream.url };
                      allValidStreams.push(stream);
                  }
              }
          }
      } catch (e) {}
  }

  if (allValidStreams.length > 0) {
      if (selectStream) {
          const { chooseFromList } = await import('./utils.js');
          const selected = await chooseFromList(
              'Stream Quality / Server',
              allValidStreams,
              (s) => `[${s.provider}] ${s.server || 'Server'} - ${s.quality} ${String(s.audio || '').toUpperCase()}`
          );
          return { stream: selected, url: selected.url };
      }
      return { stream: allValidStreams[0], url: allValidStreams[0].url };
  }

  throw new Error(`No playable stream found for episode ${episode.episodeNumber}`);
};
