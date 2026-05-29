#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';

interface AnimeSearchResult {
  id: string | number;
  title: string;
  session: string;
  year?: string | number;
  episodes?: number;
}

interface Episode {
  id: string;
  session: string;
  episodeNumber: number;
  title?: string;
}

interface StreamLink {
  quality: string;
  audio: string;
  provider?: string;
  server?: string;
  url: string;
  directUrl?: string;
  isHls?: boolean;
}

interface EpisodesPayload {
  episodes: Episode[];
  lastPage?: number;
}

interface PlayableStreamPayload {
  stream: StreamLink;
  url: string;
}

interface CliOptions {
  query: string;
  animeIndex?: number;
  episode?: number;
  range?: string;
  apiBase: string;
  player: string;
  windowSize: string;
  printUrl: boolean;
  directPlay: boolean;
  update: boolean;
}

const rl = createInterface({ input, output });
const DEFAULT_API_BASE = 'https://yorumi-sigma.vercel.app/api';

const getInstallRoot = () => {
  if (platform() === 'win32') {
    return join(process.env.LOCALAPPDATA || process.env.USERPROFILE || '', 'YorumiCLI');
  }

  return join(process.env.XDG_DATA_HOME || join(process.env.HOME || '', '.local', 'share'), 'YorumiCLI');
};

