import * as THREE from 'three';
import type { JarConfig } from '../types';

/* -------------------------------------------------------------------------
 * Built-in 5x7 bitmap pixel font.
 *
 * Every glyph is drawn with integer `fillRect` calls, so pixel typography on
 * jar labels and fallback OG banners stays razor-sharp. No webfont loading,
 * no canvas text anti-aliasing, no race conditions.
 * ---------------------------------------------------------------------- */

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;

export const PIXEL_FONT: Record<string, readonly string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],

  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],

  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],

  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '..#..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '&': ['.##..', '#..#.', '#..#.', '.##..', '#.#.#', '#..#.', '.##.#'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '*': ['.....', '..#..', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '★': ['..#..', '.###.', '#####', '.###.', '.#.#.', '#.#.#', '.....'],
};

const FALLBACK_GLYPH = PIXEL_FONT['?'];

export interface PixelTextOptions {
  /** Integer pixel scale (1 = 5x7 tiny, 2/3 = chunky). Clamped to >= 1. */
  scale?: number;
  color?: string;
  /** Optional offset colour painted behind the glyphs for a crisp emboss/drop shadow. */
  highlightColor?: string;
  /** Integer offset of the highlight in output pixels. */
  highlightOffset?: number;
  /** Blank pixel columns between glyphs (in font pixels, before scaling). */
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
}

export function measurePixelText(text: string, scale = 1, letterSpacing = 1): number {
  const glyphs = Array.from(text);
  if (glyphs.length === 0) return 0;
  const pixelScale = Math.max(1, Math.floor(scale));
  const spacing = Math.max(0, Math.floor(letterSpacing));
  return (glyphs.length * GLYPH_WIDTH + (glyphs.length - 1) * spacing) * pixelScale;
}

/** Draw 5x7 bitmap text with integer `fillRect` calls. Returns the drawn width in pixels. */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: PixelTextOptions = {},
): number {
  const scale = Math.max(1, Math.floor(options.scale ?? 1));
  const letterSpacing = Math.max(0, Math.floor(options.letterSpacing ?? 1));
  const width = measurePixelText(text, scale, letterSpacing);

  let startX = Math.round(x);
  if (options.align === 'center') startX = Math.round(x - width / 2);
  else if (options.align === 'right') startX = Math.round(x - width);
  const startY = Math.round(y);

  const paint = (color: string, offsetX: number, offsetY: number): void => {
    ctx.fillStyle = color;
    let penX = startX;
    for (const character of text) {
      const glyph = PIXEL_FONT[character.toUpperCase()] ?? FALLBACK_GLYPH;
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        const line = glyph[row] ?? '';
        for (let col = 0; col < GLYPH_WIDTH; col++) {
          if (line.charAt(col) === '#') {
            ctx.fillRect(penX + col * scale + offsetX, startY + row * scale + offsetY, scale, scale);
          }
        }
      }
      penX += (GLYPH_WIDTH + letterSpacing) * scale;
    }
  };

  if (options.highlightColor) {
    const highlightOffset = Math.max(1, Math.floor(options.highlightOffset ?? 1));
    paint(options.highlightColor, highlightOffset, highlightOffset);
  }
  paint(options.color ?? '#231712', 0, 0);

  return width;
}

