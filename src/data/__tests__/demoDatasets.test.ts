// @ts-nocheck
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORY_JAR_IDS, JAR_BY_ID, JAR_CONFIGS, LINKS_CSV_PATH } from '../../config/jars';
import { parseLinksCsv } from '../csvParser';
import { computeJarFillRatios } from '../jarStore';
import { extractYouTubeId } from '../ogResolver';

const PUBLIC_DIR = resolve(import.meta.dir, '../../../public');

describe('public/data/links.csv unified 2-column demo dataset', () => {
  test('links.csv has strictly url,type columns and populates all 5 jars with valid relative fill ratios', () => {
    expect(JAR_CONFIGS.length).toBe(5);
    expect(JAR_BY_ID.all.scale).toBeGreaterThan(1.2);

    for (const jar of JAR_CONFIGS) {
      expect(jar.csvPath).toBe(LINKS_CSV_PATH);
    }

    const relPath = LINKS_CSV_PATH.replace(/^\.\//, '');
    const absPath = resolve(PUBLIC_DIR, relPath);
    expect(existsSync(absPath)).toBe(true);

    const raw = readFileSync(absPath, 'utf-8').trim();
    const lines = raw.split(/\r?\n/);
    expect(lines[0]).toBe('url,type');

    for (const line of lines.slice(1)) {
      expect(line.split(',').length).toBe(2);
    }

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
      expect(Object.keys(entry).sort()).toEqual(['type', 'url']);
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

  test('youtube-typed rows contain valid YouTube video IDs', () => {
    const raw = readFileSync(resolve(PUBLIC_DIR, 'data/links.csv'), 'utf-8');
    const youtubeEntries = parseLinksCsv(raw).filter((e) => e.type === 'youtube');

    expect(youtubeEntries.length).toBeGreaterThan(0);
    for (const entry of youtubeEntries) {
      expect(extractYouTubeId(entry.url)).not.toBeNull();
    }
  });
});
