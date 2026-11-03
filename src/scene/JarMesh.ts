import * as THREE from 'three';
import type { JarConfig } from '../types';
import {
  createJarLabelTexture,
  createCorkTexture,
  createPaperSlipTexture,
} from '../pixel/textures';

/**
 * Shared visual dimensions (in unscaled jar-local units).
 * JarStage uses these to frame the camera and build the focal pose.
 */
export const JAR_BODY_HEIGHT = 2.09;
export const JAR_HALF_WIDTH = 0.78;
/** Local Y of the top edge of the fully unfolded hero paper. */
export const JAR_PAPER_TOP = 3.05;
/** Maximum number of folded paper notes rendered inside a 100%-full jar (`all`). */
export const MAX_INTERIOR_NOTES = 56;

const BODY_BOTTOM_RADIUS = 0.72;
const BODY_TOP_RADIUS = 0.66;
const BODY_HEIGHT = 1.25;
const SHOULDER_HEIGHT = 0.36;
const NECK_RADIUS = 0.37;
const NECK_HEIGHT = 0.28;
const RIM_Y = BODY_HEIGHT + SHOULDER_HEIGHT + NECK_HEIGHT; // 1.89

/** Draw order: back glass (0) → outline (0) → papers (1) → front glass (2) → label (20). */
const BACK_GLASS_OPACITY = 0.18;
const OUTLINE_SCALE = 1.06;
const OUTLINE_MAX_OPACITY = 0.55;
const HOVER_LIFT = 0.09;
const HOVER_WOBBLE_RAD = 0.05;
const HOVER_WOBBLE_HZ = 3;
const CORK_RATTLE_HZ = 10;
const CORK_RATTLE_Y = 0.01;
const CORK_RATTLE_ROT = 0.04;
/** The note under the hero slip is scaled up a touch so the pile has a clear top. */
const TOP_NOTE_SCALE = 1.14;

const MIN_NOTE_Y = 0.14;
const MAX_NOTE_Y = 1.48;
const GOLDEN_ANGLE = 2.399963229728653;

const LABEL_Y = 0.62;
const LABEL_WIDTH = 1.2;
const LABEL_HEIGHT = 0.6;
const LABEL_CENTER_Z = 0.72;
const LABEL_EDGE_Z = 0.45;

const CORK_CLOSED = new THREE.Vector3(0, RIM_Y - 0.29, 0);
const CORK_OPEN = new THREE.Vector3(0.82, 2.62, -0.02);

const HERO_LEAF_W = 0.66;
const HERO_LEAF_H = 0.44;
const FOLD_MAX = Math.PI * 0.88;
const HERO_EXTRACT_POS = new THREE.Vector3(0.0, 2.3, 0.3);
const HERO_UNFOLD_POS = new THREE.Vector3(0.0, 2.5, 0.55);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Tiny deterministic PRNG so every jar looks the same on every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function setUvV(geometry: THREE.BufferGeometry, vMin: number, vMax: number): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setY(i, vMin + uv.getY(i) * (vMax - vMin));
  }
  uv.needsUpdate = true;
}

