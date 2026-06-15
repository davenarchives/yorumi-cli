/**
 * GogoAnime Scraper
 *
 * Scrapes stream sources from gogoanime.by.
 */

import type { AmSource } from './api.js';

const BASE_URL = 'https://gogoanime.by';
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 15_000;

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
        .replace(/&nbsp;/g, ' ')
        .replace(/&#8211;/g, '-');
}

function isolateMainContent(html: string): string {
    const startIdx = html.indexOf('class="listupd normal"');
    if (startIdx === -1) return html;
    
    let endIdx = html.indexOf('class="pagination"', startIdx);
    if (endIdx === -1) endIdx = html.indexOf('id="sidebar"', startIdx);
    if (endIdx === -1) endIdx = startIdx + 100_000;
    
    return html.substring(startIdx, endIdx);
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
    const url = `/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);

    const matches = extractAll(
        html,
        /href=["'](?:https?:\/\/[^\/]+)?\/series\/([^"'\/]+)\/?["'][^>]*title=["']([^"']+)["']/gi
    );

    const seen = new Set<string>();
    const results = [];
    for (const m of matches) {
        const slug = m[1];
        if (seen.has(slug)) continue;
        seen.add(slug);
        
        const title = decodeHtmlEntities(m[2]);
        results.push({ slug, title });
    }
    return results;
}

/**
 * Get the movie ID and alias from a category page.
 */
async function getAnimeInfo(slug: string): Promise<AnimeInfo | null> {
    try {
        let html = '';
        try {
            html = await fetchHtml(`/series/${slug}`, BASE_URL + '/');
        } catch {
            html = await fetchHtml(`/category/${slug}`, BASE_URL + '/');
        }
        const movieId = extractAttr(html, /id="movie_id"[^>]*value="([^"]+)"/);
        const alias = extractAttr(html, /id="alias_anime"[^>]*value="([^"]+)"/);
        if (!alias) return null;
        return { movieId, alias };
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
    if (best.score < 40) return null;
    return best.r.slug;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GogoAnimeStreamOptions {
    titles: string[];
    episodeNumber: number;
    knownSlug?: string;
    episodeSession?: string;
}

export class GogoAnimeScraper {
    static isGogoAnimeSession(session: string): boolean {
        return /^gogo:[a-z0-9-]+$/i.test(String(session ?? '').trim()) || String(session ?? '').startsWith('gogo-ep:');
    }

    static toSession(slug: string): string {
        return `gogo:${slug}`;
    }

    static fromSession(session: string): string | null {
        const match = String(session ?? '').trim().match(/^gogo:(.+)$/i);
        return match ? match[1] : null;
    }

    async search(query: string) {
        const results = await searchAnime(query);
        return results.map(r => ({
            id: r.slug,
            session: GogoAnimeScraper.toSession(r.slug),
            title: r.title,
            name: r.title
        }));
    }

    async getLatest() {
        const html = await fetchHtml('/');
        const mainHtml = isolateMainContent(html);
        const mainArticles = extractAll(mainHtml, /<article[^>]*>([\s\S]*?)<\/article>/gi);
        
        const results = [];
        for (const art of mainArticles) {
            const content = art[1];
            const hrefMatch = content.match(/href=["']https?:\/\/gogoanime\.by\/([^"']+)["']/i)
                           || content.match(/href=["']\/([^"']+)["']/i);
            const titleMatch = content.match(/title=["']([^"']+)["']/i)
                            || content.match(/headline">([^<]+)</i);
            const epMatch = content.match(/class="epx">([^<]+)</i);
            if (hrefMatch && titleMatch) {
                const slug = hrefMatch[1].replace(/\/$/, '');
                const fullTitle = decodeHtmlEntities(titleMatch[1]);
                const epText = epMatch ? epMatch[1].trim() : '';
                const displayTitle = epText ? `${fullTitle.replace(/\s+Episode\s+[0-9]+.*/i, '')} (${epText})` : fullTitle;
                results.push({
                    id: slug,
                    title: displayTitle,
                    name: displayTitle,
                    session: `gogo:latest:${slug}`
                });
            }
        }
        return results;
    }

    async getPopular() {
        const html = await fetchHtml('/');
        const weeklyBlock = html.match(/wpop-weekly['"][\s\S]*?<\/ul>/i);
        const results = [];
        if (weeklyBlock) {
            const matches = extractAll(
                weeklyBlock[0],
                /href=["'](?:https?:\/\/[^\/]+)?\/series\/([^"'\/]+)\/?["'][^>]*>([^<]+)<\/a>/gi
            );
            const seen = new Set<string>();
            for (const m of matches) {
                const slug = m[1];
                const title = decodeHtmlEntities(m[2].trim());
                if (seen.has(slug) || !title) continue;
                seen.add(slug);
                results.push({
                    id: slug,
                    title: title,
                    name: title,
                    session: `gogo:${slug}`
                });
            }
        }
        return results;
    }

    async getEpisodes(session: string) {
        let slug = GogoAnimeScraper.fromSession(session) || session.replace(/^gogo:/, '');
        
        if (slug.startsWith('latest:')) {
            const epSlug = slug.replace(/^latest:/, '');
            try {
                const epHtml = await fetchHtml(`/${epSlug}`, BASE_URL + '/');
                const seriesMatch = epHtml.match(/href=["'](?:https?:\/\/[^\/]+)?\/series\/([^"'\/]+)\/?["']\s+aria-label=["']All Episodes["']/i)
                    || epHtml.match(/class=["']nvs nvsc["']><a\s+href=["'](?:https?:\/\/[^\/]+)?\/series\/([^"'\/]+)\/?["']/i)
                    || epHtml.match(/href=["'](?:https?:\/\/[^\/]+)?\/series\/([^"'\/]+)\/?["']/i);
                if (seriesMatch) {
                    slug = seriesMatch[1];
                } else {
                    slug = epSlug.replace(/-episode-[0-9]+.*/i, '');
                }
            } catch {
                slug = epSlug.replace(/-episode-[0-9]+.*/i, '');
            }
        }

        let html = '';
        try {
            html = await fetchHtml(`/series/${slug}`, BASE_URL + '/');
        } catch {
            html = await fetchHtml(`/category/${slug}`, BASE_URL + '/');
        }

        const epsMap = new Map<number, string>();
        const startIdx = html.indexOf('class="episodes-container"');
        if (startIdx !== -1) {
            const containerHtml = html.substring(startIdx, startIdx + 300_000);
            const matches = extractAll(containerHtml, /<div[^>]*class=["'][^"']*episode-item[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi);
            for (const m of matches) {
                const content = m[0];
                const numMatch = content.match(/data-episode-number=["']([0-9]+)["']/i);
                const hrefMatch = content.match(/href=["'](?:https?:\/\/[^\/]+)?\/([^"']+)["']/i);
                if (numMatch && hrefMatch) {
                    const epNum = parseInt(numMatch[1], 10);
                    const epSlug = hrefMatch[1].replace(/\/$/, '');
                    epsMap.set(epNum, epSlug);
                }
            }
        }

        if (epsMap.size === 0) {
            const regex = /href=["'](?:https?:\/\/[^\/]+)?\/([^"'\s]+-episode-([0-9]+)[^"'\s]*)\/?["']/gi;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const epSlug = match[1];
                const epNum = parseInt(match[2], 10);
                if (!isNaN(epNum)) {
                    epsMap.set(epNum, epSlug);
                }
            }
        }

        const episodes = [];
        if (epsMap.size > 0) {
            const sortedNums = Array.from(epsMap.keys()).sort((a, b) => a - b);
            for (const num of sortedNums) {
                episodes.push({
                    id: `gogo-ep:${epsMap.get(num)}`,
                    session: `gogo-ep:${epsMap.get(num)}`,
                    episodeNumber: num
                });
            }
        } else {
            const aliasMatch = extractAttr(html, /id="alias_anime"[^>]*value="([^"]+)"/);
            const alias = aliasMatch || slug;
            const epMatches = extractAll(html, new RegExp(`${alias}-episode-([0-9]+)["']`, 'i'));
            let maxEp = 1;
            for (const m of epMatches) {
                const end = parseInt(m[1], 10);
                if (!isNaN(end) && end > maxEp) {
                    maxEp = end;
                }
            }
            const epPageMatches = extractAll(html, /ep_end=["']([0-9]+)["']/i);
            for (const m of epPageMatches) {
                const end = parseInt(m[1], 10);
                if (!isNaN(end) && end > maxEp) {
                    maxEp = end;
                }
            }
            for (let i = 1; i <= maxEp; i++) {
                episodes.push({
                    id: `gogo-ep:${alias}-episode-${i}`,
                    session: `gogo-ep:${alias}-episode-${i}`,
                    episodeNumber: i
                });
            }
        }

        return { episodes };
    }

    async resolveSlug(titles: string[]): Promise<string | null> {
        const validTitles = titles.filter((t) => t && t.trim().length > 1);
        if (validTitles.length === 0) return null;

        const allResults: SearchResult[] = [];
        const seen = new Set<string>();

        const searchVariations = new Set<string>();
        for (const title of validTitles.slice(0, 3)) {
            searchVariations.add(title);
            searchVariations.add(title.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim());
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
                if (allResults.length >= 20) break;
            } catch (err) {
                console.warn(`[GogoAnime] search failed for "${title}":`, (err as any)?.message);
            }
        }

        return pickBestSlug(allResults, validTitles);
    }

    async getStreams(options: GogoAnimeStreamOptions): Promise<AmSource[]> {
        const { titles, episodeNumber, knownSlug, episodeSession } = options;

        let epSlug = '';
        if (episodeSession && episodeSession.startsWith('gogo-ep:')) {
            epSlug = episodeSession.replace(/^gogo-ep:/, '');
        } else {
            let slug = knownSlug ?? null;
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

            try {
                let seriesHtml = '';
                try {
                    seriesHtml = await fetchHtml(`/series/${slug}`, BASE_URL + '/');
                } catch {
                    seriesHtml = await fetchHtml(`/category/${slug}`, BASE_URL + '/');
                }

                const epsMap = new Map<number, string>();
                const startIdx = seriesHtml.indexOf('class="episodes-container"');
                if (startIdx !== -1) {
                    const containerHtml = seriesHtml.substring(startIdx, startIdx + 300_000);
                    const matches = extractAll(containerHtml, /<div[^>]*class=["'][^"']*episode-item[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi);
                    for (const m of matches) {
                        const content = m[0];
                        const numMatch = content.match(/data-episode-number=["']([0-9]+)["']/i);
                        const hrefMatch = content.match(/href=["'](?:https?:\/\/[^\/]+)?\/([^"']+)["']/i);
                        if (numMatch && hrefMatch) {
                            const epNum = parseInt(numMatch[1], 10);
                            const epSlugVal = hrefMatch[1].replace(/\/$/, '');
                            epsMap.set(epNum, epSlugVal);
                        }
                    }
                }

                if (epsMap.size === 0) {
                    const regex = /href=["'](?:https?:\/\/[^\/]+)?\/([^"'\s]+-episode-([0-9]+)[^"'\s]*)\/?["']/gi;
                    let match;
                    while ((match = regex.exec(seriesHtml)) !== null) {
                        const epName = match[1];
                        const epNum = parseInt(match[2], 10);
                        if (!isNaN(epNum)) {
                            epsMap.set(epNum, epName);
                        }
                    }
                }

                const foundEp = epsMap.get(episodeNumber);
                if (foundEp) {
                    epSlug = foundEp;
                } else {
                    epSlug = `${slug}-episode-${episodeNumber}`;
                }
            } catch {
                epSlug = `${slug}-episode-${episodeNumber}`;
            }
        }

        if (!epSlug) {
            return [];
        }

        const html = await fetchHtml(`/${epSlug}`, BASE_URL + '/');

        const regex = /<li\s+class=["']player-type-link[^"']*["']([^>]*?>[\s\S]*?)<\/li>/gi;
        let match;
        const sources: AmSource[] = [];
        
        const postIdMatch = html.match(/class=["']post-([0-9]+)\s+hentry["']/i)
            || html.match(/id=["']post-([0-9]+)["']/i)
            || html.match(/name=["']post_id["']\s+value=["']([0-9]+)["']/i);
        const postId = postIdMatch ? postIdMatch[1] : '';

        while ((match = regex.exec(html)) !== null) {
            const inner = match[1];
            const type = (inner.match(/data-type=['"]([^'"]+)['"]/) || [])[1];
            const enc1 = (inner.match(/data-encrypted-url1=['"]([^'"]+)['"]/) || [])[1];
            const enc2 = (inner.match(/data-encrypted-url2=['"]([^'"]+)['"]/) || [])[1];
            const enc3 = (inner.match(/data-encrypted-url3=['"]([^'"]+)['"]/) || [])[1];
            const plainUrl = (inner.match(/data-plain-url=['"]([^'"]+)['"]/) || [])[1];
            
            const textMatch = inner.match(/>([\s\S]*?)$/);
            const serverName = (textMatch ? textMatch[1].replace(/<[^>]*>/g, '').trim() : '') || type || 'Server';

            if (plainUrl) {
                try {
                    const embedHtml = await fetchHtml(plainUrl, BASE_URL + '/');
                    const fileMatch = embedHtml.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/i)
                        || embedHtml.match(/fileUrl\s*=\s*["'](https?:\/\/[^"']+)["']/i);
                    if (fileMatch) {
                        sources.push({
                            sourceUrl: fileMatch[1],
                            priority: 95,
                            sourceName: `gogo-${serverName.toLowerCase()}`
                        });
                    } else {
                        sources.push({
                            sourceUrl: plainUrl,
                            priority: 85,
                            sourceName: `gogo-${serverName.toLowerCase()}`
                        });
                    }
                } catch (err) {
                    console.warn(`[GogoAnime] failed to fetch plainUrl "${plainUrl}":`, (err as any)?.message);
                    sources.push({
                        sourceUrl: plainUrl,
                        priority: 85,
                        sourceName: `gogo-${serverName.toLowerCase()}`
                    });
                }
            } else if (type === 'Blogger' && enc1) {
                try {
                    const params = new URLSearchParams({
                        [type]: enc1,
                        ...(enc2 ? { 'url2': enc2 } : {}),
                        ...(enc3 ? { 'url3': enc3 } : {}),
                        'ref': 'gogoanime.by',
                        ...(postId ? { 'postId': postId } : {})
                    });
                    const ajaxUrl = `https://9animetv.be/wp-content/plugins/video-player/includes/player/player.php?${params.toString()}`;
                    const ajaxHtml = await fetchHtml(ajaxUrl, BASE_URL + '/');
                    const nestedIframeMatch = ajaxHtml.match(/<iframe\s+src=["'](https?:\/\/9animetv\.be\/[^"']+)["']/i);
                    if (nestedIframeMatch) {
                        const nestedUrl = nestedIframeMatch[1];
                        const nestedHtml = await fetchHtml(nestedUrl, 'https://9animetv.be/');
                        const fileMatch = nestedHtml.match(/fileUrl\s*=\s*["'](https?:\/\/[^"']+)["']/i)
                            || nestedHtml.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/i);
                        if (fileMatch) {
                            sources.push({
                                sourceUrl: fileMatch[1],
                                priority: 90,
                                sourceName: `gogo-${serverName.toLowerCase()}`
                            });
                        }
                    }
                } catch (err) {
                    console.warn('[GogoAnime] Blogger AJAX flow failed:', (err as any)?.message);
                }
            }
        }

        if (sources.length === 0) {
            const embedMatch = html.match(/src=["'](https?:\/\/[^"']+)["']/i);
            if (embedMatch) {
                sources.push({
                    sourceUrl: embedMatch[1],
                    priority: 50,
                    sourceName: 'gogoanime-fallback'
                });
            }
        }

        return sources;
    }
}

export const gogoAnimeScraper = new GogoAnimeScraper();
