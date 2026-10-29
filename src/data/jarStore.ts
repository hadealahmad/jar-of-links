import { JAR_BY_ID, JAR_CONFIGS } from '../config/jars';
import type { JarId, LinkEntry } from '../types';
import { parseLinksCsv } from './csvParser';

/** Classic in-place Fisher-Yates shuffle. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Client-side store for the jar CSV files.
 *
 * Each jar is fetched once (concurrent requests share the same in-flight
 * promise), cached in memory, and drawn from through a per-jar shuffle bag so
 * a link never repeats until every link in that jar has been drawn.
 */
export class JarStore {
  private readonly entries = new Map<JarId, LinkEntry[]>();
  private readonly inFlight = new Map<JarId, Promise<LinkEntry[]>>();
  /** Remaining (still undrawn) links per jar; the next draw pops from the end. */
  private readonly bags = new Map<JarId, LinkEntry[]>();
  private readonly lastDrawn = new Map<JarId, LinkEntry>();

  async loadJar(jarId: JarId): Promise<LinkEntry[]> {
    const cached = this.entries.get(jarId);
    if (cached) return cached;

    const pending = this.inFlight.get(jarId);
    if (pending) return pending;

    const request = this.fetchJar(jarId).finally(() => {
      this.inFlight.delete(jarId);
    });
    this.inFlight.set(jarId, request);
    return request;
  }

  async preloadAll(): Promise<Partial<Record<JarId, number>>> {
    const results = await Promise.allSettled(JAR_CONFIGS.map((jar) => this.loadJar(jar.id)));
    const counts: Partial<Record<JarId, number>> = {};

    results.forEach((result, index) => {
      const jarId = JAR_CONFIGS[index].id;
      counts[jarId] = result.status === 'fulfilled' ? result.value.length : 0;
    });

    return counts;
  }

  getCount(jarId: JarId): number {
    return this.entries.get(jarId)?.length ?? 0;
  }

  getAllCounts(): Partial<Record<JarId, number>> {
    const counts: Partial<Record<JarId, number>> = {};
    for (const [jarId, entries] of this.entries) {
      counts[jarId] = entries.length;
    }
    return counts;
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

  private async fetchJar(jarId: JarId): Promise<LinkEntry[]> {
    const config = JAR_BY_ID[jarId];
    if (!config) {
      throw new Error(`Unknown jar: ${jarId}`);
    }

    const response = await fetch(config.csvPath);
    if (!response.ok) {
      throw new Error(`Failed to load ${config.csvPath}: ${response.status} ${response.statusText}`);
    }

    const parsed = parseLinksCsv(await response.text());
    this.entries.set(jarId, parsed);
    return parsed;
  }
}
