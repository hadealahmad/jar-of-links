// Bun's test runner provides `bun:test`, but `bun-types` is not part of this
// project's TypeScript dev dependencies. Keep the test file out of `tsc --noEmit`
// so `bun run build` stays green; the tests are still fully type-checked by Bun.
// @ts-nocheck
import { afterEach, describe, expect, test } from 'bun:test';
import { JAR_BY_ID } from '../../config/jars';
import { normalizeLinkType, parseLinksCsv } from '../csvParser';
import { computeJarFillRatios, JarStore, MAX_CATEGORY_FILL_RATIO } from '../jarStore';
import { extractYouTubeId, isYouTubeUrl, resolveLinkPreview } from '../ogResolver';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler: (input: unknown) => Promise<Response> | Response): void {
  globalThis.fetch = (async (input: unknown) => handler(input)) as typeof fetch;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('parseLinksCsv', () => {
  test('parses a 2-column RFC-4180 CSV (url,type) with BOM, quoted fields and CRLF', () => {
    const csv =
      '\uFEFFurl,type\r\n' +
      'https://example.com/first,articles\r\n' +
      '\r\n' +
      '"https://example.com/second","recommendations"\r\n';

    const entries = parseLinksCsv(csv);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      url: 'https://example.com/first',
      type: 'articles',
    });
    expect(entries[1]).toEqual({
      url: 'https://example.com/second',
      type: 'recommendations',
    });
  });

  test('maps columns case-insensitively in any order and normalizes English/Arabic types', () => {
    const csv = [
      'CATEGORY,LINK',
      'مقالات,https://example.com/post',
      'recs,https://example.com/tool',
    ].join('\n');

    const entries = parseLinksCsv(csv);

    expect(entries).toEqual([
      { url: 'https://example.com/post', type: 'articles' },
      { url: 'https://example.com/tool', type: 'recommendations' },
    ]);
  });

  test('infers type when omitted (youtube URLs -> youtube, others -> others) and ignores comments/blank lines', () => {
    const csv = [
      '# My bookmarks',
      'https://youtu.be/dQw4w9WgXcQ',
      '',
      'www.github.com',
      '   ',
      'https://news.ycombinator.com/item?id=42,articles',
      '# trailing comment, with commas',
    ].join('\n');

    const entries = parseLinksCsv(csv);

    expect(entries).toEqual([
      { url: 'https://youtu.be/dQw4w9WgXcQ', type: 'youtube' },
      { url: 'https://www.github.com/', type: 'others' },
      { url: 'https://news.ycombinator.com/item?id=42', type: 'articles' },
    ]);
    expect(normalizeLinkType('', 'https://www.youtube.com/watch?v=c63KFuxi_IU')).toBe('youtube');
    expect(normalizeLinkType(undefined, 'https://example.com')).toBe('others');
  });

  test('parses headerless url,type and type,url rows', () => {
    const csv = [
      'https://example.com/a,recommendations',
      'articles,https://example.com/b',
    ].join('\n');

    expect(parseLinksCsv(csv)).toEqual([
      { url: 'https://example.com/a', type: 'recommendations' },
      { url: 'https://example.com/b', type: 'articles' },
    ]);
  });

  test('normalizes www. URLs and filters malformed or non-http(s) URLs', () => {
    const csv = [
      'url,type',
      'www.example.com/path,articles',
      'https://example.com/ok,others',
      'ftp://example.com/file,others',
      'mailto:someone@example.com,others',
      'javascript:alert(1),others',
      'not a url,others',
      'example.com/no-scheme,others',
      ',others',
    ].join('\n');

    const entries = parseLinksCsv(csv);

    expect(entries).toEqual([
      { url: 'https://www.example.com/path', type: 'articles' },
      { url: 'https://example.com/ok', type: 'others' },
    ]);
  });

  test('returns an empty array for empty input and header-only files', () => {
    expect(parseLinksCsv('')).toEqual([]);
    expect(parseLinksCsv('url,type')).toEqual([]);
    expect(parseLinksCsv('\uFEFF\n\n# only comments\n')).toEqual([]);
  });
});