/** A small paper slip bent along its middle to read as a folded V. */
function createFoldedSlipGeometry(
  width: number,
  height: number,
  creaseDepth: number,
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, 2, 1);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getX(i)) < 1e-5) {
      position.setZ(i, creaseDepth);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

interface PaperNote {
  mesh: THREE.Mesh;
  base: THREE.Euler;
  phase: number;
  /** Unscaled size of this slip; the top of the pile gets a small boost. */
  baseScale: number;
}

/**
 * A single low-poly pixel-art jar: faceted translucent glass, cork stopper,
 * parchment label, stratified interior notes scaled to relative item count,
 * and the hinged hero paper that unfolds toward the viewer.
 */
export class JarMesh {
  readonly config: JarConfig;
  readonly group: THREE.Group;
  readonly hitMesh: THREE.Mesh;

  /** Hinged leaves of the animated hero paper. */
  topLeaf!: THREE.Group;
  bottomLeaf!: THREE.Group;

  private readonly visualRoot = new THREE.Group();
  private readonly glassGroup = new THREE.Group();
  private readonly corkGroup = new THREE.Group();
  private readonly papersGroup = new THREE.Group();
  private readonly heroPaperGroup = new THREE.Group();
  private readonly heroRestPos = new THREE.Vector3(0.02, 0.92, 0.08);
  private readonly heroPosition = new THREE.Vector3();
  private readonly papers: PaperNote[] = [];
  private labelMesh!: THREE.Mesh;
  private labelMaterial!: THREE.MeshBasicMaterial;

  /** Inside-out, slightly enlarged glass shell used as the hover silhouette. */
  private readonly outlineGroup = new THREE.Group();
  private outlineMaterial!: THREE.MeshBasicMaterial;

  /** Snapshot of the OS motion preference, kept live via a media-query listener. */
  private reducedMotion = false;
  private motionQuery: MediaQueryList | null = null;
  private readonly handleMotionChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = event.matches;
  };

  private readonly paperTextures = new Map<string, THREE.Texture>();
  private readonly paperMaterials = new Map<string, THREE.MeshLambertMaterial>();

  private readonly seed: number;
  private hoverTarget = 0;
  private hoverLift = 0;

  private shakeStart = -1000;
  private shakeIntensity = 0;
  private shakeDuration = 0.55;

  private visibleNoteCount = 0;
  private hasItems = true;

  private corkT = 0;
  private corkBaseY = CORK_CLOSED.y;
  private corkBaseRotZ = 0;
  private extractT = 0;
  private unfoldT = 0;
  private heroBaseY = 0.92;
  private heroBaseRotZ = 0;

  constructor(config: JarConfig) {
    this.config = config;
    this.seed = (hashString(config.id) % 1000) / 1000;

    this.group = new THREE.Group();
    this.group.name = `jar-${config.id}`;
    this.group.userData.jarId = config.id;
    this.group.add(this.visualRoot);

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionQuery.matches;
      this.motionQuery.addEventListener('change', this.handleMotionChange);
    }

    this.buildGlass();
    this.buildOutline();
    this.buildLabel();
    this.buildHighlights();
    this.buildInteriorPapers();
    this.buildHeroPaper();
    this.buildCork();
    this.hitMesh = this.buildHitMesh();

    // `all` starts visually full (1.0); category jars start mid-full until CSV counts resolve.
    this.setFillLevel(config.id === 'all' ? 1 : 0.45);
    this.resetPose();
  }

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  private buildGlass(): void {
    const tint = new THREE.Color(this.config.glassTint);
    const glassMaterial = new THREE.MeshPhongMaterial({
      color: tint,
      emissive: tint.clone().multiplyScalar(0.12),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      flatShading: true,
      shininess: 80,
      specular: new THREE.Color(0xffffff),
      side: THREE.FrontSide,
    });

    // Second pass over the same silhouette, seen from the inside. The open
    // cylinders only ever show their front faces, which reads as a paper-thin
    // sheet; this darker back wall gives the glass visible depth behind the pile.
    const backMaterial = glassMaterial.clone();
    backMaterial.side = THREE.BackSide;
    backMaterial.opacity = BACK_GLASS_OPACITY;
    backMaterial.color.multiplyScalar(0.62);
    backMaterial.emissive.multiplyScalar(0.5);
    backMaterial.shininess = 10;

    const bodyGeometry = new THREE.CylinderGeometry(
      BODY_TOP_RADIUS,
      BODY_BOTTOM_RADIUS,
      BODY_HEIGHT,
      10,
      1,
      true,
    );
    const shoulderGeometry = new THREE.CylinderGeometry(
      NECK_RADIUS,
      BODY_TOP_RADIUS,
      SHOULDER_HEIGHT,
      10,
      1,
      true,
    );
    const neckGeometry = new THREE.CylinderGeometry(
      NECK_RADIUS,
      NECK_RADIUS,
      NECK_HEIGHT,
      10,
      1,
      true,
    );

    const addShell = (material: THREE.Material, renderOrder: number): void => {
      const body = new THREE.Mesh(bodyGeometry, material);
      body.position.y = BODY_HEIGHT / 2;
      body.renderOrder = renderOrder;
      this.glassGroup.add(body);

      const shoulder = new THREE.Mesh(shoulderGeometry, material);
      shoulder.position.y = BODY_HEIGHT + SHOULDER_HEIGHT / 2;
      shoulder.renderOrder = renderOrder;
      this.glassGroup.add(shoulder);

      const neck = new THREE.Mesh(neckGeometry, material);
      neck.position.y = BODY_HEIGHT + SHOULDER_HEIGHT + NECK_HEIGHT / 2;
      neck.renderOrder = renderOrder;
      this.glassGroup.add(neck);
    };

    // Back wall first so the notes (renderOrder 1) sit inside the glass volume.
    addShell(backMaterial, 0);
    addShell(glassMaterial, 2);

    // Thicker lip at the rim: its silhouette survives the 1/3-resolution pass.
    const rimMaterial = glassMaterial.clone();
    rimMaterial.opacity = 0.48;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(NECK_RADIUS, 0.06, 4, 10),
      rimMaterial,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = RIM_Y + 0.02;
    rim.renderOrder = 3;
    this.glassGroup.add(rim);

    // Solid, slightly more opaque glass base disk.
    const baseMaterial = glassMaterial.clone();
    baseMaterial.opacity = 0.55;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(BODY_BOTTOM_RADIUS, BODY_BOTTOM_RADIUS, 0.07, 10),
      baseMaterial,
    );
    base.position.y = 0.035;
    base.renderOrder = 3;
    this.glassGroup.add(base);

    // Dark ring where the wall meets the base: the bottom "glass thickness".
    const thicknessMaterial = glassMaterial.clone();
    thicknessMaterial.color.multiplyScalar(0.35);
    thicknessMaterial.emissive.multiplyScalar(0.4);
    thicknessMaterial.opacity = 0.55;
    thicknessMaterial.side = THREE.DoubleSide;
    const thickness = new THREE.Mesh(
      new THREE.TorusGeometry(BODY_BOTTOM_RADIUS - 0.012, 0.035, 4, 10),
      thicknessMaterial,
    );
    thickness.rotation.x = Math.PI / 2;
    thickness.position.y = 0.088;
    thickness.renderOrder = 3;
    this.glassGroup.add(thickness);

    this.visualRoot.add(this.glassGroup);
  }

  /**
   * Hover silhouette: an inside-out copy of the glass shell, slightly enlarged.
   * Only its back faces show, so it reads as an outline hugging the jar edge
   * rather than a flat overlay. Kept fully transparent (and hidden) at rest.
   */
  private buildOutline(): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0x38b6ff,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.outlineMaterial = material;

    const group = this.outlineGroup;
    group.name = 'jar-hover-outline';
    group.scale.setScalar(OUTLINE_SCALE);
    group.visible = false;

    const shells: THREE.Mesh[] = [
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          BODY_TOP_RADIUS,
          BODY_BOTTOM_RADIUS,
          BODY_HEIGHT,
          10,
          1,
          true,
        ),
        material,
      ),
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          NECK_RADIUS,
          BODY_TOP_RADIUS,
          SHOULDER_HEIGHT,
          10,
          1,
          true,
        ),
        material,
      ),
      new THREE.Mesh(
        new THREE.CylinderGeometry(NECK_RADIUS, NECK_RADIUS, NECK_HEIGHT, 10, 1, true),
        material,
      ),
    ];

    shells[0].position.y = BODY_HEIGHT / 2;
    shells[1].position.y = BODY_HEIGHT + SHOULDER_HEIGHT / 2;
    shells[2].position.y = BODY_HEIGHT + SHOULDER_HEIGHT + NECK_HEIGHT / 2;

    for (const shell of shells) {
      shell.renderOrder = 0;
      group.add(shell);
    }

    this.visualRoot.add(group);
  }

  private buildLabel(): void {
    const texture = createJarLabelTexture(this.config);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.FrontSide,
    });

    const geometry = new THREE.PlaneGeometry(LABEL_WIDTH, LABEL_HEIGHT, 8, 1);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      const half = position.getX(i) / (LABEL_WIDTH / 2);
      position.setZ(i, LABEL_CENTER_Z - (LABEL_CENTER_Z - LABEL_EDGE_Z) * half * half);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    const label = new THREE.Mesh(geometry, material);
    label.position.y = LABEL_Y;
    // Draw the parchment label after the glass so the pixel text stays crisp.
    label.renderOrder = 20;
    this.labelMesh = label;
    this.labelMaterial = material;
    this.visualRoot.add(label);
  }

  private buildHighlights(): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const makeStrip = (
      stripMaterial: THREE.Material,
      radius: number,
      height: number,
      y: number,
      start: number,
      length: number,
    ): THREE.Mesh => {
      const strip = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 2, 1, true, start, length),
        stripMaterial,
      );
      strip.position.y = y;
      strip.renderOrder = 15;
      return strip;
    };

    // Long specular streak on the front-left edge.
    this.visualRoot.add(makeStrip(material, 0.716, 1.05, 0.68, -1.0, 0.11));
    // Short companion glint further up the body.
    this.visualRoot.add(makeStrip(material, 0.714, 0.42, 1.02, -0.7, 0.05));
    // Tiny neck glint.
    this.visualRoot.add(makeStrip(material, 0.382, 0.18, 1.75, -0.85, 0.09));

    // Cool cerulean rim light down the front-right edge. Pairs with the white
    // left glints and gives the round silhouette contrast at low resolution.
    const rimLightMaterial = new THREE.MeshBasicMaterial({
      color: 0x38b6ff,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.visualRoot.add(makeStrip(rimLightMaterial, 0.717, 1.02, 0.66, 0.9, 0.09));
    this.visualRoot.add(makeStrip(rimLightMaterial, 0.714, 0.34, 1.02, 1.24, 0.05));

    // Rim and base edge catches (softer than the body glints).
    const softMaterial = material.clone();
    softMaterial.opacity = 0.32;
    const makeSoftStrip = (
      radius: number,
      height: number,
      y: number,
      start: number,
      length: number,
    ): THREE.Mesh => {
      const strip = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 2, 1, true, start, length),
        softMaterial,
      );
      strip.position.y = y;
      strip.renderOrder = 15;
      return strip;
    };
    this.visualRoot.add(makeSoftStrip(0.415, 0.018, 1.905, -1.0, 1.1));
    this.visualRoot.add(makeSoftStrip(0.725, 0.045, 0.05, -1.1, 1.4));
  }

  private paperTexture(color: string): THREE.Texture {
    let texture = this.paperTextures.get(color);
    if (!texture) {
      texture = createPaperSlipTexture(color);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.paperTextures.set(color, texture);
    }
    return texture;
  }

  /**
   * Shared paper material cache keyed by color + shade. Shade `1` lifts a slip
   * with a stronger emissive, shade `-1` darkens it so the pile reads as a mix
   * of light and shadow rather than one flat tone.
   */
  private paperMaterial(color: string, shade = 0): THREE.MeshLambertMaterial {
    const key = `${color}|${shade}`;
    let material = this.paperMaterials.get(key);
    if (!material) {
      const base = new THREE.Color(color);
      const emissiveStrength = shade < 0 ? 0.12 : shade > 0 ? 0.3 : 0.22;
      const tint = shade < 0 ? 0.84 : 1;
      material = new THREE.MeshLambertMaterial({
        map: this.paperTexture(color),
        color: new THREE.Color(tint, tint, tint),
        side: THREE.DoubleSide,
        flatShading: true,
        emissive: base.multiplyScalar(emissiveStrength),
      });
      this.paperMaterials.set(key, material);
    }
    return material;
  }

  /**
   * Pre-generate a bottom-to-top stratified stack of `MAX_INTERIOR_NOTES` folded
   * slips hugging the jar's inner profile. `setFillLevel()` reveals the bottom N
   * slips so pile height and visual card density track relative item count directly.
   */
  private buildInteriorPapers(): void {
    const random = mulberry32(hashString(this.config.id));
    const colors = this.config.paperColors;
    const geometry = createFoldedSlipGeometry(0.34, 0.26, 0.07);
    const facetApothemRatio = Math.cos(Math.PI / 10);
    const angleOffset = random() * Math.PI * 2;

    for (let i = 0; i < MAX_INTERIOR_NOTES; i += 1) {
      const color = colors[Math.floor(random() * colors.length) % colors.length];
      // Alternating bright/dark variants of the same paper tone add cheap variety.
      const shade = random() < 0.42 ? -1 : 1;
      const note = new THREE.Mesh(geometry, this.paperMaterial(color, shade));

      const s = (i + 0.5) / MAX_INTERIOR_NOTES;
      const y = clamp(
        lerp(MIN_NOTE_Y, MAX_NOTE_Y, s) + (random() - 0.5) * 0.035,
        0.12,
        1.5,
      );

      const glassRadius =
        y <= BODY_HEIGHT
          ? lerp(BODY_BOTTOM_RADIUS, BODY_TOP_RADIUS, y / BODY_HEIGHT)
          : lerp(
              BODY_TOP_RADIUS,
              NECK_RADIUS,
              clamp01((y - BODY_HEIGHT) / SHOULDER_HEIGHT),
            );

      const shoulderT = y > BODY_HEIGHT ? clamp01((y - BODY_HEIGHT) / 0.26) : 0;
      const noteScale = (0.86 + random() * 0.34) * lerp(1.0, 0.76, shoulderT);
      const apothem = glassRadius * facetApothemRatio;
      const maxCenterRadius = Math.max(0.05, apothem - 0.185 * noteScale);

      // Golden-angle spiral + radial perimeter bias keeps every fill level balanced 360°.
      const angle = angleOffset + i * GOLDEN_ANGLE + (random() - 0.5) * 0.65;
      const radius = (0.2 + 0.8 * Math.sqrt(random())) * maxCenterRadius;

      note.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      const base = new THREE.Euler(
        (random() - 0.5) * 1.5,
        random() * Math.PI * 2,
        (random() - 0.5) * 1.4,
      );
      note.rotation.copy(base);
      note.scale.setScalar(noteScale);
      note.renderOrder = 1;

      this.papers.push({
        mesh: note,
        base,
        phase: random() * Math.PI * 2,
        baseScale: noteScale,
      });
      this.papersGroup.add(note);
    }

    this.papers.sort((a, b) => a.mesh.position.y - b.mesh.position.y);
    this.visualRoot.add(this.papersGroup);
  }

  private buildHeroPaper(): void {
    const material = this.paperMaterial(this.config.paperColors[0]);
    this.heroPaperGroup.name = 'hero-paper';

    const topGeometry = new THREE.PlaneGeometry(HERO_LEAF_W, HERO_LEAF_H);
    topGeometry.translate(0, HERO_LEAF_H / 2, 0);
    setUvV(topGeometry, 0.5, 1);

    const bottomGeometry = new THREE.PlaneGeometry(HERO_LEAF_W, HERO_LEAF_H);
    bottomGeometry.translate(0, -HERO_LEAF_H / 2, 0);
    setUvV(bottomGeometry, 0, 0.5);

    this.topLeaf = new THREE.Group();
    this.topLeaf.name = 'hero-top-leaf';
    this.topLeaf.add(new THREE.Mesh(topGeometry, material));

    this.bottomLeaf = new THREE.Group();
    this.bottomLeaf.name = 'hero-bottom-leaf';
    this.bottomLeaf.add(new THREE.Mesh(bottomGeometry, material));

    this.heroPaperGroup.add(this.topLeaf, this.bottomLeaf);

    // Thin crease line at the shared hinge.
    const crease = new THREE.Mesh(
      new THREE.BoxGeometry(HERO_LEAF_W, 0.012, 0.008),
      new THREE.MeshLambertMaterial({ color: 0x8fa3ad, flatShading: true }),
    );
    crease.position.z = 0.002;
    this.heroPaperGroup.add(crease);

    this.visualRoot.add(this.heroPaperGroup);
  }

  private buildCork(): void {
    const texture = createCorkTexture();
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshLambertMaterial({
      map: texture,
      flatShading: true,
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.35, 0.34, 8),
      material,
    );
    body.position.y = 0.17;
    this.corkGroup.add(body);

    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.39, 0.1, 8),
      material,
    );
    head.position.y = 0.39;
    this.corkGroup.add(head);

    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.05, 8),
      material,
    );
    knob.position.y = 0.465;
    this.corkGroup.add(knob);

    this.corkGroup.position.copy(CORK_CLOSED);
    this.visualRoot.add(this.corkGroup);
  }

  private buildHitMesh(): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.98, 0.98, 2.35, 8),
      material,
    );
    mesh.position.y = 1.1;
    mesh.name = 'jar-hit';
    mesh.userData.jarId = this.config.id;
    this.visualRoot.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------------------
  // Fill level & Animation API
  // ---------------------------------------------------------------------------

  /**
   * Set the visual fullness of the jar (`fillRatio` in `[0, 1]`).
   * - `itemCount === 0` or `fillRatio <= 0` empties the jar completely (`0` slips).
   * - Non-empty jars reveal between `1` and `MAX_INTERIOR_NOTES` slips from the bottom up,
   *   and nestle the hero slip right onto the top of the current pile.
   */
  setFillLevel(fillRatio: number, itemCount?: number): void {
    const ratio = clamp01(fillRatio);
    const isEmpty = (itemCount !== undefined && itemCount <= 0) || ratio <= 0;

    const targetCount = isEmpty
      ? 0
      : Math.max(1, Math.min(MAX_INTERIOR_NOTES, Math.round(ratio * MAX_INTERIOR_NOTES)));

    this.visibleNoteCount = targetCount;
    this.hasItems = targetCount > 0;

    for (let i = 0; i < this.papers.length; i += 1) {
      const note = this.papers[i];
      const revealed = i < targetCount;
      note.mesh.visible = revealed;
      const isTopNote = revealed && i === targetCount - 1;
      note.mesh.scale.setScalar(note.baseScale * (isTopNote ? TOP_NOTE_SCALE : 1));
    }

    const pileTopY =
      targetCount > 0 ? this.papers[targetCount - 1].mesh.position.y : MIN_NOTE_Y;
    this.heroRestPos.set(0.02, clamp(pileTopY - 0.04, 0.16, 1.18), 0.08);
    this.setPaperState(this.extractT, this.unfoldT);
  }

  getVisibleNoteCount(): number {
    return this.visibleNoteCount;
  }

  setHovered(hovered: boolean): void {
    this.hoverTarget = hovered ? HOVER_LIFT : 0;
  }

  /** Fades the parchment label while another jar takes the spotlight. */
  setLabelOpacity(opacity: number): void {
    const value = clamp01(opacity);
    this.labelMaterial.opacity = value;
    this.labelMesh.visible = value > 0.02;
  }

  updateIdle(timeSec: number, dt: number): void {
    // Hover lift settles smoothly; its normalized value drives every hover cue.
    const liftSpeed = Math.min(1, Math.max(0, dt) * 12);
    this.hoverLift += (this.hoverTarget - this.hoverLift) * liftSpeed;
    const hoverProgress = clamp01(this.hoverLift / HOVER_LIFT);
    const reduced = this.reducedMotion;

    const bob = reduced ? 0 : Math.sin(timeSec * 1.6 + this.seed * 9) * 0.014;

    const elapsed = timeSec - this.shakeStart;
    let amp = 0;
    if (elapsed >= 0 && elapsed < this.shakeDuration) {
      const k = 1 - elapsed / this.shakeDuration;
      amp = this.shakeIntensity * k * k;
    }

    const shakeX = amp === 0 ? 0 : Math.sin(timeSec * 46 + this.seed * 20) * 0.055 * amp;
    const shakeY =
      amp === 0 ? 0 : Math.abs(Math.sin(timeSec * 38 + this.seed * 11)) * 0.03 * amp;
    const roll = amp === 0 ? 0 : Math.sin(timeSec * 31 + this.seed * 17) * 0.07 * amp;

    // Gentle 3 Hz wobble layered on the lift, fading with the hover itself.
    const hoverWobble =
      reduced || hoverProgress < 0.001
        ? 0
        : Math.sin(timeSec * Math.PI * 2 * HOVER_WOBBLE_HZ + this.seed * 8) *
          HOVER_WOBBLE_RAD *
          hoverProgress;

    this.visualRoot.position.set(shakeX, this.hoverLift + bob + shakeY, 0);
    this.visualRoot.rotation.z = roll + hoverWobble;

    // Hover silhouette glow (still shown when reduced motion is requested).
    const outlineOpacity = hoverProgress * OUTLINE_MAX_OPACITY;
    this.outlineMaterial.opacity = outlineOpacity;
    this.outlineGroup.visible = outlineOpacity > 0.01;

    // Jostle visible folded notes inside the jar.
    for (let i = 0; i < this.visibleNoteCount; i += 1) {
      const note = this.papers[i];
      if (amp > 0.0005) {
        note.mesh.rotation.set(
          note.base.x + Math.sin(timeSec * 31 + note.phase) * 0.24 * amp,
          note.base.y + Math.cos(timeSec * 27 + note.phase * 1.3) * 0.2 * amp,
          note.base.z + Math.sin(timeSec * 37 + note.phase * 1.7) * 0.22 * amp,
        );
      } else {
        note.mesh.rotation.copy(note.base);
      }
    }

    // A gentle float while the cork hovers beside the open jar.
    if (this.corkT > 0.001) {
      this.corkGroup.position.y =
        this.corkBaseY + Math.sin(timeSec * 2.1 + this.seed * 7) * 0.04 * this.corkT;
      this.corkGroup.rotation.z =
        this.corkBaseRotZ +
        Math.sin(timeSec * 1.7 + this.seed * 5) * 0.06 * this.corkT;
    } else {
      // Stepped (8-bit) cork rattle while the closed jar is hovered.
      let rattleStep = 0;
      if (!reduced && hoverProgress > 0.001) {
        rattleStep =
          Math.round(
            Math.sin(timeSec * Math.PI * 2 * CORK_RATTLE_HZ + this.seed * 13) * 2,
          ) / 2;
      }
      this.corkGroup.position.y =
        this.corkBaseY + rattleStep * CORK_RATTLE_Y * hoverProgress;
      this.corkGroup.rotation.z =
        this.corkBaseRotZ + rattleStep * CORK_RATTLE_ROT * hoverProgress;
    }

    // Tiny sway while the hero note is tucked inside a non-empty jar.
    if (this.hasItems && this.extractT < 0.001 && this.unfoldT < 0.001) {
      const sway = reduced ? 0 : Math.sin(timeSec * 1.15 + this.seed * 6) * 0.03;
      const drift = reduced ? 0 : Math.sin(timeSec * 1.6 + this.seed * 3) * 0.008;
      this.heroPaperGroup.rotation.z = this.heroBaseRotZ + sway;
      this.heroPaperGroup.position.y = this.heroBaseY + drift;
    }
  }

  setShake(intensity: number, timeSec: number): void {
    this.shakeIntensity = Math.max(0, intensity);
    this.shakeStart = timeSec;
  }

  setCorkOpenProgress(t: number): void {
    const progress = clamp01(t);
    this.corkT = progress;
    const ease = easeInOutCubic(progress);

    const arc = Math.sin(Math.PI * progress) * 0.45;
    const wobble = Math.sin(Math.PI * progress * 3) * 0.05 * (1 - progress);

    this.corkGroup.position.set(
      lerp(CORK_CLOSED.x, CORK_OPEN.x, ease),
      lerp(CORK_CLOSED.y, CORK_OPEN.y, ease) + arc + wobble,
      lerp(CORK_CLOSED.z, CORK_OPEN.z, ease),
    );
    this.corkGroup.rotation.set(
      0,
      progress * Math.PI * 2.4,
      Math.sin(Math.PI * progress) * 0.5,
    );
    this.corkGroup.scale.setScalar(1 + Math.sin(Math.PI * progress) * 0.1);
    this.corkBaseY = this.corkGroup.position.y;
    this.corkBaseRotZ = this.corkGroup.rotation.z;
  }

  setPaperState(extractT: number, unfoldT: number): void {
    const extract = clamp01(extractT);
    const unfold = clamp01(unfoldT);
    this.extractT = extract;
    this.unfoldT = unfold;

    this.heroPaperGroup.visible = this.hasItems;
    if (!this.hasItems) return;

    const e = easeInOutCubic(extract);
    const u = easeInOutCubic(unfold);

    this.heroPosition
      .copy(this.heroRestPos)
      .lerp(HERO_EXTRACT_POS, e)
      .lerp(HERO_UNFOLD_POS, u);

    this.heroPaperGroup.position.copy(this.heroPosition);
    this.heroPaperGroup.rotation.set(
      lerp(lerp(0.12, -0.2, e), 0, u),
      lerp(lerp(0.42, 0.08, e), 0, u),
      lerp(lerp(0.14, 0.02, e), 0, u),
    );
    this.heroPaperGroup.scale.setScalar(lerp(lerp(1, 1.05, e), 1.25, u));

    const fold = FOLD_MAX * (1 - u);
    this.topLeaf.rotation.x = fold / 2;
    this.bottomLeaf.rotation.x = -fold / 2;

    this.heroBaseY = this.heroPaperGroup.position.y;
    this.heroBaseRotZ = this.heroPaperGroup.rotation.z;
  }

  resetPose(): void {
    this.hoverTarget = 0;
    this.hoverLift = 0;
    this.shakeIntensity = 0;
    this.shakeStart = -1000;
    this.visualRoot.position.set(0, 0, 0);
    this.visualRoot.rotation.set(0, 0, 0);
    this.outlineMaterial.opacity = 0;
    this.outlineGroup.visible = false;
    this.setCorkOpenProgress(0);
    this.setPaperState(0, 0);
    this.setLabelOpacity(1);
    for (const note of this.papers) {
      note.mesh.rotation.copy(note.base);
    }
  }

  dispose(): void {
    this.motionQuery?.removeEventListener('change', this.handleMotionChange);
    this.motionQuery = null;

    this.group.traverse((object) => {
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
    this.paperTextures.clear();
    this.paperMaterials.clear();
  }
}
