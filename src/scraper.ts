import { StreamLink, AnimeSearchResult, Episode, PlayableStreamPayload } from './types.js';
import { GogoAnimeScraper } from './gogoanime.js';
import { fetchAllAnimeStreams } from './allanime.js';

const gogoScraper = new GogoAnimeScraper();

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
      // Just use the session directly since we fetched it from GogoAnime!
      const knownSlug = audio === 'dub' ? `${anime.id}-dub` : String(anime.id);
      
      const cleanTitle = (anime.title || anime.name || '').replace(/-/g, ' ');
      if (anime.session.startsWith('allanime:')) {
          const showId = anime.session.replace('allanime:', '');
          try {
              const allAnimeStreams = await fetchAllAnimeStreams(cleanTitle, epNum, audio, showId);
              if (allAnimeStreams.length > 0) {
                  return { stream: allAnimeStreams[0], url: allAnimeStreams[0].url };
              }
          } catch (e) {}
          continue;
      }

      try {
          const allAnimeStreams = await fetchAllAnimeStreams(cleanTitle, epNum, audio);
          if (allAnimeStreams.length > 0) {
              return { stream: allAnimeStreams[0], url: allAnimeStreams[0].url };
          }
      } catch (e) {}
      
      const gogoSources = await gogoScraper.getStreams({
          titles: [anime.title, anime.name, anime.englishName, anime.nativeName].filter(Boolean) as string[],
          episodeNumber: epNum,
          knownSlug: knownSlug
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
  }

  throw new Error(`No playable stream found for episode ${episode.episodeNumber}`);
};
