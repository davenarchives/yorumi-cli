#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
  outputDir: string;
  printUrl: boolean;
  directPlay: boolean;
  download: boolean;
  update: boolean;
  uninstall: boolean;
  yes: boolean;
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
    outputDir: 'downloads',
    printUrl: false,
    directPlay: false,
    download: false,
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
  -o, --output <dir>       Download output directory (default: downloads)
      --direct             Ask Yorumi for a direct stream URL when possible
      --print-url          Print resolved stream URL(s) and exit
  -u, --update             Update Yorumi CLI and its dependencies
      --uninstall          Remove Yorumi CLI from this machine
  -y, --yes                Skip confirmation prompts where supported
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
const downloadEpisode = async (
  url: string,
  outputPath: string,
  referer: string,
  overwrite: boolean,
) => {
  const ffmpeg = await requireFfmpegCommand(overwrite);
  const isHls = /\.m3u8(?:[?#]|$)/i.test(url);

  if (existsSync(outputPath) && !overwrite) {
    throw new Error(`Output already exists: ${outputPath}. Re-run with --yes to overwrite.`);
  }

  const args = [
    overwrite ? '-y' : '-n',
    ...(isHls ? ['-allowed_extensions', 'ALL'] : []),
    '-headers',
    `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0\r\n`,
    '-i',
    url,
    '-c',
    'copy',
    '-bsf:a',
    'aac_adtstoasc',
    outputPath,
  ];

  await new Promise<void>((resolveDownload, reject) => {
    const child = spawn(ffmpeg, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolveDownload();
        return;
      }
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
    await downloadEpisode(playable.url, outputPath, referer, overwrite);
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

  if (options.download) {
    await downloadEpisodes(anime, selectedEpisodes, resolved, options.outputDir, options.yes);
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
