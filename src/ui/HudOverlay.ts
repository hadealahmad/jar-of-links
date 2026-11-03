import { JAR_BY_ID, JAR_CONFIGS } from '../config/jars';
import { generateFallbackOgDataUrl } from '../pixel/textures';
import type { JarConfig, JarId, ResolvedLinkPreview } from '../types';

const HTTP_URL = /^https?:\/\//i;
const DATA_IMAGE = /^data:image\//i;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const DEFAULT_ACCENT = '#0582ca';
const FALLBACK_TITLE = 'رابط بدون عنوان';
const FALLBACK_DESCRIPTION = 'لا يوجد وصف متاح حالياً — افتح الورقة لاستكشاف الرابط.';

let hudInstanceCount = 0;

export interface HudCallbacks {
  onSelectJar: (jarId: JarId) => void;
  onDrawAnother: () => void;
  onCloseCard: () => void;
  onToggleMute: () => boolean;
}

/** Tiny DOM helper: always creates text through textContent (never innerHTML). */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!HTTP_URL.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafeImageSource(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return isHttpUrl(trimmed) || DATA_IMAGE.test(trimmed);
}

function safeAccent(value: string | null | undefined, fallback = DEFAULT_ACCENT): string {
  return typeof value === 'string' && HEX_COLOR.test(value.trim()) ? value.trim() : fallback;
}

function isJarId(value: string): value is JarId {
  return Object.prototype.hasOwnProperty.call(JAR_BY_ID, value);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isFocusable(node: HTMLElement): boolean {
  if (node.hasAttribute('disabled') || node.getAttribute('aria-hidden') === 'true') return false;
  return node.getClientRects().length > 0;
}

/* ---------------------------------------------------------------- SVG bits */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Builds trusted, attribute-only inline SVG nodes (never innerHTML). */
function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function svgRect(
  parent: SVGElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  opacity?: number,
): SVGRectElement {
  const attrs: Record<string, string> = {
    x: String(x),
    y: String(y),
    width: String(width),
    height: String(height),
    fill,
  };
  if (opacity !== undefined) attrs['fill-opacity'] = String(opacity);
  const rect = svgEl('rect', attrs);
  parent.append(rect);
  return rect;
}

/** 16×16 crisp-edge jar mark used next to the HUD title. */
function createJarGlyph(size = 22): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 16 16',
    width: String(size),
    height: String(size),
    'shape-rendering': 'crispEdges',
    'aria-hidden': 'true',
    focusable: 'false',
  });

  svgRect(svg, 6, 0, 4, 1, '#a98459');
  svgRect(svg, 5, 1, 6, 2, '#9e7b56');
  svgRect(svg, 4, 3, 8, 1, '#0582ca');
  svgRect(svg, 3, 4, 10, 1, '#006494');
  svgRect(svg, 2, 5, 12, 10, '#006494', 0.58);
  svgRect(svg, 3, 6, 1, 8, '#c5cfd4', 0.65);
  svgRect(svg, 12, 6, 1, 8, '#c5cfd4', 0.28);
  svgRect(svg, 5, 8, 4, 6, '#f7f8f8');
  svgRect(svg, 9, 9, 3, 5, '#7cc6fe');
  svgRect(svg, 5, 10, 4, 1, '#dfe8ec');
  svgRect(svg, 3, 15, 10, 1, '#006494');

  return svg;
}

/** 16×16 crisp-edge speaker mark, with a stepped mute slash group. */
function createSpeakerGlyph(size = 18): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 16 16',
    width: String(size),
    height: String(size),
    'shape-rendering': 'crispEdges',
    'aria-hidden': 'true',
    focusable: 'false',
  });

  svgRect(svg, 2, 6, 2, 4, 'currentColor');
  svgRect(svg, 4, 4, 2, 8, 'currentColor');

  const waves = svgEl('g', { class: 'hud-mute__waves' });
  svgRect(waves, 8, 6, 1, 4, 'currentColor');
  svgRect(waves, 10, 4, 1, 8, 'currentColor');
  svg.append(waves);

  const slash = svgEl('g', { class: 'hud-mute__slash' });
  svgRect(slash, 6, 5, 2, 2, '#e05263');
  svgRect(slash, 8, 7, 2, 2, '#e05263');
  svgRect(slash, 10, 9, 2, 2, '#e05263');
  svg.append(slash);

  return svg;
}

