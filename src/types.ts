export interface AnimeSearchResult {
  id: string | number;
  title: string;
  name?: string;
  englishName?: string;
  nativeName?: string;
  session: string;
  year?: string | number;
  episodes?: number;
}

export interface Episode {
  id: string;
  session: string;
  episodeNumber: number;
  title?: string;
}

export interface StreamLink {
  quality: string;
  audio: string;
  provider?: string;
  server?: string;
  url: string;
  directUrl?: string;
  isHls?: boolean;
}

export interface EpisodesPayload {
  episodes: Episode[];
  lastPage?: number;
}

export interface PlayableStreamPayload {
  stream: StreamLink;
  url: string;
}

export interface CliOptions {
  query: string;
  animeIndex?: number;
  episode?: number;
  range?: string;
  player: string;
  windowSize: string;
  outputDir: string;
  printUrl: boolean;
  directPlay: boolean;
  download: boolean;
  copyAudio: boolean;
  update: boolean;
  uninstall: boolean;
  yes: boolean;
  latest: boolean;
  popular: boolean;
  sub: boolean;
  dub: boolean;
  selectStream: boolean;
}
