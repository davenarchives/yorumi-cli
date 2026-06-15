import crypto from 'node:crypto';
import { StreamLink, AnimeSearchResult } from './types.js';

const API_URL = 'https://api.allanime.day/api';
const REFERER = 'https://allmanga.to';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';
const SEARCH_HASH = '9d7439c90f203e534ca778c4901f9aa2d3ad42c06243ab2c5e6b8a7382afdca3'; // Search query hash
const EPISODE_HASH = 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec'; // Episode streams query hash

const HEX_MAP: Record<string, string> = {
    '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J',
    '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T',
    '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z', '59': 'a', '5a': 'b', '5b': 'c',
    '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l',
    '55': 'm', '56': 'n', '57': 'o', '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u',
    '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z', '08': '0', '09': '1', '0a': '2', '0b': '3',
    '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9', '15': '-', '16': '.', '67': '_',
    '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$',
    '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%',
};

// AllAnime encrypts its stream links. We must decrypt them to give MPV the raw m3u8.
function decryptTobeparsed(blob: string): string[] {
    try {
        const raw = Buffer.from(blob, 'base64');
        const key = crypto.createHash('sha256').update('Xot36i3lK3:v1').digest();
        const iv = Buffer.concat([raw.subarray(1, 13), Buffer.from([0, 0, 0, 2])]);
        const ciphertext = raw.subarray(13, raw.length - 16);
        const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
        const plain = decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
        
        const urls: string[] = [];
        try {
            const parsed = JSON.parse(plain);
            const sourceUrls = Array.isArray(parsed) ? parsed : (parsed?.episode?.sourceUrls || []);
            
            for (const item of sourceUrls) {
                const urlMatch = item.sourceUrl;
                if (urlMatch && urlMatch.startsWith('--')) {
                    const clean = urlMatch.slice(2);
                    let decoded = '';
                    for (let i = 0; i < clean.length; i += 2) {
                        const pair = clean.slice(i, i + 2);
                        decoded += HEX_MAP[pair] ?? pair;
                    }
                    decoded = decoded.replace(/\\u002F/gi, '/').replace(/\\\|/g, '');
                    
                    const clockPath = decoded.replace('/clock', '/clock.json');
                    if (clockPath.startsWith('//')) urls.push(`https:${clockPath}`);
                    else if (clockPath.startsWith('/')) urls.push(`https://allanime.day${clockPath}`);
                    else if (/^https?:\/\//i.test(clockPath)) urls.push(clockPath);
                    else urls.push(`https://allanime.day/${clockPath}`);
                }
            }
        } catch (e) {
            console.error('[AllAnime] Error parsing decrypted JSON', e);
        }
        return urls;
    } catch {
        return [];
    }
}

export async function searchAllAnime(query: string): Promise<AnimeSearchResult[]> {
    try {
        const searchQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const searchQueryGql = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name availableEpisodes}}}`;
        
        const searchRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, 'Origin': REFERER },
            body: JSON.stringify({
                query: searchQueryGql,
                variables: {
                    search: { allowAdult: false, allowUnknown: false, query: searchQuery },
                    limit: 40,
                    page: 1,
                    translationType: "sub",
                    countryOrigin: "ALL"
                }
            })
        });
        const searchData = await searchRes.json() as any;
        const edges = searchData?.data?.shows?.edges || [];
        return edges.map((edge: any) => {
            const available = edge.availableEpisodes || {};
            const epsCount = Math.max(available.sub || 0, available.dub || 0, available.raw || 0, 1);
            return {
                id: `allanime-${edge._id}`,
                title: edge.name,
                session: `allanime:${edge._id}`,
                episodes: epsCount
            };
        });
    } catch {
        return [];
    }
}

export async function fetchAllAnimeStreams(title: string, episode: number, audio: string = 'sub', showId?: string): Promise<StreamLink[]> {
    try {
        let showIdToUse = showId;
        
        if (!showIdToUse) {
            // 1. Convert DMCA names (only for matching, not searching)
            let searchQuery = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

            // 2. Search AllAnime using POST (does not require Captcha)
            const searchQueryGql = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name}}}`;
            
            const searchRes = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, 'Origin': REFERER },
                body: JSON.stringify({
                    query: searchQueryGql,
                    variables: {
                        search: { allowAdult: false, allowUnknown: false, query: searchQuery },
                        limit: 40,
                        page: 1,
                        translationType: audio,
                        countryOrigin: "ALL"
                    }
                })
            });
            const searchData = await searchRes.json() as any;
            const edges = searchData?.data?.shows?.edges || [];
            if (edges.length === 0) return [];

            // Match exact or similar title
            showIdToUse = edges[0]._id;
            for (const edge of edges) {
                const n = (edge.name || '').toLowerCase();
                if (n.includes('shippuuden') && title.toLowerCase().includes('shippuden')) {
                    showIdToUse = edge._id;
                    break;
                }
                if ((n === 'nato' || n === 'naruto') && title.toLowerCase() === 'naruto') {
                    showIdToUse = edge._id;
                    break;
                }
                if (n.includes('nato') && title.toLowerCase().includes('naruto')) {
                    showIdToUse = edge._id;
                }
            }
        }

        if (!showIdToUse) return [];

        // 3. Fetch episode encrypted payload using GET to bypass Captcha
        const epParams = new URLSearchParams({
            variables: JSON.stringify({
                showId: showIdToUse,
                translationType: audio,
                episodeString: String(episode)
            }),
            extensions: JSON.stringify({
                persistedQuery: { version: 1, sha256Hash: EPISODE_HASH }
            })
        });

        const epRes = await fetch(`${API_URL}?${epParams.toString()}`, {
            headers: { 'User-Agent': USER_AGENT, 'Origin': REFERER }
        });
        const epData = await epRes.json() as any;

        const encrypted = epData?.data?.episode?.sourceUrls?.[0]?.sourceUrl || epData?.data?.tobeparsed || epData?.tobeparsed;
        let clockUrls: string[] = [];
        if (typeof encrypted === 'string' && encrypted.startsWith('--')) {
            clockUrls = decryptTobeparsed(encrypted);
        } else if (encrypted) {
            clockUrls = decryptTobeparsed(encrypted);
        }

        const rawLinks: StreamLink[] = [];
        
        // 4. Resolve the clock.json files into raw m3u8
        for (const clock of clockUrls) {
            try {
                const ac = new AbortController();
                const timeout = setTimeout(() => ac.abort(), 6000);
                const res = await fetch(clock, {
                    headers: { 'User-Agent': USER_AGENT, 'Referer': REFERER },
                    signal: ac.signal
                });
                clearTimeout(timeout);
                const data = await res.json() as any;
                if (data.links && Array.isArray(data.links)) {
                    for (const link of data.links) {
                        if (!link.link || link.link.includes('sk.json')) continue; // Skip Dash/sk.json invalid links
                        rawLinks.push({
                            server: 'AllAnime',
                            url: link.link,
                            quality: link.resolutionStr || '720p',
                            audio: audio,
                            provider: 'allmanga'
                        });
                    }
                }
            } catch (ce) {
                // Ignore fetch errors to continue attempting others
            }
        }

        // Sort rawLinks by quality and extension (m3u8 > mp4, 1080p > 720p > auto > 480p > 360p)
        rawLinks.sort((a, b) => {
            const getVal = (stream: any) => {
                const str = stream.quality.toLowerCase();
                let score = 0;
                if (str.includes('1080')) score += 1080;
                else if (str.includes('720')) score += 720;
                else if (str.includes('auto')) score += 700;
                else if (str.includes('480')) score += 480;
                else if (str.includes('360')) score += 360;

                // Heavily prioritize m3u8 (HLS) over mp4/googlevideo to avoid compressed AnimePahe proxies
                if (stream.url.includes('.m3u8')) score += 5000;
                
                return score;
            };
            return getVal(b) - getVal(a);
        });

        return rawLinks;
    } catch (e) {
        return [];
    }
}