/** Arabic-aware count label: "٣ روابط", "١٢ رابطاً", "رابطان", "لا روابط". */
function formatLinkCount(rawCount: number): string {
  const count = Number.isFinite(rawCount) ? Math.max(0, Math.trunc(rawCount)) : 0;
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';

  let digits: string;
  try {
    digits = count.toLocaleString('ar-u-nu-arab');
  } catch {
    digits = String(count);
  }

  /* Guarantee Arabic-Indic numerals even when a locale falls back to Latin. */
  digits = digits.replace(/[0-9]/g, (digit) => arabicIndic[Number(digit)]);

  if (count === 0) return 'لا روابط';
  if (count === 1) return 'رابط واحد';
  if (count === 2) return 'رابطان';

  const lastTwo = count % 100;
  if (lastTwo === 0 || lastTwo === 1) return `${digits} رابط`;
  return lastTwo >= 3 && lastTwo <= 10 ? `${digits} روابط` : `${digits} رابطاً`;
}

/* --------------------------------------------------------- OG pixelation */

const PIXEL_ART_MAX_WIDTH = 96;
const POSTERIZE_LEVELS = 6;

/** 4×4 ordered Bayer matrix (0..15) for chunky retro dithering. */
const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Posterizes each RGB channel to a few levels and applies ordered dithering. */
function posterizeAndDither(data: Uint8ClampedArray, width: number, height: number): void {
  const step = 255 / (POSTERIZE_LEVELS - 1);

  for (let y = 0; y < height; y += 1) {
    const bayerRow = BAYER_4X4[y & 3];
    for (let x = 0; x < width; x += 1) {
      const bias = (bayerRow[x & 3] / 16 - 0.47) * step;
      const index = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const shifted = data[index + channel] + bias;
        const quantized = Math.round(shifted / step) * step;
        data[index + channel] = Math.max(0, Math.min(255, quantized));
      }
    }
  }
}

export class HudOverlay {
  private readonly callbacks: HudCallbacks;
  private readonly instanceId: number;

  private readonly root: HTMLDivElement;

  private readonly headerEl: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly badgeEl: HTMLDivElement;
  private readonly badgeLabelEl: HTMLSpanElement;
  private readonly badgeCountEl: HTMLSpanElement;
  private readonly hintEl: HTMLParagraphElement;

  private readonly cardLayer: HTMLDivElement;
  private readonly paperCard: HTMLDivElement;
  private readonly stampEl: HTMLSpanElement;
  private readonly closeXBtn: HTMLButtonElement;
  private readonly linkEl: HTMLAnchorElement;
  private readonly ogFrame: HTMLDivElement;
  private readonly ogImg: HTMLImageElement;
  private readonly ogCanvas: HTMLCanvasElement;
  private readonly ogLoading: HTMLDivElement;
  private readonly loaderLabel: HTMLSpanElement;
  private readonly faviconEl: HTMLImageElement;
  private readonly hostEl: HTMLSpanElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly descEl: HTMLParagraphElement;
  private readonly drawBtn: HTMLButtonElement;
  private readonly toastEl: HTMLDivElement;

  private muted = false;
  private interactionLocked = false;
  private cardVisible = false;
  private imageIsFallback = false;
  private fallbackImageUrl = '';

  private jarCounts: Partial<Record<JarId, number>> = {};
  private hoveredJarId: JarId | null = null;
  private hintDismissed = false;

  private ogToken = 0;
  private pixelSource = '';

  private closeTimer: number | null = null;
  private toastTimer: number | null = null;
  private previouslyFocused: HTMLElement | null = null;

