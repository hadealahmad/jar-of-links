import type { LinkEntry, LinkType } from '../types';
import { extractYouTubeId } from './ogResolver';

type FieldName = 'url' | 'type';

const FIELD_ORDER: readonly FieldName[] = ['url', 'type'];

/** Accepted (normalized) header spellings for the two CSV columns. */
const HEADER_ALIASES: Record<FieldName, readonly string[]> = {
  url: ['url', 'link', 'linkurl', 'href', 'ogurl', 'الرابط', 'رابط'],
  type: [
    'type',
    'category',
    'jar',
    'jarid',
    'kind',
    'group',
    'section',
    'النوع',
    'نوع',
    'التصنيف',
    'تصنيف',
  ],
};

const TYPE_ALIASES: Record<LinkType, readonly string[]> = {
  youtube: ['youtube', 'yt', 'video', 'videos', 'يوتيوب'],
  articles: [
    'articles',
    'article',
    'post',
    'posts',
    'blog',
    'essay',
    'essays',
    'reading',
    'مقالات',
    'مقال',
    'مقالة',
  ],
  recommendations: [
    'recommendations',
    'recommendation',
    'rec',
    'recs',
    'tool',
    'tools',
    'pick',
    'picks',
    'توصيات',
    'توصية',
  ],
  others: ['others', 'other', 'misc', 'curiosity', 'curiosities', 'fun', 'أخرى', 'اخرى'],
};

function normalizeToken(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const ascii = trimmed.replace(/[^a-z0-9]/g, '');
  return ascii || trimmed;
}

/** Return the matching `LinkType` if `raw` explicitly names a known category, or `null`. */
export function parseExplicitLinkType(raw: string | undefined): LinkType | null {
  if (!raw) return null;
  const key = normalizeToken(raw);
  if (!key) return null;

  for (const [linkType, aliases] of Object.entries(TYPE_ALIASES) as Array<
    [LinkType, readonly string[]]
  >) {
    if (aliases.includes(key)) return linkType;
  }
  return null;
}

/**
 * Normalize a CSV `type` value into one of the four category jars.
 * When `raw` is empty or unrecognized, YouTube URLs default to `'youtube'`
 * and all other URLs default to `'others'`.
 */
export function normalizeLinkType(raw: string | undefined, url?: string): LinkType {
  const explicit = parseExplicitLinkType(raw);
  if (explicit) return explicit;
  if (url && extractYouTubeId(url)) return 'youtube';
  return 'others';
}

/**
 * Split CSV text into rows/fields following RFC 4180:
 * quoted fields may contain commas, line breaks and escaped `""` quotes.
 * UTF-8 BOMs are stripped, blank lines are dropped and records whose first
 * non-space character is `#` are treated as comments.
 */
function splitCsvRows(csvText: string): string[][] {
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let atFieldStart = true;
  let atRecordStart = true;

  let i = 0;
  while (i < text.length) {
    if (atRecordStart && !inQuotes) {
      // Skip comment lines (a '#' at the beginning of a record, after spaces/tabs).
      let lookahead = i;
      while (lookahead < text.length && (text[lookahead] === ' ' || text[lookahead] === '\t')) {
        lookahead++;
      }
      if (text[lookahead] === '#') {
        while (lookahead < text.length && text[lookahead] !== '\n' && text[lookahead] !== '\r') {
          lookahead++;
        }
        while (lookahead < text.length && (text[lookahead] === '\n' || text[lookahead] === '\r')) {
          lookahead++;
        }
        i = lookahead;
        continue;
      }
    }

    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      atRecordStart = false;
      i++;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      atFieldStart = true;
      atRecordStart = false;
      i++;
      continue;
    }

    if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
      atRecordStart = true;
      if (char === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }

    field += char;
    atFieldStart = false;
    atRecordStart = false;
    i++;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

function looksLikeHeader(headerRow: string[]): boolean {
  const firstRaw = (headerRow[0] ?? '').trim().toLowerCase();
  if (firstRaw.startsWith('url') || firstRaw.startsWith('link')) return true;

  const firstKey = normalizeToken(headerRow[0] ?? '');
  if (!firstKey) return false;
  if (HEADER_ALIASES.url.includes(firstKey)) return true;

  if (HEADER_ALIASES.type.includes(firstKey)) {
    return headerRow.some((cell) => HEADER_ALIASES.url.includes(normalizeToken(cell)));
  }

  return false;
}

function buildHeaderMap(headerRow: string[]): Record<FieldName, number> {
  const map: Record<FieldName, number> = {
    url: -1,
    type: -1,
  };

  headerRow.forEach((cell, index) => {
    const key = normalizeToken(cell);
    if (!key) return;
    for (const field of FIELD_ORDER) {
      if (map[field] !== -1) continue;
      if (HEADER_ALIASES[field].includes(key)) {
        map[field] = index;
        return;
      }
    }
  });

  if (map.url === -1) map.url = 0;
  return map;
}

/** Trim + validate an http(s) URL, prefixing `https://` for bare `www.` URLs. */
function normalizeUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (/^www\./i.test(value)) value = `https://${value}`;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function cellAt(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? '') : '';
}

function rowToEntry(
  row: string[],
  headerMap: Record<FieldName, number> | null,
): LinkEntry | null {
  if (headerMap) {
    const url = normalizeUrl(cellAt(row, headerMap.url));
    if (!url) return null;

    return {
      url,
      type: normalizeLinkType(cellAt(row, headerMap.type), url),
    };
  }

  // Headerless mode: `url,type` (or reversed `type,url` when cell 0 is a known type).
  const firstAsUrl = normalizeUrl(cellAt(row, 0));
  if (firstAsUrl) {
    return {
      url: firstAsUrl,
      type: normalizeLinkType(cellAt(row, 1), firstAsUrl),
    };
  }

  const firstAsType = parseExplicitLinkType(row[0]);
  const secondAsUrl = normalizeUrl(cellAt(row, 1));
  if (firstAsType && secondAsUrl) {
    return {
      url: secondAsUrl,
      type: firstAsType,
    };
  }

  return null;
}

/**
 * Parse the shared `url,type` links CSV (with or without a header row).
 */
export function parseLinksCsv(csvText: string): LinkEntry[] {
  if (!csvText) return [];

  const rows = splitCsvRows(csvText).filter((row) => !isBlankRow(row));
  if (rows.length === 0) return [];

  const hasHeader = looksLikeHeader(rows[0]);
  const headerMap = hasHeader ? buildHeaderMap(rows[0]) : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const entries: LinkEntry[] = [];
  for (const row of dataRows) {
    const entry = rowToEntry(row, headerMap);
    if (entry) entries.push(entry);
  }

  return entries;
}
