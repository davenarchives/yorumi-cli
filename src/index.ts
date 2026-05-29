#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { AnimePaheScraper, type AnimeSearchResult, type Episode, type StreamLink } from '../../backend/src/scraper/animepahe.js';

interface CliOptions {
  query: string;
  animeIndex?: number;
  episode?: number;
  apiBase: string;
  player: string;
  windowSize: string;
  printUrl: boolean;
}

const rl = createInterface({ input, output });

const parseArgs = (argv: string[]): CliOptions => {
  const queryParts: string[] = [];
  const options: CliOptions = {
    query: '',
    apiBase: String(process.env.YORUMI_API_URL || 'http://localhost:3001/api').replace(/\/+$/, ''),
    player: String(process.env.YORUMI_PLAYER || 'mpv'),
    windowSize: String(process.env.YORUMI_PLAYER_SIZE || '960x540'),
    printUrl: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--episode' || arg === '-e') {
      options.episode = Number(next);
      i += 1;
      continue;
    }

    if (arg === '--anime-index' || arg === '-i') {
      options.animeIndex = Number(next);
      i += 1;
      continue;
    }

    if (arg === '--player' || arg === '-p') {
      options.player = String(next || options.player);
      i += 1;
      continue;
    }

    if (arg === '--api-base') {
      options.apiBase = String(next || options.apiBase).replace(/\/+$/, '');
      i += 1;
      continue;
    }

    if (arg === '--size') {
      options.windowSize = String(next || options.windowSize);
      i += 1;
      continue;
    }

    if (arg === '--print-url') {
      options.printUrl = true;
      continue;
    }

    queryParts.push(arg);
  }

  options.query = queryParts.join(' ').trim();
  return options;
};

const printHelp = () => {
  console.log(`
Yorumi CLI

Usage:
  yorumi-cli [anime title] [options]

Options:
  -e, --episode <number>   Pick an episode without prompting
  -i, --anime-index <num>  Pick a search result without prompting, 1-based
  -p, --player <command>   Media player command, defaults to mpv
  --api-base <url>         Yorumi API URL, defaults to http://localhost:3001/api
  --size <WxH>             Player window size, defaults to 960x540
  --print-url              Print the selected stream URL instead of launching mpv
  -h, --help               Show this help
`);
};

const ask = async (question: string) => (await rl.question(question)).trim();

const chooseFromList = async <T>(
  title: string,
  items: T[],
  render: (item: T, index: number) => string,
  defaultIndex = 0,
): Promise<T> => {
  if (items.length === 0) throw new Error(`No ${title.toLowerCase()} found.`);

  console.log(`\n${title}`);
  items.forEach((item, index) => {
    console.log(`${String(index + 1).padStart(2, ' ')}. ${render(item, index)}`);
  });

  while (true) {
    const raw = await ask(`Choose ${title.toLowerCase()} [${defaultIndex + 1}]: `);
    const selected = raw ? Number(raw) - 1 : defaultIndex;
    if (Number.isInteger(selected) && selected >= 0 && selected < items.length) {
      return items[selected];
    }
    console.log('Pick a number from the list.');
  }
};

const selectEpisode = async (episodes: Episode[], requested?: number) => {
  const sorted = [...episodes].sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
  if (requested) {
    const match = sorted.find((episode) => Number(episode.episodeNumber) === requested);
    if (match) return match;
    console.log(`Episode ${requested} was not found. Showing episode picker instead.`);
  }

  const latest = sorted[sorted.length - 1];
  const raw = await ask(`Episode 1-${latest?.episodeNumber || sorted.length} [${latest?.episodeNumber || 1}]: `);
  const picked = raw ? Number(raw) : Number(latest?.episodeNumber || 1);
  return sorted.find((episode) => Number(episode.episodeNumber) === picked) || latest;
};

const commandExists = (command: string) => new Promise<boolean>((resolve) => {
  const checker = platform() === 'win32' ? 'where' : 'which';
  const child = spawn(checker, [command], { stdio: 'ignore', shell: false });
  child.on('close', (code) => resolve(code === 0));
  child.on('error', () => resolve(false));
});

