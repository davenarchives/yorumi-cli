/**
 * GogoAnime Scraper
 *
 * Scrapes stream sources from gogoanime.is (no Cloudflare challenge, direct HTTP 200).
 *
 * Flow:
 *  1. search(title)        → /search.html?keyword=…  → list of {title, slug}
 *  2. getAnimeId(slug)     → /category/{slug}         → movie_id + alias
 *  3. getEpisodeSlug(alias, epNum) → /{alias}-episode-{N} → episode page
 *  4. getEmbedUrl(episodePage)     → parse iframe src         → embed URL
 *  5. Returned as StreamLink with isHls=false (iframe embed)
 */

import type { AmSource } from './api.js';

import { fetchAllAnimeStreams } from './allanime.js';

const BASE_URL = 'https://www.gogoanime.is';
const EMBED_HOST = 'https://gogoanime.me.uk';
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 15_000;
const PROVIDER_NAME = 'gogoanime';

type SearchResult = { title: string; slug: string };
type AnimeInfo = { movieId: string; alias: string };

// ---------------------------------------------------------------------------
// Minimal HTML parser helpers (no cheerio dependency)
// ---------------------------------------------------------------------------

function extractAttr(html: string, pattern: RegExp): string {
    return html.match(pattern)?.[1]?.trim() ?? '';
}

function extractAll(html: string, pattern: RegExp): RegExpMatchArray[] {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const re = new RegExp(pattern.source, flags);
    return [...html.matchAll(re)];
}

function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

async function fetchHtml(path: string, referer?: string): Promise<string> {
    const url = path.startsWith('http') ? path : BASE_URL + path;
    const response = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            ...(referer ? { 'Referer': referer } : {})
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
}

/**
 * Search for anime by title and return slug candidates.
 */
