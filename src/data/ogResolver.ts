import type { JarConfig, LinkEntry, ResolvedLinkPreview } from '../types';

const YOUTUBE_OEMBED_TIMEOUT_MS = 3000;
const PROVIDER_TIMEOUT_MS = 3500;
const MICROLINK_TIMEOUT_MS = 3500;
const OG_CACHE_PREFIX = 'jar_og_v3:';

interface OgCacheEntry {
  title?: string;
  description?: string;
  image?: string;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function stripHtmlAndEntities(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const withoutTags = raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const decoded = withoutTags
    .replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
      if (body[0] === '#') {
        const hex = body[1]?.toLowerCase() === 'x';
        const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return HTML_ENTITIES[body.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return decoded || undefined;
}

/** Extract an 11-character YouTube video id from common URL shapes. */
export function extractYouTubeId(rawUrl: string): string | null {
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    const trimmed = rawUrl.trim();
    parsed = new URL(/^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const segments = parsed.pathname.split('/').filter(Boolean);
  let candidate: string | null | undefined = null;

  if (hostname === 'youtu.be') {
    candidate = segments[0];
  } else if (
    hostname === 'youtube.com' ||
    hostname === 'm.youtube.com' ||
    hostname === 'music.youtube.com' ||
    hostname === 'youtube-nocookie.com'
  ) {
    if (parsed.pathname === '/watch' || parsed.pathname.startsWith('/watch/')) {
      candidate = parsed.searchParams.get('v');
    }
    if (!candidate) {
      const match = parsed.pathname.match(/^\/(?:shorts|embed|v|live)\/([^/?#]+)/);
      candidate = match?.[1];
    }
  }

  if (!candidate) return null;
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
}

function extractSteamApp(parsed: URL | null): { appId: string; slugTitle?: string } | null {
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'store.steampowered.com') return null;

  const match = parsed.pathname.match(/^\/app\/(\d+)(?:\/([^/?#]+))?/i);
  if (!match) return null;

  const appId = match[1];
  const rawSlug = match[2];
  let slugTitle: string | undefined;

  if (rawSlug) {
    let decoded = rawSlug;
    try {
      decoded = decodeURIComponent(rawSlug);
    } catch {
      // keep raw
    }
    slugTitle = decoded
      .replace(/^NieRAutomata$/i, 'NieR:Automata')
      .replace(/__/g, ' — ')
      .replace(/_+/g, ' ')
      .replace(/([a-z]{2,})([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { appId, slugTitle: slugTitle || undefined };
}

function extractAniListMedia(
  parsed: URL | null,
): { mediaType: 'ANIME' | 'MANGA'; id: number } | null {
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'anilist.co' && host !== 'anilist.com') return null;

  const match = parsed.pathname.match(/^\/(anime|manga)\/(\d+)/i);
  if (!match) return null;

  const id = Number.parseInt(match[2], 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    mediaType: match[1].toLowerCase() === 'manga' ? 'MANGA' : 'ANIME',
    id,
  };
}

function extractWikipediaPage(parsed: URL | null): { origin: string; title: string } | null {
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith('.wikipedia.org')) return null;

  const match = parsed.pathname.match(/^\/wiki\/([^?#]+)/);
  if (!match?.[1]) return null;

  return { origin: parsed.origin, title: match[1] };
}

function extractWordPressSlug(parsed: URL | null): { origin: string; slug: string } | null {
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'hadealahmad.com' && !host.endsWith('.hadealahmad.com')) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last || /^\d+$/.test(last)) return null;

  return { origin: parsed.origin, slug: last };
}

function readSessionCache(key: string): OgCacheEntry | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as OgCacheEntry) : null;
  } catch {
    return null;
  }
}

function writeSessionCache(key: string, value: OgCacheEntry): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / disabled-storage / privacy-mode failures.
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<unknown | null> {
  if (typeof fetch !== 'function') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYouTubeOEmbed(entryUrl: string): Promise<{ title?: string; author?: string }> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(entryUrl)}&format=json`;
  const json = await fetchJsonWithTimeout(endpoint, YOUTUBE_OEMBED_TIMEOUT_MS);
  if (!json || typeof json !== 'object') return {};

  const data = json as Record<string, unknown>;
  return {
    title: asString(data.title),
    author: asString(data.author_name),
  };
}

async function fetchAniListMetadata(
  mediaType: 'ANIME' | 'MANGA',
  id: number,
): Promise<OgCacheEntry | null> {
  const query =
    'query($id:Int,$type:MediaType){Media(id:$id,type:$type){title{english romaji native}description(asHtml:false)bannerImage coverImage{extraLarge large}}}';
  const json = await fetchJsonWithTimeout('https://graphql.anilist.co', PROVIDER_TIMEOUT_MS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id, type: mediaType } }),
  });

  if (!json || typeof json !== 'object') return null;
  const media = (json as { data?: { Media?: Record<string, unknown> } }).data?.Media;
  if (!media || typeof media !== 'object') return null;

  const titles = (media.title as Record<string, unknown> | undefined) ?? {};
  const cover = (media.coverImage as Record<string, unknown> | undefined) ?? {};
  const title =
    asString(titles.english) ?? asString(titles.romaji) ?? asString(titles.native);
  const description = stripHtmlAndEntities(asString(media.description));
  const image =
    asString(media.bannerImage) ?? asString(cover.extraLarge) ?? asString(cover.large);

  if (!title && !image) return null;
  return { title, description, image };
}

async function fetchWikipediaSummary(origin: string, pageTitle: string): Promise<OgCacheEntry | null> {
  const endpoint = `${origin}/api/rest_v1/page/summary/${pageTitle}`;
  const json = await fetchJsonWithTimeout(endpoint, PROVIDER_TIMEOUT_MS);
  if (!json || typeof json !== 'object') return null;

  const data = json as Record<string, unknown>;
  const thumb = data.thumbnail as Record<string, unknown> | undefined;
  const orig = data.originalimage as Record<string, unknown> | undefined;
  const title = asString(data.title);
  const description = asString(data.extract) ?? asString(data.description);
  const image = asString(thumb?.source) ?? asString(orig?.source);

  if (!title && !description) return null;
  return { title, description, image };
}

async function fetchWordPressPost(origin: string, slug: string): Promise<OgCacheEntry | null> {
  const endpoint = `${origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed=1`;
  const json = await fetchJsonWithTimeout(endpoint, PROVIDER_TIMEOUT_MS);
  if (!Array.isArray(json) || json.length === 0) return null;

  const post = json[0] as Record<string, unknown>;
  const titleObj = post.title as Record<string, unknown> | undefined;
  const excerptObj = post.excerpt as Record<string, unknown> | undefined;
  const embedded = post._embedded as Record<string, unknown> | undefined;
  const mediaArr = Array.isArray(embedded?.['wp:featuredmedia'])
    ? (embedded['wp:featuredmedia'] as Array<Record<string, unknown>>)
    : [];

  const title = stripHtmlAndEntities(asString(titleObj?.rendered));
  const description = stripHtmlAndEntities(asString(excerptObj?.rendered));
  const image = asString(mediaArr[0]?.source_url);

  if (!title && !image) return null;
  return { title, description, image };
}

function extractMicrolinkData(json: unknown): OgCacheEntry | null {
  if (!json || typeof json !== 'object') return null;

  const payload = json as Record<string, unknown>;
  if (payload.status !== 'success') return null;

  const data = payload.data;
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const imageField = record.image;
  const image =
    typeof imageField === 'string'
      ? asString(imageField)
      : asString((imageField as Record<string, unknown> | undefined)?.url);

  return {
    title: asString(record.title),
    description: asString(record.description),
    image,
  };
}

function deriveFallbackTitle(parsed: URL | null, hostname: string, rawUrl: string): string {
  if (!parsed) return rawUrl;

  const segments = parsed.pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? '';

  let slug = lastSegment;
  try {
    slug = decodeURIComponent(lastSegment);
  } catch {
    // Keep the raw segment when it contains malformed escapes.
  }

  slug = slug
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (slug && !/^\d+$/.test(slug)) {
    return slug.replace(/\b[a-z]/gi, (char) => char.toUpperCase());
  }

  return hostname;
}

/**
 * Resolve Open Graph metadata (`title`, `description`, `image`) directly from the link URL.
 *
 * Uses native CORS-enabled provider endpoints first (YouTube oEmbed, Steam CDN,
 * AniList GraphQL, Wikipedia REST, hadealahmad.com WordPress REST), then falls
 * back to the Microlink OG API (cached in `sessionStorage`), and finally to a
 * clean URL-derived title and procedural pixel banner when offline or rate-limited.
 */
export async function resolveLinkPreview(
  entry: LinkEntry,
  jarConfig: JarConfig,
): Promise<ResolvedLinkPreview> {
  let parsed: URL | null = null;
  try {
    const trimmed = entry.url.trim();
    parsed = new URL(/^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed);
  } catch {
    parsed = null;
  }

  const hostname = parsed
    ? parsed.hostname.replace(/^www\./i, '')
    : entry.url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] || entry.url;
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;

  const cacheKey = `${OG_CACHE_PREFIX}${entry.url}`;
  let cached = readSessionCache(cacheKey);

  let title = cached?.title ?? '';
  let description = cached?.description ?? '';
  let image = cached?.image ?? '';
  let skipMicrolink = false;

  const youtubeId = extractYouTubeId(entry.url);
  if (youtubeId) {
    skipMicrolink = true;
    if (!image) image = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;

    if (!title) {
      const oembed = await fetchYouTubeOEmbed(entry.url);
      if (oembed.title) title = oembed.title;
      if (!description && oembed.author) description = `مقطع بواسطة ${oembed.author}`;
      if (title) {
        writeSessionCache(cacheKey, { title, description: description || undefined, image });
      }
    }
  }

  const steamApp = !youtubeId ? extractSteamApp(parsed) : null;
  if (steamApp) {
    if (!image) {
      image = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamApp.appId}/header.jpg`;
    }
    if (!title && steamApp.slugTitle) {
      title = steamApp.slugTitle;
    }
  }

  const aniListMedia = !youtubeId && !steamApp ? extractAniListMedia(parsed) : null;
  if (aniListMedia && (!title || !image || !description)) {
    const resolved = await fetchAniListMetadata(aniListMedia.mediaType, aniListMedia.id);
    if (resolved) {
      skipMicrolink = true;
      if (!title && resolved.title) title = resolved.title;
      if (!description && resolved.description) description = resolved.description;
      if (!image && resolved.image) image = resolved.image;
      writeSessionCache(cacheKey, { title, description, image });
    }
  }

  const wikiPage =
    !youtubeId && !steamApp && !aniListMedia ? extractWikipediaPage(parsed) : null;
  if (wikiPage && (!title || !description)) {
    const resolved = await fetchWikipediaSummary(wikiPage.origin, wikiPage.title);
    if (resolved) {
      skipMicrolink = true;
      if (!title && resolved.title) title = resolved.title;
      if (!description && resolved.description) description = resolved.description;
      if (!image && resolved.image) image = resolved.image;
      writeSessionCache(cacheKey, { title, description, image: image || undefined });
    }
  }

  const wpPost =
    !youtubeId && !steamApp && !aniListMedia && !wikiPage
      ? extractWordPressSlug(parsed)
      : null;
  if (wpPost && (!title || !image || !description)) {
    const resolved = await fetchWordPressPost(wpPost.origin, wpPost.slug);
    if (resolved) {
      skipMicrolink = true;
      if (!title && resolved.title) title = resolved.title;
      if (!description && resolved.description) description = resolved.description;
      if (!image && resolved.image) image = resolved.image;
      writeSessionCache(cacheKey, { title, description, image: image || undefined });
    }
  }

  if (!skipMicrolink && (!title || !image || !description)) {
    if (!cached) {
      const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(entry.url)}`;
      const json = await fetchJsonWithTimeout(endpoint, MICROLINK_TIMEOUT_MS);
      const extracted = extractMicrolinkData(json);
      if (extracted) {
        cached = extracted;
        writeSessionCache(cacheKey, extracted);
      }
    }

    if (cached) {
      if (!title && cached.title) title = cached.title;
      if (!description && cached.description) description = cached.description;
      if (!image && cached.image) image = cached.image;
    }
  }

  if (!title) {
    title = deriveFallbackTitle(parsed, hostname, entry.url);
  }

  if (!description) {
    description = steamApp
      ? 'صفحة اللعبة على متجر Steam — اضغط لفتحها في تبويب جديد.'
      : `اضغط على هذه الورقة لفتح ${hostname} في تبويب جديد.`;
  }

  return {
    url: entry.url,
    title,
    description,
    image: image || null,
    hostname,
    favicon,
    jarId: jarConfig.id,
    jarLabel: jarConfig.label,
    accentColor: jarConfig.accentColor,
  };
}