function fitPixelText(text: string, maxWidth: number, scale: number, letterSpacing: number): string {
  if (measurePixelText(text, scale, letterSpacing) <= maxWidth) return text;

  const ellipsis = '...';
  let trimmed = text;
  while (trimmed.length > 0 && measurePixelText(trimmed + ellipsis, scale, letterSpacing) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length > 0 ? `${trimmed.trimEnd()}${ellipsis}` : ellipsis;
}

/* -------------------------------------------------------------------------
 * Small deterministic helpers (no Math.random in texture art).
 * ---------------------------------------------------------------------- */

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed: string | number): () => number {
  return mulberry32(typeof seed === 'number' ? seed : hashString(seed));
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(hex: string): [number, number, number] {
  const match = HEX_PATTERN.exec((hex ?? '').trim());
  let value = match ? match[1] : 'f5e6c8';
  if (value.length === 3) {
    value = value
      .split('')
      .map((channel) => channel + channel)
      .join('');
  }
  const numeric = parseInt(value, 16);
  return [(numeric >> 16) & 0xff, (numeric >> 8) & 0xff, numeric & 0xff];
}

function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function normalizeHex(hex: string): string {
  const [red, green, blue] = parseHex(hex);
  return toHex(red, green, blue);
}

/** Blend two hex colours; `t = 0` returns `from`, `t = 1` returns `to`. */
function mixHex(from: string, to: string, t: number): string {
  const [fr, fg, fb] = parseHex(from);
  const [tr, tg, tb] = parseHex(to);
  const ratio = Math.max(0, Math.min(1, t));
  return toHex(
    fr + (tr - fr) * ratio,
    fg + (tg - fg) * ratio,
    fb + (tb - fb) * ratio,
  );
}

/* -------------------------------------------------------------------------
 * Canvas / texture plumbing.
 * ---------------------------------------------------------------------- */

interface PixelCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function createCanvas(width: number, height: number): PixelCanvas {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** All textures are crisp, sRGB, mipmap-free pixel art. */
function createTexture(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

/* -------------------------------------------------------------------------
 * Jar parchment label.
 * ---------------------------------------------------------------------- */

const LABEL_WIDTH = 128;
const LABEL_HEIGHT = 64;

export function createJarLabelTexture(config: JarConfig): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(LABEL_WIDTH, LABEL_HEIGHT);
  const rng = createRng(`jar-label:${config.id}:${config.shortLabel}`);
  const accent = normalizeHex(config.accentColor);

  // Dark stitched outer border.
  ctx.fillStyle = '#2b1d14';
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

  // Warm aged parchment face.
  const inset = 3;
  ctx.fillStyle = '#f5e6c8';
  ctx.fillRect(inset, inset, LABEL_WIDTH - inset * 2, LABEL_HEIGHT - inset * 2);

  // 2-tone pixel dither/aging concentrated near the edges.
  const ageColors = ['#ead9b6', '#ddc79e', '#d3ba8c'];
  for (let i = 0; i < 300; i++) {
    const x = inset + Math.floor(rng() * (LABEL_WIDTH - inset * 2));
    const y = inset + Math.floor(rng() * (LABEL_HEIGHT - inset * 2));
    const edgeDistance = Math.min(
      x - inset,
      LABEL_WIDTH - inset - 1 - x,
      y - inset,
      LABEL_HEIGHT - inset - 1 - y,
    );
    if (edgeDistance > 9) continue;
    if (edgeDistance < 3 && rng() < 0.35) continue;
    ctx.fillStyle = ageColors[Math.floor(rng() * ageColors.length)];
    ctx.fillRect(x, y, edgeDistance < 3 && rng() < 0.35 ? 2 : 1, 1);
  }

  // Soft inner shading bevels.
  ctx.fillStyle = '#ead9b6';
  ctx.fillRect(inset + 1, inset + 1, LABEL_WIDTH - (inset + 1) * 2, 1);
  ctx.fillStyle = '#ddc79e';
  ctx.fillRect(inset + 1, LABEL_HEIGHT - inset - 2, LABEL_WIDTH - (inset + 1) * 2, 1);

  // Inner accent frame (2px, integer-aligned).
  const frame = 8;
  const frameThickness = 2;
  ctx.fillStyle = accent;
  ctx.fillRect(frame, frame, LABEL_WIDTH - frame * 2, frameThickness);
  ctx.fillRect(frame, LABEL_HEIGHT - frame - frameThickness, LABEL_WIDTH - frame * 2, frameThickness);
  ctx.fillRect(frame, frame, frameThickness, LABEL_HEIGHT - frame * 2);
  ctx.fillRect(LABEL_WIDTH - frame - frameThickness, frame, frameThickness, LABEL_HEIGHT - frame * 2);

  // Four corner pixel rivets.
  const rivets: Array<[number, number]> = [
    [frame - 1, frame - 1],
    [LABEL_WIDTH - frame - 3, frame - 1],
    [frame - 1, LABEL_HEIGHT - frame - 3],
    [LABEL_WIDTH - frame - 3, LABEL_HEIGHT - frame - 3],
  ];
  for (const [rx, ry] of rivets) {
    ctx.fillStyle = '#2b1d14';
    ctx.fillRect(rx, ry, 4, 4);
    ctx.fillStyle = accent;
    ctx.fillRect(rx + 1, ry + 1, 2, 2);
    ctx.fillStyle = '#fff8eb';
    ctx.fillRect(rx + 1, ry + 1, 1, 1);
    ctx.fillStyle = mixHex(accent, '#2b1d14', 0.4);
    ctx.fillRect(rx + 2, ry + 2, 1, 1);
  }

  // Tiny centred studs on the top and bottom of the parchment.
  ctx.fillStyle = mixHex(accent, '#fff8eb', 0.25);
  for (const offset of [-8, 0, 8]) {
    ctx.fillRect(LABEL_WIDTH / 2 + offset, 5, 1, 1);
    ctx.fillRect(LABEL_WIDTH / 2 + offset, LABEL_HEIGHT - 6, 1, 1);
  }

  // Crisp auto-scaled bitmap label text.
  const text = (config.shortLabel || config.label || '').trim().toUpperCase();
  const available = LABEL_WIDTH - frame * 2 - 10;
  let scale = 3;
  if (measurePixelText(text, scale) > available) scale = 2;
  if (measurePixelText(text, scale) > available) scale = 1;

  const textHeight = GLYPH_HEIGHT * scale;
  const textTop = Math.round((LABEL_HEIGHT - textHeight) / 2) - (scale === 3 ? 1 : 0);
  drawPixelText(ctx, text, LABEL_WIDTH / 2, textTop, {
    scale,
    align: 'center',
    color: '#231712',
    highlightColor: '#fff8eb',
    highlightOffset: 1,
  });

  return createTexture(canvas);
}

/* -------------------------------------------------------------------------
 * Cork stopper grain.
 * ---------------------------------------------------------------------- */

export function createCorkTexture(): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = createCanvas(size, size);
  const rng = createRng('cork-grain-v1');

  ctx.fillStyle = '#b87d4b';
  ctx.fillRect(0, 0, size, size);

  // Broad mottled base variation.
  const mottle = ['#b87d4b', '#ad7243', '#c18753'];
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = mottle[Math.floor(rng() * mottle.length)];
    ctx.fillRect(
      Math.floor(rng() * size),
      Math.floor(rng() * size),
      1 + Math.floor(rng() * 2),
      1 + Math.floor(rng() * 2),
    );
  }

  // Fine cork speckles.
  const speckles = ['#9c6334', '#d19a66', '#7a4922'];
  for (let i = 0; i < 210; i++) {
    ctx.fillStyle = speckles[Math.floor(rng() * speckles.length)];
    ctx.fillRect(
      Math.floor(rng() * size),
      Math.floor(rng() * size),
      rng() < 0.18 ? 2 : 1,
      1,
    );
  }

  // Short wrapped grain dashes.
  for (let i = 0; i < 28; i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const length = 2 + Math.floor(rng() * 4);
    ctx.fillStyle = rng() < 0.5 ? '#9c6334' : '#7a4922';
    for (let k = 0; k < length; k++) {
      ctx.fillRect((x + k) % size, y, 1, 1);
    }
  }

  return createTexture(canvas);
}

