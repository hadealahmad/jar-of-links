import * as THREE from 'three';
import type { JarConfig } from '../types';

/* -------------------------------------------------------------------------
 * Built-in 5x7 bitmap pixel font (for ASCII hostnames & symbols)
 * + Hard-thresholded Handjet pixel renderer for connected Arabic typography.
 * Palette matched to https://hadealahmad.com (#0582CA, #006494, #131516,
 * #1A1D1E, #202527, #283033, #2D353A, #DFE8EC, #EDF1F2, #F7F8F8).
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
  '\u2605': ['..#..', '.###.', '#####', '.###.', '.#.#.', '#.#.#', '.....'],
};

const FALLBACK_GLYPH = PIXEL_FONT['?'];
const NON_ASCII_RE = /[^\x00-\x7f]/;
const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;

export interface PixelTextOptions {
  scale?: number;
  color?: string;
  highlightColor?: string;
  highlightOffset?: number;
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
  paint(options.color ?? '#2D353A', 0, 0);

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

const CANVAS_ARABIC_FONT_STACK = '"Handjet Arabic", "Handjet", "Geeza Pro", Tahoma, sans-serif';

/**
 * Contextual glyph forms `[isolated, final, initial, medial]` mapped to codepoints
 * present in `Handjet` (isolated forms stay at base `U+06xx`, joined forms use
 * Unicode Arabic Presentation Forms-B/A `U+FE80–U+FEFC` / `U+FB50–U+FBFF`).
 */
type ArabicFormTuple = readonly [
  isol: number,
  fina: number | null,
  init: number | null,
  medi: number | null,
];

const ARABIC_JOINING_FORMS: Readonly<Record<number, ArabicFormTuple>> = {
  0x0621: [0x0621, null, null, null], // ء
  0x0622: [0x0622, 0xfe82, null, null], // آ
  0x0623: [0x0623, 0xfe84, null, null], // أ
  0x0624: [0x0624, 0xfe86, null, null], // ؤ
  0x0625: [0x0625, 0xfe88, null, null], // إ
  0x0626: [0x0626, 0xfe8a, 0xfe8b, 0xfe8c], // ئ
  0x0627: [0x0627, 0xfe8e, null, null], // ا
  0x0628: [0x0628, 0xfe90, 0xfe91, 0xfe92], // ب
  0x0629: [0x0629, 0xfe94, null, null], // ة
  0x062a: [0x062a, 0xfe96, 0xfe97, 0xfe98], // ت
  0x062b: [0x062b, 0xfe9a, 0xfe9b, 0xfe9c], // ث
  0x062c: [0x062c, 0xfe9e, 0xfe9f, 0xfea0], // ج
  0x062d: [0x062d, 0xfea2, 0xfea3, 0xfea4], // ح
  0x062e: [0x062e, 0xfea6, 0xfea7, 0xfea8], // خ
  0x062f: [0x062f, 0xfeaa, null, null], // د
  0x0630: [0x0630, 0xfeac, null, null], // ذ
  0x0631: [0x0631, 0xfeae, null, null], // ر
  0x0632: [0x0632, 0xfeb0, null, null], // ز
  0x0633: [0x0633, 0xfeb2, 0xfeb3, 0xfeb4], // س
  0x0634: [0x0634, 0xfeb6, 0xfeb7, 0xfeb8], // ش
  0x0635: [0x0635, 0xfeba, 0xfebb, 0xfebc], // ص
  0x0636: [0x0636, 0xfebe, 0xfebf, 0xfec0], // ض
  0x0637: [0x0637, 0xfec2, 0xfec3, 0xfec4], // ط
  0x0638: [0x0638, 0xfec6, 0xfec7, 0xfec8], // ظ
  0x0639: [0x0639, 0xfeca, 0xfecb, 0xfecc], // ع
  0x063a: [0x063a, 0xfece, 0xfecf, 0xfed0], // غ
  0x0641: [0x0641, 0xfed2, 0xfed3, 0xfed4], // ف
  0x0642: [0x0642, 0xfed6, 0xfed7, 0xfed8], // ق
  0x0643: [0x0643, 0xfeda, 0xfedb, 0xfedc], // ك
  0x0644: [0x0644, 0xfede, 0xfedf, 0xfee0], // ل
  0x0645: [0x0645, 0xfee2, 0xfee3, 0xfee4], // م
  0x0646: [0x0646, 0xfee6, 0xfee7, 0xfee8], // ن
  0x0647: [0x0647, 0xfeea, 0xfeeb, 0xfeec], // ه
  0x0648: [0x0648, 0xfeee, null, null], // و
  0x0649: [0x0649, 0xfef0, null, null], // ى
  0x064a: [0x064a, 0xfef2, 0xfef3, 0xfef4], // ي
  0x0671: [0x0671, 0xfb51, null, null], // ٱ
  0x067e: [0x067e, 0xfb57, 0xfb58, 0xfb59], // پ
  0x0686: [0x0686, 0xfb7b, 0xfb7c, 0xfb7d], // چ
  0x0698: [0x0698, 0xfb8b, null, null], // ژ
  0x06a9: [0x06a9, 0xfb8f, 0xfb90, 0xfb91], // ک
  0x06af: [0x06af, 0xfb93, 0xfb94, 0xfb95], // گ
  0x06cc: [0x06cc, 0xfbfd, 0xfbfe, 0xfbff], // ی
};

