import type { JarConfig, LinkEntry, ResolvedLinkPreview } from '../types';

const YOUTUBE_OEMBED_TIMEOUT_MS = 3000;
const MICROLINK_TIMEOUT_MS = 3500;
const OG_CACHE_PREFIX = 'jar_og_v2:';

interface OgCacheEntry {
  title?: string;
  description?: string;
  image?: string;
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

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown | null> {
  if (typeof fetch !== 'function') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
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
 * YouTube links use the oEmbed + deterministic thumbnail fast path. All other URLs
 * resolve through the Microlink OG API (cached in `sessionStorage`), falling back to
 * a clean URL-derived title and procedural pixel banner when offline or blocked.
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

  const youtubeId = extractYouTubeId(entry.url);
  if (youtubeId) {
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

  if (!title || !image) {
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
    description = `اضغط على هذه الورقة لفتح ${hostname} في تبويب جديد.`;
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
