import * as THREE from "three";
import { max, smoothstep, varyingProperty } from "three/tsl";
import { GROUND_Y } from "../core/config";
import type { ItemType, Surface } from "../core/types";
import { VISUAL_QUALITY, type VisualQuality } from "../core/visual-quality";
import { celMaterial } from "./cel-shading";
import { GLOW_LUMINANCE, glowColor } from "./glow";
import { TireWake } from "./tire-wake";

const MAX_PARTICLES = 320;
/** Puff radius for a unit particle size, matching the old unit cube's bulk. */
const PUFF_RADIUS = 0.6;
const MAX_SKIDS = 180;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  rotationX: number;
  rotationZ: number;
  spinX: number;
  spinZ: number;
  growth: number;
  color: THREE.Color;
}

interface SkidMark {
  active: boolean;
  x: number;
  z: number;
  yaw: number;
  height: number;
  pitch: number;
  roll: number;
  life: number;
  maxLife: number;
}

const hitColors: Record<ItemType, number[]> = {
  "oil-can": [0x12161d, 0x323944, 0xf0b429],
  missile: [0xfff6e8, 0xef4b42],
  "red-missile": [0xef4444, 0xffd23f],
  lightning: [0xffd23f, 0xfffbe0],
};

interface DriftProfile {
  colors: number[];
  size: number;
  life: number;
  gravity: number;
  upward: number;
  drag: number;
}

const driftProfiles: Record<Surface, DriftProfile> = {
  asphalt: {
    colors: [0xdadde2, 0xeef1f4, 0xc2c8d2],
    size: 0.24,
    life: 0.85,
    gravity: -0.3,
    upward: 0.9,
    drag: 1.1,
  },
  dirt: {
    colors: [0xf2ddb2, 0xe7c896, 0xd8b07a],
    size: 0.22,
    life: 0.65,
    gravity: 2.2,
    upward: 1.8,
    drag: 1,
  },
  grass: {
    colors: [0xd8c089, 0xa6c16a, 0x83a24a],
    size: 0.18,
    life: 0.6,
    gravity: 2,
    upward: 1.5,
    drag: 1,
  },
  ice: {
    colors: [0xeafaff, 0xbfeaff, 0x8fd8f4],
    size: 0.16,
    life: 0.55,
    gravity: 0.5,
    upward: 1.2,
    drag: 1.4,
  },
  sand: {
    colors: [0xf5dfb0, 0xe4c184, 0xd0a568],
    size: 0.22,
    life: 0.68,
    gravity: 2.2,
    upward: 1.8,
    drag: 1,
  },
  stone: {
    colors: [0xf0dfbd, 0xd6bb8b, 0xb99b6d],
    size: 0.17,
    life: 0.5,
    gravity: 2.4,
    upward: 1.1,
    drag: 1.2,
  },
};

export class Effects {
  readonly group = new THREE.Group();
  readonly tireWake: TireWake;

  private readonly particles: Particle[] = [];
  private readonly particleMesh: THREE.InstancedMesh;
  private particleCursor = 0;