const LAM_ALEF_LIGATURES: Readonly<Record<number, readonly [isol: number, fina: number]>> = {
  0x0622: [0xfef5, 0xfef6], // لآ
  0x0623: [0xfef7, 0xfef8], // لأ
  0x0625: [0xfef9, 0xfefa], // لإ
  0x0627: [0xfefb, 0xfefc], // لا
};

function isArabicTransparentMark(cp: number): boolean {
  return (
    (cp >= 0x0610 && cp <= 0x061a) ||
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06ed)
  );
}

function canArabicJoinLeft(cp: number): boolean {
  if (cp === 0x0640 || cp === 0x200d) return true;
  const forms = ARABIC_JOINING_FORMS[cp];
  return Boolean(forms && forms[2] !== null);
}

function canArabicJoinRight(cp: number): boolean {
  if (cp === 0x0640 || cp === 0x200d) return true;
  const forms = ARABIC_JOINING_FORMS[cp];
  return Boolean(forms && forms[1] !== null);
}

/**
 * Pre-shapes Arabic words in logical RTL order into explicit contextual
 * Unicode Presentation Forms (`U+FE80–U+FEFC`, including `Lam-Alef` ligatures).
 *
 * Safari / WebKit's CoreText Canvas 2D pipeline skips `GSUB` contextual joining
 * when a web font omits the `arab` script tag or renders onto an offscreen canvas.
 * Because `U+FE80–U+FEFC` retain BiDi class `AL` (Right-to-Left) and map directly
 * in `Handjet`'s `cmap`, the shaped string renders identically in CoreText (Safari)
 * and HarfBuzz (Chrome/Firefox).
 */
export function shapeArabicForCanvas(input: string): string {
  if (!input || !ARABIC_RE.test(input)) return input;

  const cps = Array.from(input.normalize('NFC'), (ch) => ch.codePointAt(0) ?? 0);
  const out: number[] = [];
  const len = cps.length;
  let i = 0;

  while (i < len) {
    const cp = cps[i];
    const forms = ARABIC_JOINING_FORMS[cp];
    if (!forms) {
      out.push(cp);
      i += 1;
      continue;
    }

    let prevIdx = i - 1;
    while (prevIdx >= 0 && isArabicTransparentMark(cps[prevIdx])) {
      prevIdx -= 1;
    }
    const joinsPrev =
      prevIdx >= 0 && canArabicJoinLeft(cps[prevIdx]) && canArabicJoinRight(cp);

    if (cp === 0x0644) {
      let nextBaseIdx = i + 1;
      const marks: number[] = [];
      while (nextBaseIdx < len && isArabicTransparentMark(cps[nextBaseIdx])) {
        marks.push(cps[nextBaseIdx]);
        nextBaseIdx += 1;
      }
      const ligature = nextBaseIdx < len ? LAM_ALEF_LIGATURES[cps[nextBaseIdx]] : undefined;
      if (ligature) {
        out.push(joinsPrev ? ligature[1] : ligature[0]);
        for (const mark of marks) out.push(mark);
        i = nextBaseIdx + 1;
        continue;
      }
    }

    let nextIdx = i + 1;
    while (nextIdx < len && isArabicTransparentMark(cps[nextIdx])) {
      nextIdx += 1;
    }
    const joinsNext =
      nextIdx < len && canArabicJoinLeft(cp) && canArabicJoinRight(cps[nextIdx]);

    if (joinsPrev && joinsNext && forms[3] !== null) {
      out.push(forms[3]);
    } else if (joinsPrev && forms[1] !== null) {
      out.push(forms[1]);
    } else if (joinsNext && forms[2] !== null) {
      out.push(forms[2]);
    } else {
      out.push(forms[0]);
    }
    i += 1;
  }

  return String.fromCodePoint(...out);
}

