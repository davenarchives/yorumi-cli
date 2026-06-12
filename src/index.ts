#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createDecipheriv } from 'node:crypto';

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
}

const rl = createInterface({ input, output });
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const getCliVersion = () => {
  try {
    const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version?: string };
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
};

const getDefaultDownloadDir = () => {
  const configured = String(process.env.YORUMI_DOWNLOAD_DIR || '').trim();
  if (configured) return resolve(configured);

  const home = homedir() || process.env.USERPROFILE || process.env.HOME || process.cwd();
  return join(home, 'Downloads', 'Yorumi');
};

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
    player: String(process.env.YORUMI_PLAYER || 'mpv'),
    windowSize: String(process.env.YORUMI_PLAYER_SIZE || '960x540'),
    outputDir: getDefaultDownloadDir(),
    printUrl: false,
    directPlay: false,
    download: false,
    copyAudio: false,
    update: false,
    uninstall: false,
    yes: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--version' || arg === '-v') {
      console.log(getCliVersion());
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

    if (arg === '--size') {
      options.windowSize = String(next || options.windowSize);
      i += 1;
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      options.outputDir = String(next || options.outputDir);
      i += 1;
      continue;
    }

    if (arg === '--print-url') {
      options.printUrl = true;
      continue;
    }

    if (arg === '--download' || arg === '-d') {
      options.download = true;
      continue;
    }

    if (arg === '--copy-audio') {
      options.copyAudio = true;
      continue;
    }

    if (arg === '--direct') {
      options.directPlay = true;
      continue;
    }

    if (arg === '--update' || arg === '-u') {
      options.update = true;
      continue;
    }

    if (arg === '--uninstall') {
      options.uninstall = true;
      continue;
    }

    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
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
  yorumi-cli -d -e 1 "Frieren"
  yorumi-cli -d -r "1-5" "Naruto"

Options:
  -e, --episode <number>   Pick an episode without prompting
  -r, --range <start-end>  Watch an episode range, for example 1-5
  -i, --anime-index <num>  Pick a search result without prompting, 1-based
  -d, --download           Download selected anime episode(s) instead of opening mpv
  -o, --output <dir>       Download output directory (default: ~/Downloads/Yorumi)
      --copy-audio         Keep source audio instead of converting to AAC
      --direct             Ask Yorumi for a direct stream URL when possible
      --print-url          Print resolved stream URL(s) and exit
  -u, --update             Update Yorumi CLI and its dependencies
      --uninstall          Remove Yorumi CLI from this machine
  -y, --yes                Skip confirmation prompts where supported
  -v, --version            Show the installed Yorumi CLI version
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
): Promise<T> => {
  if (items.length === 0) throw new Error(`No ${title.toLowerCase()} found.`);

  const externalPick = await tryExternalMenu(title, items, render);
  if (externalPick) return externalPick;

  throw new Error(
    `No ${title.toLowerCase()} selected. Install fzf or rofi to use Yorumi CLI's interactive picker.`,
  );
};

