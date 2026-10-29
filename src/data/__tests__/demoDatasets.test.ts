// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JAR_CONFIGS, JAR_BY_ID } from '../../config/jars';
import { parseLinksCsv } from '../csvParser';
import { extractYouTubeId, resolveLinkPreview } from '../ogResolver';

const PUBLIC_DIR = resolve(import.meta.dir, '../../../public');

describe('public/data/*.csv demo datasets', () => {
  test('all 5 configured jars map to valid, populated CSV files', () => {
    expect(JAR_CONFIGS.length).toBe(5);
    expect(JAR_BY_ID.all.scale).toBeGreaterThan(1.2);

    for (const jar of JAR_CONFIGS) {
      const relPath = jar.csvPath.replace(/^\.\//, '');
      const absPath = resolve(PUBLIC_DIR, relPath);
      const raw = readFileSync(absPath, 'utf-8');
      const entries = parseLinksCsv(raw);

      expect(entries.length).toBeGreaterThanOrEqual(10);
      for (const entry of entries) {
        const parsed = new URL(entry.url);
        expect(['http:', 'https:']).toContain(parsed.protocol);
      }
    }
  });

  test('youtube.csv contains valid YouTube video IDs and resolves pre-enriched rows instantly', async () => {
    const raw = readFileSync(resolve(PUBLIC_DIR, 'data/youtube.csv'), 'utf-8');
    const entries = parseLinksCsv(raw);

    const enrichedRow = entries.find((e) => e.title && e.image);
    expect(enrichedRow).toBeDefined();

    for (const entry of entries) {
      expect(extractYouTubeId(entry.url)).not.toBeNull();
    }

    const preview = await resolveLinkPreview(enrichedRow!, JAR_BY_ID.youtube);
    expect(preview.jarId).toBe('youtube');
    expect(preview.title.length).toBeGreaterThan(3);
    expect(preview.image).toContain('ytimg.com');
  });
});
