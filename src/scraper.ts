import { StreamLink, AnimeSearchResult, Episode, PlayableStreamPayload } from './types.js';
import { GogoAnimeScraper } from './gogoanime.js';
import { fetchAllAnimeStreams } from './allanime.js';
import https from 'node:https';
import http from 'node:http';

const gogoScraper = new GogoAnimeScraper();

function isStreamValid(url: string, referer: string): Promise<boolean> {
  return new Promise((resolve) => {
    // We only validate direct mp4/m3u8 or known raw streams
    if (!/\.(m3u8|mp4|mkv)(\?|$)/i.test(url) && !/googlevideo\.com|allanime\.day|wixmp\.com/i.test(url)) {
      return resolve(true);
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
  _directPlay: boolean,
  preferSub: boolean,
  preferDub: boolean,
): Promise<PlayableStreamPayload> => {
  console.log(`Resolving playable stream for episode ${episode.episodeNumber}...`);
  const epNum = episode.episodeNumber;

  const audioOptions = preferDub ? ['dub'] : preferSub ? ['sub'] : ['sub', 'dub'];

  for (const audio of audioOptions) {
      const isAllAnime = anime.session.startsWith('allanime:');
      
      const cleanTitle = (anime.title || anime.name || '').replace(/-/g, ' ');
      
      // Attempt GogoAnime first because its streams (gogocdn) are vastly more reliable in mpv
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
              return { stream, url: stream.url };
          }
      } catch (e) {
          // Ignore GogoAnime failure
      }

      // Fallback to AllAnime
      try {
          const showId = isAllAnime ? anime.session.replace('allanime:', '') : undefined;
          const allAnimeStreams = await fetchAllAnimeStreams(cleanTitle, epNum, audio, showId);
          if (allAnimeStreams.length > 0) {
              for (const stream of allAnimeStreams) {
                  if (await isStreamValid(stream.url, 'https://allmanga.to')) {
                      return { stream, url: stream.url };
                  }
              }
          }
      } catch (e) {
          // Ignore AllAnime failure
      }
  }

  throw new Error(`No playable stream found for episode ${episode.episodeNumber}`);
};