const selectEpisode = async (episodes: Episode[], requested?: number) => {
  const sorted = [...episodes].sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
  if (requested) {
    const match = sorted.find((episode) => Number(episode.episodeNumber) === requested);
    if (match) return match;
    console.log(`Episode ${requested} was not found. Showing episode picker instead.`);
  }

  return chooseFromList<Episode>(
    'Episode',
    sorted,
    (episode) => {
      const title = String(episode.title || '').trim();
      return title && !/^episode\s+\d+(?:\.\d+)?$/i.test(title)
        ? `Episode ${episode.episodeNumber} - ${title}`
        : `Episode ${episode.episodeNumber}`;
    },
  );
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

const sanitizeFilePart = (value: string) =>
  String(value || 'anime')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'anime';

const resolveFfmpegCommand = async () => {
  if (await commandExists('ffmpeg')) return 'ffmpeg';

  if (platform() !== 'win32') return null;

  const candidates = [
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
  ];

  return candidates.find((candidate) => existsSync(candidate)) || null;
};

const installFfmpegWithWinget = async (yes: boolean) => {
  if (platform() !== 'win32' || !(await commandExists('winget'))) return false;

  if (!yes) {
    const answer = (await ask('ffmpeg is required for downloads. Install it with winget now? [y/N] ')).toLowerCase();
    if (answer !== 'y' && answer !== 'yes') return false;
  }

  console.log('Installing ffmpeg with winget...');
  const result = spawnSync('winget', [
    'install',
    '--id',
    'Gyan.FFmpeg',
    '-e',
    '--accept-package-agreements',
    '--accept-source-agreements',
  ], { stdio: 'inherit' });

  return result.status === 0;
};

const requireFfmpegCommand = async (yes: boolean) => {
  const existing = await resolveFfmpegCommand();
  if (existing) return existing;

  const installed = await installFfmpegWithWinget(yes);
  if (installed) {
    const afterInstall = await resolveFfmpegCommand();
    if (afterInstall) return afterInstall;

    throw new Error('ffmpeg was installed, but your terminal PATH has not refreshed. Reopen PowerShell and run the download again.');
  }

  throw new Error('ffmpeg was not found. Install it with: winget install --id Gyan.FFmpeg -e');
};

const getFfmpegHlsExtensionArgs = (ffmpeg: string) => {
  const help = spawnSync(ffmpeg, ['-hide_banner', '-h', 'demuxer=hls'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const output = `${help.stdout || ''}\n${help.stderr || ''}`;

  if (output.includes('allowed_segment_extensions')) {
    return ['-allowed_segment_extensions', 'ALL', '-extension_picky', '0'];
  }

  return ['-allowed_extensions', 'ALL', '-extension_picky', '0'];
};

const probeHlsDurationMs = async (url: string, referer: string) => {
  try {
    const response = await fetch(url, {
      headers: {
        Referer: referer,
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return 0;

    const playlist = await response.text();
    const seconds = [...playlist.matchAll(/^#EXTINF:([\d.]+)/gim)]
      .reduce((sum, match) => sum + Number(match[1] || 0), 0);

    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
  } catch {
    return 0;
  }
};

const probeDurationMs = async (ffmpeg: string, url: string, referer: string, hlsExtensionArgs: string[]) => {
  if (/\.m3u8(?:[?#]|$)/i.test(url)) {
    const hlsDuration = await probeHlsDurationMs(url, referer);
    if (hlsDuration > 0) return hlsDuration;
  }

  const result = spawnSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'info',
    ...hlsExtensionArgs,
    '-headers',
    `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0\r\n`,
    '-i',
    url,
    '-f',
    'null',
    '-',
  ], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 15_000,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return 0;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return Math.round(((hours * 60 * 60) + (minutes * 60) + seconds) * 1000);
};

const formatClock = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

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

const resolveNpmCommand = async () => {
  if (platform() === 'win32') {
    const bundledNpm = join(dirname(process.execPath), 'npm.cmd');
    if (existsSync(bundledNpm)) return bundledNpm;
  }

  return await commandExists('npm') ? 'npm' : null;
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

// ── AllManga direct GraphQL helpers ─────────────────────────────────
const ALLMANGA_API = 'https://api.allanime.day/api';
const ALLMANGA_REFERER = 'https://allmanga.to';
const ALLMANGA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
const SEARCH_GQL = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name englishName availableEpisodes __typename}}}`;
const EPISODE_GQL = `query($showId:String! $translationType:VaildTranslationTypeEnumType! $episodeString:String!){episode(showId:$showId translationType:$translationType episodeString:$episodeString){episodeString sourceUrls}}`;
const EPISODE_QUERY_HASH = 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec';

const HEX_MAP: Record<string, string> = {
  79: 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', 70: 'H', 71: 'I', 72: 'J',
  73: 'K', 74: 'L', 75: 'M', 76: 'N', 77: 'O', 68: 'P', 69: 'Q', '6a': 'R', '6b': 'S', '6c': 'T',
  '6d': 'U', '6e': 'V', '6f': 'W', 60: 'X', 61: 'Y', 62: 'Z', 59: 'a', '5a': 'b', '5b': 'c',
  '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', 50: 'h', 51: 'i', 52: 'j', 53: 'k', 54: 'l',
  55: 'm', 56: 'n', 57: 'o', 48: 'p', 49: 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u',
  '4e': 'v', '4f': 'w', 40: 'x', 41: 'y', 42: 'z', '08': '0', '09': '1', '0a': '2', '0b': '3',
  '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9', 15: '-', 16: '.', 67: '_',
  46: '~', '02': ':', 17: '/', '07': '?', '1b': '#', 63: '[', 65: ']', 78: '@', 19: '!', '1c': '$',
  '1e': '&', 10: '(', 11: ')', 12: '*', 13: '+', 14: ',', '03': ';', '05': '=', '1d': '%',
};

const amHeaders = {
  'User-Agent': ALLMANGA_UA,
  Referer: ALLMANGA_REFERER,
  Origin: ALLMANGA_REFERER,
  Accept: '*/*',
  'Content-Type': 'application/json',
};

const amGql = async <T>(variables: Record<string, unknown>, query: string): Promise<T | null> => {
  const response = await fetch(ALLMANGA_API, {
    method: 'POST',
    headers: amHeaders,
    body: JSON.stringify({ variables, query }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`AllManga API ${response.status}`);
  return await response.json() as T;
};

const decodeAmUrl = (encoded: string) => {
  const clean = encoded.startsWith('--') ? encoded.slice(2) : encoded;
  let result = '';
  for (let i = 0; i < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2);
    result += HEX_MAP[pair] ?? pair;
  }
  return result.replace(/\\u002F/gi, '/').replace(/\\\|/g, '');
};

const normalizeClockUrl = (path: string) => {
  if (path.startsWith('//')) return `https:${path}`;
  if (path.startsWith('/')) return `https://allanime.day${path}`;
  if (/^https?:\/\//i.test(path)) return path;
  return `https://allanime.day/${path}`;
};

const followRedirects = async (url: string, maxHops = 10): Promise<string | null> => {
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    const response = await fetch(current, {
      method: 'GET',
      headers: { 'User-Agent': ALLMANGA_UA, Referer: ALLMANGA_REFERER },
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    return current;
  }
  return current;
};

type AmSource = { sourceUrl?: string; sourceName?: string; priority?: number };

const decryptTobeparsed = (blob: string): AmSource[] => {
  try {
    const raw = Buffer.from(blob, 'base64');
    const key = createHash('sha256').update('Xot36i3lK3:v1').digest();
    const iv = Buffer.concat([raw.subarray(1, 13), Buffer.from([0, 0, 0, 2])]);
    const ciphertext = raw.subarray(13, raw.length - 16);
    const decipher = createDecipheriv('aes-256-ctr', key, iv);
    const plain = decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
    try {
      const parsed = JSON.parse(plain);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.episode?.sourceUrls)) return parsed.episode.sourceUrls;
    } catch {
      const sources: AmSource[] = [];
      for (const chunk of plain.split(/[{}]/)) {
        const urlMatch = chunk.match(/"sourceUrl"\s*:\s*"(--[^"]+)"/);
        if (!urlMatch) continue;
        const nameMatch = chunk.match(/"sourceName"\s*:\s*"([^"]+)"/);
        const priorityMatch = chunk.match(/"priority"\s*:\s*([0-9.]+)/);
        sources.push({
          sourceUrl: urlMatch[1],
          sourceName: nameMatch?.[1] || '',
          priority: priorityMatch ? Number(priorityMatch[1]) : 0,
        });
      }
      if (sources.length > 0) return sources;
    }
    return [];
  } catch {
    return [];
  }
};

const parseAmSources = (payload: any): AmSource[] => {
  if (Array.isArray(payload?.data?.episode?.sourceUrls)) return payload.data.episode.sourceUrls;
  const encrypted = payload?.data?.tobeparsed || payload?.tobeparsed;
  if (encrypted) return decryptTobeparsed(encrypted);
  return [];
};

const getAmEpisodeSources = async (showId: string, episodeNumber: number, translationType: string): Promise<AmSource[]> => {
  const episodeString = String(episodeNumber);
  const candidates = episodeString.includes('.') ? [episodeString] : [episodeString, `${episodeString}.0`];
  for (const epStr of candidates) {
    try {
      // Try persisted query (GET) first
      const params = new URLSearchParams({
        variables: JSON.stringify({ showId, translationType, episodeString: epStr }),
        extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: EPISODE_QUERY_HASH } }),
      });
      const response = await fetch(`${ALLMANGA_API}?${params.toString()}`, {
        headers: { 'User-Agent': ALLMANGA_UA, Referer: ALLMANGA_REFERER, Origin: 'https://youtu-chan.com' },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) {
        const data = await response.json();
        const sources = parseAmSources(data);
        if (sources.length > 0) return sources;
      }
    } catch { /* fall through to POST */ }
    // Fallback: POST with full query
    const payload = await amGql({ showId, translationType, episodeString: epStr }, EPISODE_GQL);
    const sources = parseAmSources(payload);
    if (sources.length > 0) return sources;
  }
  return [];
};

const resolveAmSource = async (source: AmSource, audio: string): Promise<StreamLink | null> => {
  const sourceUrl = String(source.sourceUrl || '');
  if (!sourceUrl) return null;

  // Direct URL (not encoded)
  if (/^https?:\/\//i.test(sourceUrl) && !/\/clock(?:\.json)?(?:[?#]|$)/i.test(sourceUrl)) {
    return {
      quality: '720', audio, provider: 'allmanga', server: String(source.sourceName || 'allmanga'),
      url: sourceUrl, directUrl: sourceUrl, isHls: /\.m3u8(?:[?#]|$)/i.test(sourceUrl),
    };
  }

  if (!sourceUrl.startsWith('--')) return null;

  const decodedPath = decodeAmUrl(sourceUrl).replace('/clock', '/clock.json');
  const fetchUrl = normalizeClockUrl(decodedPath);

  try {
    const sourceName = String(source.sourceName || 'allmanga');
    if (/fast4speed\.rsvp/i.test(fetchUrl) || sourceName === 'Yt-mp4') {
      const finalUrl = await followRedirects(fetchUrl);
      if (!finalUrl) return null;
      return {
        quality: '720', audio, provider: 'allmanga', server: sourceName,
        url: finalUrl, directUrl: finalUrl, isHls: /\.m3u8(?:[?#]|$)/i.test(finalUrl),
      };
    }

    const response = await fetch(fetchUrl, {
      headers: { 'User-Agent': ALLMANGA_UA, Referer: ALLMANGA_REFERER },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { links?: Array<{ link?: string; resolutionStr?: string }> };
    const links = Array.isArray(data?.links) ? data.links : [];
    const best = links.filter(l => l?.link).sort((a, b) =>
      (parseInt(String(b.resolutionStr || ''), 10) || 0) - (parseInt(String(a.resolutionStr || ''), 10) || 0)
    )[0];
    if (!best?.link) return null;
    return {
      quality: String(best.resolutionStr || '').replace(/[^\d]/g, '') || '720',
      audio, provider: 'allmanga', server: sourceName,
      url: best.link, directUrl: best.link, isHls: /\.m3u8(?:[?#]|$)/i.test(best.link),
    };
  } catch {
    return null;
  }
};

const searchAnime = async (query: string): Promise<AnimeSearchResult[]> => {
  const payload = await amGql<{ data?: { shows?: { edges?: Array<{ _id?: string; name?: string; englishName?: string; availableEpisodes?: Record<string, number> }> } } }>({
    search: { allowAdult: true, allowUnknown: false, query: query.toLowerCase() },
    limit: 40, page: 1, translationType: 'sub', countryOrigin: 'ALL',
  }, SEARCH_GQL);
  const edges = payload?.data?.shows?.edges || [];
  return edges.filter(e => e?._id).map(e => {
    const subEps = Number(e.availableEpisodes?.sub || 0);
    const dubEps = Number(e.availableEpisodes?.dub || 0);
    return {
      id: `am-${e._id}`,
      title: String(e.englishName || e.name || '').trim(),
      session: `am-${e._id}`,
      episodes: Math.max(subEps, dubEps) || undefined,
    };
  }).filter(r => r.title);
};

const getEpisodes = async (animeSession: string): Promise<EpisodesPayload> => {
  const showId = String(animeSession).replace(/^am-/, '');
  // Get show info for episode count
  const showPayload = await amGql<{ data?: { show?: { availableEpisodes?: Record<string, number> } } }>(
    { _id: showId },
    `query($_id:String!){show(_id:$_id){_id availableEpisodes}}`,
  );
  const show = showPayload?.data?.show;
  const subCount = Number(show?.availableEpisodes?.sub || 0);
  const dubCount = Number(show?.availableEpisodes?.dub || 0);
  const totalEpisodes = Math.max(subCount, dubCount, 1);
  const episodes: Episode[] = [];
  for (let i = 1; i <= totalEpisodes; i++) {
    episodes.push({
      id: `${animeSession}?ep=${i}`,
      session: `${animeSession}?ep=${i}`,
      episodeNumber: i,
    });
  }
  return { episodes };
};

const getStreamReferer = (stream?: StreamLink) => {
  const streamUrl = String(stream?.url || '').trim();
  try {
    const parsed = new URL(streamUrl);
    if (/^([^/]+\.)?kwik\./i.test(parsed.host)) return `${parsed.origin}/`;
  } catch {
    // Fall back to AllManga below.
  }
  return 'https://allmanga.to/';
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
  _directPlay: boolean,
): Promise<PlayableStreamPayload> => {
  console.log(`Resolving playable stream for episode ${episode.episodeNumber}...`);
  const showId = String(anime.session).replace(/^am-/, '');
  const epNum = episode.episodeNumber;

  for (const audio of ['sub', 'dub']) {
    const sources = await getAmEpisodeSources(showId, epNum, audio);
    const orderedSources = sources
      .filter(s => s?.sourceUrl)
      .sort((a, b) => {
        const aDirect = /^https?:\/\//i.test(String(a.sourceUrl || '')) ? 1 : 0;
        const bDirect = /^https?:\/\//i.test(String(b.sourceUrl || '')) ? 1 : 0;
        return (bDirect - aDirect) || (Number(b.priority || 0) - Number(a.priority || 0));
      });

    for (const source of orderedSources) {
      const stream = await resolveAmSource(source, audio);
      if (stream && stream.directUrl) {
        return { stream, url: stream.directUrl };
      }
      if (stream && stream.url) {
        return { stream, url: stream.url };
      }
    }
  }

  throw new Error(`No playable stream found for episode ${epNum}`);
};

// ── Colored output helpers ────────────────────────────────────────
const downloadEpisode = async (
  url: string,
  outputPath: string,
  referer: string,
  overwrite: boolean,
  label: string,
  copyAudio: boolean,
) => {
  const ffmpeg = await requireFfmpegCommand(overwrite);
  const isHls = /\.m3u8(?:[?#]|$)/i.test(url);
  const hlsExtensionArgs = isHls ? getFfmpegHlsExtensionArgs(ffmpeg) : [];
  const durationMs = await probeDurationMs(ffmpeg, url, referer, hlsExtensionArgs);

  if (existsSync(outputPath) && !overwrite) {
    throw new Error(`Output already exists: ${outputPath}. Re-run with --yes to overwrite.`);
  }

  const args = [
    overwrite ? '-y' : '-n',
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostats',
    '-progress',
    'pipe:1',
    ...hlsExtensionArgs,
    '-headers',
    `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0\r\n`,
    '-i',
    url,
    '-c:v',
    'copy',
    '-c:a',
    copyAudio ? 'copy' : 'aac',
    ...(copyAudio ? ['-bsf:a', 'aac_adtstoasc'] : ['-b:a', '192k', '-ac', '2']),
    '-movflags',
    '+faststart',
    outputPath,
  ];

  await new Promise<void>((resolveDownload, reject) => {
    let lastPercent = 0;
    let lastOutTimeMs = 0;
    let lastRenderAt = 0;
    let lastRenderedText = '';
    let progressBuffer = '';
    const startedAt = Date.now();

    const renderProgress = (percent: number, outTimeMs: number, force = false) => {
      lastOutTimeMs = Math.max(lastOutTimeMs, outTimeMs);
      const elapsed = formatClock(Date.now() - startedAt);
      const mediaTime = lastOutTimeMs > 0 ? ` | media ${formatClock(lastOutTimeMs)}` : '';
      const now = Date.now();

      if (durationMs > 0) {
        lastPercent = Math.max(lastPercent, Math.min(100, Math.floor(percent)));
        const filled = Math.min(BAR_WIDTH, Math.floor((lastPercent / 100) * BAR_WIDTH));
        const text = `${label} ${lastPercent}% | elapsed ${elapsed}${mediaTime}`;
        if (!force && text === lastRenderedText && now - lastRenderAt < 500) return;
        lastRenderedText = text;
        lastRenderAt = now;
        drawBar(filled, text);
        return;
      }

      const pulse = Math.floor(((Date.now() - startedAt) / 250) % BAR_WIDTH) + 1;
      const text = `${label} downloading | elapsed ${elapsed}${mediaTime}`;
      if (!force && text === lastRenderedText && now - lastRenderAt < 500) return;
      lastRenderedText = text;
      lastRenderAt = now;
      drawBar(pulse, text);
    };

    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const progressTimer = setInterval(() => {
      if (durationMs > 0) {
        renderProgress((lastOutTimeMs / durationMs) * 100, lastOutTimeMs);
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      const syntheticPercent = Math.min(99, Math.floor(elapsedMs / 1000) % 100);
      renderProgress(Math.max(lastPercent, syntheticPercent), lastOutTimeMs);
    }, 250);

    renderProgress(0, 0, true);

    child.stdout?.on('data', (chunk) => {
      progressBuffer += chunk.toString();
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || '';

      for (const line of lines) {
        const [key, rawValue] = line.split('=');
        if (key !== 'out_time_ms' && key !== 'out_time_us') continue;

        const value = Number(rawValue);
        if (!Number.isFinite(value)) continue;

        const outTimeMs = value / 1000;
        const percent = durationMs > 0 ? (outTimeMs / durationMs) * 100 : lastPercent;
        renderProgress(percent, outTimeMs);
      }
    });

    let errorOutput = '';
    child.stderr?.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      clearInterval(progressTimer);
      if (code === 0) {
        drawBar(BAR_WIDTH, `${label} 100% | saved`);
        process.stdout.write(`\r${ERASE_LINE}`);
        console.log(fmtLabel('success', CLR.bgGreen, `${label} saved`));
        resolveDownload();
        return;
      }
      process.stdout.write(`\r${ERASE_LINE}`);
      if (errorOutput.trim()) console.error(errorOutput.trim());
      const signedCode = typeof code === 'number' && code > 0x7fffffff ? code - 0x100000000 : code;
      reject(new Error(`ffmpeg exited with code ${signedCode ?? code}.`));
    });
  });
};

const downloadEpisodes = async (
  anime: AnimeSearchResult,
  episodes: Episode[],
  resolved: PlayableStreamPayload[],
  outputDir: string,
  overwrite: boolean,
  copyAudio: boolean,
) => {
  const targetDir = resolve(outputDir);
  mkdirSync(targetDir, { recursive: true });

  for (let index = 0; index < resolved.length; index += 1) {
    const episode = episodes[index];
    const playable = resolved[index];
    const referer = getStreamReferer(playable.stream);
    const fileName = `${sanitizeFilePart(anime.title)} - E${String(episode.episodeNumber).padStart(2, '0')}.mp4`;
    const outputPath = join(targetDir, fileName);

    console.log(`Downloading episode ${episode.episodeNumber} to ${outputPath}`);
    await downloadEpisode(playable.url, outputPath, referer, overwrite, `Episode ${episode.episodeNumber}`, copyAudio);
  }

  console.log('Download complete.');
};

const removePathLater = (targetPath: string, binPath: string) => {
  if (platform() === 'win32') {
    const quotedPath = `'${targetPath.replace(/'/g, "''")}'`;
    const quotedBinPath = `'${binPath.replace(/'/g, "''")}'`;
    const script = `
Start-Sleep -Milliseconds 800
$target = ${quotedPath}
$binPath = ${quotedBinPath}
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath) {
  $normalizedBin = [System.IO.Path]::GetFullPath($binPath).TrimEnd('\\', '/')
  $nextPath = ($userPath -split ';' | Where-Object {
    if (-not $_.Trim()) { return $false }
    try {
      $entry = [Environment]::ExpandEnvironmentVariables($_.Trim().Trim('"'))
      [System.IO.Path]::GetFullPath($entry).TrimEnd('\\', '/') -ne $normalizedBin
    } catch {
      $true
    }
  }) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $nextPath, 'User')
}
Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
`;
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return;
  }

  const child = spawn('sh', ['-c', 'sleep 0.8; rm -rf -- "$1"', 'sh', targetPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
};

const getWindowsCommandShimPaths = () => {
  if (platform() !== 'win32') return [];

  const npmBin = process.env.APPDATA ? join(process.env.APPDATA, 'npm') : '';
  return [
    join(binPathFromInstallRoot(), 'yorumi-cli.cmd'),
    npmBin ? join(npmBin, 'yorumi-cli') : '',
    npmBin ? join(npmBin, 'yorumi-cli.cmd') : '',
    npmBin ? join(npmBin, 'yorumi-cli.ps1') : '',
    npmBin ? join(npmBin, 'node_modules', 'yorumi-cli') : '',
  ].filter(Boolean);
};

const binPathFromInstallRoot = () => join(resolve(getInstallRoot()), 'bin');

const removeKnownCommandShims = () => {
  for (const target of getWindowsCommandShimPaths()) {
    if (!existsSync(target)) continue;

    const stats = lstatSync(target);
    rmSync(target, { recursive: stats.isDirectory() && !stats.isSymbolicLink(), force: true });
  }
};

const uninstallYorumiCli = async (yes: boolean) => {
  const installRoot = resolve(getInstallRoot());
  const binPath = join(installRoot, 'bin');
  const totalSteps = 3;
  let step = 0;
  let filled = 0;

  console.log(`\n  ${CLR.magenta}yorumi-cli uninstall${CLR.reset}\n`);

  if (!installRoot.endsWith('YorumiCLI')) {
    throw new Error(`Refusing to uninstall unexpected path: ${installRoot}`);
  }

  if (!existsSync(installRoot)) {
    console.log(fmtLabel('warning', CLR.bgYellow, `Yorumi CLI is not installed at ${installRoot}`));
    return;
  }

  if (!yes) {
    const answer = (await ask(`Remove Yorumi CLI from ${installRoot}? Type "yes" to continue: `)).toLowerCase();
    if (answer !== 'yes') {
      console.log(fmtLabel('warning', CLR.bgYellow, 'Uninstall cancelled.'));
      return;
    }
  }

  drawBar(filled, 'Checking installation...');
  step++;
  filled = await animateBar(filled, step, totalSteps, 'Checking installation');
  msgAbove(filled, 'Checking installation', fmtLabel('success', CLR.bgGreen, 'Yorumi CLI installation found'));

  drawBar(filled, 'Starting cleanup helper...');
  removeKnownCommandShims();
  removePathLater(installRoot, binPath);
  step++;
  filled = await animateBar(filled, step, totalSteps, 'Starting cleanup helper');
  msgAbove(filled, 'Starting cleanup helper', fmtLabel('success', CLR.bgGreen, 'Cleanup helper started'));

  step++;
  filled = await animateBar(filled, step, totalSteps, 'Complete');
  process.stdout.write(`\r${ERASE_LINE}`);
  console.log('');
  console.log(fmtLabel('success', CLR.bgGreen, 'Uninstall complete!'));
  console.log(fmtLabel('note', CLR.bgGray, 'Close and reopen your terminal to refresh PATH.'));
  console.log('');
};

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
  const columns = process.stdout.columns || 100;
  const label = ` | ${text}`;
  const barWidth = Math.min(BAR_WIDTH, Math.max(10, columns - label.length - 16));
  const normalizedFilled = Math.max(0, Math.min(barWidth, Math.round((filled / BAR_WIDTH) * barWidth)));
  const pct = Math.floor((Math.max(0, Math.min(BAR_WIDTH, filled)) / BAR_WIDTH) * 100);
  const useAscii = /^(1|true|yes)$/i.test(String(process.env.YORUMI_ASCII_PROGRESS || ''));
  const filledChar = useAscii ? '#' : '█';
  const emptyChar = useAscii ? '-' : '░';
  const bar = filledChar.repeat(normalizedFilled) + emptyChar.repeat(barWidth - normalizedFilled);
  process.stdout.write(`\r${ERASE_LINE}  [${bar}] ${CLR.green}${String(pct).padStart(3)}%${CLR.reset}${label}`);
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
    console.log(fmtLabel('note', CLR.bgGray, 'Please rerun the installer to install the latest version.'));
    return;
  }

  if (!existsSync(join(repoDir, '.git')) || !(await commandExists('git'))) {
    console.log(fmtLabel('warning', CLR.bgYellow, 'This install cannot update with git pull.'));
    console.log(fmtLabel('note', CLR.bgGray, 'Rerun the installer to download the latest version.'));
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
  const npmCommand = await resolveNpmCommand();
  if (!npmCommand) {
    msgAbove(filled, 'Installing CLI dependencies', fmtLabel('error', CLR.bgRed, 'npm was not found.'));
    return;
  }

  spawnSync(npmCommand, ['install', '--loglevel=error'], { cwd: repoDir, stdio: 'pipe' });
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

  if (options.uninstall) {
    await uninstallYorumiCli(options.yes);
    return;
  }

  const query = options.query || await ask('Search anime: ');
  if (!query) {
    printHelp();
    return;
  }

  console.log(`Searching Yorumi for "${query}"...`);
  const results = await searchAnime(query);
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
  const episodePayload = await getEpisodes(anime.session);
  const selectedEpisodes = options.range
    ? parseEpisodeRange(options.range, episodePayload.episodes)
    : [await selectEpisode(episodePayload.episodes, options.episode)];
  if (selectedEpisodes.length === 0) throw new Error('No episode selected.');

  const resolved = [];
  for (const episode of selectedEpisodes) {
    resolved.push(await resolveEpisodeStreamUrl(anime, episode, options.directPlay));
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

  if (options.download) {
    await downloadEpisodes(anime, selectedEpisodes, resolved, options.outputDir, options.yes, options.copyAudio);
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
