import type { JarConfig, JarId, LinkType } from '../types';

/** Shared static CSV containing all links with a `type` column. */
export const LINKS_CSV_PATH = './data/links.csv';

/** Non-`all` category jar IDs corresponding to `type` values in `links.csv`. */
export const CATEGORY_JAR_IDS: readonly LinkType[] = [
  'watch',
  'games',
  'books',
  'articles',
] as const;

/**
 * Canonical definitions for the 5 jars (Arabic UI):
 *   مرئيات (watch) · ألعاب (games) · الكل (all) · كتب (books) · مقالات (articles)
 * Color scheme harmonized with https://hadealahmad.com:
 *   Brand blues: #0582CA & #006494
 *   Dark surfaces: #131516, #1A1D1E, #202527, #283033
 *   Light paper surfaces: #FFFFFF, #F7F8F8, #EDF1F2, #DFE8EC, #2D353A
 */
export const JAR_CONFIGS: readonly JarConfig[] = [
  {
    id: 'watch',
    label: '\u0645\u0631\u0626\u064a\u0627\u062a',
    shortLabel: '\u0645\u0631\u0626\u064a\u0627\u062a',
    csvPath: LINKS_CSV_PATH,
    scale: 1.0,
    glassTint: '#d8e8f2',
    accentColor: '#e05263',
    paperColors: ['#f29ca6', '#f7cfd4', '#EDF1F2', '#F7F8F8'],
    subtitle: '\u0645\u0642\u0627\u0637\u0639 \u0648\u0642\u0646\u0648\u0627\u062a \u064a\u0648\u062a\u064a\u0648\u0628\u060c \u0623\u0646\u0645\u064a \u0648\u0633\u0644\u0627\u0633\u0644 \u0645\u0631\u0626\u064a\u0629',
    hotkey: '1',
  },
  {
    id: 'games',
    label: '\u0623\u0644\u0639\u0627\u0628',
    shortLabel: '\u0623\u0644\u0639\u0627\u0628',
    csvPath: LINKS_CSV_PATH,
    scale: 1.0,
    glassTint: '#c9eff2',
    accentColor: '#0d9488',
    paperColors: ['#6ee7d8', '#b5f2ea', '#EDF1F2', '#DFE8EC'],
    subtitle: '\u0623\u0644\u0639\u0627\u0628 \u0641\u064a\u062f\u064a\u0648 \u0648\u062a\u062c\u0627\u0631\u0628 \u062a\u0641\u0627\u0639\u0644\u064a\u0629 \u0645\u062e\u062a\u0627\u0631\u0629',
    hotkey: '2',
  },
  {
    id: 'all',
    label: '\u0627\u0644\u0643\u0644',
    shortLabel: '\u0627\u0644\u0643\u0644',
    csvPath: LINKS_CSV_PATH,
    scale: 1.38,
    glassTint: '#d7eefb',
    accentColor: '#0582ca',
    paperColors: ['#38b6ff', '#7cc6fe', '#6ee7d8', '#8bb8d0', '#F7F8F8', '#f29ca6'],
    subtitle: '\u062c\u0645\u064a\u0639 \u0627\u0644\u0631\u0648\u0627\u0628\u0637 \u0645\u062c\u062a\u0645\u0639\u0629 \u0641\u064a \u0627\u0644\u0645\u0631\u0637\u0628\u0627\u0646 \u0627\u0644\u0643\u0628\u064a\u0631',
    hotkey: '3',
  },
  {
    id: 'books',
    label: '\u0643\u062a\u0628',
    shortLabel: '\u0643\u062a\u0628',
    csvPath: LINKS_CSV_PATH,
    scale: 1.0,
    glassTint: '#d5e3ec',
    accentColor: '#006494',
    paperColors: ['#8bb8d0', '#C5CFD4', '#DFE8EC', '#F7F8F8'],
    subtitle: '\u0631\u0648\u0627\u064a\u0627\u062a \u0648\u0643\u062a\u0628 \u062a\u0633\u062a\u062d\u0642 \u0627\u0644\u0642\u0631\u0627\u0621\u0629',
    hotkey: '4',
  },
  {
    id: 'articles',
    label: '\u0645\u0642\u0627\u0644\u0627\u062a',
    shortLabel: '\u0645\u0642\u0627\u0644\u0627\u062a',
    csvPath: LINKS_CSV_PATH,
    scale: 1.0,
    glassTint: '#c9e8f8',
    accentColor: '#2997d8',
    paperColors: ['#7cc6fe', '#bce3fa', '#EDF1F2', '#F7F8F8'],
    subtitle: '\u0645\u0642\u0627\u0644\u0627\u062a\u060c \u062a\u062f\u0648\u064a\u0646\u0627\u062a \u0648\u0642\u0631\u0627\u0621\u0627\u062a \u0645\u0639\u0645\u0651\u0642\u0629',
    hotkey: '5',
  },
] as const;

export const JAR_BY_ID: Record<JarId, JarConfig> = {
  watch: JAR_CONFIGS[0],
  games: JAR_CONFIGS[1],
  all: JAR_CONFIGS[2],
  books: JAR_CONFIGS[3],
  articles: JAR_CONFIGS[4],
};