async function searchAnime(query: string): Promise<SearchResult[]> {
    const url = `/search.html?keyword=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);

    // Pattern: <a href="/category/naruto-shippuden" title="Naruto Shippuden">
    const matches = extractAll(
        html,
        /href="\/category\/([^"]+)"\s+title="([^"]+)"/
    );

    const seen = new Set<string>();
    const results = [];
    for (const m of matches) {
        const slug = m[1];
        if (seen.has(slug)) continue;
        seen.add(slug);
        
        // Also try to extract release year if available nearby
        // The HTML structure usually has <p class="released">Released: 2002</p> after the a tag
        const title = decodeHtmlEntities(m[2]);
        results.push({ slug, title });
    }
    return results;
}

/**
 * Get the movie ID and alias from a category page (needed for episode slugs).
 */
async function getAnimeInfo(slug: string): Promise<AnimeInfo | null> {
    try {
        const html = await fetchHtml(`/category/${slug}`, BASE_URL + '/');
        const movieId = extractAttr(html, /id="movie_id"[^>]*value="([^"]+)"/);
        const alias = extractAttr(html, /id="alias_anime"[^>]*value="([^"]+)"/);
        if (!alias) return null;
        return { movieId, alias };
    } catch {
        return null;
    }
}

/**
 * Get the embed iframe URL from a specific episode page.
 */
async function getEpisodeEmbedUrl(
    alias: string,
    episodeNumber: number
): Promise<string | null> {
    try {
        const epSlug = `${alias}-episode-${episodeNumber}`;
        const html = await fetchHtml(`/${epSlug}`, BASE_URL + '/');

        // Pattern: src="https://gogoanime.me.uk/newplayer.php?id=naruto-677?ep=12352&type=hd-1&category=sub"
        // Rewrite gogoanime.me.uk to vidstreaming.io so yt-dlp natively recognizes the extractor
        const embedMatch = html.match(/src="(https?:\/\/gogoanime\.me\.uk\/newplayer\.php[^"]+)"/);
        if (embedMatch) {
            return embedMatch[1].replace('gogoanime.me.uk/newplayer.php', 'vidstreaming.io/streaming.php');
        }

        // Fallback: parse data-video attribute from server buttons
        const dataVideoMatch = html.match(/data-video="(https?:\/\/gogoanime\.me\.uk\/newplayer\.php[^"]+)"/);
        if (dataVideoMatch) {
            return dataVideoMatch[1].replace('gogoanime.me.uk/newplayer.php', 'vidstreaming.io/streaming.php');
        }

        return null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Title similarity scoring
// ---------------------------------------------------------------------------

function normalizeStr(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function titleScore(candidate: string, targets: string[]): number {
    const norm = normalizeStr(candidate);
    let best = 0;
    for (const t of targets) {
        const nt = normalizeStr(t);
        if (!nt || nt.length < 2) continue;
        if (norm === nt) { best = Math.max(best, 100); continue; }
        if (norm.includes(nt) || nt.includes(norm)) { best = Math.max(best, 70); continue; }
        // Prefix match
        const minLen = Math.min(norm.length, nt.length);
        if (minLen >= 4 && norm.slice(0, minLen) === nt.slice(0, minLen)) {
            best = Math.max(best, 50);
        }
    }
    return best;
}

function pickBestSlug(results: SearchResult[], titles: string[]): string | null {
    if (results.length === 0) return null;
    const scored = results.map((r) => ({ r, score: titleScore(r.title, titles) }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.score < 40) return null; // no confident match
    return best.r.slug;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GogoAnimeStreamOptions {
    /** All title variants to try (english, romaji, native) */
    titles: string[];
    episodeNumber: number;
    /** Override slug if already known (avoids extra search request) */
    knownSlug?: string;
}

export class GogoAnimeScraper {
    /** Check if a session string is a GogoAnime slug */
    static isGogoAnimeSession(session: string): boolean {
        return /^gogo:[a-z0-9-]+$/i.test(String(session ?? '').trim());
    }

    /** Encode a slug as a session identifier */
    static toSession(slug: string): string {
        return `gogo:${slug}`;
    }

    /** Decode a session identifier back to a slug */
    static fromSession(session: string): string | null {
        const match = String(session ?? '').trim().match(/^gogo:([a-z0-9-]+)$/i);
        return match ? match[1] : null;
    }

    /**
     * Search for anime using GogoAnime.
     */
    async search(query: string) {
        const results = await searchAnime(query);
        return results.map(r => ({
            id: r.slug,
            session: GogoAnimeScraper.toSession(r.slug),
            title: r.title,
            name: r.title
        }));
    }

    /**
     * Get episode list for a specific GogoAnime session
     */
    async getEpisodes(session: string) {
        const slug = GogoAnimeScraper.fromSession(session) || session.replace(/^gogo:/, '');
        const html = await fetchHtml(`/category/${slug}`, BASE_URL + '/');
        
        // If we found the alias, we should use it for the episode IDs
        const aliasMatch = extractAttr(html, /id="alias_anime"[^>]*value="([^"]+)"/);
        const alias = aliasMatch || slug;
        
        // Parse the episode page list using the specific alias to avoid sidebar links
        const epMatches = extractAll(html, new RegExp(`${alias}-episode-([0-9]+)["']`, 'i'));
        
        let maxEp = 1;
        for (const m of epMatches) {
            const end = parseInt(m[1], 10);
            if (!isNaN(end) && end > maxEp) {
                maxEp = end;
            }
        }
        
        // GogoAnime's ul#episode_page lists the actual start/end
        const epPageMatches = extractAll(html, /ep_end=["']([0-9]+)["']/i);
        for (const m of epPageMatches) {
            const end = parseInt(m[1], 10);
            if (!isNaN(end) && end > maxEp) {
                maxEp = end;
            }
        }

        const episodes = [];
        for (let i = 1; i <= maxEp; i++) {
            episodes.push({
                id: `${alias}-ep-${i}`,
                session: `${alias}-ep-${i}`,
                episodeNumber: i
            });
        }
        
        return { episodes };
    }

    /**
     * Find the best matching GogoAnime slug for the given titles.
     * Returns null if nothing matches confidently.
     */
    async resolveSlug(titles: string[]): Promise<string | null> {
        const validTitles = titles.filter((t) => t && t.trim().length > 1);
        if (validTitles.length === 0) return null;

        // Try each title as a search query and aggregate results
        const allResults: SearchResult[] = [];
        const seen = new Set<string>();

        const searchVariations = new Set<string>();
        for (const title of validTitles.slice(0, 3)) {
            searchVariations.add(title);
            // Also try without punctuation
            searchVariations.add(title.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim());
            // Also try shorter variant (first 3 words)
            const words = title.split(/[\s\-:]+/);
            if (words.length > 2) {
                searchVariations.add(words.slice(0, 3).join(' '));
            }
            if (words.length > 1) {
                searchVariations.add(words.slice(0, 2).join(' '));
            }
        }

        for (const title of Array.from(searchVariations).slice(0, 5)) {
            if (!title || title.length < 3) continue;
            try {
                const results = await searchAnime(title);
                for (const r of results) {
                    if (!seen.has(r.slug)) {
                        seen.add(r.slug);
                        allResults.push(r);
                    }
                }
                if (allResults.length >= 20) break; // enough candidates
            } catch (err) {
                console.warn(`[GogoAnime] search failed for "${title}":`, (err as any)?.message);
            }
        }

        return pickBestSlug(allResults, validTitles);
    }

    /**
     * Get streaming links for a specific episode.
     * Returns embed iframe URL(s) as StreamLink entries.
     */
    async getStreams(options: GogoAnimeStreamOptions): Promise<AmSource[]> {
        const { titles, episodeNumber, knownSlug } = options;

        let slug = knownSlug ?? null;

        // Step 1: Resolve slug if not provided
        if (!slug) {
            try {
                slug = await this.resolveSlug(titles);
            } catch (err) {
                console.warn('[GogoAnime] resolveSlug failed:', (err as any)?.message);
            }
        }

        if (!slug) {
            console.warn('[GogoAnime] Could not resolve slug for titles:', titles.slice(0, 2));
            return [];
        }

        // Step 2: Get anime info (alias) from category page
        const info = await getAnimeInfo(slug).catch((err) => {
            console.warn(`[GogoAnime] getAnimeInfo failed for slug "${slug}":`, (err as any)?.message);
            return null;
        });

        const alias = info?.alias ?? slug;

        // Step 3: Get embed URL from episode page
        const embedUrl = await getEpisodeEmbedUrl(alias, episodeNumber).catch((err) => {
            console.warn(`[GogoAnime] getEpisodeEmbedUrl failed (alias=${alias}, ep=${episodeNumber}):`, (err as any)?.message);
            return null;
        });

        if (!embedUrl) {
            console.warn(`[GogoAnime] No embed URL found for ${alias} ep ${episodeNumber}`);
            return [];
        }

        console.log(`[GogoAnime] Resolved stream: ${alias} ep ${episodeNumber} → ${embedUrl}`);

        const stream: AmSource = {
            sourceUrl: embedUrl,
            priority: 90,
            sourceName: 'gogoanime'
        };

        const streams: AmSource[] = [stream];

        try {
            const epSlug = `${alias}-episode-${episodeNumber}`;
            const html = await fetchHtml(`/${epSlug}`, BASE_URL + '/');

            // Extract all data-video entries (HD-1, HD-2, etc.)
            const videoMatches = extractAll(html, /data-video="(https?:\/\/gogoanime\.me\.uk\/newplayer\.php[^"]+)"/);
            const seen = new Set<string>([embedUrl]);

            for (const m of videoMatches) {
                const url = m[1].replace('gogoanime.me.uk/newplayer.php', 'vidstreaming.io/streaming.php');
                if (seen.has(url)) continue;
                seen.add(url);

                const typeMatch = url.match(/type=([^&]+)/);
                const serverType = typeMatch ? decodeURIComponent(typeMatch[1]) : 'hd';

                streams.push({
                    sourceUrl: url,
                    priority: 80,
                    sourceName: `gogoanime-${serverType}`
                });
            }
        } catch {
            // Non-fatal: already have the primary stream
        }

        return streams;
    }
}

export const gogoAnimeScraper = new GogoAnimeScraper();
