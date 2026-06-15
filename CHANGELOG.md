# Changelog

All notable changes to the Yorumi CLI project will be documented in this file.

## [2.0.0] - 2026-06-15

### Added
- **Direct AllAnime (AllManga) API Scraper Integration**: Bypassed GogoAnime's browser-emulation scraping and Vercel proxy requirements. The CLI now queries the AllAnime backend via optimized GraphQL requests.
- **Silent On-the-Fly Decryption**: Integrated native Node.js decryption logic using `aes-256-ctr` to decode AllAnime's encrypted `"tobeparsed"` stream blocks and resolve direct, playable `.m3u8` playlist files.
- **GraphQL-based Search Fallback**: Implemented an automated search pipeline. If GogoAnime's search fails due to Cloudflare anti-bot blocks (yielding 0 results), the CLI automatically falls back to AllAnime's GraphQL API search.
- **Robust Direct Stream Headers**: Added automatic `--referrer` injection and custom HTTP header overrides for Direct streams in `mpv`.

### Changed
- **Architectural Refactor & Code Modularization**: Deconstructed the monolithic CLI architecture into clean, decoupled, single-responsibility modules (`src/allanime.ts`, `src/gogoanime.ts`, `src/player.ts`, `src/downloader.ts`, `src/scraper.ts`, `src/system.ts`, `src/cliUtils.ts`, `src/constants.ts`, `src/types.ts`, `src/utils.ts`).

### Fixed
- **Instant Media Player Playback (`mpv` Code 2 Errors)**: Fixed the frequent "exited with code 2" errors by automatically appending `--no-ytdl` to direct AllAnime HLS `.m3u8` streams. This completely disables unnecessary `youtube-dl` / `yt-dlp` parsing checks, making video streams load instantly.
- **Strict Episode List Mapping (Naruto 1000+ Eps Bug)**: Resolved the episode list overflow bug where sidebar recent releases (e.g., One Piece episodes) were incorrectly counted towards the selected show's total episodes. Scraper regexes are now strictly constrained to the chosen anime's slug.
- **Search Failures on Cloudflare-Blocked Titles**: Fixed "No anime found" errors on titles heavily protected by Cloudflare by resolving them transparently via AllAnime's API search.
