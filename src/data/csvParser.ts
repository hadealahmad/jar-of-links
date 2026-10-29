import type { LinkEntry } from '../types';

type FieldName = 'url' | 'title' | 'description' | 'image' | 'siteName';

const FIELD_ORDER: readonly FieldName[] = ['url', 'title', 'description', 'image', 'siteName'];

/** Accepted (normalized) header spellings for each logical column. */
const HEADER_ALIASES: Record<FieldName, readonly string[]> = {
  url: ['url', 'link', 'linkurl', 'href', 'ogurl'],
  title: ['title', 'name', 'ogtitle'],
  description: ['description', 'desc', 'summary', 'ogdescription'],
  image: ['image', 'ogimage', 'thumbnail', 'thumb', 'img', 'imageurl'],
  siteName: ['sitename', 'site', 'publisher', 'ogsitename'],
};

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

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function looksLikeHeader(firstCell: string): boolean {
  const value = firstCell.trim().toLowerCase();
  return value.startsWith('url') || value.startsWith('link');
}

function buildHeaderMap(headerRow: string[]): Record<FieldName, number> {
  const map: Record<FieldName, number> = {
    url: -1,
    title: -1,
    description: -1,
    image: -1,
    siteName: -1,
  };

  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (!key) return;
    for (const field of FIELD_ORDER) {
      if (map[field] !== -1) continue;
      if (HEADER_ALIASES[field].includes(key)) {
        map[field] = index;
        return;
      }
    }
  });

  // A header row without a recognizable URL column still falls back to column 0.
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

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cellAt(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? '') : '';
}

function rowToEntry(row: string[], headerMap: Record<FieldName, number>): LinkEntry | null {
  const url = normalizeUrl(cellAt(row, headerMap.url));
  if (!url) return null;

  return {
    url,
    title: cleanOptional(cellAt(row, headerMap.title)),
    description: cleanOptional(cellAt(row, headerMap.description)),
    image: cleanOptional(cellAt(row, headerMap.image)),
    siteName: cleanOptional(cellAt(row, headerMap.siteName)),
  };
}

/**
 * Parse a links CSV containing either a header row or plain data rows.
 *
 * Supported layouts:
 * - Header row (`url`/`link`, `title`, `description`/`desc`,
 *   `image`/`og_image`/`thumbnail`, `site_name`/`sitename`/`site`), case-insensitive.
 * - Headerless rows: `url,title,description,image,site_name` by position, so a
 *   one-column file of bare URLs works as-is.
 */
export function parseLinksCsv(csvText: string): LinkEntry[] {
  if (!csvText) return [];

  const rows = splitCsvRows(csvText).filter((row) => !isBlankRow(row));
  if (rows.length === 0) return [];

  const hasHeader = looksLikeHeader(rows[0][0] ?? '');
  const headerMap = hasHeader
    ? buildHeaderMap(rows[0])
    : ({
        url: 0,
        title: 1,
        description: 2,
        image: 3,
        siteName: 4,
      } satisfies Record<FieldName, number>);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const entries: LinkEntry[] = [];
  for (const row of dataRows) {
    const entry = rowToEntry(row, headerMap);
    if (entry) entries.push(entry);
  }

  return entries;
}