describe('extractYouTubeId', () => {
  test('extracts ids from watch, youtu.be, shorts, embed and live URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=43')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtube.com/shorts/abc123XYZ_-')).toBe('abc123XYZ_-');
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('returns null for non-YouTube and malformed URLs', () => {
    expect(extractYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(extractYouTubeId('https://youtu.be/short')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/watch?v=tooShort')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/watch')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
    expect(extractYouTubeId('')).toBeNull();
  });

  test('isYouTubeUrl recognizes videos, playlists, and @handle channels', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(
      isYouTubeUrl('https://www.youtube.com/playlist?list=PLPnjato8iGXLQbppBPhOny8XLSRl7S5pM'),
    ).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/@LEMMiNO')).toBe(true);
    expect(isYouTubeUrl('https://www.youtube.com/channel/UCRcgy6GzDeccI7dkbbBna3Q')).toBe(true);
    expect(isYouTubeUrl('https://www.goodreads.com/book/show/17803.After_Dark')).toBe(false);
    expect(normalizeLinkType('', 'https://www.youtube.com/@LEMMiNO')).toBe('youtube');
  });
});

describe('resolveLinkPreview', () => {
  test('resolves YouTube playlists via oEmbed and Goodreads books via Apple Books search', async () => {
    stubFetch((input) => {
      const url = String(input);
      if (url.includes('youtube.com/oembed')) {
        return jsonResponse({
          title: 'Interface',
          author_name: 'u m a m i',
          thumbnail_url: 'https://i.ytimg.com/vi/EHqsCmfTDmI/hqdefault.jpg',
        });
      }
      if (url.includes('itunes.apple.com/search')) {
        return jsonResponse({
          results: [
            {
              trackName: 'After Dark',
              artistName: 'Haruki Murakami',
              description: '<b>Late night</b> encounters in Tokyo.',
              artworkUrl100: 'https://example.com/cover/100x100bb.jpg',
            },
          ],
        });
      }
      return new Response('not found', { status: 404 });
    });

    const playlistPreview = await resolveLinkPreview(
      {
        url: 'https://www.youtube.com/playlist?list=PLPnjato8iGXLQbppBPhOny8XLSRl7S5pM',
        type: 'youtube',
      },
      JAR_BY_ID.youtube,
    );
    expect(playlistPreview.title).toBe('Interface');
    expect(playlistPreview.description).toContain('u m a m i');
    expect(playlistPreview.image).toBe('https://i.ytimg.com/vi/EHqsCmfTDmI/hqdefault.jpg');

    const bookPreview = await resolveLinkPreview(
      {
        url: 'https://www.goodreads.com/book/show/17803.After_Dark',
        type: 'recommendations',
      },
      JAR_BY_ID.recommendations,
    );
    expect(bookPreview.title).toBe('After Dark');
    expect(bookPreview.description).toContain('Haruki Murakami');
    expect(bookPreview.description).toContain('Late night encounters in Tokyo.');
    expect(bookPreview.image).toBe('https://example.com/cover/600x600bb.jpg');
  });
  test('uses the YouTube fast path (thumbnail + oEmbed title/author)', async () => {
    let requested = '';
    stubFetch((input) => {
      requested = String(input);
      return jsonResponse({ title: 'Mock Video', author_name: 'Mock Author' });
    });

    const preview = await resolveLinkPreview(
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'youtube' },
      JAR_BY_ID.youtube,
    );

    expect(preview.title).toBe('Mock Video');
    expect(preview.description).toBe('مقطع بواسطة Mock Author');
    expect(preview.image).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(preview.hostname).toBe('youtube.com');
    expect(preview.favicon).toBe('https://www.google.com/s2/favicons?domain=youtube.com&sz=64');
    expect(preview.jarId).toBe('youtube');
    expect(preview.jarLabel).toBe('يوتيوب');
    expect(preview.accentColor).toBe('#e05263');
    expect(requested).toContain('youtube.com/oembed');
  });

  test('resolves title, description and image from Microlink OG metadata', async () => {
    stubFetch(() =>
      jsonResponse({
        status: 'success',
        data: {
          title: 'OG Title',
          description: 'OG Description',
          image: { url: 'https://og.example.com/image.png' },
        },
      }),
    );

    const preview = await resolveLinkPreview(
      { url: 'https://example.com/article', type: 'articles' },
      JAR_BY_ID.articles,
    );

    expect(preview.title).toBe('OG Title');
    expect(preview.description).toBe('OG Description');
    expect(preview.image).toBe('https://og.example.com/image.png');
    expect(preview.hostname).toBe('example.com');
    expect(preview.jarId).toBe('articles');
  });

  test('falls back gracefully when the network fails', async () => {
    stubFetch(() => {
      throw new Error('offline');
    });

    const preview = await resolveLinkPreview(
      { url: 'https://example.com/some/cool-article', type: 'articles' },
      JAR_BY_ID.articles,
    );

    expect(preview.title).toBe('Cool Article');
    expect(preview.description).toBe('اضغط على هذه الورقة لفتح example.com في تبويب جديد.');
    expect(preview.image).toBeNull();
    expect(preview.hostname).toBe('example.com');
    expect(preview.favicon).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=64');
  });
});

