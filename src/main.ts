import './styles/pixel.css';

import { JAR_BY_ID } from './config/jars';
import { JarStore } from './data/jarStore';
import { resolveLinkPreview } from './data/ogResolver';
import { SfxController } from './pixel/sfx';
import { JarStage } from './scene/JarStage';
import type { JarId, ResolvedLinkPreview } from './types';
import { HudOverlay } from './ui/HudOverlay';

interface ActiveDrawState {
  token: number;
  jarId: JarId;
  settled: boolean;
  result: ResolvedLinkPreview | null;
  promise: Promise<ResolvedLinkPreview | null>;
}

function bootstrap(): void {
  const canvas = document.getElementById('jar-canvas');
  const hudRoot = document.getElementById('hud-root');

  if (!(canvas instanceof HTMLCanvasElement) || !(hudRoot instanceof HTMLElement)) {
    throw new Error('Missing #jar-canvas or #hud-root mount elements in index.html');
  }

  const sfx = new SfxController();
  const jarStore = new JarStore();

  let drawCounter = 0;
  let activeDraw: ActiveDrawState | null = null;
  let stage: JarStage | null = null;

  const startDraw = (jarId: JarId): ActiveDrawState => {
    const token = ++drawCounter;
    const jarConfig = JAR_BY_ID[jarId];

    const state: ActiveDrawState = {
      token,
      jarId,
      settled: false,
      result: null,
      promise: Promise.resolve(null),
    };

    state.promise = (async (): Promise<ResolvedLinkPreview | null> => {
      try {
        const entry = await jarStore.drawRandom(jarId);
        hud.updateJarCounts(jarStore.getAllCounts());
        if (!entry) return null;
        return await resolveLinkPreview(entry, jarConfig);
      } catch (err) {
        console.error(`[JarOfLinks] Failed to draw link from "${jarId}" jar:`, err);
        return null;
      }
    })().then((resolved) => {
      state.settled = true;
      state.result = resolved;
      return resolved;
    });

    activeDraw = state;
    return state;
  };

  const hud = new HudOverlay(
    hudRoot,
    {
      onSelectJar: (jarId: JarId) => {
        if (!stage || stage.getPhase() !== 'idle') return;
        stage.triggerJar(jarId);
      },
      onDrawAnother: () => {
        if (!stage || stage.getPhase() !== 'card_open') return;
        const activeJarId = stage.getActiveJarId();
        if (!activeJarId) return;

        hud.hideCard();
        sfx.playJarPick();
        startDraw(activeJarId);
        stage.replayExtractForAnotherLink();
      },
      onCloseCard: () => {
        drawCounter += 1;
        activeDraw = null;
        hud.hideCard();
        if (stage && stage.getPhase() !== 'idle' && stage.getPhase() !== 'closing') {
          sfx.playClose();
          stage.closeActiveJar();
        } else {
          hud.setInteractionLocked(false);
        }
      },
      onToggleMute: () => sfx.toggleMute(),
    },
    sfx.isMuted(),
  );

  stage = new JarStage(canvas, {
    onJarHover: (jarId: JarId | null) => {
      if (jarId) {
        sfx.playHoverBlip();
        hud.setHoveredJar(JAR_BY_ID[jarId]);
      } else {
        hud.setHoveredJar(null);
      }
    },
    onJarSelect: (jarId: JarId) => {
      hud.setInteractionLocked(true);
      hud.setHoveredJar(JAR_BY_ID[jarId]);
      sfx.playJarPick();
      // Begin fetching CSV / resolving OG metadata concurrently while the 3D jar animates
      startDraw(jarId);
    },
    onCorkPop: () => {
      sfx.playCorkPop();
    },
    onPaperUnfolded: (jarId: JarId) => {
      sfx.playPaperUnfold();
      const jarConfig = JAR_BY_ID[jarId];
      const currentDraw =
        activeDraw && activeDraw.jarId === jarId ? activeDraw : startDraw(jarId);
      const expectedToken = currentDraw.token;

      if (currentDraw.settled) {
        if (!currentDraw.result) {
          hud.showToast(`لا توجد روابط في مرطبان «${jarConfig.label}» بعد!`);
          sfx.playClose();
          stage?.closeActiveJar();
          return;
        }
        hud.showCardPreview(currentDraw.result);
        return;
      }

      // OG metadata is still resolving over the network — show unfolded paper skeleton first
      hud.showCardLoading(jarConfig);
      void currentDraw.promise.then((preview) => {
        if (drawCounter !== expectedToken) return;
        if (!preview) {
          hud.hideCard();
          hud.showToast(`لا توجد روابط في مرطبان «${jarConfig.label}» بعد!`);
          sfx.playClose();
          stage?.closeActiveJar();
          return;
        }
        hud.showCardPreview(preview);
      });
    },
    onJarClosed: () => {
      hud.setHoveredJar(null);
      hud.setInteractionLocked(false);
    },
  });

  // Preload all 5 CSV files in the background so first jar click opens with zero fetch delay
  void jarStore.preloadAll().then((counts) => {
    hud.updateJarCounts(counts);
  });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      hud.dispose();
      stage?.dispose();
    });
  }
}

bootstrap();