  constructor(container: HTMLElement, callbacks: HudCallbacks, initialMuted = false) {
    if (!(container instanceof HTMLElement)) {
      throw new Error('HudOverlay requires a valid container element.');
    }

    this.callbacks = callbacks;
    this.instanceId = ++hudInstanceCount;
    this.muted = initialMuted;

    /* ---------------------------------------------------------------- root */
    this.root = el('div', 'hud');
    this.root.dataset.hud = 'root';
    this.root.dir = 'rtl';

    /* -------------------------------------------------------------- header */
    this.headerEl = el('header', 'hud-header');

    const brand = el('div', 'hud-brand');
    const logo = el('span', 'hud-logo');
    logo.setAttribute('aria-hidden', 'true');
    logo.append(createJarGlyph(22));

    const brandTitle = el('span', 'hud-brand__title', 'مرطبان الروابط');
    brand.append(logo, brandTitle);

    this.muteBtn = el('button', 'hud-mute');
    this.muteBtn.type = 'button';
    this.muteBtn.append(createSpeakerGlyph(18));
    this.muteBtn.addEventListener('click', () => {
      const nextMuted = Boolean(this.callbacks.onToggleMute());
      this.setMutedState(nextMuted);
      this.showToast(nextMuted ? 'الصوت: مكتوم' : 'الصوت: مفعّل');
    });

    this.headerEl.append(brand, this.muteBtn);

    /* ---------------------------------------------------------- hover badge */
    this.badgeEl = el('div', 'hud-jar-badge');
    this.badgeEl.hidden = true;
    this.badgeEl.setAttribute('aria-hidden', 'true');

    const badgeBar = el('span', 'hud-jar-badge__bar');
    badgeBar.setAttribute('aria-hidden', 'true');
    this.badgeLabelEl = el('span', 'hud-jar-badge__label', '');
    this.badgeCountEl = el('span', 'hud-jar-badge__count', '');
    this.badgeCountEl.hidden = true;
    this.badgeEl.append(badgeBar, this.badgeLabelEl, this.badgeCountEl);

    /* --------------------------------------------------------- landing hint */
    this.hintEl = el('p', 'hud-hint', 'اختر مرطباناً لسحب ورقة');
    this.hintEl.setAttribute('aria-hidden', 'true');

    /* ---------------------------------------------------------------- card */
    const titleId = `paper-card-title-${this.instanceId}`;
    const descId = `paper-card-desc-${this.instanceId}`;

    this.cardLayer = el('div', 'card-layer');
    this.cardLayer.hidden = true;

    const backdrop = el('div', 'card-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', () => this.requestClose());

    this.paperCard = el('div', 'paper-card');
    this.paperCard.setAttribute('role', 'dialog');
    this.paperCard.setAttribute('aria-modal', 'true');
    this.paperCard.setAttribute('aria-labelledby', titleId);
    this.paperCard.setAttribute('aria-describedby', descId);

    const head = el('div', 'paper-head');
    this.stampEl = el('span', 'paper-stamp', 'رابط');
    this.stampEl.setAttribute('aria-hidden', 'true');

    this.closeXBtn = el('button', 'paper-close', '\u2715');
    this.closeXBtn.type = 'button';
    this.closeXBtn.setAttribute('aria-label', 'إغلاق البطاقة');
    this.closeXBtn.addEventListener('click', () => this.requestClose());
    head.append(this.stampEl, this.closeXBtn);

    /* Anchor wraps the whole readable card body. */
    this.linkEl = el('a', 'paper-card-link');
    this.linkEl.target = '_blank';
    this.linkEl.rel = 'noopener noreferrer';
    this.linkEl.setAttribute('draggable', 'false');

    const ogFrame = el('div', 'paper-og');
    this.ogFrame = ogFrame;

    this.ogLoading = el('div', 'paper-og-loading');
    this.ogLoading.setAttribute('aria-hidden', 'true');
    this.loaderLabel = el('span', 'paper-og-loading__label', 'جارٍ فتح الورقة...');
    this.ogLoading.append(this.loaderLabel);

    this.ogImg = el('img', 'paper-og-img');
    this.ogImg.alt = '';
    this.ogImg.decoding = 'async';
    this.ogImg.loading = 'eager';
    this.ogImg.referrerPolicy = 'no-referrer';
    this.ogImg.hidden = true;

    /* Upscaled low-res canvas: the "pixelated" version of the OG image. */
    this.ogCanvas = el('canvas', 'paper-og-pixel');
    this.ogCanvas.width = PIXEL_ART_MAX_WIDTH;
    this.ogCanvas.height = 54;
    this.ogCanvas.setAttribute('aria-hidden', 'true');

    const openBadge = el('span', 'paper-open-badge', 'افتح الرابط \u2196');
    openBadge.setAttribute('aria-hidden', 'true');

    ogFrame.append(this.ogLoading, this.ogImg, this.ogCanvas, openBadge);

    const meta = el('div', 'paper-meta');
    this.faviconEl = el('img', 'paper-favicon');
    this.faviconEl.alt = '';
    this.faviconEl.width = 16;
    this.faviconEl.height = 16;
    this.faviconEl.decoding = 'async';
    this.faviconEl.referrerPolicy = 'no-referrer';
    this.faviconEl.hidden = true;
    this.hostEl = el('span', 'paper-host', '');
    meta.append(this.faviconEl, this.hostEl);

    this.titleEl = el('h2', 'paper-title', '');
    this.titleEl.id = titleId;
    this.titleEl.dir = 'auto';
    this.descEl = el('p', 'paper-desc', '');
    this.descEl.id = descId;
    this.descEl.dir = 'auto';

    const hint = el('p', 'paper-hint', 'اضغط على البطاقة لفتح الرابط في تبويب جديد \u2196');

    this.linkEl.append(ogFrame, meta, this.titleEl, this.descEl, hint);

    const actions = el('div', 'paper-actions');
    this.drawBtn = el('button', 'pixel-btn paper-btn paper-btn--draw', '\u21bb اسحب ورقة أخرى');
    this.drawBtn.type = 'button';
    this.drawBtn.addEventListener('click', () => this.callbacks.onDrawAnother());

    const putBackBtn = el('button', 'pixel-btn paper-btn paper-btn--back', '\u2715 أعدها للمرطبان');
    putBackBtn.type = 'button';
    putBackBtn.addEventListener('click', () => this.requestClose());

    actions.append(this.drawBtn, putBackBtn);

    this.paperCard.append(head, this.linkEl, actions);
    this.cardLayer.append(backdrop, this.paperCard);

    /* --------------------------------------------------------------- toast */
    this.toastEl = el('div', 'hud-toast');
    this.toastEl.hidden = true;
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.setAttribute('aria-live', 'polite');

    /* ------------------------------------------------------------ scanlines */
    const scanlines = el('div', 'hud-scanlines');
    scanlines.setAttribute('aria-hidden', 'true');

    this.root.append(
      this.headerEl,
      this.badgeEl,
      this.hintEl,
      this.cardLayer,
      this.toastEl,
      scanlines,
    );
    container.replaceChildren(this.root);

    this.ogImg.addEventListener('load', () => this.handleOgImageLoad());
    this.ogImg.addEventListener('error', () => this.handleOgImageError());
    this.faviconEl.addEventListener('error', () => {
      this.faviconEl.hidden = true;
      this.faviconEl.removeAttribute('src');
    });

    this.setMutedState(initialMuted);

    window.addEventListener('keydown', this.handleKeyDown);
  }

