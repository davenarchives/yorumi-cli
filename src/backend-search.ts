import { AnimeSearchResult } from './types.js';

const LOCAL_API_BASE = process.env.YORUMI_API_BASE ? String(process.env.YORUMI_API_BASE).replace(/\/+$/, '') : null;
const ALLANIME_API_URL = 'https://api.allanime.day/api';
const ALLANIME_REFERER = 'https://allmanga.to';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';

type AllAnimeSort = 'Latest_Update' | 'Score';

const toAnimeResult = (anime: any): AnimeSearchResult => ({
  id: anime.id,
  title: anime.title?.english || anime.title?.romaji || anime.title?.native || anime.title?.userPreferred,
  session: `yorumi:${anime.id}`,
  year: anime.seasonYear || anime.startDate?.year,
  episodes: anime.episodes
});

const normalizeTitle = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const scoreSearchResult = (query: string, result: AnimeSearchResult) => {
  const q = normalizeTitle(query);
  const title = normalizeTitle(result.title);
  let score = 0;

  if (title === q) score += 100_000;
  if (title.startsWith(`${q} `)) score += 20_000;
  if (title.includes(q)) score += 5_000;

  const isSpecial = /\b(movie|special|recap|ova|ona)\b/i.test(result.title);
  const asksSpecial = /\b(movie|special|recap|ova|ona)\b/i.test(query);
  if (isSpecial && !asksSpecial) score -= 10_000;

  score += Math.min(Number(result.episodes || 0), 1_000);
  return score;
};

const rankSearchResults = (query: string, results: AnimeSearchResult[]) =>
  [...results].sort((a, b) => scoreSearchResult(query, b) - scoreSearchResult(query, a));

async function fetchBackendResults(path: string): Promise<AnimeSearchResult[]> {
  if (!LOCAL_API_BASE) return [];
  const res = await fetch(`${LOCAL_API_BASE}${path}`, { signal: AbortSignal.timeout(3500) });
  if (!res.ok) return [];

  const data: any = await res.json();
  const media: any[] = Array.isArray(data?.media) ? data.media : [];
  return media
    .map(toAnimeResult)
    .filter((item: AnimeSearchResult) => item.id && item.title);
}

async function fetchAllAnimeResults(options: { query?: string; sortBy?: AllAnimeSort; limit?: number }): Promise<AnimeSearchResult[]> {
  const search: Record<string, unknown> = { allowAdult: false, allowUnknown: false };
  if (options.query) {
    search.query = normalizeTitle(options.query);
  } else if (options.sortBy) {
    search.sortBy = options.sortBy;
    search.sortDirection = 'DSC';
  }

  const query = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name availableEpisodes}}}`;
  const res = await fetch(ALLANIME_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Origin: ALLANIME_REFERER,
    },
    body: JSON.stringify({
      query,
      variables: {
        search,
        limit: options.limit || 40,
        page: 1,
        translationType: 'sub',
        countryOrigin: 'ALL',
      },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return [];

  const data: any = await res.json();
  const edges = Array.isArray(data?.data?.shows?.edges) ? data.data.shows.edges : [];
  const results = edges.map((edge: any) => {
    const available = edge.availableEpisodes || {};
    const episodes = Math.max(available.sub || 0, available.dub || 0, available.raw || 0, 1);

    return {
      id: `allanime-${edge._id}`,
      title: edge.name,
      session: `allanime:${edge._id}`,
      episodes,
    };
  }).filter((item: AnimeSearchResult) => item.title);

  return options.query ? rankSearchResults(options.query, results) : results;
}

export async function getLatestAnime(): Promise<AnimeSearchResult[]> {
  try {
    const backendResults = await fetchBackendResults('/anime/search?sort=TRENDING_DESC');
    if (backendResults.length > 0) return backendResults;
  } catch {
    // Fall back to the direct provider below.
  }

  return fetchAllAnimeResults({ sortBy: 'Latest_Update', limit: 15 }).catch(() => []);
}

export async function getPopularAnime(): Promise<AnimeSearchResult[]> {
  try {
    const backendResults = await fetchBackendResults('/anime/search?sort=POPULARITY_DESC');
    if (backendResults.length > 0) return backendResults;
  } catch {
    // Fall back to the direct provider below.
  }

  return fetchAllAnimeResults({ sortBy: 'Score', limit: 15 }).catch(() => []);
}

export async function searchAllAnime(query: string): Promise<AnimeSearchResult[]> {
  try {
    const backendResults = await fetchBackendResults(`/anime/search?query=${encodeURIComponent(query)}`);
    if (backendResults.length > 0) return rankSearchResults(query, backendResults);
  } catch {
    // Fall back to the direct provider below.
  }

  return fetchAllAnimeResults({ query }).catch(() => []);
}
