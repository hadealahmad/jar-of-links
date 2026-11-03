import * as THREE from 'three';

/* -------------------------------------------------------------------------
 * Retro wall backdrop for the jar shelf.
 *
 * The whole image is banded on a 4-5 tone slate palette and dithered with an
 * ordered Bayer 4x4 matrix, so the vertical gradient never renders as a smooth
 * (and therefore non-pixel-art) ramp. A soft dithered vignette darkens the
 * corners, faint plaster/mortar lines hint at a wall, and a second texture
 * supplies a low, wide cerulean light pool behind the centre jar.
 * Palette: #131516 / #1A1D1E / #202527 / #283033 with #0582CA & #006494 glow.
 * ---------------------------------------------------------------------- */

const BACKDROP_WIDTH = 160;
const BACKDROP_HEIGHT = 96;

const GLOW_SIZE = 96;

/** Classic 4x4 ordered-dither matrix (values 0..15). */
const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

type Rgb = readonly [number, number, number];

/** Deep slate (top) to slightly lighter slate (shelf height, then floor). */
const BANDS: readonly Rgb[] = [
  [0x0d, 0x0f, 0x11],
  [0x14, 0x17, 0x1a],
  [0x18, 0x1c, 0x1f],
  [0x1d, 0x22, 0x26],
  [0x20, 0x26, 0x2a],
  [0x25, 0x2c, 0x30],
];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const bayer = (x: number, y: number): number =>
  ((BAYER_4X4[y & 3]?.[x & 3] ?? 0) + 0.5) / 16;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Same pixel-texture plumbing as `src/pixel/textures.ts`. */
function createPixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function paintBackdropCanvas(ctx: CanvasRenderingContext2D): void {
  const image = ctx.createImageData(BACKDROP_WIDTH, BACKDROP_HEIGHT);
  const data = image.data;
  const random = mulberry32(0x51a7c0de);

  for (let y = 0; y < BACKDROP_HEIGHT; y += 1) {
    const ty = y / (BACKDROP_HEIGHT - 1);
    for (let x = 0; x < BACKDROP_WIDTH; x += 1) {
      const nx = (x / (BACKDROP_WIDTH - 1)) * 2 - 1;
      const ny = ty * 2 - 1;
      const radius = Math.sqrt(nx * nx * 0.78 + ny * ny * 0.64);
      const vignette = smoothstep(0.6, 1.42, radius);

      // Tiny deterministic grain keeps the bands dithering across the frame.
      const grain = (random() - 0.5) * 0.22;
      const bandValue = Math.min(
        BANDS.length - 1,
        Math.max(0, 1 + ty * 5 + grain - vignette * 2),
      );
      const lower = Math.floor(bandValue);
      const upper = Math.min(BANDS.length - 1, lower + 1);
      const band = bandValue - lower > bayer(x, y) ? BANDS[upper] : BANDS[lower];
      const [red, green, blue] = band;

      const offset = (y * BACKDROP_WIDTH + x) * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Sparse plaster seams: barely-lighter 1px lines, dashed so they read as wear.
  ctx.fillStyle = '#2c343a';
  ctx.globalAlpha = 0.16;
  for (let x = 13; x < BACKDROP_WIDTH; x += 29) {
    for (let y = 0; y < BACKDROP_HEIGHT; y += 2) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = '#262e33';
  ctx.globalAlpha = 0.13;
  for (let y = 15; y < BACKDROP_HEIGHT; y += 23) {
    for (let x = 0; x < BACKDROP_WIDTH; x += 2) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // A few specks of lighter plaster dust.
  const speckRng = mulberry32(0x9e3779b9);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#39454b';
  for (let i = 0; i < 46; i += 1) {
    ctx.fillRect(
      Math.floor(speckRng() * BACKDROP_WIDTH),
      Math.floor(speckRng() * BACKDROP_HEIGHT),
      1,
      1,
    );
  }
  ctx.globalAlpha = 1;
}

function paintGlowCanvas(ctx: CanvasRenderingContext2D): void {
  const image = ctx.createImageData(GLOW_SIZE, GLOW_SIZE);
  const data = image.data;
  const center = (GLOW_SIZE - 1) / 2;
  const levels = 5;

  for (let y = 0; y < GLOW_SIZE; y += 1) {
    const ny = (y - center) / center;
    for (let x = 0; x < GLOW_SIZE; x += 1) {
      const nx = (x - center) / center;
      const radius = Math.min(1, Math.sqrt(nx * nx + ny * ny));
      const falloff = Math.pow(1 - radius, 1.7);

      // Dithered quantisation => banded glow instead of a smooth radial blur.
      const quantized = falloff * levels;
      const lower = Math.floor(quantized);
      const upper = Math.min(levels, lower + 1);
      const level = (quantized - lower > bayer(x, y) ? upper : lower) / levels;

      const strength = level * 0.4;
      const offset = (y * GLOW_SIZE + x) * 4;
      data[offset] = Math.round(0x05 * strength);
      data[offset + 1] = Math.round(0x82 * strength);
      data[offset + 2] = Math.round(0xca * strength);
      data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
}

export function createBackdropTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(BACKDROP_WIDTH, BACKDROP_HEIGHT);
  paintBackdropCanvas(ctx);
  return createPixelTexture(canvas);
}

/** Low, wide cerulean light pool drawn with additive blending behind the jars. */
export function createGlowTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = createCanvas(GLOW_SIZE, GLOW_SIZE);
  paintGlowCanvas(ctx);
  return createPixelTexture(canvas);
}