const resolvePlayerCommand = async (player: string) => {
  if (existsSync(player)) return player;
  if (await commandExists(player)) return player;

  if (platform() !== 'win32') return null;

  const candidates = [
    'C:\\Program Files\\MPV Player\\mpv.exe',
    'C:\\Program Files (x86)\\MPV Player\\mpv.exe',
    'C:\\Program Files\\mpv\\mpv.exe',
    'C:\\Program Files (x86)\\mpv\\mpv.exe',
    'C:\\Program Files\\mpv.net\\mpvnet.exe',
    'C:\\Program Files (x86)\\mpv.net\\mpvnet.exe',
  ];

  return candidates.find((candidate) => existsSync(candidate)) || null;
};

const normalizeAudio = (value: unknown) => {
  const lower = String(value || '').toLowerCase();
  if (/(dub|eng|english)/.test(lower)) return 'dub';
  return 'sub';
};

const scoreStream = (stream: StreamLink) => {
  const quality = Number(String(stream.quality || '').replace(/[^\d]/g, '')) || 0;
  const subScore = normalizeAudio(stream.audio) === 'sub' ? 10_000 : 0;
  const directScore = stream.directUrl ? 1_000 : 0;
  return subScore + directScore + quality;
};

const playInMediaPlayer = async (url: string, player: string, title: string, size: string) => {
  const playerCommand = await resolvePlayerCommand(player);
  if (!playerCommand) {
    console.error(`${player} was not found, so no media-player popup can be opened.`);
    console.error('Install mpv, then reopen your terminal: winget install mpv');
    console.error('Or pass the player path: yorumi-cli -p "C:\\Path\\To\\mpv.exe" "Frieren"');
    console.error(`Resolved stream URL: ${url}`);
    return;
  }

  const args = [
    '--force-window=yes',
    '--fullscreen=no',
    `--geometry=${size}+50%+50%`,
    '--autofit-larger=70%x70%',
    '--keepaspect=yes',
    `--title=${title}`,
    '--msg-level=ffmpeg/demuxer=info,demux=info,cplayer=info',
    '--referrer=https://animepahe.pw/',
    '--http-header-fields=Referer: https://animepahe.pw/',
    url,
  ];
  const child = spawn(playerCommand, args, { stdio: 'inherit' });
  await new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code && code !== 0) {
        console.error(`${playerCommand} exited with code ${code}.`);
      }
      resolve();
    });
  });
};

const buildYorumiProxyUrl = (apiBase: string, mediaUrl: string) => {
  return `${apiBase}/scraper/proxy?url=${encodeURIComponent(mediaUrl)}&referer=${encodeURIComponent('https://animepahe.pw/')}&proxyMedia=1`;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const query = options.query || await ask('Search anime: ');
  if (!query) {
    printHelp();
    return;
  }

  const scraper = new AnimePaheScraper();
  try {
    console.log(`Searching AnimePahe for "${query}"...`);
    const results = await scraper.search(query);
    const visibleResults = results.slice(0, 12);
    const requestedAnimeIndex = Number(options.animeIndex || 0);
    const anime = requestedAnimeIndex > 0 && requestedAnimeIndex <= visibleResults.length
      ? visibleResults[requestedAnimeIndex - 1]
      : await chooseFromList<AnimeSearchResult>(
        'Anime',
        visibleResults,
        (item) => `${item.title}${item.year ? ` (${item.year})` : ''}${item.episodes ? ` - ${item.episodes} eps` : ''}`,
      );

    console.log(`Fetching episodes for ${anime.title}...`);
    const episodePayload = await scraper.getEpisodes(anime.session);
    const episode = await selectEpisode(episodePayload.episodes, options.episode);
    if (!episode) throw new Error('No episode selected.');

    console.log(`Fetching streams for episode ${episode.episodeNumber}...`);
    const streams = await scraper.getLinks(anime.session, episode.session);
    if (streams.length === 0) throw new Error('No streams found.');

    const stream = [...streams].sort((a, b) => scoreStream(b) - scoreStream(a))[0];
    console.log('Resolving direct media URL...');
    const directStreamUrl = await scraper.resolveStreamUrl(stream);
    const streamUrl = buildYorumiProxyUrl(options.apiBase, directStreamUrl);
    const title = `${anime.title} Episode ${episode.episodeNumber}`;

    if (options.printUrl) {
      console.log(streamUrl);
      return;
    }

    console.log(`Opening ${title} in ${options.player} (${stream.quality || 'unknown'}p ${normalizeAudio(stream.audio).toUpperCase()})...`);
    await playInMediaPlayer(streamUrl, options.player, title, options.windowSize);
  } finally {
    await scraper.close();
  }
};

main()
  .catch((error) => {
    console.error(`\nError: ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