/* -------------------------------------------------------------------------
 * Cozy dark-oak shelf planks (seamlessly repeatable).
 * ---------------------------------------------------------------------- */

export function createWoodShelfTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = createCanvas(size, size);
  const plankHeight = 16;
  const plankColors = ['#4d3020', '#3d2518'];

  for (let plank = 0; plank < size / plankHeight; plank++) {
    const top = plank * plankHeight;
    ctx.fillStyle = plankColors[plank % plankColors.length];
    ctx.fillRect(0, top, size, plankHeight);

    // Plank seam: dark groove plus a warm highlight lip.
    ctx.fillStyle = '#2b1910';
    ctx.fillRect(0, top, size, 1);
    ctx.fillStyle = '#5c3a28';
    ctx.fillRect(0, top + 1, size, 1);

    // Grain streaks, wrapped horizontally to tile cleanly.
    const grainRng = createRng(`wood-plank-${plank}`);
    for (let i = 0; i < 20; i++) {
      const y = top + 3 + Math.floor(grainRng() * (plankHeight - 5));
      const x = Math.floor(grainRng() * size);
      const length = 3 + Math.floor(grainRng() * 13);
      ctx.fillStyle = grainRng() < 0.62 ? '#2b1910' : '#5c3a28';
      for (let k = 0; k < length; k++) {
        ctx.fillRect((x + k) % size, y, 1, 1);
      }
    }

    // Occasional knot.
    if (plank % 2 === 1) {
      const kx = 10 + Math.floor(grainRng() * 44);
      const ky = top + 6 + Math.floor(grainRng() * 5);
      ctx.fillStyle = '#2b1910';
      ctx.fillRect(kx, ky, 3, 2);
      ctx.fillRect(kx + 1, ky - 1, 1, 1);
      ctx.fillStyle = '#5c3a28';
      ctx.fillRect(kx, ky - 1, 1, 1);
      ctx.fillRect(kx + 1, ky + 2, 1, 1);
    }
  }

  // Fine cross-plank grain flecks.
  const fineRng = createRng('wood-fine-grain');
  for (let i = 0; i < 44; i++) {
    ctx.fillStyle = fineRng() < 0.5 ? '#3d2518' : '#5c3a28';
    const y = Math.floor(fineRng() * size);
    const x = Math.floor(fineRng() * size);
    const length = 2 + Math.floor(fineRng() * 6);
    for (let k = 0; k < length; k++) {
      ctx.fillRect((x + k) % size, y, 1, 1);
    }
  }

  return createTexture(canvas, true);
}

