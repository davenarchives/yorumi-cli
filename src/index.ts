#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PACKAGE_ROOT } from './constants.js';
import { ask, chooseFromList, selectEpisode, parseEpisodeRange, normalizeAudio } from './utils.js';
import { getPopularAnime } from './api.js';
import { gogoAnimeScraper } from './gogoanime.js';
import { resolveEpisodeStreamUrl } from './scraper.js';
import { searchAllAnime } from './allanime.js';
import { playInMediaPlayer, getStreamReferer } from './player.js';
import { downloadEpisodes } from './downloader.js';
import { updateYorumiCli, uninstallYorumiCli } from './system.js';
import { CliOptions, AnimeSearchResult } from './types.js';

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
  if (configured) return configured;
  const home = homedir() || process.env.USERPROFILE || process.env.HOME || process.cwd();
  return join(home, 'Downloads', 'Yorumi');
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
      --sub                Prefer SUBbed audio
      --dub                Prefer DUBbed audio
  -l, --latest             Show the top latest updated anime
  -p, --popular            Show the top trending anime
  -u, --update             Update Yorumi CLI and its dependencies
      --uninstall          Remove Yorumi CLI from this machine
  -y, --yes                Skip confirmation prompts where supported
  -v, --version            Show the installed Yorumi CLI version
  -h, --help               Show this help
`);
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
    latest: false,
    popular: false,
    sub: false,
    dub: false,
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
    if (arg === '--player') {
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
    if (arg === '--print-url') { options.printUrl = true; continue; }
    if (arg === '--download' || arg === '-d') { options.download = true; continue; }
    if (arg === '--copy-audio') { options.copyAudio = true; continue; }
    if (arg === '--direct') { options.directPlay = true; continue; }
    if (arg === '--update' || arg === '-u') { options.update = true; continue; }
    if (arg === '--uninstall') { options.uninstall = true; continue; }
    if (arg === '--latest' || arg === '-l') { options.latest = true; continue; }
    if (arg === '--popular' || arg === '-p') { options.popular = true; continue; }
    if (arg === '--sub') { options.sub = true; continue; }
    if (arg === '--dub') { options.dub = true; continue; }
    if (arg === '--yes' || arg === '-y') { options.yes = true; continue; }
    queryParts.push(arg);
  }

  options.query = queryParts.join(' ').trim();
  return options;
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

  let results: AnimeSearchResult[] = [];
  if (options.latest) {
    console.log('Fetching latest anime...');
    results = await gogoAnimeScraper.getLatest();
  } else if (options.popular) {
    console.log('Fetching popular anime...');
    results = await gogoAnimeScraper.getPopular();
  } else {
    const query = options.query || await ask('Search anime: ');
    if (!query) {
      printHelp();
      return;
    }
    console.log(`Searching Yorumi for "${query}"...`);
    results = await gogoAnimeScraper.search(query);
    if (results.length === 0) {
      results = await searchAllAnime(query);
    }
  }

  const visibleResults = results.slice(0, 15);
  if (visibleResults.length === 0) throw new Error('No anime found.');

  const requestedAnimeIndex = Number(options.animeIndex || 0);
  let anime = requestedAnimeIndex > 0 && requestedAnimeIndex <= visibleResults.length
    ? visibleResults[requestedAnimeIndex - 1]
    : await chooseFromList<AnimeSearchResult>(
      'Anime',
      visibleResults,
      (item) => `${item.title}${item.year ? ` (${item.year})` : ''}${item.episodes ? ` - ${item.episodes} eps` : ''}`,
    );

  console.log(`Fetching episodes for ${anime.title}...`);
  let episodePayload;
  if (anime.session.startsWith('allanime:')) {
    const showId = anime.session.replace('allanime:', '');
    const maxEp = anime.episodes || 1;
    const episodes = [];
    for (let i = 1; i <= maxEp; i++) {
      episodes.push({
        id: `allanime:${showId}-ep-${i}`,
        session: `allanime:${showId}-ep-${i}`,
        episodeNumber: i
      });
    }
    episodePayload = { episodes };
  } else {
    episodePayload = await gogoAnimeScraper.getEpisodes(anime.session);
  }
  const selectedEpisodes = options.range
    ? parseEpisodeRange(options.range, episodePayload.episodes)
    : [await selectEpisode(episodePayload.episodes, options.episode)];
  
  if (selectedEpisodes.length === 0) throw new Error('No episode selected.');

  const resolved = [];
  for (const episode of selectedEpisodes) {
    resolved.push(await resolveEpisodeStreamUrl(anime, episode, options.directPlay, options.sub, options.dub));
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
    process.exit();
  });
