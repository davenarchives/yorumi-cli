import { AnimeSearchResult } from './types.js';

export type AmSource = { sourceUrl?: string; sourceName?: string; priority?: number };

export const getPopularAnime = async (): Promise<AnimeSearchResult[]> => {
  try {
    const response = await fetch('https://animetsu.net/v2/api/anime/home', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const data = await response.json() as any;
    const trending = Array.isArray(data?.trending) ? data.trending : [];
    return trending.map((item: any) => {
      const title = String(item.title?.english || item.title?.romaji || item.title?.native || '').trim();
      return {
        id: `animetsu-${item.anilist_id}`,
        title,
        session: title,
        episodes: item.total_eps || undefined,
      };
    }).filter((r: AnimeSearchResult) => r.title).slice(0, 15);
  } catch {
    return [];
  }
};
