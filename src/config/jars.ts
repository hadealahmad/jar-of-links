import type { JarConfig, JarId } from '../types';

/**
 * Canonical definitions for the 5 jars.
 * Order matches visual shelf arrangement:
 * Desktop left-to-right: youtube, articles, [ALL (center, big)], recommendations, others.
 */
export const JAR_CONFIGS: readonly JarConfig[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    shortLabel: 'YOUTUBE',
    csvPath: './data/youtube.csv',
    scale: 1.0,
    glassTint: '#ffd6de',
    accentColor: '#ff4d6d',
    paperColors: ['#ff8fa3', '#ffb3c1', '#fff0f3', '#ffd166'],
    subtitle: 'Videos, talks & visual rabbit holes',
    hotkey: '1',
  },
  {
    id: 'articles',
    label: 'Articles',
    shortLabel: 'ARTICLES',
    csvPath: './data/articles.csv',
    scale: 1.0,
    glassTint: '#ccf2ff',
    accentColor: '#38bdf8',
    paperColors: ['#90e0ef', '#caf0f8', '#fef9ef', '#a8dadc'],
    subtitle: 'Essays, deep dives & blog posts',
    hotkey: '2',
  },
  {
    id: 'all',
    label: 'All',
    shortLabel: 'ALL',
    csvPath: './data/all.csv',
    scale: 1.38,
    glassTint: '#fff1c2',
    accentColor: '#f59e0b',
    paperColors: ['#fde047', '#ff8fa3', '#90e0ef', '#a7f3d0', '#ddd6fe', '#fed7aa'],
    subtitle: 'Everything mixed into the grand center jar',
    hotkey: '3',
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    shortLabel: 'RECS',
    csvPath: './data/recommendations.csv',
    scale: 1.0,
    glassTint: '#d1fae5',
    accentColor: '#34d399',
    paperColors: ['#6ee7b7', '#a7f3d0', '#ecfdf5', '#fde68a'],
    subtitle: 'Hand-picked tools, gems & favorites',
    hotkey: '4',
  },
  {
    id: 'others',
    label: 'Others',
    shortLabel: 'OTHERS',
    csvPath: './data/others.csv',
    scale: 1.0,
    glassTint: '#ede9fe',
    accentColor: '#c084fc',
    paperColors: ['#d8b4fe', '#e9d5ff', '#fae8ff', '#fbcfe8'],
    subtitle: 'Curiosities, toys & internet treasures',
    hotkey: '5',
  },
] as const;

export const JAR_BY_ID: Record<JarId, JarConfig> = {
  youtube: JAR_CONFIGS[0],
  articles: JAR_CONFIGS[1],
  all: JAR_CONFIGS[2],
  recommendations: JAR_CONFIGS[3],
  others: JAR_CONFIGS[4],
};