interface CrispFontOptions {
  maxWidth: number;
  fontSize: number;
  minFontSize?: number;
  fontWeight?: number;
  color: string;
  highlightColor?: string;
  highlightOffset?: number;
  alphaThreshold?: number;
}

let sharedScratchCanvas: PixelCanvas | null = null;

function acquireDomScratchCanvas(width: number, height: number, isArabic: boolean): PixelCanvas {
  if (!sharedScratchCanvas) {
    sharedScratchCanvas = createCanvas(width, height);
    const el = sharedScratchCanvas.canvas;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:0;height:0;visibility:hidden;pointer-events:none;letter-spacing:0;-webkit-font-smoothing:antialiased;font-variation-settings:"ELSH" 2,"ELGR" 1;';
  }

  const { canvas, ctx } = sharedScratchCanvas;
  if (typeof document !== 'undefined' && document.body && !canvas.isConnected) {
    document.body.appendChild(canvas);
  }

  canvas.width = width;
  canvas.height = height;
  canvas.dir = isArabic ? 'rtl' : 'ltr';
  canvas.lang = isArabic ? 'ar' : 'en';
  ctx.imageSmoothingEnabled = false;
  return sharedScratchCanvas;
}

/**
 * Renders connected Arabic (or Unicode) strings using `Handjet Arabic` / `Handjet`
 * onto a DOM-attached RTL scratch canvas (working around WebKit Bug 169922 and
 * CoreText's missing-`arab` GSUB handling) and quantizes alpha into hard 1x1 pixels.
 */
function drawCrispFontText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  options: CrispFontOptions,
): void {
  const clean = text.trim();
  if (!clean) return;

  const targetWidth = ctx.canvas.width;
  const targetHeight = ctx.canvas.height;
  const isArabic = ARABIC_RE.test(clean);
  const { ctx: scratchCtx } = acquireDomScratchCanvas(targetWidth, targetHeight, isArabic);

  const weight = options.fontWeight ?? 700;
  const minSize = options.minFontSize ?? 10;

  scratchCtx.direction = isArabic ? 'rtl' : 'ltr';
  const extCtx = scratchCtx as CanvasRenderingContext2D & {
    lang?: string;
    letterSpacing?: string;
  };
  if ('lang' in extCtx) extCtx.lang = isArabic ? 'ar' : 'en';
  if ('letterSpacing' in extCtx) extCtx.letterSpacing = '0px';
  scratchCtx.textAlign = 'center';
  scratchCtx.textBaseline = 'middle';

  let size = options.fontSize;
  let display = isArabic ? shapeArabicForCanvas(clean) : clean;

  while (size > minSize) {
    scratchCtx.font = `${weight} ${size}px ${CANVAS_ARABIC_FONT_STACK}`;
    if (scratchCtx.measureText(display).width <= options.maxWidth) break;
    size -= 1;
  }

  scratchCtx.font = `${weight} ${size}px ${CANVAS_ARABIC_FONT_STACK}`;
  if (scratchCtx.measureText(display).width > options.maxWidth) {
    const glyphs = Array.from(clean);
    while (glyphs.length > 1) {
      glyphs.pop();
      const candidateRaw = `${glyphs.join('').trimEnd()}…`;
      const candidate = isArabic ? shapeArabicForCanvas(candidateRaw) : candidateRaw;
      if (scratchCtx.measureText(candidate).width <= options.maxWidth) {
        display = candidate;
        break;
      }
    }
  }

  scratchCtx.clearRect(0, 0, targetWidth, targetHeight);
  scratchCtx.fillStyle = '#ffffff';
  scratchCtx.fillText(display, Math.round(centerX), Math.round(centerY));

  const data = scratchCtx.getImageData(0, 0, targetWidth, targetHeight).data;
  const threshold = options.alphaThreshold ?? 88;

  const stampMask = (fill: string, ox: number, oy: number): void => {
    ctx.fillStyle = fill;
    for (let y = 0; y < targetHeight; y++) {
      const rowOffset = y * targetWidth * 4;
      for (let x = 0; x < targetWidth; x++) {
        if (data[rowOffset + x * 4 + 3] >= threshold) {
          ctx.fillRect(x + ox, y + oy, 1, 1);
        }
      }
    }
  };

  if (options.highlightColor) {
    const off = Math.max(1, Math.floor(options.highlightOffset ?? 1));
    stampMask(options.highlightColor, off, off);
  }
  stampMask(options.color, 0, 0);
}

