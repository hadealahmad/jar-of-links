import { JAR_BY_ID, JAR_CONFIGS } from '../config/jars';
import { generateFallbackOgDataUrl } from '../pixel/textures';
import type { JarConfig, JarId, ResolvedLinkPreview } from '../types';

const HTTP_URL = /^https?:\/\//i;
const DATA_IMAGE = /^data:image\//i;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const DEFAULT_ACCENT = '#f59e0b';
const DEFAULT_HOVER_TEXT = 'PICK A JAR TO UNFOLD A RANDOM NOTE';
const FALLBACK_TITLE = 'Untitled link';
const FALLBACK_DESCRIPTION = 'No summary available yet — open the note to see what is hiding inside.';

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
  private readonly soundBtn: HTMLButtonElement;

  private readonly hoverLine: HTMLParagraphElement;
  private readonly hoverDot: HTMLSpanElement;
  private readonly hoverText: HTMLSpanElement;

  private readonly pillsRoot: HTMLDivElement;
  private readonly pills = new Map<JarId, HTMLButtonElement>();
  private readonly pillCounts = new Map<JarId, HTMLSpanElement>();
  private readonly counts: Partial<Record<JarId, number>> = {};

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

    /* ------------------------------------------------------------ top bar */
    const topBar = el('header', 'hud-top');
    const brand = el('div', 'hud-brand');
    const title = el('h1', 'hud-title', 'JAR OF LINKS');
    const subtitle = el('p', 'hud-subtitle', 'CLICK A JAR TO UNFOLD A RANDOM LINK');
    brand.append(title, subtitle);

    this.soundBtn = el('button', 'pixel-btn hud-sound');
    this.soundBtn.type = 'button';
    this.soundBtn.addEventListener('click', () => {
      this.applyMuted(this.callbacks.onToggleMute());
    });
    topBar.append(brand, this.soundBtn);

    /* ---------------------------------------------------------- hover line */
    this.hoverLine = el('p', 'hud-hover');
    this.hoverLine.setAttribute('aria-live', 'polite');
    this.hoverLine.setAttribute('aria-atomic', 'true');
    this.hoverDot = el('span', 'hud-hover__dot');
    this.hoverDot.setAttribute('aria-hidden', 'true');
    this.hoverText = el('span', 'hud-hover__text', DEFAULT_HOVER_TEXT);
    this.hoverLine.append(this.hoverDot, this.hoverText);

    /* --------------------------------------------------------------- pills */
    this.pillsRoot = el('div', 'hud-pills');
    this.pillsRoot.setAttribute('role', 'group');
    this.pillsRoot.setAttribute('aria-label', 'Jar shortcuts');
    for (const config of JAR_CONFIGS) {
      this.pillsRoot.append(this.createPill(config));
    }

    const dock = el('div', 'hud-dock');
    dock.append(this.hoverLine, this.pillsRoot);

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
    this.stampEl = el('span', 'paper-stamp', 'LINK');
    this.stampEl.setAttribute('aria-hidden', 'true');

    this.closeXBtn = el('button', 'paper-close', '✕');
    this.closeXBtn.type = 'button';
    this.closeXBtn.setAttribute('aria-label', 'Close link card');
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
    this.loaderLabel = el('span', 'paper-og-loading__label', 'UNFOLDING...');
    this.ogLoading.append(this.loaderLabel);

    this.ogImg = el('img', 'paper-og-img');
    this.ogImg.alt = '';
    this.ogImg.decoding = 'async';
    this.ogImg.loading = 'eager';
    this.ogImg.referrerPolicy = 'no-referrer';
    this.ogImg.hidden = true;

    const openBadge = el('span', 'paper-open-badge', 'OPEN LINK ↗');
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

    const hint = el('p', 'paper-hint', 'CLICK CARD TO OPEN IN NEW TAB ↗');

    this.linkEl.append(ogFrame, meta, this.titleEl, this.descEl, hint);

    const actions = el('div', 'paper-actions');
    this.drawBtn = el('button', 'pixel-btn paper-btn paper-btn--draw', '↻ DRAW ANOTHER');
    this.drawBtn.type = 'button';
    this.drawBtn.addEventListener('click', () => this.callbacks.onDrawAnother());

    const putBackBtn = el('button', 'pixel-btn paper-btn paper-btn--back', '✕ PUT BACK');
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

    this.root.append(topBar, dock, this.cardLayer, this.toastEl, scanlines);
    container.replaceChildren(this.root);

    this.ogImg.addEventListener('load', () => this.handleOgImageLoad());
    this.ogImg.addEventListener('error', () => this.handleOgImageError());
    this.faviconEl.addEventListener('error', () => {
      this.faviconEl.hidden = true;
      this.faviconEl.removeAttribute('src');
    });

    this.setMutedState(initialMuted);
    this.updateJarCounts({});
    this.setHoveredJar(null);

    window.addEventListener('keydown', this.handleKeyDown);
  }

  /* ====================================================================== */
  /* Public API                                                             */
  /* ====================================================================== */

  public setHoveredJar(jarConfig: JarConfig | null): void {
    if (!jarConfig) {
      this.hoverText.textContent = DEFAULT_HOVER_TEXT;
      this.hoverDot.style.backgroundColor = '';
      this.hoverLine.classList.remove('is-active');
      return;
    }

    this.hoverText.textContent = `${jarConfig.label} — ${jarConfig.subtitle}`;
    this.hoverDot.style.backgroundColor = safeAccent(jarConfig.accentColor);
    this.hoverLine.classList.add('is-active');
  }

  public updateJarCounts(counts: Partial<Record<JarId, number>>): void {
    for (const key of Object.keys(counts)) {
      if (!isJarId(key)) continue;
      const raw = counts[key];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      this.counts[key] = Math.max(0, Math.floor(raw));
    }
    this.renderJarCounts();
  }

  public setInteractionLocked(locked: boolean): void {
    this.interactionLocked = locked;
    this.root.classList.toggle('is-locked', locked);
    for (const pill of this.pills.values()) {
      pill.disabled = locked;
      pill.setAttribute('aria-disabled', String(locked));
    }
  }

  public showCardLoading(jarConfig: JarConfig): void {
    this.openCard();

    this.cardVisible = true;
    this.paperCard.classList.add('is-loading');
    this.setCardAccent(safeAccent(jarConfig.accentColor));

    this.stampEl.textContent = (jarConfig.shortLabel || jarConfig.label).toUpperCase();

    this.linkEl.removeAttribute('href');
    this.linkEl.setAttribute('aria-busy', 'true');
    this.linkEl.setAttribute('aria-label', `${jarConfig.label} note is unfolding`);

    this.ogImg.hidden = true;
    this.ogImg.classList.remove('is-loaded', 'is-fallback');
    this.ogImg.removeAttribute('src');
    this.ogLoading.hidden = false;
    this.ogLoading.classList.remove('is-error');
    this.loaderLabel.textContent = 'UNFOLDING...';

    this.faviconEl.hidden = true;
    this.faviconEl.removeAttribute('src');
    this.siteEl.textContent = jarConfig.label.toUpperCase();
    this.hostEl.textContent = '···';
    this.titleEl.textContent = 'UNFOLDING NOTE...';
    this.descEl.textContent = `Pulling a random note out of the ${jarConfig.label} jar...`;

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

    const jarLabel = (preview.jarLabel || config?.label || 'LINK').trim();
    this.stampEl.textContent = jarLabel.toUpperCase();

    const hostname = (preview.hostname || '').trim();
    const title = (preview.title || '').trim() || hostname || FALLBACK_TITLE;
    const description = (preview.description || '').trim() || FALLBACK_DESCRIPTION;

    this.siteEl.textContent = (preview.siteName || '').trim() || hostname || 'LINK';
    this.hostEl.textContent = hostname ? `· ${hostname}` : '';
    this.titleEl.textContent = title;
    this.descEl.textContent = description;

    /* URL is only ever attached when it is a real http(s) destination. */
    if (isHttpUrl(preview.url)) {
      this.linkEl.href = preview.url.trim();
      this.linkEl.setAttribute('aria-busy', 'false');
      this.linkEl.setAttribute(
        'aria-label',
        `${title} — opens ${hostname || 'the link'} in a new tab`,
      );
    } else {
      this.linkEl.removeAttribute('href');
      this.linkEl.setAttribute('aria-busy', 'false');
      this.linkEl.setAttribute('aria-label', `${title} — link unavailable`);
      this.showToast('THIS LINK COULD NOT BE OPENED');
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
    this.soundBtn.textContent = this.muted ? 'SFX: OFF' : 'SFX: ON';
    this.soundBtn.setAttribute('aria-pressed', String(!this.muted));
    this.soundBtn.setAttribute(
      'aria-label',
      this.muted ? 'Sound effects off. Turn sound on' : 'Sound effects on. Turn sound off',
    );
    this.soundBtn.classList.toggle('is-muted', this.muted);
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
    }, 2600);
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
    this.pills.clear();
    this.pillCounts.clear();
    this.root.remove();
  }

  /* ====================================================================== */
  /* DOM builders                                                           */
  /* ====================================================================== */

  private createPill(config: JarConfig): HTMLButtonElement {
    const pill = el('button', 'jar-pill');
    pill.type = 'button';
    pill.dataset.jarId = config.id;
    pill.setAttribute('aria-keyshortcuts', config.hotkey);
    pill.style.setProperty('--pill-accent', safeAccent(config.accentColor));

    const dot = el('span', 'jar-pill__dot');
    dot.setAttribute('aria-hidden', 'true');

    const label = el(
      'span',
      'jar-pill__label',
      config.id === 'all' ? `★ ${config.shortLabel}` : config.shortLabel,
    );
    const count = el('span', 'jar-pill__count', '(··)');
    count.setAttribute('aria-hidden', 'true');

    pill.append(dot, label, count);

    pill.addEventListener('click', () => {
      if (this.interactionLocked) return;
      this.callbacks.onSelectJar(config.id);
    });
    pill.addEventListener('pointerenter', () => this.setHoveredJar(config));
    pill.addEventListener('pointerleave', () => this.setHoveredJar(null));
    pill.addEventListener('focus', () => this.setHoveredJar(config));
    pill.addEventListener('blur', () => this.setHoveredJar(null));

    this.pills.set(config.id, pill);
    this.pillCounts.set(config.id, count);
    return pill;
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
    this.loaderLabel.textContent = 'UNFOLDING...';

    this.faviconEl.hidden = true;
    this.faviconEl.removeAttribute('src');

    this.siteEl.textContent = '';
    this.hostEl.textContent = '';
    this.titleEl.textContent = '';
    this.descEl.textContent = '';
    this.stampEl.textContent = 'LINK';

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
    this.loaderLabel.textContent = 'UNFOLDING...';

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
    this.loaderLabel.textContent = 'NO PREVIEW IMAGE';
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
  /* Hover / counts                                                         */
  /* ====================================================================== */

  private renderJarCounts(): void {
    for (const config of JAR_CONFIGS) {
      const count = this.counts[config.id];
      const countEl = this.pillCounts.get(config.id);
      if (countEl) {
        countEl.textContent = typeof count === 'number' ? `(${count})` : '(··)';
      }

      const pill = this.pills.get(config.id);
      if (pill) {
        pill.setAttribute(
          'aria-label',
          typeof count === 'number'
            ? `${config.label} jar, ${count} links, shortcut ${config.hotkey}`
            : `${config.label} jar, shortcut ${config.hotkey}`,
        );
      }
    }
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
      this.applyMuted(this.callbacks.onToggleMute());
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

  private applyMuted(muted: boolean): void {
    this.setMutedState(Boolean(muted));
  }

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