/* -------------------------------------------------------------------------
 * Folded paper notes (tinted per jar palette).
 * ---------------------------------------------------------------------- */

export function createPaperSlipTexture(baseHex: string): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = createCanvas(size, size);
  const base = normalizeHex(baseHex);
  const border = mixHex(base, '#3a2b21', 0.3);
  const light = mixHex(base, '#ffffff', 0.35);
  const ink = mixHex(base, '#2b1d14', 0.72);
  const rng = createRng(`paper-slip:${base}`);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Paper fibre noise.
  for (let i = 0; i < 36; i++) {
    ctx.fillStyle = rng() < 0.5 ? light : border;
    ctx.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
  }

  // Light bevel on the top and left.
  ctx.fillStyle = light;
  ctx.fillRect(1, 1, size - 2, 1);
  ctx.fillRect(1, 1, 1, size - 2);

  // Dark pixel border.
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, size, 1);
  ctx.fillRect(0, size - 1, size, 1);
  ctx.fillRect(0, 0, 1, size);
  ctx.fillRect(size - 1, 0, 1, size);

  // Horizontal fold crease across the middle.
  ctx.fillStyle = border;
  ctx.fillRect(2, 16, size - 4, 1);
  ctx.fillStyle = light;
  ctx.fillRect(2, 17, size - 4, 1);

  // Dog-eared bottom-right corner.
  for (let y = size - 7; y < size; y++) {
    for (let x = size - 7; x < size; x++) {
      if (x + y >= 57) {
        ctx.fillStyle = light;
        ctx.fillRect(x, y, 1, 1);
      } else if (x + y === 56) {
        ctx.fillStyle = border;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // Tiny pixel "handwriting" squiggle bars.
  const handwritingRows = [6, 9, 12, 20, 23, 26];
  for (const row of handwritingRows) {
    let x = 5 + Math.floor(rng() * 3);
    const end = 27 - Math.floor(rng() * 4);
    while (x < end) {
      const length = 2 + Math.floor(rng() * 4);
      ctx.fillStyle = ink;
      ctx.fillRect(x, row, Math.min(length, end - x), 1);
      if (rng() < 0.5) ctx.fillRect(x, row + 1, 1, 1);
      x += length + 2 + Math.floor(rng() * 2);
    }
  }

  return createTexture(canvas);
}

/* -------------------------------------------------------------------------
 * Deterministic procedural OG fallback banner.
 * ---------------------------------------------------------------------- */

function drawSparkle(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, color: string): void {
  const x = Math.round(centerX);
  const y = Math.round(centerY);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
  ctx.globalAlpha = 0.7;
  ctx.fillRect(x - 1, y, 1, 1);
  ctx.fillRect(x + 1, y, 1, 1);
  ctx.fillRect(x, y - 1, 1, 1);
  ctx.fillRect(x, y + 1, 1, 1);
  ctx.globalAlpha = 1;
}

function drawPixelJarIcon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  accent: string,
): void {
  const dark = '#191126';
  const glass = mixHex(accent, '#fff8eb', 0.35);
  const glassDeep = mixHex(accent, '#191126', 0.35);
  const glint = mixHex('#fff8eb', accent, 0.2);
  const corkDark = '#8a5a33';
  const corkLight = '#b8834f';
  const x = Math.round(centerX);
  const y = Math.round(top);

  // Cork stopper.
  ctx.fillStyle = corkDark;
  ctx.fillRect(x - 4, y, 9, 3);
  ctx.fillStyle = corkLight;
  ctx.fillRect(x - 3, y, 7, 1);
  ctx.fillStyle = dark;
  ctx.fillRect(x - 5, y + 2, 11, 1);

  // Neck.
  ctx.fillStyle = dark;
  ctx.fillRect(x - 4, y + 3, 9, 2);
  ctx.fillStyle = glass;
  ctx.fillRect(x - 3, y + 3, 7, 1);

  // Jar body tinted glass.
  ctx.fillStyle = glassDeep;
  ctx.fillRect(x - 9, y + 5, 19, 14);
  ctx.fillStyle = glass;
  ctx.fillRect(x - 8, y + 6, 17, 12);

  // Folded paper slips inside.
  const slips = ['#fff8eb', mixHex(accent, '#ffffff', 0.4), '#ffd166'];
  for (let i = 0; i < slips.length; i++) {
    const slipX = x - 5 + i * 3;
    const slipY = y + 11 + (i % 2);
    ctx.fillStyle = slips[i];
    ctx.fillRect(slipX, slipY, 3, 6 - (i % 2));
    ctx.fillStyle = mixHex(slips[i], '#2b1d14', 0.35);
    ctx.fillRect(slipX, slipY, 3, 1);
  }

  // Glass glint.
  ctx.fillStyle = glint;
  ctx.fillRect(x - 6, y + 7, 1, 6);
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x - 7, y + 7, 1, 3);
  ctx.globalAlpha = 1;

  // Crisp dark outline.
  ctx.fillStyle = dark;
  ctx.fillRect(x - 9, y + 5, 19, 1);
  ctx.fillRect(x - 9, y + 18, 19, 1);
  ctx.fillRect(x - 9, y + 5, 1, 14);
  ctx.fillRect(x + 9, y + 5, 1, 14);
}