/* -------------------------------------------------------------------------
 * Small deterministic helpers.
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
  let value = match ? match[1] : 'F7F8F8';
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
 * Jar label (hadealahmad.com light-surface palette: #F7F8F8, #EDF1F2, #DFE8EC, #2D353A).
 * ---------------------------------------------------------------------- */

const LABEL_WIDTH = 128;
const LABEL_HEIGHT = 64;

function paintJarLabelCanvas(ctx: CanvasRenderingContext2D, config: JarConfig): void {
  const rng = createRng(`jar-label:${config.id}:${config.shortLabel}`);
  const accent = normalizeHex(config.accentColor);

  // Deep slate outer border (#131516).
  ctx.fillStyle = '#131516';
  ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);

  // Crisp cool paper face (#F7F8F8).
  const inset = 3;
  ctx.fillStyle = '#F7F8F8';
  ctx.fillRect(inset, inset, LABEL_WIDTH - inset * 2, LABEL_HEIGHT - inset * 2);

  // Subtle ice-slate pixel dither near edges (#EDF1F2, #DFE8EC, #C5CFD4).
  const ageColors = ['#EDF1F2', '#DFE8EC', '#d2dee4'];
  for (let i = 0; i < 280; i++) {
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

  // Crisp top highlight & bottom bevel.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(inset + 1, inset + 1, LABEL_WIDTH - (inset + 1) * 2, 1);
  ctx.fillStyle = '#DFE8EC';
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
    ctx.fillStyle = '#131516';
    ctx.fillRect(rx, ry, 4, 4);
    ctx.fillStyle = accent;
    ctx.fillRect(rx + 1, ry + 1, 2, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(rx + 1, ry + 1, 1, 1);
    ctx.fillStyle = mixHex(accent, '#131516', 0.45);
    ctx.fillRect(rx + 2, ry + 2, 1, 1);
  }

  // Tiny centred studs on the top and bottom of the label.
  ctx.fillStyle = mixHex(accent, '#2D353A', 0.25);
  for (const offset of [-8, 0, 8]) {
    ctx.fillRect(LABEL_WIDTH / 2 + offset, 5, 1, 1);
    ctx.fillRect(LABEL_WIDTH / 2 + offset, LABEL_HEIGHT - 6, 1, 1);
  }

  const rawLabel = (config.shortLabel || config.label || '').trim();
  const available = LABEL_WIDTH - frame * 2 - 12;

  if (NON_ASCII_RE.test(rawLabel)) {
    drawCrispFontText(ctx, rawLabel, LABEL_WIDTH / 2, LABEL_HEIGHT / 2 + 1, {
      maxWidth: available,
      fontSize: config.id === 'all' ? 31 : 27,
      minFontSize: 16,
      fontWeight: 800,
      color: '#2D353A',
      highlightColor: '#FFFFFF',
      highlightOffset: 1,
      alphaThreshold: 88,
    });
  } else {
    const text = rawLabel.toUpperCase();
    let scale = 3;
    if (measurePixelText(text, scale) > available) scale = 2;
    if (measurePixelText(text, scale) > available) scale = 1;

    const textHeight = GLYPH_HEIGHT * scale;
    const textTop = Math.round((LABEL_HEIGHT - textHeight) / 2) - (scale === 3 ? 1 : 0);
    drawPixelText(ctx, text, LABEL_WIDTH / 2, textTop, {
      scale,
      align: 'center',
      color: '#2D353A',
      highlightColor: '#FFFFFF',
      highlightOffset: 1,
    });
  }
}