  /* ====================================================================== */
  /* Public API                                                             */
  /* ====================================================================== */

  public setHoveredJar(jarConfig: JarConfig | null): void {
    if (!jarConfig) {
      this.hideJarBadge();
      return;
    }

    const accent = safeAccent(jarConfig.accentColor);
    const isNewJar = this.hoveredJarId !== jarConfig.id || this.badgeEl.hidden;

    this.hoveredJarId = jarConfig.id;
    this.badgeEl.style.setProperty('--badge-accent', accent);
    this.badgeLabelEl.textContent = jarConfig.label;
    this.renderBadgeCount();

    if (!isNewJar) return;

    this.badgeEl.hidden = false;
    this.badgeEl.classList.remove('is-visible');
    void this.badgeEl.offsetWidth;
    this.badgeEl.classList.add('is-visible');
  }

  public updateJarCounts(counts: Partial<Record<JarId, number>>): void {
    this.jarCounts = { ...counts };
    if (this.hoveredJarId) this.renderBadgeCount();
  }

  public setInteractionLocked(locked: boolean): void {
    this.interactionLocked = locked;
    this.root.classList.toggle('is-locked', locked);
    if (locked) this.dismissHint();
  }

  public showCardLoading(jarConfig: JarConfig): void {
    this.openCard();

    this.cardVisible = true;
    this.paperCard.classList.add('is-loading');
    this.setCardAccent(safeAccent(jarConfig.accentColor));

    this.stampEl.textContent = jarConfig.shortLabel || jarConfig.label;

    this.linkEl.removeAttribute('href');
    this.linkEl.setAttribute('aria-busy', 'true');
    this.linkEl.setAttribute('aria-label', `جارٍ فتح ورقة من مرطبان ${jarConfig.label}`);

    this.ogImg.hidden = true;
    this.ogImg.classList.remove('is-loaded', 'is-fallback');
    this.ogImg.removeAttribute('src');
    this.resetPixelArt();
    this.ogLoading.hidden = false;
    this.ogLoading.classList.remove('is-error');
    this.loaderLabel.textContent = 'جارٍ فتح الورقة...';

    this.faviconEl.hidden = true;
    this.faviconEl.removeAttribute('src');
    this.hostEl.textContent = '\u00b7\u00b7\u00b7';
    this.titleEl.textContent = 'جارٍ فتح القصاصة...';
    this.descEl.textContent = `يتم سحب ورقة عشوائية من مرطبان ${jarConfig.label}...`;

    this.drawBtn.disabled = true;
    this.fallbackImageUrl = '';
    this.imageIsFallback = false;
  }

