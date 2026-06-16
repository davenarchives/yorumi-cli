import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { StreamLink } from './types.js';
import { commandExists } from './utils.js';
const GENERIC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const resolvePlayerCommand = async (player: string) => {
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

export const getStreamReferer = (stream?: StreamLink) => {
  const streamUrl = String(stream?.url || '').trim();
  try {
    const parsed = new URL(streamUrl);
    if (/(^|\.)googlevideo\.com$/i.test(parsed.hostname)) return 'https://www.youtube.com/';
    if (/(^|\.)mp4upload\.com$/i.test(parsed.hostname)) return 'https://www.mp4upload.com/';
    if (/^([^/]+\.)?kwik\./i.test(parsed.host)) return `${parsed.origin}/`;
    if (stream?.provider === 'allmanga') return 'https://allmanga.to/';
  } catch {
    // Fall back below
  }
  return 'https://allmanga.to/';
};

export const getStreamOrigin = (referer: string) => {
  if (referer === 'https://allmanga.to/') return 'https://allmanga.to';
  return referer.replace(/\/$/, '');
};

export const playInMediaPlayer = async (urls: string[], player: string, title: string, size: string, referer: string) => {
  const playerCommand = await resolvePlayerCommand(player);
  if (!playerCommand) {
    console.error(`${player} was not found, so no media-player popup can be opened.`);
    console.error('Install mpv, then reopen your terminal: winget install mpv');
    console.error('Or pass the player path: yorumi-cli -p "C:\\Path\\To\\mpv.exe" "Frieren"');
    console.error(`Resolved stream URL: ${urls[0] || ''}`);
    return;
  }

  const origin = getStreamOrigin(referer);

  const args = [
    '--force-window=yes',
    '--fullscreen=no',
    `--geometry=${size}+50%+50%`,
    '--autofit-larger=70%x70%',
    '--keepaspect=yes',
    `--title=${title}`,
    '--msg-level=ffmpeg/demuxer=info,demux=info,cplayer=info',
  ];

  // Only force custom HTTP headers if it's a direct raw stream or wixmp.
  // Passing these headers for iframes overrides yt-dlp and breaks it.
  const isDirect = /wixmp\.com/i.test(urls[0] || '') ||
                   /allanime\.day/i.test(urls[0] || '') ||
                   /googlevideo\.com/i.test(urls[0] || '') ||
                   /megaplay\.su/i.test(urls[0] || '');
                   
  args.push('--hls-bitrate=max'); // Force highest quality for all HLS streams
  
  if (isDirect) {
    args.push('--no-ytdl');
    args.push(`--referrer=${referer}`);
    args.push(`--user-agent=${GENERIC_UA}`);
  } else {
    if (!(await commandExists('yt-dlp'))) {
      console.error('\n[Error] yt-dlp is required to play this stream but was not found.');
      console.error('Please install it using: winget install yt-dlp.yt-dlp');
      console.error('After installation, restart your terminal to update the PATH.');
      return;
    }
    args.push('--ytdl-format=bestvideo[height<=?720]+bestaudio/best');
    // Important: Pass referer and user-agent to yt-dlp so it doesn't get blocked.
    // We must use the explicit 'referer' and 'user-agent' yt-dlp arguments instead to pass both!
    const safeUa = GENERIC_UA.replace(/,/g, '');
    args.push(`--ytdl-raw-options=referer=${referer},user-agent=${safeUa}`);
  }

  args.push(...urls);
  const child = spawn(playerCommand, args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: false,
  });

  let stderrOutput = '';
  child.stderr?.on('data', (chunk) => {
    stderrOutput += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    // Increase timeout to 5 seconds to catch stream resolution failures from yt-dlp
    const timer = setTimeout(resolve, 5000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code && code !== 0) {
        const errStr = stderrOutput.trim() ? `\nMPV Error Output:\n${stderrOutput.trim()}` : '';
        reject(new Error(`${playerCommand} exited with code ${code}.${errStr}`));
        return;
      }
      resolve();
    });
  });

  child.unref();
};
