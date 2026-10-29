#!/usr/bin/env bun
/**
 * enrich-csv.ts — pre-fetch Open Graph metadata for the Jar of Links CSV files.
 *
 * Usage:
 *   bun run scripts/enrich-csv.ts                 # enrich every CSV in public/data and write it back
 *   bun run scripts/enrich-csv.ts --dry-run       # show what would change, write nothing
 *   bun run scripts/enrich-csv.ts --sync-all      # merge all category URLs into all.csv, then enrich
 *   bun run scripts/enrich-csv.ts --dry-run --sync-all
 *
 * Input format (both shapes may be mixed in one file):
 *   url
 *   https://example.com/one,,,,                      <- bare URL, 5 empty columns
 *   url,title,description,image,site_name            <- header (optional)
 *   https://example.com/two,Title,"A description, with a comma",https://example.com/og.png,Example
 *
 * Rows missing a title or an image are resolved at runtime:
 *   - YouTube links use the oEmbed endpoint plus the deterministic i.ytimg.com thumbnail.
 *   - Everything else is fetched (5s timeout) and parsed for og:* / twitter:* / <title> /
 *     <meta name="description"> tags.
 *
 * Existing non-empty fields are never overwritten.
 * Set JAR_DATA_DIR to point the script at another directory (used by tests).
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DATA_DIR = process.env.JAR_DATA_DIR
  ? resolve(process.env.JAR_DATA_DIR)
  : resolve(import.meta.dir, '..', 'public', 'data');

const CATEGORY_FILES = ['youtube.csv', 'articles.csv', 'recommendations.csv', 'others.csv'];
const ALL_FILE = 'all.csv';
const HEADER = ['url', 'title', 'description', 'image', 'site_name'] as const;
const TIMEOUT_MS = 5000;
const CONCURRENCY = 4;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface LinkRow {
  url: string;
  title: string;
  description: string;
  image: string;
  site_name: string;
}

interface EnrichResult {
  row: LinkRow;
  /** Fields that were filled in, in the order they were discovered. */
  filled: Array<{ field: keyof LinkRow; value: string }>;
  source: 'oembed' | 'page' | 'thumbnail' | 'none';
  note?: string;
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/** RFC-4180 parser: handles quoted fields, escaped quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function isHeaderRow(cells: string[]): boolean {
  const first = (cells[0] ?? '').trim().toLowerCase();
  return first === 'url' || first === 'link' || first === 'address';
}

function toRows(cells: string[][], file: string): LinkRow[] {
  const rows: LinkRow[] = [];

  for (const [index, record] of cells.entries()) {
    if (isHeaderRow(record)) continue;

    const url = (record[0] ?? '').trim();
    if (!url) continue;

    if (!/^https?:\/\//i.test(url)) {
      warn(`${file}: skipping row ${index + 1} — not an http(s) URL: ${truncate(url, 60)}`);
      continue;
    }

    if (record.length > 5) {
      warn(`${file}: row ${index + 1} has ${record.length} columns, keeping the first 5`);
    }

    rows.push({
      url,
      title: (record[1] ?? '').trim(),
      description: (record[2] ?? '').trim(),
      image: (record[3] ?? '').trim(),
      site_name: (record[4] ?? '').trim(),
    });
  }

  return rows;
}

function escapeField(value: string): string {
  if (/[",\r\n]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeCsv(rows: LinkRow[]): string {
  const lines = [HEADER.join(',')];
  for (const row of rows) {
    lines.push(
      [row.url, row.title, row.description, row.image, row.site_name].map(escapeField).join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function warn(message: string): void {
  console.warn(`${glyph('!', '!')} ${message}`);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function glyph(symbol: string, fallback: string): string {
  return process.stdout.isTTY ? symbol : fallback;
}

function normalizeUrl(url: string): string {
  return url.trim();
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v');
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
      const match = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (match) return match[1];
    }
  } catch {
    /* not a URL — handled by the caller */
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
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

function decodeEntities(value: string): string {
  return value
    .replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
      if (body[0] === '#') {
        const hex = body[1]?.toLowerCase() === 'x';
        const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*?(?:property|name|itemprop)\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta\\b[^>]*?content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name|itemprop)\\s*=\\s*["']${escaped}["']`,
      'i',
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const value = decodeEntities(match[1]);
      if (value) return value;
    }
  }
  return undefined;
}

function titleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const value = match?.[1] ? decodeEntities(match[1]) : '';
  return value || undefined;
}

function absoluteUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/html|xml/i.test(contentType)) {
      await response.body?.cancel();
      return null;
    }

    const html = (await response.text()).slice(0, 600_000);
    return { html, finalUrl: response.url || url };
  } catch {
    return null;
  }
}

