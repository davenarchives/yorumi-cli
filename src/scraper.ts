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
      const isAllAnime = anime.session.startsWith('allanime:');
      
      const cleanTitle = (anime.title || anime.name || '').replace(/-/g, ' ');
      
      // Attempt AllAnime first if it's an AllAnime result, or just try it as a fallback guess
      try {
          const showId = isAllAnime ? anime.session.replace('allanime:', '') : undefined;
          const allAnimeStreams = await fetchAllAnimeStreams(cleanTitle, epNum, audio, showId);
          if (allAnimeStreams.length > 0) {
              return { stream: allAnimeStreams[0], url: allAnimeStreams[0].url };
          }
      } catch (e) {
          // Ignore AllAnime failure
      }
      
      // Fallback to GogoAnime
      const knownSlug = (!isAllAnime) ? (audio === 'dub' ? `${anime.id}-dub` : String(anime.id)) : null;
      
      try {
          const gogoSources = await gogoScraper.getStreams({
              titles: [anime.title, anime.name, anime.englishName, anime.nativeName].filter(Boolean) as string[],
              episodeNumber: epNum,
              knownSlug: knownSlug ?? undefined, // Only use known slug if it's actually a GogoAnime slug
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
  }

  throw new Error(`No playable stream found for episode ${episode.episodeNumber}`);
};