const parseArgs = (argv: string[]): CliOptions => {
  const queryParts: string[] = [];
  const options: CliOptions = {
    query: '',
    apiBase: String(process.env.YORUMI_API_URL || DEFAULT_API_BASE).replace(/\/+$/, ''),
    player: String(process.env.YORUMI_PLAYER || 'mpv'),
    windowSize: String(process.env.YORUMI_PLAYER_SIZE || '960x540'),
    printUrl: false,
    directPlay: false,
    update: false,
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

    if (arg === '--range' || arg === '-r') {
      options.range = String(next || '').trim();
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

    if (arg === '--direct' || arg === '-d') {
      options.directPlay = true;
      continue;
    }

    if (arg === '--update' || arg === '-u') {
      options.update = true;
      continue;
    }

    queryParts.push(arg);
  }

  options.query = queryParts.join(' ').trim();
  return options;
};

const printHelp = () => {
  console.log(`
▄▄ ▄▄  ▄▄▄  ▄▄▄▄  ▄▄ ▄▄ ▄▄   ▄▄ ▄▄      ▄▄▄▄ ▄▄    ▄▄
▀███▀ ██▀██ ██▄█▄ ██ ██ ██▀▄▀██ ██ ▄▄▄ ██▀▀▀ ██    ██
  █   ▀███▀ ██ ██ ▀███▀ ██   ██ ██     ▀████ ██▄▄▄ ██

Yorumi CLI - terminal anime watcher powered by Yorumi + mpv

Usage:
  yorumi-cli [anime title] [options]

Quick Start:
  yorumi-cli
  yorumi-cli "Frieren"
  yorumi-cli -e 1 "Frieren"
  yorumi-cli -r "1-5" "Naruto"

Examples:
  yorumi-cli "One Piece"
  yorumi-cli --episode 1 "Frieren"
  yorumi-cli --range "1-5" "Naruto"
  yorumi-cli "Frieren" --size 854x480
  yorumi-cli "Frieren" --print-url

Options:
  -e, --episode <number>   Pick an episode without prompting
  -r, --range <start-end>  Watch an episode range, for example 1-5
  -i, --anime-index <num>  Pick a search result without prompting, 1-based
  -p, --player <command>   Media player command, defaults to mpv
  --api-base <url>         Yorumi API URL, defaults to https://yorumi-sigma.vercel.app/api
  --size <WxH>             Player window size, defaults to 960x540
  --print-url              Print the selected stream URL instead of launching mpv
  -d, --direct             Kept for compatibility; mpv playback already uses direct streams
  -u, --update             Update Yorumi CLI and its dependencies
  -h, --help               Show this help
`);
};

const ask = async (question: string) => (await rl.question(question)).trim();

const tryExternalMenu = async <T>(
  title: string,
  items: T[],
  render: (item: T, index: number) => string,
): Promise<T | null> => {
  const labels = items.map((item, index) => `${index + 1}. ${render(item, index)}`);

  if (await commandExists('fzf')) {
    const result = spawnSync('fzf', ['--prompt', `${title}> `, '--height', '40%', '--border', '--layout=default'], {
      input: labels.join('\n'),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const selected = String(result.stdout || '').trim();
    const index = Number(selected.match(/^(\d+)\./)?.[1]) - 1;
    return Number.isInteger(index) && index >= 0 && index < items.length ? items[index] : null;
  }

  if (await commandExists('rofi')) {
    const result = spawnSync('rofi', ['-dmenu', '-i', '-p', title], {
      input: labels.join('\n'),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const selected = String(result.stdout || '').trim();
    const index = Number(selected.match(/^(\d+)\./)?.[1]) - 1;
    return Number.isInteger(index) && index >= 0 && index < items.length ? items[index] : null;
  }

  return null;
};

const chooseFromList = async <T>(
  title: string,
  items: T[],
  render: (item: T, index: number) => string,
  defaultIndex = 0,
): Promise<T> => {
  if (items.length === 0) throw new Error(`No ${title.toLowerCase()} found.`);

  const externalPick = await tryExternalMenu(title, items, render);
  if (externalPick) return externalPick;

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

const parseEpisodeRange = (range: string, episodes: Episode[]) => {
  const match = String(range || '').trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (!match) throw new Error('Invalid range. Use a format like 1-5.');

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) {
    throw new Error('Invalid range. Start must be lower than or equal to end.');
  }

  const selected = [...episodes]
    .sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber))
    .filter((episode) => {
      const number = Number(episode.episodeNumber);
      return Number.isFinite(number) && number >= start && number <= end;
    });

  if (selected.length === 0) throw new Error(`No episodes found in range ${range}.`);
  return selected;
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

const apiGet = async <T>(apiBase: string, path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> => {
  const url = new URL(`${apiBase}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim();
    try {
      const payload = await response.json() as { error?: string; message?: string };
      message = payload.error || payload.message || message;
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    throw new Error(message);
  }

  return await response.json() as T;
};

const searchAnime = (apiBase: string, query: string) => {
  return apiGet<AnimeSearchResult[]>(apiBase, '/scraper/search/animepahe', { q: query });
};

const getEpisodes = (apiBase: string, animeSession: string) => {
  return apiGet<EpisodesPayload>(apiBase, '/scraper/episodes', { session: animeSession });
};

const getStreamReferer = (stream?: StreamLink) => {
  const streamUrl = String(stream?.url || '').trim();
  try {
    const parsed = new URL(streamUrl);
    if (/^([^/]+\.)?kwik\./i.test(parsed.host)) return `${parsed.origin}/`;
  } catch {
    // Fall back to AnimePahe below.
  }
  return 'https://animepahe.pw/';
};

const playInMediaPlayer = async (urls: string[], player: string, title: string, size: string, referer: string) => {
  const playerCommand = await resolvePlayerCommand(player);
  if (!playerCommand) {
    console.error(`${player} was not found, so no media-player popup can be opened.`);
    console.error('Install mpv, then reopen your terminal: winget install mpv');
    console.error('Or pass the player path: yorumi-cli -p "C:\\Path\\To\\mpv.exe" "Frieren"');
    console.error(`Resolved stream URL: ${urls[0] || ''}`);
    return;
  }

  const args = [
    '--no-ytdl',
    '--force-window=yes',
    '--fullscreen=no',
    `--geometry=${size}+50%+50%`,
    '--autofit-larger=70%x70%',
    '--keepaspect=yes',
    `--title=${title}`,
    '--msg-level=ffmpeg/demuxer=info,demux=info,cplayer=info',
    `--referrer=${referer}`,
    `--http-header-fields=Referer: ${referer}`,
    ...urls,
  ];
  const child = spawn(playerCommand, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 1200);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code && code !== 0) {
        reject(new Error(`${playerCommand} exited with code ${code}.`));
        return;
      }
      resolve();
    });
  });

  child.unref();
};

const resolveEpisodeStreamUrl = async (
  anime: AnimeSearchResult,
  episode: Episode,
  apiBase: string,
  _directPlay: boolean,
) => {
  console.log(`Resolving playable stream for episode ${episode.episodeNumber}...`);
  return await apiGet<PlayableStreamPayload>(apiBase, '/scraper/playable-stream', {
    anime_session: anime.session,
    ep_session: episode.session,
    direct: 1,
  });
};

// ── Colored output helpers ────────────────────────────────────────
const CLR = {
  reset: '\x1b[0m',
  black: '\x1b[30m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  bgGreen: '\x1b[42m',
  bgCyan: '\x1b[46m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  bgGray: '\x1b[100m',
  white: '\x1b[1;37m',
};

const ERASE_LINE = '\x1b[2K';
const BAR_WIDTH = 40;

const fmtLabel = (tag: string, bg: string, msg: string) =>
  `  ${CLR.black}${bg} ${tag} ${CLR.reset}  ${msg}`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Draws the progress bar in-place on the current line (no newline). */
const drawBar = (filled: number, text: string) => {
  const pct = Math.floor((filled / BAR_WIDTH) * 100);
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
  process.stdout.write(`\r${ERASE_LINE}  [${bar}] ${CLR.green}${String(pct).padStart(3)}%${CLR.reset} | ${text}`);
};

/** Clears the bar line, prints a message above, then redraws the bar. */
const msgAbove = (filled: number, barText: string, msg: string) => {
  process.stdout.write(`\r${ERASE_LINE}`);
  console.log(msg);
  drawBar(filled, barText);
};

/** Smoothly animates the bar from current fill to the target step. */
const animateBar = async (fromFilled: number, targetStep: number, totalSteps: number, text: string) => {
  const target = Math.floor(BAR_WIDTH * targetStep / totalSteps);
  let current = fromFilled;
  while (current < target) {
    current++;
    drawBar(current, text);
    await sleep(18);
  }
  return current;
};

const updateYorumiCli = async () => {
  const installRoot = getInstallRoot();
  const repoDir = join(installRoot, 'repo');

  const totalSteps = 3;
  let step = 0;
  let filled = 0;

  console.log(`\n  ${CLR.magenta}yorumi-cli update${CLR.reset}\n`);

  if (!existsSync(repoDir)) {
    console.log(fmtLabel('error', CLR.bgRed, 'YorumiCLI installation not found at ' + installRoot));
    console.log(fmtLabel('note', CLR.bgGray, 'Please run git pull manually in your installation folder.'));
    return;
  }

  // Step: Pull CLI repo
  drawBar(filled, 'Pulling CLI repository...');
  const repoPull = spawnSync('git', ['pull', '--ff-only'], { cwd: repoDir, encoding: 'utf8', stdio: 'pipe' });
  step++;
  filled = await animateBar(filled, step, totalSteps, 'Pulling CLI repository');
  if (repoPull.error || repoPull.status !== 0) {
    msgAbove(filled, 'Pulling CLI repository', fmtLabel('error', CLR.bgRed, 'Failed to update Yorumi CLI repo.'));
  } else {
    const out = String(repoPull.stdout || '').trim();
    const msg = out.includes('Already up to date') ? 'Yorumi CLI is already up-to-date' : 'CLI repo updated';
    msgAbove(filled, 'Pulling CLI repository', fmtLabel('success', CLR.bgGreen, msg));
  }

  // Step: Install CLI deps
  drawBar(filled, 'Installing CLI dependencies...');
  spawnSync('npm', ['install', '--loglevel=error'], { cwd: repoDir, stdio: 'pipe' });
  step++;
  filled = await animateBar(filled, step, totalSteps, 'Installing CLI dependencies');
  msgAbove(filled, 'Installing CLI dependencies', fmtLabel('success', CLR.bgGreen, 'CLI dependencies installed'));

  // Done
  step++;
  filled = await animateBar(filled, step, totalSteps, 'Complete');
  process.stdout.write(`\r${ERASE_LINE}`);
  console.log('');
  console.log(fmtLabel('success', CLR.bgGreen, 'Update complete!'));
  console.log('');
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (options.update) {
    await updateYorumiCli();
    return;
  }

  const query = options.query || await ask('Search anime: ');
  if (!query) {
    printHelp();
    return;
  }

  console.log(`Searching AnimePahe for "${query}"...`);
  const results = await searchAnime(options.apiBase, query);
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
  const episodePayload = await getEpisodes(options.apiBase, anime.session);
  const selectedEpisodes = options.range
    ? parseEpisodeRange(options.range, episodePayload.episodes)
    : [await selectEpisode(episodePayload.episodes, options.episode)];
  if (selectedEpisodes.length === 0) throw new Error('No episode selected.');

  const resolved = [];
  for (const episode of selectedEpisodes) {
    resolved.push(await resolveEpisodeStreamUrl(anime, episode, options.apiBase, options.directPlay));
  }

  const streamUrls = resolved.map((item) => item.url);
  const firstStream = resolved[0]?.stream;
  const title = selectedEpisodes.length > 1
    ? `${anime.title} Episodes ${selectedEpisodes[0].episodeNumber}-${selectedEpisodes[selectedEpisodes.length - 1].episodeNumber}`
    : `${anime.title} Episode ${selectedEpisodes[0].episodeNumber}`;

  if (options.printUrl) {
    streamUrls.forEach((url) => console.log(url));
    return;
  }

  const referer = getStreamReferer(firstStream);
  console.log(`Opening ${title} in ${options.player} (${firstStream?.quality || 'unknown'}p ${normalizeAudio(firstStream?.audio).toUpperCase()})...`);
  await playInMediaPlayer(streamUrls, options.player, title, options.windowSize, referer);
};

main()
  .catch((error) => {
    console.error(`\nError: ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