  public showCardPreview(preview: ResolvedLinkPreview): void {
    this.openCard();

    this.cardVisible = true;
    this.paperCard.classList.remove('is-loading');

    const config = isJarId(preview.jarId) ? JAR_BY_ID[preview.jarId] : null;
    const accent = safeAccent(preview.accentColor, safeAccent(config?.accentColor));
    this.setCardAccent(accent);

    const jarLabel = (preview.jarLabel || config?.label || 'رابط').trim();
    this.stampEl.textContent = jarLabel;

    const hostname = (preview.hostname || '').trim();
    const title = (preview.title || '').trim() || hostname || FALLBACK_TITLE;
    const description = (preview.description || '').trim() || FALLBACK_DESCRIPTION;

    this.hostEl.textContent = hostname;
    this.titleEl.textContent = title;
    this.descEl.textContent = description;

    /* URL is only ever attached when it is a real http(s) destination. */
    if (isHttpUrl(preview.url)) {
      this.linkEl.href = preview.url.trim();
      this.linkEl.setAttribute('aria-busy', 'false');
      this.linkEl.setAttribute(
        'aria-label',
        `${title} — يفتح ${hostname || 'الرابط'} في تبويب جديد`,
      );
    } else {
      this.linkEl.removeAttribute('href');
      this.linkEl.setAttribute('aria-busy', 'false');
      this.linkEl.setAttribute('aria-label', `${title} — الرابط غير متاح`);
      this.showToast('تعذّر فتح هذا الرابط');
    }

    /* Favicon: hide gracefully if it 404s or is not an allowed source. */
    if (isSafeImageSource(preview.favicon)) {
      this.faviconEl.hidden = false;
      this.faviconEl.src = preview.favicon.trim();
    } else {
      this.faviconEl.hidden = true;
      this.faviconEl.removeAttribute('src');
    }

    /* OG image, with the procedural pixel banner as the guaranteed fallback. */
    this.fallbackImageUrl = this.buildFallbackBanner(preview, accent);
    this.imageIsFallback = false;

    if (isSafeImageSource(preview.image)) {
      this.setOgImage(preview.image.trim(), false);
    } else {
      this.setOgImage(this.fallbackImageUrl, true);
    }

    this.drawBtn.disabled = false;
  }