export function generateFallbackOgDataUrl(title: string, hostname: string, accentColor: string): string {
  const width = 160;
  const height = 90;
  const { canvas, ctx } = createCanvas(width, height);

  const accent = normalizeHex(accentColor);
  const seed = hashString(`${hostname}\u0000${title}`);
  const rng = createRng(seed);
  const horizon = 60;

  const skyTop = mixHex('#151129', accent, 0.1);
  const skyMid = mixHex('#241c40', accent, 0.16);
  const skyLow = mixHex('#3b2a55', accent, 0.22);
  const skyGlow = mixHex('#5a3c70', accent, 0.28);
  const frameDark = '#110c18';
  const accentBright = mixHex(accent, '#ffffff', 0.35);

  // Twilight sky, banded in 2px strips.
  for (let y = 0; y < horizon; y += 2) {
    const t = y / horizon;
    ctx.fillStyle = t < 0.32 ? skyTop : t < 0.7 ? skyMid : skyLow;
    ctx.fillRect(0, y, width, 2);
  }

  // Warm accent haze near the horizon.
  ctx.globalAlpha = 0.5;
  for (let y = horizon - 12; y < horizon; y += 2) {
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, y, width, 1);
  }
  ctx.globalAlpha = 1;

  // Checkerboard dither texture.
  for (let y = 0; y < horizon; y++) {
    for (let x = 0; x < width; x++) {
      if (((x + y) & 1) === 0 && rng() < 0.16) {
        ctx.fillStyle = rng() < 0.5 ? skyTop : skyLow;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // Deterministic stars, kept clear of the jar icon.
  for (let i = 0; i < 30; i++) {
    const starX = 5 + Math.floor(rng() * (width - 10));
    const starY = 5 + Math.floor(rng() * 26);
    if (starX > 58 && starX < 102) continue;
    const bright = rng() < 0.22;
    ctx.fillStyle = bright ? '#fff8eb' : mixHex('#b9c6ff', accent, 0.3);
    ctx.fillRect(starX, starY, bright ? 2 : 1, 1);
    if (bright) {
      ctx.globalAlpha = 0.65;
      ctx.fillRect(starX - 1, starY, 1, 1);
      ctx.fillRect(starX + 2, starY, 1, 1);
      ctx.fillRect(starX, starY - 1, 1, 1);
      ctx.fillRect(starX, starY + 1, 1, 1);
      ctx.globalAlpha = 1;
    }
  }

  // Retro grid floor below the horizon.
  ctx.fillStyle = mixHex('#0f0b1a', accent, 0.1);
  ctx.fillRect(0, horizon, width, height - horizon);
  ctx.fillStyle = mixHex(accent, '#0f0b1a', 0.45);
  ctx.fillRect(3, horizon, width - 6, 1);
  ctx.fillStyle = mixHex(accent, '#0f0b1a', 0.7);
  ctx.fillRect(3, horizon + 1, width - 6, 1);

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = mixHex('#1a1329', accent, 0.55);
  for (let gridX = 8; gridX < width - 4; gridX += 10) {
    ctx.fillRect(gridX, horizon + 2, 1, height - horizon - 2);
  }
  for (let gridY = horizon + 5; gridY < height - 3; gridY += 5) {
    ctx.fillRect(4, gridY, width - 8, 1);
  }
  ctx.globalAlpha = 1;

  // Pixel-art decorative frame with corner rivets.
  ctx.fillStyle = frameDark;
  ctx.fillRect(0, 0, width, 2);
  ctx.fillRect(0, height - 2, width, 2);
  ctx.fillRect(0, 0, 2, height);
  ctx.fillRect(width - 2, 0, 2, height);

  ctx.fillStyle = mixHex(accent, '#110c18', 0.25);
  ctx.fillRect(3, 3, width - 6, 1);
  ctx.fillRect(3, height - 4, width - 6, 1);
  ctx.fillRect(3, 3, 1, height - 6);
  ctx.fillRect(width - 4, 3, 1, height - 6);

  const rivets: Array<[number, number]> = [
    [2, 2],
    [width - 5, 2],
    [2, height - 5],
    [width - 5, height - 5],
  ];
  for (const [rivetX, rivetY] of rivets) {
    ctx.fillStyle = frameDark;
    ctx.fillRect(rivetX, rivetY, 3, 3);
    ctx.fillStyle = accent;
    ctx.fillRect(rivetX + 1, rivetY + 1, 1, 1);
  }

  // Tiny jar icon and sparkles.
  drawPixelJarIcon(ctx, width / 2, 8, accent);
  drawSparkle(ctx, 64, 14, accentBright);
  drawSparkle(ctx, 96, 21, accentBright);

  // Uppercase hostname.
  const hostText = fitPixelText(
    (hostname || 'jar.hadealahmad.com').toUpperCase(),
    width - 20,
    1,
    1,
  );
  drawPixelText(ctx, hostText, width / 2, 32, {
    scale: 1,
    align: 'center',
    color: '#fff8eb',
    highlightColor: '#0b0714',
    highlightOffset: 1,
  });

  // Truncated title line.
  const titleText = fitPixelText(
    (title || 'A tiny treasure from the jar').toUpperCase(),
    width - 18,
    1,
    1,
  );
  drawPixelText(ctx, titleText, width / 2, 44, {
    scale: 1,
    align: 'center',
    color: '#d8cfae',
    highlightColor: '#0b0714',
    highlightOffset: 1,
  });

  // Star divider.
  ctx.fillStyle = mixHex(accent, '#110c18', 0.35);
  ctx.fillRect(width / 2 - 30, 54, 22, 1);
  ctx.fillRect(width / 2 + 8, 54, 22, 1);
  drawPixelText(ctx, '★', width / 2, 51, {
    color: accentBright,
    highlightColor: '#0b0714',
    highlightOffset: 1,
    align: 'center',
  });

  // Footer brand stamp on the grid.
  drawPixelText(ctx, '★ JAR OF LINKS ★', width / 2, 67, {
    color: mixHex(accent, '#fff8eb', 0.25),
    highlightColor: '#0b0714',
    highlightOffset: 1,
    align: 'center',
  });

  // Upscale 2x with hard pixels (160x90 -> 320x180).
  const scaled = document.createElement('canvas');
  scaled.width = width * 2;
  scaled.height = height * 2;
  const scaledCtx = scaled.getContext('2d');
  if (!scaledCtx) return canvas.toDataURL('image/png');
  scaledCtx.imageSmoothingEnabled = false;
  scaledCtx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled.toDataURL('image/png');
}
