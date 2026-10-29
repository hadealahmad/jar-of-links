import * as THREE from 'three';
import type { AnimationPhase, JarConfig, JarId, JarStageCallbacks } from '../types';
import { JAR_CONFIGS } from '../config/jars';
import { computeJarFillRatios } from '../data/jarStore';
import {
  JarMesh,
  JAR_BODY_HEIGHT,
  JAR_HALF_WIDTH,
  JAR_PAPER_TOP,
} from './JarMesh';
import { createWoodShelfTexture } from '../pixel/textures';

const V_FOV_DEG = 40;
const FOCAL_SCALE = 1.08;
const FOCAL_Z_RATIO = 0.15;
const FOCAL_Z_MIN = 0.8;
const FOCAL_Z_MAX = 4.0;

/** Exact dark-mode body background of https://hadealahmad.com (--theme-palette-color-7) */
const STAGE_BG_HEX = 0x1a1d1e;

const DURATIONS = {
  picking: 0.42,
  opening: 0.36,
  extracting: 0.38,
  unfolding: 0.38,
  replayExtract: 0.3,
  replayUnfold: 0.32,
  closing: 0.48,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface JarSlot {
  x: number;
  y: number;
  z: number;
}

interface ShelfDef {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

interface StageLayout {
  mode: 'desktop' | 'mobile';
  slots: Record<JarId, JarSlot>;
  shelves: ShelfDef[];
  width: number;
  height: number;
  centerY: number;
}

interface Star {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  baseX: number;
  baseY: number;
  baseOpacity: number;
  size: number;
  phase: number;
  speed: number;
  driftSpeed: number;
  driftAmp: number;
}

interface JarRuntime {
  config: JarConfig;
  mesh: JarMesh;
  slot: THREE.Vector3;
  baseScale: number;
  focalPos: THREE.Vector3;
  focalScale: number;
  slotRotationY: number;
  shadow: THREE.Mesh;
  shadowMaterial: THREE.MeshBasicMaterial;
}

/** RTL right-to-left shelf layout: يوتيوب (+5), مقالات (+2.55), الكل (0), توصيات (-2.55), أخرى (-5) */
function createDesktopLayout(): StageLayout {
  const slots: Record<JarId, JarSlot> = {
    youtube: { x: 5.0, y: -0.75, z: 0 },
    articles: { x: 2.55, y: -0.75, z: 0 },
    all: { x: 0, y: -0.75, z: 0.25 },
    recommendations: { x: -2.55, y: -0.75, z: 0 },
    others: { x: -5.0, y: -0.75, z: 0 },
  };

  const top = -0.75 + JAR_BODY_HEIGHT * 1.38;
  const bottom = -1.26;

  return {
    mode: 'desktop',
    slots,
    shelves: [
      { x: 0, y: -0.92, z: 0, width: 12.2, height: 0.34, depth: 1.7 },
      { x: 0, y: -1.0, z: 0.35, width: 3.0, height: 0.52, depth: 2.0 },
    ],
    width: (5.0 + JAR_HALF_WIDTH) * 2,
    height: top - bottom,
    centerY: (top + bottom) / 2,
  };
}

function createMobileLayout(): StageLayout {
  const slots: Record<JarId, JarSlot> = {
    youtube: { x: 1.65, y: 2.45, z: 0 },
    articles: { x: -1.65, y: 2.45, z: 0 },
    all: { x: 0, y: -0.35, z: 0.2 },
    recommendations: { x: 1.65, y: -2.95, z: 0 },
    others: { x: -1.65, y: -2.95, z: 0 },
  };

  const top = 2.45 + JAR_BODY_HEIGHT;
  const bottom = -3.25;

  return {
    mode: 'mobile',
    slots,
    shelves: [
      { x: 0, y: 2.3, z: -1.0, width: 4.5, height: 0.3, depth: 1.2 },
      { x: 0, y: -0.53, z: 0, width: 3.2, height: 0.36, depth: 1.6 },
      { x: 0, y: -3.1, z: 0, width: 4.5, height: 0.3, depth: 1.4 },
    ],
    width: (1.65 + JAR_HALF_WIDTH) * 2,
    height: top - bottom,
    centerY: (top + bottom) / 2,
  };
}

/**
 * Full Three.js stage styled with https://hadealahmad.com's dark slate & cerulean palette.
 */
export class JarStage {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: JarStageCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  private readonly jars = new Map<JarId, JarRuntime>();
  private readonly jarList: JarRuntime[] = [];
  private readonly hitMeshes: THREE.Mesh[] = [];

  private readonly stars: Star[] = [];
  private readonly starGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly shelfGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly shelfMeshes: THREE.Mesh[] = [];
  private readonly shadowGeometry = new THREE.CircleGeometry(1, 12);
  private woodMaterial!: THREE.MeshLambertMaterial;

  private cameraZ = 12;
  private focalZ = 1.5;

  private phase: AnimationPhase = 'idle';
  private phaseStartedAt = 0;
  private phaseDuration = 0;
  private activeId: JarId | null = null;
  private selectionT = 0;
  private corkT = 0;
  private extractT = 0;
  private unfoldT = 0;
  private replayMode = false;
  private closingFrom = { selection: 0, cork: 0, extract: 0, unfold: 0 };

  private hoveredId: JarId | null = null;
  private pointerDown: { x: number; y: number; pointerId: number } | null = null;

  private rafId = 0;
  private lastTime = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: JarStageCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(STAGE_BG_HEX, 1);

    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'default';

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(STAGE_BG_HEX);

    this.camera = new THREE.PerspectiveCamera(V_FOV_DEG, 1, 0.1, 200);

    this.setupLights();
    this.setupStars();
    this.setupShelves();
    this.setupJars();
    this.attachEvents();

    this.resize();
    this.lastTime = performance.now() / 1000;
    this.rafId = requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------------------------
  // Scene setup (hadealahmad.com slate + #0582CA / #006494 studio lighting)
  // ---------------------------------------------------------------------------

  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0x88a2b0, 1.15));

    const hemisphere = new THREE.HemisphereLight(0xf7f8f8, 0x131516, 0.8);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xf7f8f8, 2.05);
    key.position.set(5, 9, 8);
    this.scene.add(key);

    const ceruleanRim = new THREE.DirectionalLight(0x0582ca, 1.65);
    ceruleanRim.position.set(-7, 5, -6);
    this.scene.add(ceruleanRim);

    const deepSeaFill = new THREE.DirectionalLight(0x006494, 0.7);
    deepSeaFill.position.set(0, 3, 9);
    this.scene.add(deepSeaFill);

    const crispFront = new THREE.DirectionalLight(0xedf1f2, 0.55);
    crispFront.position.set(0, 2, 10);
    this.scene.add(crispFront);

    const cyanGlow = new THREE.PointLight(0x38b6ff, 12, 26, 2);
    cyanGlow.position.set(0, 2.6, 6);
    this.scene.add(cyanGlow);
  }

  private setupStars(): void {
    const random = mulberry32(0x51a7c0de);
    // Cool cerulean, sky cyan, slate-mist, and crisp off-white pixel motes
    const colors = [0x0582ca, 0x38b6ff, 0xc5cfd4, 0xedf1f2];

    for (let i = 0; i < 45; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.starGeometry, material);

      const size = 0.07 + random() * 0.12;
      const baseX = (random() - 0.5) * 30;
      const baseY = -6 + random() * 16;
      const z = -20 + random() * 12;

      mesh.scale.setScalar(size);
      mesh.position.set(baseX, baseY, z);
      mesh.renderOrder = -10;

      this.scene.add(mesh);
      this.stars.push({
        mesh,
        material,
        baseX,
        baseY,
        baseOpacity: 0.28 + random() * 0.38,
        size,
        phase: random() * Math.PI * 2,
        speed: 0.5 + random() * 1.4,
        driftSpeed: 0.08 + random() * 0.18,
        driftAmp: 0.15 + random() * 0.35,
      });
    }
  }

  private setupShelves(): void {
    const texture = createWoodShelfTexture();
    texture.colorSpace = THREE.SRGBColorSpace;
    this.woodMaterial = new THREE.MeshLambertMaterial({
      map: texture,
      emissive: new THREE.Color(0x0c0e0f),
    });

    for (let i = 0; i < 5; i += 1) {
      const shelf = new THREE.Mesh(this.shelfGeometry, this.woodMaterial);
      shelf.visible = false;
      this.scene.add(shelf);
      this.shelfMeshes.push(shelf);
    }
  }

  private setupJars(): void {
    for (const config of JAR_CONFIGS) {
      const mesh = new JarMesh(config);
      this.scene.add(mesh.group);
      this.hitMeshes.push(mesh.hitMesh);

      const shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x0b0d0e,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        toneMapped: false,
      });
      const shadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 1;
      this.scene.add(shadow);

      const runtime: JarRuntime = {
        config,
        mesh,
        slot: new THREE.Vector3(),
        baseScale: config.scale,
        focalPos: new THREE.Vector3(),
        focalScale: config.scale * FOCAL_SCALE,
        slotRotationY: 0,
        shadow,
        shadowMaterial,
      };

      this.jars.set(config.id, runtime);
      this.jarList.push(runtime);
    }
  }

  // ---------------------------------------------------------------------------
  // Layout, resize and auto-framing
  // ---------------------------------------------------------------------------

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth || 1;
    const height = this.canvas.clientHeight || window.innerHeight || 1;
    if (width < 2 || height < 2) return;

    const pixelStep = width < 640 ? 2 : 3;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(
      Math.max(200, Math.floor(width / pixelStep)),
      Math.max(200, Math.floor(height / pixelStep)),
      false,
    );

    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    this.updateLayout(width, height);
  }

  private updateLayout(width: number, height: number): void {
    const aspect = width / height;
    const layout = aspect >= 0.95 ? createDesktopLayout() : createMobileLayout();

    this.applyShelfLayout(layout);

    const vFov = THREE.MathUtils.degToRad(V_FOV_DEG);
    const vTan = Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(vTan * aspect);
    const hTan = Math.tan(hFov / 2);

    const marginY = Math.max(0.45, layout.height * 0.065);
    const marginX = Math.max(layout.mode === 'desktop' ? 0.5 : 0.16, layout.width * 0.025);

    const halfHeight = layout.height / 2 + marginY;
    const halfWidth = layout.width / 2 + marginX;

    let distance = Math.max(halfHeight / vTan, halfWidth / hTan) + 0.7;

    const maxFocalScale = 1.38 * FOCAL_SCALE;
    const paperHalfHeight = (JAR_PAPER_TOP * maxFocalScale) / 2;
    const paperForward = 0.55 * maxFocalScale;
    for (let i = 0; i < 6; i += 1) {
      const focalZ = clamp(distance * FOCAL_Z_RATIO, FOCAL_Z_MIN, FOCAL_Z_MAX);
      const required = paperHalfHeight / (0.75 * vTan) + focalZ + paperForward + 0.15;
      if (distance >= required) break;
      distance = required;
    }

    this.cameraZ = distance;
    this.focalZ = clamp(distance * FOCAL_Z_RATIO, FOCAL_Z_MIN, FOCAL_Z_MAX);

    this.camera.aspect = aspect;
    this.camera.position.set(0, layout.centerY, distance);
    this.camera.lookAt(0, layout.centerY, 0);
    this.camera.updateProjectionMatrix();

    for (const runtime of this.jarList) {
      const slot = layout.slots[runtime.config.id];
      runtime.slot.set(slot.x, slot.y, slot.z);
      runtime.baseScale = runtime.config.scale;
      runtime.focalScale = runtime.config.scale * FOCAL_SCALE;
      const focalY =
        layout.centerY - (JAR_PAPER_TOP * runtime.focalScale) / 2;
      runtime.focalPos.set(0, focalY, this.focalZ);
      runtime.slotRotationY = Math.atan2(
        -slot.x,
        Math.max(0.001, this.cameraZ - slot.z),
      );

      runtime.shadow.position.set(slot.x, slot.y + 0.012, slot.z + 0.03);
      runtime.shadow.scale.set(
        0.9 * runtime.config.scale,
        0.62 * runtime.config.scale,
        1,
      );
    }
  }

  private applyShelfLayout(layout: StageLayout): void {
    for (let i = 0; i < this.shelfMeshes.length; i += 1) {
      const mesh = this.shelfMeshes[i];
      const def = layout.shelves[i];
      if (!def) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(def.x, def.y, def.z);
      mesh.scale.set(def.width, def.height, def.depth);
    }
  }

  // ---------------------------------------------------------------------------
  // Pointer & touch interaction
  // ---------------------------------------------------------------------------

  private attachEvents(): void {
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('resize', this.onWindowResize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    }
  }

  private readonly onWindowResize = (): void => {
    this.resize();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    if (this.phase !== 'idle') {
      this.setHovered(null);
      return;
    }
    this.setHovered(this.pickJar(event.clientX, event.clientY));
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || down.pointerId !== event.pointerId) return;
    if (this.phase !== 'idle') return;

    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (Math.hypot(dx, dy) > 14) return;

    const hit = this.pickJar(event.clientX, event.clientY);
    if (hit) this.triggerJar(hit);
  };

  private readonly onPointerLeave = (): void => {
    this.pointerDown = null;
    this.setHovered(null);
  };

  private readonly onPointerCancel = (): void => {
    this.pointerDown = null;
  };

  private setHovered(jarId: JarId | null): void {
    if (this.hoveredId === jarId) return;
    if (this.hoveredId) {
      this.jars.get(this.hoveredId)?.mesh.setHovered(false);
    }
    this.hoveredId = jarId;
    if (jarId) {
      this.jars.get(jarId)?.mesh.setHovered(true);
    }
    this.canvas.style.cursor = jarId ? 'pointer' : 'default';
    this.callbacks.onJarHover?.(jarId);
  }

  private pickJar(clientX: number, clientY: number): JarId | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false);

    for (const hit of hits) {
      const id = hit.object.userData.jarId as JarId | undefined;
      if (id) return id;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Public animation & fill controls
  // ---------------------------------------------------------------------------

  /**
   * Update the visual card fullness of every jar based on current CSV item counts.
   * `all` is always the fullest jar; category jars reflect their relative counts.
   */
  updateJarCounts(counts: Partial<Record<JarId, number>>): void {
    const ratios = computeJarFillRatios(counts);
    for (const runtime of this.jarList) {
      const id = runtime.config.id;
      runtime.mesh.setFillLevel(ratios[id], counts[id]);
    }
  }

  getPhase(): AnimationPhase {
    return this.phase;
  }

  getActiveJarId(): JarId | null {
    return this.activeId;
  }

  triggerJar(jarId: JarId): void {
    if (this.phase !== 'idle') return;
    if (!this.jars.has(jarId)) return;

    const now = performance.now() / 1000;
    this.activeId = jarId;
    this.selectionT = 0;
    this.corkT = 0;
    this.extractT = 0;
    this.unfoldT = 0;
    this.replayMode = false;

    this.setHovered(null);
    this.callbacks.onJarSelect(jarId);
    this.jars.get(jarId)?.mesh.setShake(0.9, now);
    this.startPhase('picking', DURATIONS.picking, now);
  }

  replayExtractForAnotherLink(): void {
    if (this.phase !== 'card_open' || !this.activeId) return;

    const now = performance.now() / 1000;
    this.extractT = 0;
    this.unfoldT = 0;
    this.replayMode = true;

    this.jars.get(this.activeId)?.mesh.setShake(0.75, now);
    this.startPhase('extracting', DURATIONS.replayExtract, now);
  }

  closeActiveJar(): void {
    if (this.phase === 'idle' || this.phase === 'closing' || !this.activeId) return;

    const now = performance.now() / 1000;
    this.closingFrom = {
      selection: this.selectionT,
      cork: this.corkT,
      extract: this.extractT,
      unfold: this.unfoldT,
    };
    this.startPhase('closing', DURATIONS.closing, now);
  }

  private startPhase(phase: AnimationPhase, duration: number, now: number): void {
    this.phase = phase;
    this.phaseDuration = duration;
    this.phaseStartedAt = now;
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  private readonly tick = (timestamp: number): void => {
    this.rafId = requestAnimationFrame(this.tick);

    const now = timestamp / 1000;
    if (this.lastTime === 0) this.lastTime = now;
    const dt = clamp(now - this.lastTime, 0, 0.05);
    this.lastTime = now;

    this.updatePhase(now);
    this.updateScene(now, dt);

    this.renderer.render(this.scene, this.camera);
  };

  private updatePhase(now: number): void {
    if (!this.activeId) return;
    if (this.phase === 'idle' || this.phase === 'card_open') return;

    const progress = clamp01(
      (now - this.phaseStartedAt) / Math.max(0.0001, this.phaseDuration),
    );
    const id = this.activeId;

    switch (this.phase) {
      case 'picking': {
        this.selectionT = easeOutCubic(progress);
        if (progress >= 1) {
          this.selectionT = 1;
          this.startPhase('opening', DURATIONS.opening, now);
          this.callbacks.onCorkPop?.(id);
        }
        break;
      }
      case 'opening': {
        this.corkT = easeOutCubic(progress);
        if (progress >= 1) {
          this.corkT = 1;
          this.startPhase('extracting', DURATIONS.extracting, now);
          this.callbacks.onPaperExtract?.(id);
        }
        break;
      }
      case 'extracting': {
        this.extractT = easeInOutCubic(progress);
        if (progress >= 1) {
          this.extractT = 1;
          const duration = this.replayMode
            ? DURATIONS.replayUnfold
            : DURATIONS.unfolding;
          this.replayMode = false;
          this.startPhase('unfolding', duration, now);
        }
        break;
      }
      case 'unfolding': {
        this.unfoldT = easeInOutCubic(progress);
        if (progress >= 1) {
          this.unfoldT = 1;
          this.phase = 'card_open';
          this.phaseDuration = 0;
          this.callbacks.onPaperUnfolded(id);
        }
        break;
      }
      case 'closing': {
        const unfoldOut = easeInOutCubic(clamp01(progress / 0.32));
        this.unfoldT = this.closingFrom.unfold * (1 - unfoldOut);

        const extractOut = easeInOutCubic(clamp01((progress - 0.1) / 0.42));
        this.extractT = this.closingFrom.extract * (1 - extractOut);

        const corkOut = easeInOutCubic(clamp01((progress - 0.32) / 0.38));
        this.corkT = this.closingFrom.cork * (1 - corkOut);

        const selectionOut = easeInOutCubic(clamp01((progress - 0.22) / 0.78));
        this.selectionT = this.closingFrom.selection * (1 - selectionOut);

        if (progress >= 1) {
          this.unfoldT = 0;
          this.extractT = 0;
          this.corkT = 0;
          this.selectionT = 0;
          this.phase = 'idle';
          this.phaseDuration = 0;
          this.jars.get(id)?.mesh.resetPose();
          this.activeId = null;
          this.callbacks.onJarClosed?.(id);
        }
        break;
      }
      default:
        break;
    }
  }

  private updateScene(time: number, dt: number): void {
    const selection = easeInOutCubic(this.selectionT);

    for (const runtime of this.jarList) {
      const active = runtime.config.id === this.activeId;
      const moveT = active ? selection : 0;
      const pushT = active ? 0 : selection;

      const x = lerp(runtime.slot.x, runtime.focalPos.x, moveT);
      const y = lerp(runtime.slot.y, runtime.focalPos.y, moveT) - 0.05 * pushT;
      const z = lerp(runtime.slot.z, runtime.focalPos.z, moveT) - 0.32 * pushT;

      runtime.mesh.group.position.set(x, y, z);
      runtime.mesh.group.scale.setScalar(
        lerp(runtime.baseScale, runtime.focalScale, moveT) * (1 - 0.035 * pushT),
      );
      runtime.mesh.group.rotation.y = lerp(runtime.slotRotationY, 0, moveT);

      runtime.mesh.setCorkOpenProgress(active ? this.corkT : 0);
      runtime.mesh.setPaperState(
        active ? this.extractT : 0,
        active ? this.unfoldT : 0,
      );
      runtime.mesh.setLabelOpacity(active ? 1 : 1 - selection * 0.9);
      runtime.mesh.updateIdle(time, dt);

      runtime.shadowMaterial.opacity = active ? 0.36 * (1 - selection * 0.85) : 0.36;
    }

    for (const star of this.stars) {
      const twinkle =
        0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * star.speed + star.phase));
      star.material.opacity = star.baseOpacity * twinkle;
      star.mesh.position.x =
        star.baseX + Math.sin(time * star.driftSpeed + star.phase) * star.driftAmp;
      star.mesh.position.y =
        star.baseY +
        Math.cos(time * star.driftSpeed * 0.8 + star.phase) * star.driftAmp * 0.7;
      star.mesh.scale.setScalar(star.size * (0.9 + twinkle * 0.25));
    }
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  dispose(): void {
    cancelAnimationFrame(this.rafId);

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    window.removeEventListener('resize', this.onWindowResize);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);

    for (const runtime of this.jarList) {
      runtime.mesh.dispose();
    }

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const map = (material as THREE.Material & { map?: THREE.Texture | null }).map;
        if (map) map.dispose();
        material.dispose();
      }
    });

    this.starGeometry.dispose();
    this.shelfGeometry.dispose();
    this.shadowGeometry.dispose();
    this.renderer.dispose();
  }
}
