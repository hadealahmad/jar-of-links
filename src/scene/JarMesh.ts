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

    this.buildGlass();
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

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(
        BODY_TOP_RADIUS,
        BODY_BOTTOM_RADIUS,
        BODY_HEIGHT,
        10,
        1,
        true,
      ),
      glassMaterial,
    );
    body.position.y = BODY_HEIGHT / 2;
    body.renderOrder = 2;
    this.glassGroup.add(body);

    const shoulder = new THREE.Mesh(
      new THREE.CylinderGeometry(
        NECK_RADIUS,
        BODY_TOP_RADIUS,
        SHOULDER_HEIGHT,
        10,
        1,
        true,
      ),
      glassMaterial,
    );
    shoulder.position.y = BODY_HEIGHT + SHOULDER_HEIGHT / 2;
    shoulder.renderOrder = 2;
    this.glassGroup.add(shoulder);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(NECK_RADIUS, NECK_RADIUS, NECK_HEIGHT, 10, 1, true),
      glassMaterial,
    );
    neck.position.y = BODY_HEIGHT + SHOULDER_HEIGHT + NECK_HEIGHT / 2;
    neck.renderOrder = 2;
    this.glassGroup.add(neck);

    const rimMaterial = glassMaterial.clone();
    rimMaterial.opacity = 0.48;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(NECK_RADIUS, 0.045, 4, 10),
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

    this.visualRoot.add(this.glassGroup);
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
      radius: number,
      height: number,
      y: number,
      start: number,
      length: number,
    ): THREE.Mesh => {
      const strip = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 2, 1, true, start, length),
        material,
      );
      strip.position.y = y;
      strip.renderOrder = 15;
      return strip;
    };

    // Long specular streak on the front-left edge.
    this.visualRoot.add(makeStrip(0.716, 1.05, 0.68, -1.0, 0.11));
    // Short companion glint further up the body.
    this.visualRoot.add(makeStrip(0.714, 0.42, 1.02, -0.7, 0.05));
    // Tiny neck glint.
    this.visualRoot.add(makeStrip(0.382, 0.18, 1.75, -0.85, 0.09));
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

  private paperMaterial(color: string): THREE.MeshLambertMaterial {
    let material = this.paperMaterials.get(color);
    if (!material) {
      material = new THREE.MeshLambertMaterial({
        map: this.paperTexture(color),
        side: THREE.DoubleSide,
        flatShading: true,
        emissive: new THREE.Color(color).multiplyScalar(0.22),
      });
      this.paperMaterials.set(color, material);
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
      const note = new THREE.Mesh(geometry, this.paperMaterial(color));

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

      this.papers.push({ mesh: note, base, phase: random() * Math.PI * 2 });
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
      this.papers[i].mesh.visible = i < targetCount;
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
    this.hoverTarget = hovered ? 0.09 : 0;
  }

  /** Fades the parchment label while another jar takes the spotlight. */
  setLabelOpacity(opacity: number): void {
    const value = clamp01(opacity);
    this.labelMaterial.opacity = value;
    this.labelMesh.visible = value > 0.02;
  }

  updateIdle(timeSec: number, dt: number): void {
    // Hover lift settles smoothly.
    const liftSpeed = Math.min(1, Math.max(0, dt) * 12);
    this.hoverLift += (this.hoverTarget - this.hoverLift) * liftSpeed;

    const bob = Math.sin(timeSec * 1.6 + this.seed * 9) * 0.014;

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

    this.visualRoot.position.set(shakeX, this.hoverLift + bob + shakeY, 0);
    this.visualRoot.rotation.z = roll;

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
      this.corkGroup.position.y = this.corkBaseY;
      this.corkGroup.rotation.z = this.corkBaseRotZ;
    }

    // Tiny sway while the hero note is tucked inside a non-empty jar.
    if (this.hasItems && this.extractT < 0.001 && this.unfoldT < 0.001) {
      this.heroPaperGroup.rotation.z =
        this.heroBaseRotZ + Math.sin(timeSec * 1.15 + this.seed * 6) * 0.03;
      this.heroPaperGroup.position.y =
        this.heroBaseY + Math.sin(timeSec * 1.6 + this.seed * 3) * 0.008;
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
    this.setCorkOpenProgress(0);
    this.setPaperState(0, 0);
    this.setLabelOpacity(1);
    for (const note of this.papers) {
      note.mesh.rotation.copy(note.base);
    }
  }

  dispose(): void {
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
