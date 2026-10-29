/**
 * Zero-dependency retro 8-bit sound effects.
 *
 * A tiny WebAudio chiptune synthesizer: every sound is generated on the fly
 * from oscillators and filtered noise, so there are no audio assets to load.
 * The AudioContext is created lazily on the first user gesture (browsers block
 * audio before that), and every entry point degrades to a silent no-op when
 * WebAudio is unavailable.
 */

const STORAGE_KEY = 'jar_sfx_muted';

type AudioContextConstructor = new () => AudioContext;
type WebkitWindow = Window & { webkitAudioContext?: AudioContextConstructor };

interface ToneOptions {
  /** Starting frequency in Hz. */
  freq: number;
  /** Optional exponential sweep target in Hz. */
  endFreq?: number;
  type?: OscillatorType;
  /** Total note length in seconds. */
  duration: number;
  /** Peak gain relative to the master bus (0..1). */
  gain: number;
  /** Seconds to wait before the note starts. */
  delay?: number;
  /** Envelope attack in seconds. */
  attack?: number;
}

interface NoiseOptions {
  duration: number;
  gain: number;
  filter: BiquadFilterType;
  frequency: number;
  endFrequency?: number;
  q?: number;
  delay?: number;
}

function readStoredMute(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

function writeStoredMute(muted: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Storage can be unavailable (private mode / file URLs); sound still works.
  }
}

export class SfxController {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private lastHoverAt = Number.NEGATIVE_INFINITY;

  constructor() {
    this.muted = readStoredMute();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = Boolean(muted);
    writeStoredMute(this.muted);
  }

  /** Flip mute state, persist it, and chirp a tiny confirmation when unmuting. */
  toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) this.confirmBlip();
    return this.muted;
  }

  /** Very soft, short tick — throttled to at most once every 70 ms. */
  playHoverBlip(): void {
    if (this.muted) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastHoverAt < 70) return;
    this.lastHoverAt = now;
    if (!this.ensureContext()) return;

    try {
      this.tone({
        freq: 1420,
        endFreq: 1680,
        type: 'triangle',
        duration: 0.035,
        gain: 0.12,
        attack: 0.003,
      });
    } catch {
      // Audio is best-effort only.
    }
  }

  /** Playful rising two-note arpeggio plus a subtle paper rattle. */
  playJarPick(): void {
    if (this.muted || !this.ensureContext()) return;

    try {
      this.tone({ freq: 523.25, type: 'square', duration: 0.12, gain: 0.22, attack: 0.004 });
      this.tone({ freq: 783.99, type: 'square', duration: 0.16, gain: 0.2, delay: 0.08, attack: 0.004 });
      this.noise({
        duration: 0.24,
        gain: 0.2,
        filter: 'bandpass',
        frequency: 2400,
        endFrequency: 3200,
        q: 0.9,
        delay: 0.02,
      });
    } catch {
      // Audio is best-effort only.
    }
  }

  /** Classic pitch-sweep "bloop-pop!" cork sound. */
  playCorkPop(): void {
    if (this.muted || !this.ensureContext()) return;

    try {
      this.tone({ freq: 170, endFreq: 780, type: 'sine', duration: 0.075, gain: 0.55, attack: 0.003 });
      this.tone({
        freq: 780,
        endFreq: 230,
        type: 'triangle',
        duration: 0.14,
        gain: 0.35,
        delay: 0.06,
        attack: 0.002,
      });
      this.noise({ duration: 0.06, gain: 0.26, filter: 'highpass', frequency: 1600, q: 0.7 });
    } catch {
      // Audio is best-effort only.
    }
  }

  /** Soft paper rustle plus a warm 8-bit chime triad. */
  playPaperUnfold(): void {
    if (this.muted || !this.ensureContext()) return;

    try {
      this.noise({
        duration: 0.4,
        gain: 0.22,
        filter: 'bandpass',
        frequency: 1400,
        endFrequency: 3400,
        q: 0.7,
      });
      this.noise({ duration: 0.28, gain: 0.15, filter: 'highpass', frequency: 2200, delay: 0.08 });

      const chime = [523.25, 659.25, 783.99];
      chime.forEach((freq, index) => {
        this.tone({
          freq,
          type: 'triangle',
          duration: 0.34,
          gain: 0.16,
          delay: 0.14 + index * 0.06,
          attack: 0.012,
        });
      });
    } catch {
      // Audio is best-effort only.
    }
  }

  /** Gentle descending two-note tuck ending in a soft cork thud. */
  playClose(): void {
    if (this.muted || !this.ensureContext()) return;

    try {
      this.tone({ freq: 659.25, type: 'triangle', duration: 0.13, gain: 0.2, attack: 0.006 });
      this.tone({
        freq: 440,
        type: 'triangle',
        duration: 0.24,
        gain: 0.18,
        delay: 0.1,
        attack: 0.008,
      });
      this.tone({
        freq: 150,
        endFreq: 65,
        type: 'sine',
        duration: 0.18,
        gain: 0.42,
        delay: 0.22,
        attack: 0.004,
      });
      this.noise({ duration: 0.09, gain: 0.15, filter: 'lowpass', frequency: 700, delay: 0.22 });
    } catch {
      // Audio is best-effort only.
    }
  }

  /* --------------------------------------------------------------------- */

  private confirmBlip(): void {
    if (!this.ensureContext()) return;

    try {
      this.tone({ freq: 880, type: 'square', duration: 0.05, gain: 0.09, attack: 0.003 });
      this.tone({
        freq: 1318.51,
        type: 'square',
        duration: 0.08,
        gain: 0.09,
        delay: 0.055,
        attack: 0.003,
      });
    } catch {
      // Audio is best-effort only.
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      this.resume();
      return this.ctx;
    }
    if (typeof window === 'undefined') return null;

    const AudioCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!AudioCtor) return null;

    try {
      const ctx = new AudioCtor();
      const master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.resume();
      return ctx;
    } catch {
      this.ctx = null;
      this.master = null;
      return null;
    }
  }

  private resume(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    void ctx.resume().catch(() => {
      // Still waiting for a user gesture; the next call will try again.
    });
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }

    const frames = Math.max(1, Math.floor(ctx.sampleRate * 0.6));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private tone(options: ToneOptions): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const duration = Math.max(0.02, options.duration);
    const start = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const attack = Math.min(Math.max(0.002, options.attack ?? 0.008), duration * 0.5);

    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();

    oscillator.type = options.type ?? 'square';
    oscillator.frequency.setValueAtTime(Math.max(20, options.freq), start);
    if (options.endFreq !== undefined && options.endFreq !== options.freq) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.endFreq),
        start + duration,
      );
    }

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private noise(options: NoiseOptions): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const duration = Math.max(0.02, options.duration);
    const start = ctx.currentTime + Math.max(0, options.delay ?? 0);

    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = options.filter;
    filter.frequency.setValueAtTime(Math.max(40, options.frequency), start);
    if (options.endFrequency !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, options.endFrequency),
        start + duration,
      );
    }
    filter.Q.value = Math.max(0.0001, options.q ?? 0.8);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(start);
    source.stop(start + duration + 0.03);
  }
}
