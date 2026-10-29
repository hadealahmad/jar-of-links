// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORY_JAR_IDS, JAR_BY_ID, JAR_CONFIGS, LINKS_CSV_PATH } from '../../config/jars';
import { parseLinksCsv } from '../csvParser';
import { computeJarFillRatios } from '../jarStore';
import { extractYouTubeId, resolveLinkPreview } from '../ogResolver';

const PUBLIC_DIR = resolve(import.meta.dir, '../../../public');

describe('public/data/links.csv unified demo dataset', () => {
  test('all 5 jars read from a single populated links.csv with valid types and relative fill ratios', () => {
    expect(JAR_CONFIGS.length).toBe(5);
    expect(JAR_BY_ID.all.scale).toBeGreaterThan(1.2);

    for (const jar of JAR_CONFIGS) {
      expect(jar.csvPath).toBe(LINKS_CSV_PATH);
    }

    const relPath = LINKS_CSV_PATH.replace(/^\.\//, '');
    const absPath = resolve(PUBLIC_DIR, relPath);
    expect(existsSync(absPath)).toBe(true);

    // Legacy 5-file layout should be gone.
    for (const legacy of ['all.csv', 'youtube.csv', 'articles.csv', 'recommendations.csv', 'others.csv']) {
      expect(existsSync(resolve(PUBLIC_DIR, 'data', legacy))).toBe(false);
    }

    const raw = readFileSync(absPath, 'utf-8');
    const entries = parseLinksCsv(raw);

    expect(entries.length).toBeGreaterThanOrEqual(25);

    const counts: Record<string, number> = {
      all: entries.length,
      youtube: 0,
      articles: 0,
      recommendations: 0,
      others: 0,
    };

    for (const entry of entries) {
      const parsed = new URL(entry.url);
      expect(['http:', 'https:']).toContain(parsed.protocol);
      expect(CATEGORY_JAR_IDS).toContain(entry.type);
      counts[entry.type] += 1;
    }

    for (const categoryId of CATEGORY_JAR_IDS) {
      expect(counts[categoryId]).toBeGreaterThan(0);
    }

    const ratios = computeJarFillRatios(counts);
    expect(ratios.all).toBe(1);
    for (const categoryId of CATEGORY_JAR_IDS) {
      expect(ratios[categoryId]).toBeGreaterThan(0);
      expect(ratios[categoryId]).toBeLessThan(ratios.all);
    }
  });

  test('youtube-typed rows contain valid YouTube video IDs and resolve pre-enriched rows instantly', async () => {
    const raw = readFileSync(resolve(PUBLIC_DIR, 'data/links.csv'), 'utf-8');
    const youtubeEntries = parseLinksCsv(raw).filter((e) => e.type === 'youtube');

    expect(youtubeEntries.length).toBeGreaterThan(0);
    const enrichedRow = youtubeEntries.find((e) => e.title && e.image);
    expect(enrichedRow).toBeDefined();

    for (const entry of youtubeEntries) {
      expect(extractYouTubeId(entry.url)).not.toBeNull();
    }

    const preview = await resolveLinkPreview(enrichedRow!, JAR_BY_ID.youtube);
    expect(preview.jarId).toBe('youtube');
    expect(preview.title.length).toBeGreaterThan(3);
    expect(preview.image).toContain('ytimg.com');
  });
});