  private readonly skids: SkidMark[] = [];
  private readonly skidMesh: THREE.InstancedMesh;
  private skidCursor = 0;

  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(quality: VisualQuality = VISUAL_QUALITY) {
    const particleCapacity = Math.max(
      64,
      Math.round(MAX_PARTICLES * quality.particleDensity),
    );
    const skidCapacity = Math.max(
      32,
      Math.round(MAX_SKIDS * quality.particleDensity),
    );
    const wakeCapacity = Math.max(
      48,
      Math.round(160 * quality.particleDensity),
    );
    this.tireWake = new TireWake(wakeCapacity);
    this.group.name = "effects";
    this.group.add(this.tireWake.mesh);

    // Comic puffs: opaque, cel-lit and round enough that the screen-space ink
    // draws only their outline. They pop in and shrink away instead of fading,
    // so they can write depth for the ink pass.
    const particleMaterial = celMaterial(0xffffff, 0, { hatch: false });
    // HDR instance colors (sparks, fire) glow on their own, even on the shaded side.
    const tint = varyingProperty("vec3", "vInstanceColor");
    particleMaterial.emissiveNode = tint.mul(smoothstep(1, 1.2, max(max(tint.r, tint.g), tint.b)));

    this.particleMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(PUFF_RADIUS, 1),
      particleMaterial,
      particleCapacity,
    );
    this.particleMesh.frustumCulled = false;
    this.particleMesh.renderOrder = 3;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.particleMesh);

    const defaultColor = new THREE.Color(0xffffff);
    for (let index = 0; index < particleCapacity; index++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0.1,
        gravity: 0,
        drag: 0,
        rotationX: 0,
        rotationZ: 0,
        spinX: 0,
        spinZ: 0,
        growth: 0,
        color: new THREE.Color(0xffffff),
      });
      this.writeParticleMatrix(index, 0);
      this.particleMesh.setColorAt(index, defaultColor);
    }
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;

    const skidMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    skidMaterial.userData.outlineParameters = { visible: false };

    this.skidMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 0.008, 0.5),
      skidMaterial,
      skidCapacity,
    );
    this.skidMesh.frustumCulled = false;
    this.skidMesh.renderOrder = 2;
    this.skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.skidMesh);

    for (let index = 0; index < skidCapacity; index++) {
      this.skids.push({
        active: false,
        x: 0,
        z: 0,
        yaw: 0,
        height: 0,
        pitch: 0,
        roll: 0,
        life: 0,
        maxLife: 1,
      });
      this.writeSkidMatrix(index, 0);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.tireWake.update(dt);
    const step = Math.min(dt, 0.05);
    let particlesChanged = false;
    let skidsChanged = false;

    for (let index = 0; index < this.particles.length; index++) {
      const particle = this.particles[index];
      if (!particle.active) {
        continue;
      }

      particle.life -= step;
      if (particle.life <= 0) {
        particle.active = false;
        this.writeParticleMatrix(index, 0);
        particlesChanged = true;
        continue;
      }

      particle.vy -= particle.gravity * step;
      const damping = Math.exp(-particle.drag * step);
      particle.vx *= damping;
      particle.vy *= damping;
      particle.vz *= damping;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.z += particle.vz * step;
      particle.rotationX += particle.spinX * step;
      particle.rotationZ += particle.spinZ * step;

      const lifeRatio = particle.life / particle.maxLife;
      // Pop in over the first tenth, shrink to nothing over the last 45%.
      const fade = Math.min(1, (1 - lifeRatio) / 0.1) * Math.min(1, lifeRatio / 0.45);
      const growth = 1 + particle.growth * (1 - lifeRatio);
      this.dummy.position.set(particle.x, particle.y, particle.z);
      this.dummy.rotation.set(particle.rotationX, 0, particle.rotationZ);
      this.dummy.scale.setScalar(particle.size * fade * growth);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(index, this.dummy.matrix);
      particlesChanged = true;
    }

    for (let index = 0; index < this.skids.length; index++) {
      const skid = this.skids[index];
      if (!skid.active) {
        continue;
      }

      skid.life -= step;
      if (skid.life <= 0) {
        skid.active = false;
        this.writeSkidMatrix(index, 0);
        skidsChanged = true;
        continue;
      }

      const fade =
        skid.life < 0.45 ? Math.max(0.01, skid.life / 0.45) : 1;
      this.writeSkidMatrix(index, fade);
      skidsChanged = true;
    }

    if (particlesChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
    if (skidsChanged) {
      this.skidMesh.instanceMatrix.needsUpdate = true;
    }
  }

  reset(): void {
    this.tireWake.reset();
    for (let index = 0; index < this.particles.length; index++) {
      this.particles[index].active = false;
      this.writeParticleMatrix(index, 0);
    }
    for (let index = 0; index < this.skids.length; index++) {
      this.skids[index].active = false;
      this.writeSkidMatrix(index, 0);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  hit(x: number, z: number, item: ItemType): void {
    this.burst(
      x,
      GROUND_Y + 0.62,
      z,
      hitColors[item],
      16,
      4.5,
      3.5,
      0.12,
      0.55,
      10,
    );
  }

  pickup(x: number, z: number): void {
    this.burst(
      x,
      GROUND_Y + 0.8,
      z,
      [0xfacc15, 0x22d3ee, 0xef4444, 0xf8fafc, 0x8b5cf6],
      22,
      3.6,
      4.5,
      0.1,
      0.7,
      4,
    );
  }

  impact(x: number, z: number): void {
    this.burst(
      x,
      GROUND_Y + 0.45,
      z,
      [0xd6b17a, 0xf5e6c8, 0x9ca3af],
      10,
      3,
      2.6,
      0.1,
      0.42,
      9,
    );
  }

  landing(x: number, height: number, z: number, yaw: number, surface: Surface, impact: number): void {
    const strength = Math.min(1, impact / 7);
    const profile = driftProfiles[surface];
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    for (const side of [-1, 1]) {
      this.burst(x + rightX * side * 0.65, GROUND_Y + height + 0.08, z + rightZ * side * 0.65,
        profile.colors, Math.round(3 + strength * 5), 1.1 + strength * 1.8,
        0.7 + strength * 1.2, surface === "ice" ? 0.055 : 0.09, 0.4, 7);
    }
  }

  /** Icy water splash when the kart falls into the hole. */
  splash(x: number, z: number): void {
    this.burst(
      x,
      GROUND_Y + 0.14,
      z,
      [0x2c6f96, 0x7cc7e4, 0xd9f6ff, 0xffffff],
      26,
      4.2,
      5.4,
      0.11,
      0.7,
      8,
    );
  }

  missileTrail(x: number, z: number, kind: "white" | "red", ground = 0): void {
    const y = GROUND_Y + ground + 0.24;
    const driftX = (Math.random() - 0.5) * 0.28;
    const driftZ = (Math.random() - 0.5) * 0.28;

    // A grey puff remains where the missile passed, forming the smoke trail.
    this.emit(
      x + (Math.random() - 0.5) * 0.16,
      y + Math.random() * 0.12,
      z + (Math.random() - 0.5) * 0.16,
      driftX,
      0.12 + Math.random() * 0.22,
      driftZ,
      0xc8cdd5,
      0.11 + Math.random() * 0.05,
      0.5 + Math.random() * 0.18,
      -0.18,
      1.25,
      3.6,
    );

    // White missiles leave a red exhaust; red missiles leave yellow sparks.
    const color = kind === "red" ? 0xffd23f : 0xef4b42;
    this.emit(
      x + (Math.random() - 0.5) * 0.14,
      y + (Math.random() - 0.5) * 0.08,
      z + (Math.random() - 0.5) * 0.14,
      driftX * 0.6,
      0.18 + Math.random() * 0.4,
      driftZ * 0.6,
      color,
      0.055,
      0.22,
      0.4,
      1.6,
      0.5,
      true,
    );
  }

  /** Small fireball and smoke ring where a missile reaches its target. */
  missileExplosion(
    x: number,
    z: number,
    kind: "white" | "red",
    ground = 0,
  ): void {
    const y = GROUND_Y + ground + 0.52;
    const fire = kind === "red"
      ? [0xfff3c4, 0xffd23f, 0xff9f43]
      : [0xfff6e8, 0xef4b42, 0xffb23a];
    this.burst(x, y, z, fire, 16, 3.8, 2.6, 0.15, 0.4, 8, true);

    // One short bloom-driven flash sells the impact at chase-camera distance.
    this.emit(x, y, z, 0, 0, 0, 0xffd27a, 0.42, 0.14, 0, 0, 0, true);

    for (let index = 0; index < 8; index++) {
      const angle = Math.random() * Math.PI * 2;
      const force = 0.7 + Math.random() * 1.1;
      this.emit(
        x,
        y + Math.random() * 0.12,
        z,
        Math.cos(angle) * force,
        0.35 + Math.random() * 0.75,
        Math.sin(angle) * force,
        0x858b96,
        0.13 + Math.random() * 0.06,
        0.5 + Math.random() * 0.2,
        -0.12,
        1.7,
        3.2,
      );
    }

    for (let index = 0; index < 6; index++) {
      const angle = Math.random() * Math.PI * 2;
      const force = 1.2 + Math.random() * 1.6;
      this.emit(
        x,
        y,
        z,
        Math.cos(angle) * force,
        0.6 + Math.random() * 1.2,
        Math.sin(angle) * force,
        0xffc04a,
        0.09,
        0.28,
        0,
        2,
        1.2,
        true,
      );
    }
  }

  boostTrail(
    x: number,
    y: number,
    z: number,
    backwardX: number,
    backwardZ: number,
    color: number,
  ): void {
    this.emit(
      x + (Math.random() - 0.5) * 0.2,
      y + (Math.random() - 0.5) * 0.16,
      z + (Math.random() - 0.5) * 0.2,
      backwardX * (2 + Math.random() * 2) + (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.5,
      backwardZ * (2 + Math.random() * 2) + (Math.random() - 0.5) * 0.7,
      color,
      0.035 + Math.random() * 0.025,
      0.28,
      0,
      1.2,
      0,
      true,
    );
  }

  driftParticle(
    x: number,
    z: number,
    yaw: number,
    surface: Surface,
    height = 0,
  ): void {
    // Asphalt smoke is drawn by TireWake; loose surfaces keep small debris flecks.
    if (surface === "asphalt") return;
    const profile = driftProfiles[surface];
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = -Math.cos(yaw);
    const rightZ = Math.sin(yaw);
    const backward = -(0.6 + Math.random() * 0.9);
    this.emit(
      x + (Math.random() - 0.5) * 0.12,
      GROUND_Y + height + 0.08,
      z + (Math.random() - 0.5) * 0.12,
      forwardX * backward +
        rightX * (Math.random() - 0.5) * 1.3,
      profile.upward * (0.45 + Math.random() * 0.65),
      forwardZ * backward +
        rightZ * (Math.random() - 0.5) * 1.3,
      profile.colors[Math.floor(Math.random() * profile.colors.length)],
      profile.size * (0.22 + Math.random() * 0.15),
      profile.life * (0.8 + Math.random() * 0.4),
      profile.gravity,
      profile.drag,
      0.6,
    );
  }

  skid(x: number, z: number, yaw: number, height = 0, pitch = 0, roll = 0, surface: Surface = "asphalt"): void {
    const index = this.skidCursor++ % this.skids.length;
    const skid = this.skids[index];
    skid.active = true;
    skid.x = x;
    skid.z = z;
    skid.yaw = yaw;
    skid.height = height;
    skid.pitch = pitch;
    skid.roll = roll;
    skid.maxLife = surface === "ice" ? 3.4 : surface === "stone" ? 2.4 : 2.1;
    this.color.setHex(
      surface === "ice" ? 0xc5efff : surface === "stone" ? 0x6b5a43 : 0x3a2a1f,
    );
    this.skidMesh.setColorAt(index, this.color);
    if (this.skidMesh.instanceColor) this.skidMesh.instanceColor.needsUpdate = true;
    skid.life = skid.maxLife;
    this.writeSkidMatrix(index, 1);
    this.skidMesh.instanceMatrix.needsUpdate = true;
  }

  private burst(
    x: number,
    y: number,
    z: number,
    colors: number[],
    count: number,
    speed: number,
    upward: number,
    size: number,
    life: number,
    gravity: number,
    glow = false,
  ): void {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const force = speed * (0.35 + Math.random() * 0.65);
      this.emit(
        x,
        y,
        z,
        Math.cos(angle) * force,
        upward * (0.35 + Math.random() * 0.65),
        Math.sin(angle) * force,
        colors[Math.floor(Math.random() * colors.length)],
        size * (0.7 + Math.random() * 0.6),
        life * (0.8 + Math.random() * 0.4),
        gravity,
        1.2,
        0,
        glow,
      );
    }
  }

  private emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: number,
    size: number,
    life: number,
    gravity: number,
    drag: number,
    growth = 0,
    glow = false,
  ): void {
    const index = this.particleCursor++ % this.particles.length;
    const particle = this.particles[index];
    particle.active = true;
    particle.x = x;
    particle.y = y;
    particle.z = z;
    particle.vx = vx;
    particle.vy = vy;
    particle.vz = vz;
    particle.life = life;
    particle.maxLife = life;
    particle.size = size;
    particle.gravity = gravity;
    particle.drag = drag;
    particle.rotationX = Math.random() * Math.PI;
    particle.rotationZ = Math.random() * Math.PI;
    particle.spinX = (Math.random() - 0.5) * 12;
    particle.spinZ = (Math.random() - 0.5) * 12;
    particle.growth = growth;
    // Glowing sparks get an HDR color so the bloom pass picks them up.
    if (glow) glowColor(color, GLOW_LUMINANCE, particle.color);
    else particle.color.setHex(color);
    this.particleMesh.setColorAt(index, particle.color);
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(particle.rotationX, 0, particle.rotationZ);
    // Starts at zero; update() pops it in.
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.particleMesh.setMatrixAt(index, this.dummy.matrix);
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  private writeParticleMatrix(index: number, scale: number): void {
    this.dummy.position.set(0, -100, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    this.particleMesh.setMatrixAt(index, this.dummy.matrix);
  }

  private writeSkidMatrix(index: number, scale: number): void {
    const skid = this.skids[index];
    this.dummy.position.set(skid.x, GROUND_Y + skid.height + 0.011, skid.z);
    this.dummy.rotation.order = "YXZ";
    this.dummy.rotation.set(skid.pitch, skid.yaw, skid.roll);
    this.dummy.scale.set(scale, 1, scale);
    this.dummy.updateMatrix();
    this.skidMesh.setMatrixAt(index, this.dummy.matrix);
  }
}
