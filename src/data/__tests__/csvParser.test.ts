// Bun's test runner provides `bun:test`, but `bun-types` is not part of this
// project's TypeScript dev dependencies. Keep the test file out of `tsc --noEmit`
// so `bun run build` stays green; the tests are still fully type-checked by Bun.
// @ts-nocheck
import { afterEach, describe, expect, test } from 'bun:test';
import { JAR_BY_ID } from '../../config/jars';
import { parseLinksCsv } from '../csvParser';
import { JarStore } from '../jarStore';
import { extractYouTubeId, resolveLinkPreview } from '../ogResolver';

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
  test('parses a 5-column RFC-4180 CSV with BOM, quoted commas, escaped quotes and CRLF', () => {
    const csv =
      '\uFEFFurl,title,description,image,site_name\r\n' +
      'https://example.com/first,"Hello, world","First line\nSecond ""quoted"" line","https://images.example.com/one.png","Example Site"\r\n' +
      '\r\n' +
      'https://example.com/second,Plain title,Plain description,,\r\n';

    const entries = parseLinksCsv(csv);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      url: 'https://example.com/first',
      title: 'Hello, world',
      description: 'First line\nSecond "quoted" line',
      image: 'https://images.example.com/one.png',
      siteName: 'Example Site',
    });
    expect(entries[1]).toEqual({
      url: 'https://example.com/second',
      title: 'Plain title',
      description: 'Plain description',
      image: undefined,
      siteName: undefined,
    });
  });

  test('maps columns case-insensitively using header aliases', () => {
    const csv = [
      'LINK,DESC,THUMBNAIL,SITE',
      'https://example.com/post,A nice description,https://cdn.example.com/p.png,Example',
    ].join('\n');

    const [entry] = parseLinksCsv(csv);

    expect(entry.url).toBe('https://example.com/post');
    expect(entry.title).toBeUndefined();
    expect(entry.description).toBe('A nice description');
    expect(entry.image).toBe('https://cdn.example.com/p.png');
    expect(entry.siteName).toBe('Example');
  });

  test('parses a headerless one-column bare URL list and ignores comments/blank lines', () => {
    const csv = [
      '# My bookmarks',
      'https://example.com/one',
      '',
      'www.github.com',
      '   ',
      'https://news.ycombinator.com/item?id=42',
      '# trailing comment, with commas',
    ].join('\n');

    const entries = parseLinksCsv(csv);

    expect(entries.map((entry) => entry.url)).toEqual([
      'https://example.com/one',
      'https://www.github.com/',
      'https://news.ycombinator.com/item?id=42',
    ]);
    expect(entries[0]).toEqual({
      url: 'https://example.com/one',
      title: undefined,
      description: undefined,
      image: undefined,
      siteName: undefined,
    });
  });

  test('parses headerless positional rows (url,title,description,image,siteName)', () => {
    const csv = [
      'https://example.com/a,"Title, with comma",Description,https://img.example.com/a.jpg,Site A',
      'https://example.com/b,,, ,',
    ].join('\n');

    const entries = parseLinksCsv(csv);

    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe('Title, with comma');
    expect(entries[0].siteName).toBe('Site A');
    expect(entries[0].image).toBe('https://img.example.com/a.jpg');
    expect(entries[1]).toEqual({
      url: 'https://example.com/b',
      title: undefined,
      description: undefined,
      image: undefined,
      siteName: undefined,
    });
  });

  test('normalizes www. URLs and filters malformed or non-http(s) URLs', () => {
    const csv = [
      'url,title',
      'www.example.com/path,Valid www',
      'https://example.com/ok,Valid https',
      'ftp://example.com/file,Invalid protocol',
      'mailto:someone@example.com,Invalid mailto',
      'javascript:alert(1),Invalid javascript',
      'not a url,Invalid text',
      'example.com/no-scheme,Missing scheme',
      ',Empty URL',
    ].join('\n');

    const entries = parseLinksCsv(csv);

    expect(entries.map((entry) => entry.url)).toEqual([
      'https://www.example.com/path',
      'https://example.com/ok',
    ]);
    expect(entries.map((entry) => entry.title)).toEqual(['Valid www', 'Valid https']);
  });

  test('returns an empty array for empty input and header-only files', () => {
    expect(parseLinksCsv('')).toEqual([]);
    expect(parseLinksCsv('url,title,description,image,site_name')).toEqual([]);
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
});

