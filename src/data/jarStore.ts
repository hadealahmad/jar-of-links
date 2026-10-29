import { CATEGORY_JAR_IDS, JAR_BY_ID, JAR_CONFIGS, LINKS_CSV_PATH } from '../config/jars';
import type { JarId, LinkEntry, LinkType } from '../types';
import { parseLinksCsv } from './csvParser';

/**
 * Maximum visual fill ratio for any single category jar so the `all` jar (1.0)
 * always appears visually fuller than every individual category jar.
 */
export const MAX_CATEGORY_FILL_RATIO = 0.78;

/**
 * Compute visual fullness in `[0, 1]` for all 5 jars from their item counts:
 * - `all` is always the most visually full (`1.0` whenever total > 0, `0` when completely empty).
 * - Other jars scale proportionally to their count relative to the largest category jar,
 *   capped at `MAX_CATEGORY_FILL_RATIO` (`0.78`) so `all` remains strictly fuller.
 */
export function computeJarFillRatios(
  counts: Partial<Record<JarId, number>>,
): Record<JarId, number> {
  const categoryCounts: Record<LinkType, number> = {
    youtube: Math.max(0, counts.youtube ?? 0),
    articles: Math.max(0, counts.articles ?? 0),
    recommendations: Math.max(0, counts.recommendations ?? 0),
    others: Math.max(0, counts.others ?? 0),
  };

  const sumCategories =
    categoryCounts.youtube +
    categoryCounts.articles +
    categoryCounts.recommendations +
    categoryCounts.others;
  const allCount = Math.max(0, counts.all ?? sumCategories);
  const maxCategory = Math.max(
    categoryCounts.youtube,
    categoryCounts.articles,
    categoryCounts.recommendations,
    categoryCounts.others,
  );

  return {
    all: allCount > 0 ? 1 : 0,
    youtube:
      maxCategory > 0 ? (categoryCounts.youtube / maxCategory) * MAX_CATEGORY_FILL_RATIO : 0,
    articles:
      maxCategory > 0 ? (categoryCounts.articles / maxCategory) * MAX_CATEGORY_FILL_RATIO : 0,
    recommendations:
      maxCategory > 0
        ? (categoryCounts.recommendations / maxCategory) * MAX_CATEGORY_FILL_RATIO
        : 0,
    others:
      maxCategory > 0 ? (categoryCounts.others / maxCategory) * MAX_CATEGORY_FILL_RATIO : 0,
  };
}

/** Classic in-place Fisher-Yates shuffle. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Client-side store backed by a single shared CSV (`./data/links.csv`) with a `type` column.
 *
 * The CSV is fetched once (concurrent requests across any jars share the same
 * in-flight promise), partitioned by `type` for category jars while `all` receives
 * every row, and drawn from through a per-jar shuffle bag so a link never repeats
 * until every link in that jar has been drawn.
 */
export class JarStore {
  private readonly csvPath: string;
  private readonly entries = new Map<JarId, LinkEntry[]>();
  private loaded = false;
  private inFlight: Promise<void> | null = null;
  /** Remaining (still undrawn) links per jar; the next draw pops from the end. */
  private readonly bags = new Map<JarId, LinkEntry[]>();
  private readonly lastDrawn = new Map<JarId, LinkEntry>();

  constructor(csvPath: string = LINKS_CSV_PATH) {
    this.csvPath = csvPath;
  }

  async loadJar(jarId: JarId): Promise<LinkEntry[]> {
    if (!JAR_BY_ID[jarId]) {
      throw new Error(`Unknown jar: ${jarId}`);
    }

    await this.ensureLoaded();
    return this.entries.get(jarId) ?? [];
  }

  async preloadAll(): Promise<Record<JarId, number>> {
    try {
      await this.ensureLoaded();
    } catch {
      const zeroCounts: Record<JarId, number> = {
        youtube: 0,
        articles: 0,
        all: 0,
        recommendations: 0,
        others: 0,
      };
      return zeroCounts;
    }

    return {
      youtube: this.getCount('youtube'),
      articles: this.getCount('articles'),
      all: this.getCount('all'),
      recommendations: this.getCount('recommendations'),
      others: this.getCount('others'),
    };
  }

  getCount(jarId: JarId): number {
    return this.entries.get(jarId)?.length ?? 0;
  }

  getAllCounts(): Partial<Record<JarId, number>> {
    const counts: Partial<Record<JarId, number>> = {};
    for (const [jarId, list] of this.entries) {
      counts[jarId] = list.length;
    }
    return counts;
  }

  getFillRatios(): Record<JarId, number> {
    return computeJarFillRatios(this.getAllCounts());
  }

  async drawRandom(jarId: JarId): Promise<LinkEntry | null> {
    const entries = await this.loadJar(jarId);
    if (entries.length === 0) return null;

    let bag = this.bags.get(jarId);
    if (!bag || bag.length === 0) {
      bag = shuffle([...entries]);

      // Never let the first pick of a new bag repeat the last pick of the old one.
      const previous = this.lastDrawn.get(jarId);
      if (previous && entries.length > 1) {
        const lastIndex = bag.length - 1;
        if (bag[lastIndex] === previous) {
          const swapIndex = bag.findIndex((entry) => entry !== previous);
          if (swapIndex !== -1) {
            [bag[lastIndex], bag[swapIndex]] = [bag[swapIndex], bag[lastIndex]];
          }
        }
      }

      this.bags.set(jarId, bag);
    }

    const entry = bag.pop();
    if (!entry) return null;

    this.lastDrawn.set(jarId, entry);
    return entry;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (this.inFlight) return this.inFlight;

    const request = this.fetchAndPartition().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = request;
    return request;
  }

  private async fetchAndPartition(): Promise<void> {
    const response = await fetch(this.csvPath);
    if (!response.ok) {
      throw new Error(`Failed to load ${this.csvPath}: ${response.status} ${response.statusText}`);
    }

    const allEntries = parseLinksCsv(await response.text());
    const byCategory: Record<LinkType, LinkEntry[]> = {
      youtube: [],
      articles: [],
      recommendations: [],
      others: [],
    };

    for (const entry of allEntries) {
      byCategory[entry.type].push(entry);
    }

    this.entries.set('all', allEntries);
    for (const categoryId of CATEGORY_JAR_IDS) {
      this.entries.set(categoryId, byCategory[categoryId]);
    }
    for (const config of JAR_CONFIGS) {
      if (!this.entries.has(config.id)) {
        this.entries.set(config.id, []);
      }
    }

    this.loaded = true;
  }
}