  public hideCard(): void {
    if (!this.cardVisible) return;

    this.cardVisible = false;
    this.paperCard.classList.remove('is-loading');

    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    this.cardLayer.classList.remove('is-open');
    this.cardLayer.classList.add('is-closing');
    this.root.dataset.cardOpen = 'false';
    this.restoreFocus();

    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = null;
      if (this.cardVisible) return;
      this.cardLayer.hidden = true;
      this.cardLayer.classList.remove('is-closing');
      this.resetCard();
    }, 170);
  }

  public setMutedState(muted: boolean): void {
    this.muted = Boolean(muted);
    this.root.dataset.muted = this.muted ? 'true' : 'false';

    this.muteBtn.classList.toggle('is-muted', this.muted);
    this.muteBtn.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
    this.muteBtn.setAttribute('aria-label', this.muted ? 'إلغاء كتم الصوت' : 'كتم الصوت');
    this.muteBtn.title = this.muted ? 'إلغاء كتم الصوت (M)' : 'كتم الصوت (M)';
  }

  public showToast(message: string): void {
    const text = String(message ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;

    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    this.toastEl.textContent = text.slice(0, 180);
    this.toastEl.hidden = false;
    this.toastEl.classList.remove('is-visible');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('is-visible');

    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = null;
      this.toastEl.classList.remove('is-visible');
      this.toastEl.hidden = true;
    }, 2400);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);

    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    this.restoreFocus();
    this.root.remove();
  }

  /* ====================================================================== */
  /* Card helpers                                                           */
  /* ====================================================================== */

  private openCard(): void {
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    this.cardLayer.hidden = false;
    this.cardLayer.classList.remove('is-closing');
    this.root.dataset.cardOpen = 'true';
    this.dismissHint();

    if (this.cardVisible) return;

    this.cardVisible = true;
    this.previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    /* Restart the unfold animation on every fresh card. */
    this.cardLayer.classList.remove('is-open');
    void this.cardLayer.offsetWidth;
    this.cardLayer.classList.add('is-open');

    window.requestAnimationFrame(() => {
      if (this.cardVisible) this.closeXBtn.focus({ preventScroll: true });
    });
  }

  private requestClose(): void {
    if (!this.cardVisible) return;
    this.callbacks.onCloseCard();
    this.hideCard();
  }

  private resetCard(): void {
    this.linkEl.removeAttribute('href');
    this.linkEl.removeAttribute('aria-busy');
    this.linkEl.removeAttribute('aria-label');

    this.ogImg.hidden = true;
    this.ogImg.classList.remove('is-loaded', 'is-fallback');
    this.ogImg.removeAttribute('src');
    this.resetPixelArt();

    this.ogLoading.hidden = false;
    this.ogLoading.classList.remove('is-error');
    this.loaderLabel.textContent = 'جارٍ فتح الورقة...';

    this.faviconEl.hidden = true;
    this.faviconEl.removeAttribute('src');

    this.hostEl.textContent = '';
    this.titleEl.textContent = '';
    this.descEl.textContent = '';
    this.stampEl.textContent = 'رابط';

    this.drawBtn.disabled = true;
    this.paperCard.classList.remove('is-loading');
    this.fallbackImageUrl = '';
    this.imageIsFallback = false;
  }

  private setCardAccent(accent: string): void {
    this.paperCard.style.setProperty('--card-accent', accent);
  }

  private setOgImage(url: string, fallback: boolean): void {
    this.resetPixelArt();
    this.imageIsFallback = fallback;
    this.ogImg.hidden = false;
    this.ogImg.classList.remove('is-loaded');
    this.ogImg.classList.toggle('is-fallback', fallback);
    this.ogLoading.hidden = false;
    this.ogLoading.classList.remove('is-error');
    this.loaderLabel.textContent = 'جارٍ فتح الورقة...';

    if (this.ogImg.getAttribute('src') === url) {
      if (this.ogImg.complete && this.ogImg.naturalWidth > 0) this.handleOgImageLoad();
      return;
    }

    this.ogImg.src = url;

    /* Cached data URLs / images can resolve before the load event fires. */
    if (this.ogImg.complete && this.ogImg.naturalWidth > 0) this.handleOgImageLoad();
  }

  private handleOgImageLoad(): void {
    this.ogImg.classList.add('is-loaded');
    this.ogLoading.hidden = true;

    const source = this.ogImg.getAttribute('src') || '';
    if (this.imageIsFallback || !source) return;

    this.pixelateOgImage(source, this.ogToken);
  }

  /**
   * Re-loads the OG image through a CORS-enabled probe, downsamples it to a
   * ~96px wide canvas, posterizes + ordered-dithers it, and shows the upscaled
   * canvas with `image-rendering: pixelated`. Falls back to the plain <img>
   * plus the CSS scanline overlay whenever CORS or the canvas is unavailable.
   */
  private pixelateOgImage(url: string, token: number): void {
    if (this.pixelSource === url) return;
    this.pixelSource = url;

    let handled = false;
    const claim = (): boolean => {
      if (handled) return false;
      handled = true;
      return true;
    };

    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.referrerPolicy = 'no-referrer';
    probe.decoding = 'async';

    probe.addEventListener('load', () => {
      if (!claim() || token !== this.ogToken) return;
      try {
        this.renderPixelArt(probe, token);
      } catch {
        /* Tainted canvas or a broken draw: keep the sharp <img> + CSS overlay. */
        this.markCorsFallback();
      }
    });

    probe.addEventListener('error', () => {
      if (!claim() || token !== this.ogToken) return;
      this.markCorsFallback();
    });

    probe.src = url;
  }

  private renderPixelArt(probe: HTMLImageElement, token: number): void {
    if (token !== this.ogToken) return;
    if (!probe.naturalWidth || !probe.naturalHeight) throw new Error('Image has no pixels');

    const ctx = this.ogCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas is unavailable');

    const width = PIXEL_ART_MAX_WIDTH;
    const ratio = probe.naturalHeight / probe.naturalWidth;
    const height = Math.max(24, Math.min(140, Math.round(width * ratio)));

    this.ogCanvas.width = width;
    this.ogCanvas.height = height;

    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(probe, 0, 0, width, height);

    /* Reading pixels throws when the canvas is tainted (no CORS clearance). */
    const frame = ctx.getImageData(0, 0, width, height);
    posterizeAndDither(frame.data, width, height);
    ctx.putImageData(frame, 0, 0);

    if (token !== this.ogToken) return;

    this.ogFrame.classList.remove('is-cors-blocked');
    this.ogFrame.classList.add('has-pixel-art');
    this.ogCanvas.classList.add('is-loaded');
  }

  private markCorsFallback(): void {
    this.ogFrame.classList.add('is-cors-blocked');
  }

  private resetPixelArt(): void {
    this.ogToken += 1;
    this.pixelSource = '';
    this.ogFrame.classList.remove('has-pixel-art', 'is-cors-blocked');
    this.ogCanvas.classList.remove('is-loaded');

    const ctx = this.ogCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.ogCanvas.width, this.ogCanvas.height);
  }

  private hideJarBadge(): void {
    this.hoveredJarId = null;
    this.badgeEl.classList.remove('is-visible');
    this.badgeEl.hidden = true;
  }

  private renderBadgeCount(): void {
    const jarId = this.hoveredJarId;
    const count = jarId ? this.jarCounts[jarId] : undefined;

    if (typeof count !== 'number' || !Number.isFinite(count)) {
      this.badgeCountEl.hidden = true;
      this.badgeCountEl.textContent = '';
      return;
    }

    this.badgeCountEl.hidden = false;
    this.badgeCountEl.textContent = formatLinkCount(count);
  }

  private dismissHint(): void {
    if (this.hintDismissed) return;
    this.hintDismissed = true;
    this.hintEl.classList.add('is-hidden');
    this.hintEl.setAttribute('aria-hidden', 'true');
  }

  private handleOgImageError(): void {
    /* First failure: swap to the guaranteed procedural banner. */
    if (!this.imageIsFallback && this.fallbackImageUrl) {
      this.setOgImage(this.fallbackImageUrl, true);
      return;
    }

    /* Even the banner failed — show the dither placeholder with a label. */
    this.ogImg.hidden = true;
    this.resetPixelArt();
    this.ogLoading.hidden = false;
    this.ogLoading.classList.add('is-error');
    this.loaderLabel.textContent = 'لا توجد صورة معاينة';
  }

  /**
   * Calls the pixel-asset workstream's banner renderer, then falls back to a
   * minimal inline SVG banner if it throws or returns junk.
   */
  private buildFallbackBanner(preview: ResolvedLinkPreview, accent: string): string {
    const hostname = (preview.hostname || '').trim();
    const title = (preview.title || hostname || FALLBACK_TITLE).trim();

    try {
      const banner = generateFallbackOgDataUrl(title, hostname, accent);
      if (isSafeImageSource(banner)) return banner.trim();
    } catch {
      /* Fall through to the inline banner below. */
    }

    return buildEmergencyBanner(accent);
  }

  /* ====================================================================== */
  /* Keyboard + focus                                                       */
  /* ====================================================================== */

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    if (event.key === 'Escape') {
      if (this.cardVisible) {
        event.preventDefault();
        this.requestClose();
      }
      return;
    }

    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      const nextMuted = Boolean(this.callbacks.onToggleMute());
      this.setMutedState(nextMuted);
      this.showToast(nextMuted ? 'الصوت: مكتوم' : 'الصوت: مفعّل');
      return;
    }

    if (this.cardVisible) {
      if (event.key === 'Tab') this.trapFocus(event);
      return;
    }

    if (this.interactionLocked) return;

    const jar = JAR_CONFIGS.find((config) => config.hotkey === event.key);
    if (!jar) return;

    event.preventDefault();
    this.callbacks.onSelectJar(jar.id);
  };

  private trapFocus(event: KeyboardEvent): void {
    const focusables = this.focusablesInCard();
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!active || !this.paperCard.contains(active)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  private focusablesInCard(): HTMLElement[] {
    const nodes = this.paperCard.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    return Array.from(nodes).filter(isFocusable);
  }

  private restoreFocus(): void {
    const target = this.previouslyFocused;
    this.previouslyFocused = null;
    if (target && document.contains(target)) {
      target.focus({ preventScroll: true });
    }
  }
}

/** Minimal, accent-tinted 8-bit banner used only if the pixel module fails. */
function buildEmergencyBanner(accent: string): string {
  const color = safeAccent(accent);
  const bars = [0, 1, 2]
    .map(
      (index) =>
        `<rect x="${8 + index * 10}" y="${18 + index * 10}" width="6" height="${54 - index * 10}" fill="${color}"/>`,
    )
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" shape-rendering="crispEdges">` +
    `<rect width="160" height="90" fill="#131516"/>` +
    `<rect y="0" width="160" height="5" fill="${color}"/>` +
    `<rect y="85" width="160" height="5" fill="${color}"/>` +
    `<rect x="4" y="9" width="152" height="72" fill="none" stroke="${color}" stroke-width="2"/>` +
    bars +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
