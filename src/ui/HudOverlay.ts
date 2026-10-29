import { JAR_BY_ID, JAR_CONFIGS } from '../config/jars';
import { generateFallbackOgDataUrl } from '../pixel/textures';
import type { JarConfig, JarId, ResolvedLinkPreview } from '../types';

const HTTP_URL = /^https?:\/\//i;
const DATA_IMAGE = /^data:image\//i;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const DEFAULT_ACCENT = '#f59e0b';
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

export class HudOverlay {
  private readonly callbacks: HudCallbacks;
  private readonly instanceId: number;

  private readonly root: HTMLDivElement;

  private readonly cardLayer: HTMLDivElement;
  private readonly paperCard: HTMLDivElement;
  private readonly stampEl: HTMLSpanElement;
  private readonly closeXBtn: HTMLButtonElement;
  private readonly linkEl: HTMLAnchorElement;
  private readonly ogImg: HTMLImageElement;
  private readonly ogLoading: HTMLDivElement;
  private readonly loaderLabel: HTMLSpanElement;
  private readonly faviconEl: HTMLImageElement;
  private readonly siteEl: HTMLSpanElement;
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

    const openBadge = el('span', 'paper-open-badge', 'افتح الرابط \u2196');
    openBadge.setAttribute('aria-hidden', 'true');

    ogFrame.append(this.ogLoading, this.ogImg, openBadge);

    const meta = el('div', 'paper-meta');
    this.faviconEl = el('img', 'paper-favicon');
    this.faviconEl.alt = '';
    this.faviconEl.width = 16;
    this.faviconEl.height = 16;
    this.faviconEl.decoding = 'async';
    this.faviconEl.referrerPolicy = 'no-referrer';
    this.faviconEl.hidden = true;
    this.siteEl = el('span', 'paper-site', '');
    this.hostEl = el('span', 'paper-host', '');
    meta.append(this.faviconEl, this.siteEl, this.hostEl);

    this.titleEl = el('h2', 'paper-title', '');
    this.titleEl.id = titleId;
    this.descEl = el('p', 'paper-desc', '');
    this.descEl.id = descId;

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

    this.root.append(this.cardLayer, this.toastEl, scanlines);
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

  public setHoveredJar(_jarConfig: JarConfig | null): void {
    /* Top and bottom HUD bars are intentionally removed for a clean 3D stage. */
  }

  public updateJarCounts(_counts: Partial<Record<JarId, number>>): void {
    /* Bottom jar shortcut bar removed; counts remain managed in JarStore. */
  }

  public setInteractionLocked(locked: boolean): void {
    this.interactionLocked = locked;
    this.root.classList.toggle('is-locked', locked);
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
    this.ogLoading.hidden = false;
    this.ogLoading.classList.remove('is-error');
    this.loaderLabel.textContent = 'جارٍ فتح الورقة...';

    this.faviconEl.hidden = true;
    this.faviconEl.removeAttribute('src');
    this.siteEl.textContent = jarConfig.label;
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

    this.siteEl.textContent = (preview.siteName || '').trim() || hostname || 'رابط';
    this.hostEl.textContent = hostname ? `\u00b7 ${hostname}` : '';
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

    this.ogLoading.hidden = false;
    this.ogLoading.classList.remove('is-error');
    this.loaderLabel.textContent = 'جارٍ فتح الورقة...';

    this.faviconEl.hidden = true;
    this.faviconEl.removeAttribute('src');

    this.siteEl.textContent = '';
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
  }

  private handleOgImageError(): void {
    /* First failure: swap to the guaranteed procedural banner. */
    if (!this.imageIsFallback && this.fallbackImageUrl) {
      this.setOgImage(this.fallbackImageUrl, true);
      return;
    }

    /* Even the banner failed — show the dither placeholder with a label. */
    this.ogImg.hidden = true;
    this.ogLoading.hidden = false;
    this.ogLoading.classList.add('is-error');
    this.loaderLabel.textContent = 'لا توجد صورة معاينة';
  }

  /**
   * Calls the pixel-asset workstream's banner renderer, then falls back to a
   * minimal inline SVG banner if it throws or returns junk.
   */
  private buildFallbackBanner(preview: ResolvedLinkPreview, accent: string): string {
    const hostname = (preview.hostname || preview.siteName || '').trim();
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
    `<rect width="160" height="90" fill="#241712"/>` +
    `<rect y="0" width="160" height="5" fill="${color}"/>` +
    `<rect y="85" width="160" height="5" fill="${color}"/>` +
    `<rect x="4" y="9" width="152" height="72" fill="none" stroke="${color}" stroke-width="2"/>` +
    bars +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