describe('resolveLinkPreview', () => {
  test('uses the YouTube fast path (thumbnail + oEmbed title/author)', async () => {
    let requested = '';
    stubFetch((input) => {
      requested = String(input);
      return jsonResponse({ title: 'Mock Video', author_name: 'Mock Author' });
    });

    const preview = await resolveLinkPreview(
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      JAR_BY_ID.youtube,
    );

    expect(preview.title).toBe('Mock Video');
    expect(preview.description).toBe('مقطع بواسطة Mock Author');
    expect(preview.image).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(preview.siteName).toBe('YouTube');
    expect(preview.hostname).toBe('youtube.com');
    expect(preview.favicon).toBe('https://www.google.com/s2/favicons?domain=youtube.com&sz=64');
    expect(preview.jarId).toBe('youtube');
    expect(preview.jarLabel).toBe('يوتيوب');
    expect(preview.accentColor).toBe('#e05263');
    expect(requested).toContain('youtube.com/oembed');
  });

  test('enriches missing fields from Microlink on the general path', async () => {
    stubFetch(() =>
      jsonResponse({
        status: 'success',
        data: {
          title: 'OG Title',
          description: 'OG Description',
          image: { url: 'https://og.example.com/image.png' },
          publisher: 'OG Publisher',
        },
      }),
    );

    const preview = await resolveLinkPreview({ url: 'https://example.com/article' }, JAR_BY_ID.articles);

    expect(preview.title).toBe('OG Title');
    expect(preview.description).toBe('OG Description');
    expect(preview.image).toBe('https://og.example.com/image.png');
    expect(preview.siteName).toBe('OG Publisher');
    expect(preview.hostname).toBe('example.com');
    expect(preview.jarId).toBe('articles');
  });

  test('falls back gracefully when the network fails', async () => {
    stubFetch(() => {
      throw new Error('offline');
    });

    const preview = await resolveLinkPreview(
      { url: 'https://example.com/some/cool-article' },
      JAR_BY_ID.articles,
    );

    expect(preview.title).toBe('Cool Article');
    expect(preview.description).toBe('اضغط على هذه الورقة لفتح example.com في تبويب جديد.');
    expect(preview.image).toBeNull();
    expect(preview.siteName).toBe('example.com');
    expect(preview.hostname).toBe('example.com');
    expect(preview.favicon).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=64');
  });

  test('keeps pre-populated entry metadata without fetching', async () => {
    let calls = 0;
    stubFetch(() => {
      calls++;
      return jsonResponse({ status: 'success', data: {} });
    });

    const preview = await resolveLinkPreview(
      {
        url: 'https://example.com/ready',
        title: 'Ready Title',
        description: 'Ready Description',
        image: 'https://example.com/ready.png',
        siteName: 'Ready Site',
      },
      JAR_BY_ID.others,
    );

    expect(calls).toBe(0);
    expect(preview.title).toBe('Ready Title');
    expect(preview.description).toBe('Ready Description');
    expect(preview.image).toBe('https://example.com/ready.png');
    expect(preview.siteName).toBe('Ready Site');
  });
});

describe('JarStore', () => {
  const threeLinksCsv = [
    'url,title',
    'https://example.com/a,Alpha',
    'https://example.com/b,Beta',
    'https://example.com/c,Gamma',
  ].join('\n');

  test('loads once, deduplicates concurrent fetches and reports counts', async () => {
    let calls = 0;
    stubFetch(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(threeLinksCsv, { status: 200 });
    });

    const store = new JarStore();
    const [first, second] = await Promise.all([
      store.loadJar('articles'),
      store.loadJar('articles'),
    ]);

    expect(calls).toBe(1);
    expect(first).toBe(second);
    expect(first).toHaveLength(3);
    expect(store.getCount('articles')).toBe(3);
    expect(store.getCount('youtube')).toBe(0);
    expect(store.getAllCounts()).toEqual({ articles: 3 });

    await store.loadJar('articles');
    expect(calls).toBe(1);
  });

  test('preloadAll loads every jar concurrently and tolerates failures', async () => {
    stubFetch((input) => {
      if (String(input).includes('articles')) {
        return new Response('missing', { status: 500, statusText: 'Server Error' });
      }
      return new Response('https://example.com/a\nhttps://example.com/b\n', { status: 200 });
    });

    const store = new JarStore();
    const counts = await store.preloadAll();

    expect(counts).toEqual({
      youtube: 2,
      articles: 0,
      all: 2,
      recommendations: 2,
      others: 2,
    });
    expect(store.getAllCounts()).toEqual({
      youtube: 2,
      all: 2,
      recommendations: 2,
      others: 2,
    });
  });

  test('draws each link once per shuffle bag, then refills without immediate repeats', async () => {
    let calls = 0;
    stubFetch(() => {
      calls++;
      return new Response(threeLinksCsv, { status: 200 });
    });

    const store = new JarStore();
    const draws: string[] = [];
    for (let i = 0; i < 9; i++) {
      const entry = await store.drawRandom('youtube');
      expect(entry).not.toBeNull();
      draws.push(entry!.url);
    }

    expect(calls).toBe(1);
    expect(new Set(draws.slice(0, 3)).size).toBe(3);
    expect(new Set(draws.slice(3, 6)).size).toBe(3);
    expect(new Set(draws.slice(6, 9)).size).toBe(3);
    expect(draws[3]).not.toBe(draws[2]);
    expect(draws[6]).not.toBe(draws[5]);
  });

  test('returns null for an empty jar', async () => {
    stubFetch(() => new Response('# no links yet\n', { status: 200 }));

    const store = new JarStore();
    expect(await store.drawRandom('recommendations')).toBeNull();
    expect(store.getCount('recommendations')).toBe(0);
  });
});