export function createJarLabelTexture(config: JarConfig): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(LABEL_WIDTH, LABEL_HEIGHT);
  paintJarLabelCanvas(ctx, config);
  const texture = createTexture(canvas);

  if (typeof document !== 'undefined' && document.fonts) {
    const rawLabel = (config.shortLabel || config.label || '').trim();
    const sample = shapeArabicForCanvas(rawLabel) || rawLabel;
    const repaint = (): void => {
      paintJarLabelCanvas(ctx, config);
      texture.needsUpdate = true;
    };
    void Promise.allSettled([
      document.fonts.load('800 28px "Handjet Arabic"', sample),
      document.fonts.load('800 28px "Handjet"', rawLabel),
    ]).then(repaint);
    void document.fonts.ready.then(repaint).catch(() => {});
  }

  return texture;
}

/* -------------------------------------------------------------------------
 * Natural muted driftwood-cork stopper grain.
 * ---------------------------------------------------------------------- */

export function createCorkTexture(): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = createCanvas(size, size);
  const rng = createRng('cork-grain-v2');

  ctx.fillStyle = '#9e7b56';
  ctx.fillRect(0, 0, size, size);

  const mottle = ['#9e7b56', '#916f4c', '#ab8862'];
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = mottle[Math.floor(rng() * mottle.length)];
    ctx.fillRect(
      Math.floor(rng() * size),
      Math.floor(rng() * size),
      1 + Math.floor(rng() * 2),
      1 + Math.floor(rng() * 2),
    );
  }

  const speckles = ['#7d5d3b', '#bfa07a', '#5e452c'];
  for (let i = 0; i < 210; i++) {
    ctx.fillStyle = speckles[Math.floor(rng() * speckles.length)];
    ctx.fillRect(
      Math.floor(rng() * size),
      Math.floor(rng() * size),
      rng() < 0.18 ? 2 : 1,
      1,
    );
  }

  for (let i = 0; i < 28; i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const length = 2 + Math.floor(rng() * 4);
    ctx.fillStyle = rng() < 0.5 ? '#7d5d3b' : '#5e452c';
    for (let k = 0; k < length; k++) {
      ctx.fillRect((x + k) % size, y, 1, 1);
    }
  }

  return createTexture(canvas);
}

/* -------------------------------------------------------------------------
 * Dark slate-ash shelf planks (hadealahmad.com dark palette: #202527, #283033, #131516).
 * ---------------------------------------------------------------------- */