async function fetchYouTubeOEmbed(url: string): Promise<string | undefined> {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return undefined;
    }
    const data = (await response.json()) as { title?: string };
    return data.title ? decodeEntities(data.title) : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * Enrichment
 * ------------------------------------------------------------------ */

function needsEnrichment(row: LinkRow): boolean {
  return !row.title || !row.image;
}

async function enrichRow(row: LinkRow): Promise<EnrichResult> {
  const next: LinkRow = { ...row };
  const filled: EnrichResult['filled'] = [];
  const set = (field: keyof LinkRow, value: string | undefined) => {
    if (!value || next[field]) return;
    next[field] = value;
    filled.push({ field, value });
  };

  const videoId = youtubeId(row.url);

  if (videoId) {
    if (!next.title) {
      set('title', await fetchYouTubeOEmbed(row.url));
    }
    set('image', `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
    set('site_name', 'YouTube');

    return {
      row: next,
      filled,
      source: filled.some((entry) => entry.field === 'title') ? 'oembed' : 'thumbnail',
      note: next.title ? undefined : 'oembed lookup failed',
    };
  }

  const page = await fetchHtml(row.url);
  if (!page) {
    return { row: next, filled, source: 'none', note: 'fetch failed (blocked, offline or timed out)' };
  }
  const { html, finalUrl } = page;

  if (!next.title) {
    set(
      'title',
      metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title') ?? titleTag(html),
    );
  }
  if (!next.description) {
    set(
      'description',
      metaContent(html, 'og:description') ??
        metaContent(html, 'description') ??
        metaContent(html, 'twitter:description'),
    );
  }
  if (!next.image) {
    const image =
      metaContent(html, 'og:image:secure_url') ??
      metaContent(html, 'og:image') ??
      metaContent(html, 'twitter:image') ??
      metaContent(html, 'twitter:image:src');
    set('image', image ? absoluteUrl(image, finalUrl) : undefined);
  }
  if (!next.site_name) {
    set('site_name', metaContent(html, 'og:site_name') ?? hostnameOf(finalUrl));
  }

  return {
    row: next,
    filled,
    source: filled.length > 0 ? 'page' : 'none',
    note:
      filled.length > 0
        ? undefined
        : !next.title
          ? 'no metadata found'
          : !next.image
            ? 'no og:image (procedural fallback)'
            : undefined,
  };
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

async function enrichRows(rows: LinkRow[]): Promise<{ rows: LinkRow[]; results: EnrichResult[] }> {
  const pending = rows.map((row, index) => ({ row, index })).filter((entry) => needsEnrichment(entry.row));

  const enriched = await mapLimit(pending, CONCURRENCY, async (entry) => ({
    index: entry.index,
    result: await enrichRow(entry.row),
  }));

  const next = rows.slice();
  const results: EnrichResult[] = [];

  for (const { index, result } of enriched) {
    next[index] = result.row;
    results.push(result);
  }

  return { rows: next, results };
}

/* ------------------------------------------------------------------ *
 * Sync
 * ------------------------------------------------------------------ */

function mergeIntoAll(categories: LinkRow[], existing: LinkRow[]): { rows: LinkRow[]; added: number; kept: number } {
  const existingByUrl = new Map(existing.map((row) => [normalizeUrl(row.url), row]));
  const seen = new Set<string>();
  const rows: LinkRow[] = [];
  let added = 0;

  for (const row of categories) {
    const key = normalizeUrl(row.url);
    if (seen.has(key)) continue;
    seen.add(key);
    const previous = existingByUrl.get(key);
    if (!previous) added += 1;
    rows.push(previous ?? row);
  }

  let kept = 0;
  for (const row of existing) {
    const key = normalizeUrl(row.url);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    kept += 1;
  }

  return { rows, added, kept };
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function printUsage(): void {
  console.log(`Jar of Links — CSV enrichment

Usage:
  bun run scripts/enrich-csv.ts [--dry-run] [--sync-all]

Options:
  --dry-run    Resolve metadata and print a report, but do not write any file.
  --sync-all   Merge every unique URL from ${CATEGORY_FILES.join(', ')}
               into ${ALL_FILE} (existing bonus links are preserved), then enrich.
  --help       Show this message.

Environment:
  JAR_DATA_DIR   Override the data directory (default: public/data).
`);
}

async function listCsvFiles(): Promise<string[]> {
  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
    .map((entry) => entry.name)
    .sort();
}

async function readRows(file: string): Promise<LinkRow[]> {
  const text = await readFile(join(DATA_DIR, file), 'utf8');
  return toRows(parseCsv(text), file);
}

function describeFilled(result: EnrichResult): string[] {
  return result.filled.map((entry) => `${entry.field} ← ${truncate(entry.value, 72)}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return;
  }

  const unknown = argv.filter((arg) => !['--dry-run', '--sync-all'].includes(arg));
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(' ')}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const dryRun = argv.includes('--dry-run');
  const syncAll = argv.includes('--sync-all');

  console.log(`Jar of Links — CSV enrichment${dryRun ? ' (dry run)' : ''}`);
  console.log(`data: ${DATA_DIR}`);

  const available = await listCsvFiles().catch(() => [] as string[]);
  if (available.length === 0) {
    console.error(`No CSV files found in ${DATA_DIR}`);
    process.exitCode = 1;
    return;
  }

  const missing = CATEGORY_FILES.filter((file) => !available.includes(file));
  if (missing.length > 0) {
    warn(`missing category file(s): ${missing.join(', ')}`);
  }

  // Load everything first so --sync-all can reuse the parsed rows.
  const data = new Map<string, LinkRow[]>();
  for (const file of available) {
    data.set(file, await readRows(file));
  }

  if (syncAll) {
    const categories: LinkRow[] = [];
    for (const file of CATEGORY_FILES) {
      const rows = data.get(file);
      if (rows) categories.push(...rows);
    }

    const existing = data.get(ALL_FILE) ?? [];
    const { rows, added, kept } = mergeIntoAll(categories, existing);

    console.log(
      `\n${glyph('◆', '*')} sync ${ALL_FILE}: ${existing.length} → ${rows.length} rows (+${added} from categories, ${kept} bonus kept)`,
    );

    data.set(ALL_FILE, rows);
  }

  let totalRows = 0;
  let totalEnriched = 0;
  let totalMissingTitle = 0;
  let totalBlocked = 0;
  let totalNoImage = 0;
  let totalFilled = 0;
  let written = 0;

  for (const file of [...data.keys()].sort()) {
    const rows = data.get(file) ?? [];
    const { rows: enrichedRows, results } = await enrichRows(rows);

    const changed = results.filter((result) => result.filled.length > 0);
    const missingTitle = results.filter((result) => !result.row.title);
    const blocked = results.filter((result) => result.note?.startsWith('fetch failed'));
    const noImage = results.filter(
      (result) => result.filled.length === 0 && Boolean(result.row.title) && !result.row.image,
    );

    totalRows += rows.length;
    totalEnriched += changed.length;
    totalFilled += changed.reduce((sum, result) => sum + result.filled.length, 0);
    totalMissingTitle += missingTitle.length;
    totalBlocked += blocked.length;
    totalNoImage += noImage.length;

    console.log(
      `\n${glyph('▸', '>')} ${file} — ${rows.length} rows, ${rows.length - results.length} complete, ${results.length} needing metadata`,
    );

    for (const result of results) {
      const lines = describeFilled(result);
      if (lines.length === 0) {
        if (!result.row.title) {
          console.log(
            `   ${glyph('·', '-')} ${truncate(result.row.url, 84)} — unresolved${result.note ? ` (${result.note})` : ''}`,
          );
        } else if (!result.row.image) {
          console.log(
            `   ${glyph('·', '-')} ${truncate(result.row.url, 84)} — no og:image, procedural banner will be used`,
          );
        } else {
          console.log(`   ${glyph('·', '-')} ${truncate(result.row.url, 84)} — already complete`);
        }
        continue;
      }
      console.log(`   ${glyph('✓', '+')} ${truncate(result.row.url, 84)} [${result.source}]`);
      for (const line of lines) console.log(`       ${line}`);
    }

    if (dryRun) {
      continue;
    }

    await writeFile(join(DATA_DIR, file), serializeCsv(enrichedRows), 'utf8');
    written += 1;
    console.log(`   ${glyph('✔', '-')} wrote ${file}`);
  }

  const writtenLabel = dryRun ? '0 (dry run)' : `${written} file(s)`;

  console.log(`\nSummary`);
  console.log(`  files:         ${data.size}`);
  console.log(`  rows:          ${totalRows}`);
  console.log(`  filled:        ${totalEnriched} row(s), ${totalFilled} field(s)`);
  console.log(`  no image:      ${totalNoImage} row(s) -> procedural banner`);
  console.log(`  blocked:       ${totalBlocked} row(s)`);
  console.log(`  missing title: ${totalMissingTitle} row(s)`);
  console.log(`  written:       ${writtenLabel}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
