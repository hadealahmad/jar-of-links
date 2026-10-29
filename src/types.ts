export type JarId = 'all' | 'watch' | 'games' | 'books' | 'articles';

/** Concrete link category stored in the `type` column of `public/data/links.csv`. */
export type LinkType = Exclude<JarId, 'all'>;

export interface JarConfig {
  id: JarId;
  /** Display label shown on the jar's parchment pixel label and HUD */
  label: string;
  /** Short pixel-label text rendered directly onto the 3D jar texture */
  shortLabel: string;
  /** Relative URL to the shared static CSV file inside public/data/ */
  csvPath: string;
  /** Relative scale multiplier (center 'all' jar is > 1.0, others are 1.0) */
  scale: number;
  /** Subtle glass tint hex color */
  glassTint: string;
  /** Category accent hex color for badges, borders, and label stamp */
  accentColor: string;
  /** Hex palette used for folded paper notes inside this jar */
  paperColors: string[];
  /** Friendly subtitle shown on hover or mobile pill */
  subtitle: string;
  /** Keyboard shortcut digit ('1' - '5') */
  hotkey: string;
}

export interface LinkEntry {
  url: string;
  type: LinkType;
}

export interface ResolvedLinkPreview {
  url: string;
  title: string;
  description: string;
  /** Resolved OG image URL, or null if unavailable (falls back to procedural pixel banner) */
  image: string | null;
  hostname: string;
  favicon: string;
  jarId: JarId;
  jarLabel: string;
  accentColor: string;
}

export type AnimationPhase =
  | 'idle'
  | 'picking'
  | 'opening'
  | 'extracting'
  | 'unfolding'
  | 'card_open'
  | 'closing';

export interface JarStageCallbacks {
  onJarHover?: (jarId: JarId | null) => void;
  onJarSelect: (jarId: JarId) => void;
  onCorkPop?: (jarId: JarId) => void;
  onPaperExtract?: (jarId: JarId) => void;
  onPaperUnfolded: (jarId: JarId) => void;
  onJarClosed?: (jarId: JarId) => void;
}