export function createWoodShelfTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = createCanvas(size, size);
  const plankHeight = 16;
  const plankColors = ['#283033', '#202527'];

  for (let plank = 0; plank < size / plankHeight; plank++) {
    const top = plank * plankHeight;
    ctx.fillStyle = plankColors[plank % plankColors.length];
    ctx.fillRect(0, top, size, plankHeight);

    // Plank seam: deep #131516 groove plus cool slate-blue highlight lip.
    ctx.fillStyle = '#131516';
    ctx.fillRect(0, top, size, 1);
    ctx.fillStyle = '#364247';
    ctx.fillRect(0, top + 1, size, 1);

    const grainRng = createRng(`slate-plank-${plank}`);
    for (let i = 0; i < 20; i++) {
      const y = top + 3 + Math.floor(grainRng() * (plankHeight - 5));
      const x = Math.floor(grainRng() * size);
      const length = 3 + Math.floor(grainRng() * 13);
      ctx.fillStyle = grainRng() < 0.62 ? '#16191b' : '#323d42';
      for (let k = 0; k < length; k++) {
        ctx.fillRect((x + k) % size, y, 1, 1);
      }
    }

    if (plank % 2 === 1) {
      const kx = 10 + Math.floor(grainRng() * 44);
      const ky = top + 6 + Math.floor(grainRng() * 5);
      ctx.fillStyle = '#131516';
      ctx.fillRect(kx, ky, 3, 2);
      ctx.fillRect(kx + 1, ky - 1, 1, 1);
      ctx.fillStyle = '#364247';
      ctx.fillRect(kx, ky - 1, 1, 1);
      ctx.fillRect(kx + 1, ky + 2, 1, 1);
    }
  }

  const fineRng = createRng('slate-fine-grain');
  for (let i = 0; i < 44; i++) {
    ctx.fillStyle = fineRng() < 0.5 ? '#1A1D1E' : '#364247';
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
 * Folded paper notes (tinted per jar palette with cool slate ink).
 * ---------------------------------------------------------------------- */

export function createPaperSlipTexture(baseHex: string): THREE.CanvasTexture {
  const size = 32;
  const { canvas, ctx } = createCanvas(size, size);
  const base = normalizeHex(baseHex);
  const border = mixHex(base, '#131516', 0.34);
  const light = mixHex(base, '#FFFFFF', 0.4);
  const ink = mixHex(base, '#2D353A', 0.74);
  const rng = createRng(`paper-slip:${base}`);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 36; i++) {
    ctx.fillStyle = rng() < 0.5 ? light : border;
    ctx.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
  }

  ctx.fillStyle = light;
  ctx.fillRect(1, 1, size - 2, 1);
  ctx.fillRect(1, 1, 1, size - 2);

  ctx.fillStyle = border;
  ctx.fillRect(0, 0, size, 1);
  ctx.fillRect(0, size - 1, size, 1);
  ctx.fillRect(0, 0, 1, size);
  ctx.fillRect(size - 1, 0, 1, size);

  ctx.fillStyle = border;
  ctx.fillRect(2, 16, size - 4, 1);
  ctx.fillStyle = light;
  ctx.fillRect(2, 17, size - 4, 1);

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
 * Deterministic procedural OG fallback banner (hadealahmad.com slate + cerulean).
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
  const dark = '#131516';
  const glass = mixHex(accent, '#F7F8F8', 0.38);
  const glassDeep = mixHex(accent, '#131516', 0.42);
  const glint = mixHex('#FFFFFF', accent, 0.18);
  const corkDark = '#7d5d3b';
  const corkLight = '#ab8862';
  const x = Math.round(centerX);
  const y = Math.round(top);

  ctx.fillStyle = corkDark;
  ctx.fillRect(x - 4, y, 9, 3);
  ctx.fillStyle = corkLight;
  ctx.fillRect(x - 3, y, 7, 1);
  ctx.fillStyle = dark;
  ctx.fillRect(x - 5, y + 2, 11, 1);

  ctx.fillStyle = dark;
  ctx.fillRect(x - 4, y + 3, 9, 2);
  ctx.fillStyle = glass;
  ctx.fillRect(x - 3, y + 3, 7, 1);

  ctx.fillStyle = glassDeep;
  ctx.fillRect(x - 9, y + 5, 19, 14);
  ctx.fillStyle = glass;
  ctx.fillRect(x - 8, y + 6, 17, 12);

  const slips = ['#F7F8F8', mixHex(accent, '#FFFFFF', 0.45), '#7cc6fe'];
  for (let i = 0; i < slips.length; i++) {
    const slipX = x - 5 + i * 3;
    const slipY = y + 11 + (i % 2);
    ctx.fillStyle = slips[i];
    ctx.fillRect(slipX, slipY, 3, 6 - (i % 2));
    ctx.fillStyle = mixHex(slips[i], '#131516', 0.35);
    ctx.fillRect(slipX, slipY, 3, 1);
  }

  ctx.fillStyle = glint;
  ctx.fillRect(x - 6, y + 7, 1, 6);
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x - 7, y + 7, 1, 3);
  ctx.globalAlpha = 1;

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

  const skyTop = mixHex('#131516', accent, 0.08);
  const skyMid = mixHex('#1A1D1E', accent, 0.14);
  const skyLow = mixHex('#202527', accent, 0.22);
  const skyGlow = mixHex('#006494', accent, 0.35);
  const frameDark = '#131516';
  const accentBright = mixHex(accent, '#FFFFFF', 0.35);

  for (let y = 0; y < horizon; y += 2) {
    const t = y / horizon;
    ctx.fillStyle = t < 0.32 ? skyTop : t < 0.7 ? skyMid : skyLow;
    ctx.fillRect(0, y, width, 2);
  }

  ctx.globalAlpha = 0.5;
  for (let y = horizon - 12; y < horizon; y += 2) {
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, y, width, 1);
  }
  ctx.globalAlpha = 1;

  for (let y = 0; y < horizon; y++) {
    for (let x = 0; x < width; x++) {
      if (((x + y) & 1) === 0 && rng() < 0.16) {
        ctx.fillStyle = rng() < 0.5 ? skyTop : skyLow;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  for (let i = 0; i < 30; i++) {
    const starX = 5 + Math.floor(rng() * (width - 10));
    const starY = 5 + Math.floor(rng() * 26);
    if (starX > 58 && starX < 102) continue;
    const bright = rng() < 0.22;
    ctx.fillStyle = bright ? '#F7F8F8' : mixHex('#C5CFD4', accent, 0.35);
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

  ctx.fillStyle = mixHex('#131516', accent, 0.08);
  ctx.fillRect(0, horizon, width, height - horizon);
  ctx.fillStyle = mixHex(accent, '#131516', 0.42);
  ctx.fillRect(3, horizon, width - 6, 1);
  ctx.fillStyle = mixHex(accent, '#131516', 0.68);
  ctx.fillRect(3, horizon + 1, width - 6, 1);

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = mixHex('#202527', accent, 0.52);
  for (let gridX = 8; gridX < width - 4; gridX += 10) {
    ctx.fillRect(gridX, horizon + 2, 1, height - horizon - 2);
  }
  for (let gridY = horizon + 5; gridY < height - 3; gridY += 5) {
    ctx.fillRect(4, gridY, width - 8, 1);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = frameDark;
  ctx.fillRect(0, 0, width, 2);
  ctx.fillRect(0, height - 2, width, 2);
  ctx.fillRect(0, 0, 2, height);
  ctx.fillRect(width - 2, 0, 2, height);

  ctx.fillStyle = mixHex(accent, '#131516', 0.25);
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

  drawPixelJarIcon(ctx, width / 2, 8, accent);
  drawSparkle(ctx, 64, 14, accentBright);
  drawSparkle(ctx, 96, 21, accentBright);

  const rawHost = (hostname || 'link').trim();
  if (NON_ASCII_RE.test(rawHost)) {
    drawCrispFontText(ctx, rawHost, width / 2, 35, {
      maxWidth: width - 20,
      fontSize: 13,
      minFontSize: 10,
      color: '#F7F8F8',
      highlightColor: '#131516',
      highlightOffset: 1,
    });
  } else {
    const hostText = fitPixelText(rawHost.toUpperCase(), width - 20, 1, 1);
    drawPixelText(ctx, hostText, width / 2, 32, {
      scale: 1,
      align: 'center',
      color: '#F7F8F8',
      highlightColor: '#131516',
      highlightOffset: 1,
    });
  }

  const rawTitle = (title || 'كنز صغير من المرطبان').trim();
  if (NON_ASCII_RE.test(rawTitle)) {
    drawCrispFontText(ctx, rawTitle, width / 2, 46, {
      maxWidth: width - 18,
      fontSize: 13,
      minFontSize: 10,
      color: '#C5CFD4',
      highlightColor: '#131516',
      highlightOffset: 1,
    });
  } else {
    const titleText = fitPixelText(rawTitle.toUpperCase(), width - 18, 1, 1);
    drawPixelText(ctx, titleText, width / 2, 44, {
      scale: 1,
      align: 'center',
      color: '#C5CFD4',
      highlightColor: '#131516',
      highlightOffset: 1,
    });
  }

  ctx.fillStyle = mixHex(accent, '#131516', 0.35);
  ctx.fillRect(width / 2 - 30, 54, 22, 1);
  ctx.fillRect(width / 2 + 8, 54, 22, 1);
  drawPixelText(ctx, '\u2605', width / 2, 51, {
    color: accentBright,
    highlightColor: '#131516',
    highlightOffset: 1,
    align: 'center',
  });

  drawCrispFontText(ctx, 'مرطبان الروابط', width / 2, 71, {
    maxWidth: width - 24,
    fontSize: 14,
    minFontSize: 11,
    fontWeight: 700,
    color: mixHex(accent, '#F7F8F8', 0.25),
    highlightColor: '#131516',
    highlightOffset: 1,
  });

  const scaled = document.createElement('canvas');
  scaled.width = width * 2;
  scaled.height = height * 2;
  const scaledCtx = scaled.getContext('2d');
  if (!scaledCtx) return canvas.toDataURL('image/png');
  scaledCtx.imageSmoothingEnabled = false;
  scaledCtx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled.toDataURL('image/png');
}