describe('JarStore & computeJarFillRatios', () => {
  const sharedCsv = [
    'url,type',
    'https://www.youtube.com/watch?v=c63KFuxi_IU,youtube',
    'https://www.youtube.com/watch?v=Qz0KTGYJtUk,youtube',
    'https://www.youtube.com/watch?v=WUlgvNe4BLU,youtube',
    'https://example.com/art-1,articles',
    'https://example.com/art-2,articles',
    'https://example.com/rec-1,recommendations',
  ].join('\n');

  test('fetches links.csv once across all jars, partitions by type, and populates all with every row', async () => {
    let calls = 0;
    stubFetch(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(sharedCsv, { status: 200 });
    });

    const store = new JarStore();
    const [yt, art, all] = await Promise.all([
      store.loadJar('youtube'),
      store.loadJar('articles'),
      store.loadJar('all'),
    ]);

    expect(calls).toBe(1);
    expect(yt).toHaveLength(3);
    expect(art).toHaveLength(2);
    expect(all).toHaveLength(6);
    expect(store.getCount('recommendations')).toBe(1);
    expect(store.getCount('others')).toBe(0);
    expect(store.getAllCounts()).toEqual({
      all: 6,
      youtube: 3,
      articles: 2,
      recommendations: 1,
      others: 0,
    });
  });

  test('preloadAll tolerates fetch failures gracefully', async () => {
    stubFetch(() => new Response('missing', { status: 500, statusText: 'Server Error' }));

    const store = new JarStore();
    const counts = await store.preloadAll();

    expect(counts).toEqual({
      youtube: 0,
      articles: 0,
      all: 0,
      recommendations: 0,
      others: 0,
    });
  });

  test('draws each link once per shuffle bag (and all jar draws across all types) without immediate repeats', async () => {
    let calls = 0;
    stubFetch(() => {
      calls++;
      return new Response(sharedCsv, { status: 200 });
    });

    const store = new JarStore();
    const ytDraws: string[] = [];
    for (let i = 0; i < 9; i++) {
      const entry = await store.drawRandom('youtube');
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('youtube');
      ytDraws.push(entry!.url);
    }

    const allDraws: string[] = [];
    for (let i = 0; i < 6; i++) {
      const entry = await store.drawRandom('all');
      expect(entry).not.toBeNull();
      allDraws.push(entry!.url);
    }

    expect(calls).toBe(1);
    expect(new Set(ytDraws.slice(0, 3)).size).toBe(3);
    expect(new Set(ytDraws.slice(3, 6)).size).toBe(3);
    expect(new Set(ytDraws.slice(6, 9)).size).toBe(3);
    expect(ytDraws[3]).not.toBe(ytDraws[2]);
    expect(ytDraws[6]).not.toBe(ytDraws[5]);
    expect(new Set(allDraws).size).toBe(6);
  });

  test('returns null for an empty category jar', async () => {
    stubFetch(() => new Response(sharedCsv, { status: 200 }));

    const store = new JarStore();
    expect(await store.drawRandom('others')).toBeNull();
    expect(store.getCount('others')).toBe(0);
  });

  test('computes relative fill ratios with all jar always fullest and category jars proportional to each other', () => {
    const ratios = computeJarFillRatios({
      all: 37,
      articles: 20,
      youtube: 10,
      recommendations: 5,
      others: 2,
    });

    expect(ratios.all).toBe(1);
    expect(ratios.articles).toBeCloseTo(MAX_CATEGORY_FILL_RATIO, 5);
    expect(ratios.youtube).toBeCloseTo(MAX_CATEGORY_FILL_RATIO * 0.5, 5);
    expect(ratios.recommendations).toBeCloseTo(MAX_CATEGORY_FILL_RATIO * 0.25, 5);
    expect(ratios.others).toBeCloseTo(MAX_CATEGORY_FILL_RATIO * 0.1, 5);

    const singleCategory = computeJarFillRatios({
      all: 12,
      youtube: 12,
      articles: 0,
      recommendations: 0,
      others: 0,
    });
    expect(singleCategory.all).toBe(1);
    expect(singleCategory.youtube).toBeLessThan(singleCategory.all);
    expect(singleCategory.articles).toBe(0);

    expect(
      computeJarFillRatios({ all: 0, youtube: 0, articles: 0, recommendations: 0, others: 0 }),
    ).toEqual({
      all: 0,
      youtube: 0,
      articles: 0,
      recommendations: 0,
      others: 0,
    });
  });
});
