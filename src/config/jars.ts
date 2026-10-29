import type { JarConfig, JarId } from '../types';

/**
 * Canonical definitions for the 5 jars (Arabic UI).
 * Color scheme harmonized with https://hadealahmad.com:
 *   Brand blues: #0582CA & #006494
 *   Dark surfaces: #131516, #1A1D1E, #202527, #283033
 *   Light paper surfaces: #FFFFFF, #F7F8F8, #EDF1F2, #DFE8EC, #2D353A
 */
export const JAR_CONFIGS: readonly JarConfig[] = [
  {
    id: 'youtube',
    label: 'يوتيوب',
    shortLabel: 'يوتيوب',
    csvPath: './data/youtube.csv',
    scale: 1.0,
    glassTint: '#d8e8f2',
    accentColor: '#e05263',
    paperColors: ['#f29ca6', '#f7cfd4', '#EDF1F2', '#F7F8F8'],
    subtitle: 'مقاطع مرئية، محاضرات وعوالم إبداعية',
    hotkey: '1',
  },
  {
    id: 'articles',
    label: 'مقالات',
    shortLabel: 'مقالات',
    csvPath: './data/articles.csv',
    scale: 1.0,
    glassTint: '#c9e8f8',
    accentColor: '#0582ca',
    paperColors: ['#7cc6fe', '#bce3fa', '#EDF1F2', '#F7F8F8'],
    subtitle: 'مقالات، شروحات وتدوينات معمّقة',
    hotkey: '2',
  },
  {
    id: 'all',
    label: 'الكل',
    shortLabel: 'الكل',
    csvPath: './data/all.csv',
    scale: 1.38,
    glassTint: '#d7eefb',
    accentColor: '#0582ca',
    paperColors: ['#38b6ff', '#7cc6fe', '#6ee7d8', '#F7F8F8', '#DFE8EC', '#f29ca6'],
    subtitle: 'جميع الروابط مجتمعة في المرطبان الكبير',
    hotkey: '3',
  },
  {
    id: 'recommendations',
    label: 'توصيات',
    shortLabel: 'توصيات',
    csvPath: './data/recommendations.csv',
    scale: 1.0,
    glassTint: '#c9eff2',
    accentColor: '#0d9488',
    paperColors: ['#6ee7d8', '#b5f2ea', '#EDF1F2', '#DFE8EC'],
    subtitle: 'أدوات ومواقع مختارة بعناية',
    hotkey: '4',
  },
  {
    id: 'others',
    label: 'أخرى',
    shortLabel: 'أخرى',
    csvPath: './data/others.csv',
    scale: 1.0,
    glassTint: '#d5e3ec',
    accentColor: '#006494',
    paperColors: ['#8bb8d0', '#C5CFD4', '#DFE8EC', '#F7F8F8'],
    subtitle: 'نوادر وتجارب رقمية ممتعة من الإنترنت',
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
