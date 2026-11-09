import * as THREE from "three";
import { GROUND_Y } from "../../../core/config";
import { createInstancedOutline } from "../../../rendering/instanced-outline";
import { celMaterial, outlinedMaterial } from "../../../rendering/cel-shading";
import { terrainMaterial } from "../../../rendering/terrain-material";
import { glowColor } from "../../../rendering/glow";
import { mergeStaticDecoration } from "../../../decor/merge-static";
import type { ColliderBox } from "../../../core/types";
import type { TrackLike } from "../../track";

const SHELL = { from: 0.566, to: 0.719 } as const;
const WALL_OFFSET = 9.25;
const WALL_THICKNESS = 1.3;
const WALL_HEIGHT = 8.55;
const ROWS = 6;
const QUARTER = 2.2;
const CEILING_Y = 8.5;

interface Sample {
  x: number;
  z: number;
  y: number;
  yaw: number;
}

interface Torch {
  flame: THREE.Mesh;
  light: THREE.PointLight;
  phase: number;
  baseIntensity: number;
}

function mat(color: number): THREE.Material {
  return outlinedMaterial(color, 0.0008);
}

function dummyMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = 0;
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}

/**
 * Stone corridor beneath the dunes: irregular block walls, slab ceiling,
 * hieroglyph bands, animated torches, and two solar portals. The geometry
 * follows the centerline but stays behind the barriers; the colliders close the
 * gap left by `wallGaps` in the layout.
 */
export class SunstoneTunnel {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];

  private readonly torches: Torch[] = [];
  private readonly random = (() => {
    let seed = 0x5eed;
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();
  private time = 0;

  constructor(private readonly track: TrackLike) {
    this.group.name = "sunstone-tunnel";
    this.group.position.y = GROUND_Y;
    this.addWalls();
    this.addCeiling();
    this.addRoofMound();
    this.addFriezes();
    this.addWallMurals();
    this.addTorches();
    this.addPortal(SHELL.from, false);
    this.addPortal(SHELL.to, true);
    this.addFloorEmblem();
  }

  update(dt: number): void {
    this.time += Math.min(dt, 0.05);
    for (const torch of this.torches) {
      const flicker =
        0.84 +
        Math.sin(this.time * 7.3 + torch.phase) * 0.08 +
        Math.sin(this.time * 13.7 + torch.phase * 2.1) * 0.05;
      torch.light.intensity = torch.baseIntensity * flicker;
      torch.flame.scale.set(
        0.9 + flicker * 0.18,
        0.82 + flicker * 0.3,
        0.9 + flicker * 0.18,
      );
      torch.flame.rotation.y += dt * 2.4;
    }
  }

  /** Position interpolated on the centerline, with the segment yaw. */
  private sample(t: number): Sample {
    const count = this.track.path.length;
    const u = ((t % 1) + 1) % 1 * count;
    const index = Math.floor(u) % count;
    const next = (index + 1) % count;
    const fraction = u - Math.floor(u);
    const a = this.track.path[index];
    const b = this.track.path[next];
    const x = a.x + (b.x - a.x) * fraction;
    const z = a.z + (b.z - a.z) * fraction;
    return {
      x,
      z,
      y: this.track.heightAt?.(x, z) ?? 0,
      yaw: this.track.pathYaw(index),
    };
  }

  private spans(): Array<{ from: Sample; to: Sample; mid: Sample; yaw: number; length: number }> {
    const total = this.track.pathSpacing * this.track.path.length;
    const count = Math.max(
      4,
      Math.ceil(((SHELL.to - SHELL.from) * total) / QUARTER),
    );
    const result = [];
    for (let index = 0; index < count; index++) {
      const t0 = SHELL.from + ((SHELL.to - SHELL.from) * index) / count;
      const t1 = SHELL.from + ((SHELL.to - SHELL.from) * (index + 1)) / count;
      const from = this.sample(t0);
      const to = this.sample(t1);
      const mid = this.sample((t0 + t1) / 2);
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      result.push({
        from,
        to,
        mid,
        yaw: Math.atan2(to.x - from.x, to.z - from.z),
        length,
      });
    }
    return result;
  }

  private addWalls(): void {
    const spans = this.spans();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const shades = [0x8f6a3e, 0x7d5a33, 0x9d7747].map((color) =>
      celMaterial(color),
    );
    shades.forEach((material) => {
      material.userData.outlineParameters = { visible: false };
    });
    const meshes = shades.map((material) =>
      dummyMesh(this.group, geometry, material, spans.length * ROWS * 2 + 2),
    );

    const dummy = new THREE.Object3D();
    const rightX = (yaw: number) => -Math.cos(yaw);
    const rightZ = (yaw: number) => Math.sin(yaw);

    for (const span of spans) {
      for (const side of [-1, 1] as const) {
        for (let row = 0; row < ROWS; row++) {
          const shade =
            ((row + Math.round(span.mid.x) + side + 9) % shades.length +
              shades.length) %
            shades.length;
          const mesh = meshes[shade];
          const inset = (row % 2) * 0.025;
          const lateral = side * (WALL_OFFSET - inset);
          dummy.position.set(
            span.mid.x + rightX(span.yaw) * lateral,
            span.mid.y + row * (WALL_HEIGHT / ROWS) + WALL_HEIGHT / (ROWS * 2),
            span.mid.z + rightZ(span.yaw) * lateral,
          );
          dummy.rotation.set(0, span.yaw, 0);
          dummy.scale.set(
            WALL_THICKNESS,
            WALL_HEIGHT / ROWS - 0.035,
            span.length + 0.06,
          );
          dummy.updateMatrix();
          mesh.setMatrixAt(mesh.count, dummy.matrix);
          mesh.count++;
        }
      }
    }

    meshes.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(createInstancedOutline(mesh, 0.55));
    });

    // One collider per span and side; the visual blocks are only cladding.
    for (const span of spans) {
      for (const side of [-1, 1] as const) {
        const lateral = side * WALL_OFFSET;
        this.colliders.push({
          center: {
            x: span.mid.x + rightX(span.yaw) * lateral,
            y: GROUND_Y + span.mid.y + WALL_HEIGHT / 2,
            z: span.mid.z + rightZ(span.yaw) * lateral,
          },
          half: { x: WALL_THICKNESS / 2, y: WALL_HEIGHT / 2, z: span.length / 2 + 0.04 },
          yaw: span.yaw,
        });
      }
    }
  }

  private addCeiling(): void {
    const spans = this.spans();
    const slabGeometry = new THREE.BoxGeometry(1, 1, 1);
    const slabMaterial = celMaterial(0x40301f);
    slabMaterial.userData.outlineParameters = { visible: false };
    const slabs = dummyMesh(this.group, slabGeometry, slabMaterial, spans.length + 2);
    const beamMaterial = celMaterial(0x64482a);
    beamMaterial.userData.outlineParameters = { visible: false };
    const beams = dummyMesh(this.group, slabGeometry, beamMaterial, spans.length + 2);
    const dummy = new THREE.Object3D();
    const width = (WALL_OFFSET + WALL_THICKNESS / 2) * 2 + 1.1;

    spans.forEach((span, index) => {
      dummy.position.set(span.mid.x, span.mid.y + CEILING_Y, span.mid.z);
      dummy.rotation.set(0, span.yaw, 0);
      dummy.scale.set(width, 0.85, span.length + 0.12);
      dummy.updateMatrix();
      slabs.setMatrixAt(index, dummy.matrix);
      slabs.count++;

      if (index % 4 === 0) {
        dummy.position.y = span.mid.y + CEILING_Y - 0.62;
        dummy.scale.set(width + 0.4, 0.42, 0.78);
        dummy.updateMatrix();
        beams.setMatrixAt(beams.count, dummy.matrix);
        beams.count++;
      }
    });

    slabs.instanceMatrix.needsUpdate = true;
    slabs.castShadow = true;
    slabs.receiveShadow = true;
    beams.instanceMatrix.needsUpdate = true;
    beams.castShadow = true;
    this.group.add(createInstancedOutline(slabs, 0.6));
  }

  /** Continuous sand crest over the roof, with long windward and lee slopes. */
  private addRoofMound(): void {
    const from = SHELL.from + 0.009, to = SHELL.to - 0.009;
    const segments = 72, across = 24;
    const positions: number[] = [], indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const sample = this.sample(from + (to - from) * t);
      const crestOffset = Math.sin(t * Math.PI * 2) * 2.6;
      const crestHeight = 13.2 + Math.sin(t * Math.PI) * 2.8 + Math.sin(t * 14) * 0.5;
      const endFade = THREE.MathUtils.smoothstep(t, 0, 0.16) * THREE.MathUtils.smoothstep(1 - t, 0, 0.16);
      for (let j = 0; j <= across; j++) {
        const lateral = (j / across * 2 - 1) * 24;
        const d = Math.abs(lateral);
        const roof = d <= 12 ? CEILING_Y + 0.95 : (CEILING_Y + 0.95) * Math.max(0, (24 - d) / 12) * endFade;
        const crest = Math.max(0, 1 - Math.abs(lateral - crestOffset) / (lateral < crestOffset ? 21 : 14));
        const y = Math.max(roof, crest * crestHeight * endFade);
        positions.push(sample.x - Math.cos(sample.yaw) * lateral, y, sample.z + Math.sin(sample.yaw) * lateral);
        if (i < segments && j < across) {
          const a = i * (across + 1) + j, b = a + across + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = terrainMaterial(0xe6c58a, "sand");
    material.side = THREE.DoubleSide;
    const ridge = new THREE.Mesh(geometry, material);
    ridge.name = "tunnel-sand-ridge";
    ridge.receiveShadow = true;
    this.group.add(ridge);
  }

  private addFriezes(): void {
    const spans = this.spans();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const goldMaterial = celMaterial(0xe2bd65);
    goldMaterial.userData.outlineParameters = { visible: false };
    const tealMaterial = celMaterial(0x2d8b88);
    tealMaterial.userData.outlineParameters = { visible: false };
    const gold = dummyMesh(this.group, geometry, goldMaterial, spans.length * 4 + 2);
    const teal = dummyMesh(this.group, geometry, tealMaterial, spans.length * 4 + 2);
    const dummy = new THREE.Object3D();
    const rightX = (yaw: number) => -Math.cos(yaw);
    const rightZ = (yaw: number) => Math.sin(yaw);
    const inner = WALL_OFFSET - WALL_THICKNESS / 2 - 0.02;

    spans.forEach((span, index) => {
      for (const side of [-1, 1] as const) {
        const lateral = side * inner;
        const x = span.mid.x + rightX(span.yaw) * lateral;
        const z = span.mid.z + rightZ(span.yaw) * lateral;

        dummy.position.set(x, span.mid.y + 6.25, z);
        dummy.rotation.set(0, span.yaw, 0);
        dummy.scale.set(0.07, 0.15, span.length + 0.02);
        dummy.updateMatrix();
        gold.setMatrixAt(gold.count++, dummy.matrix);

        // Alternating blocks form a hieroglyph band readable from a distance.
        if (index % 2 === 0) {
          const glyphHeight = 0.28 + ((index * 7 + side * 3) % 4) * 0.09;
          dummy.position.set(x, span.mid.y + 6.85, z);
          dummy.scale.set(0.085, glyphHeight, 0.23);
          dummy.updateMatrix();
          teal.setMatrixAt(teal.count++, dummy.matrix);
        }
        if (index % 5 === 0) {
          dummy.position.set(x, span.mid.y + 7.3, z);
          dummy.rotation.set(0, span.yaw, 0);
          dummy.scale.set(0.08, 0.28, 0.7);
          dummy.updateMatrix();
          gold.setMatrixAt(gold.count++, dummy.matrix);
        }
      }
    });

    gold.instanceMatrix.needsUpdate = true;
    teal.instanceMatrix.needsUpdate = true;
    this.group.add(gold, teal);
  }

  private addWallMurals(): void {
    const murals = new THREE.Group();
    murals.name = "sunstone-tunnel-painted-murals";
    const pigment = celMaterial(0x308487);
    const ochre = celMaterial(0xc5a05b);
    const inset = celMaterial(0x674c32);
    for (let i = 0; i < 6; i++) {
      const sample = this.sample(SHELL.from + (SHELL.to - SHELL.from) * (0.09 + i * 0.16));
      for (const side of [-1, 1]) {
        const panel = new THREE.Group();
        const lateral = side * (WALL_OFFSET - WALL_THICKNESS / 2 - 0.08);
        panel.position.set(sample.x - Math.cos(sample.yaw) * lateral, sample.y + 4.2, sample.z + Math.sin(sample.yaw) * lateral);
        panel.rotation.y = sample.yaw + side * Math.PI / 2;
        murals.add(panel);
        const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z = 0.06) => {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(x, y, z);
          panel.add(mesh);
          return mesh;
        };
        add(new THREE.BoxGeometry(2.4, 3.6, 0.07), inset, 0, 0, 0);
        for (const x of [-1.1, 1.1]) add(new THREE.BoxGeometry(0.08, 3.4, 0.04), ochre, x, 0);
        for (const y of [-1.65, 1.65]) add(new THREE.BoxGeometry(2.2, 0.08, 0.04), ochre, 0, y);
        if (i % 2 === 0) {
          const loop = add(new THREE.TorusGeometry(0.43, 0.1, 6, 18), ochre, 0, 0.7);
          loop.scale.y = 1.18;
          add(new THREE.BoxGeometry(0.2, 1.6, 0.08), pigment, 0, -0.45);
          add(new THREE.BoxGeometry(1.4, 0.2, 0.08), ochre, 0, 0.03);
        } else {
          add(new THREE.CircleGeometry(0.47, 20), ochre, 0, 0.7);
          for (const wing of [-1, 1]) for (let feather = 0; feather < 3; feather++) {
            const bar = add(new THREE.BoxGeometry(0.8 - feather * 0.12, 0.18, 0.06), pigment, wing * 0.58, 0.25 - feather * 0.3);
            bar.rotation.z = wing * (0.25 + feather * 0.18);
          }
        }
        for (const x of [-0.6, 0, 0.6]) add(new THREE.BoxGeometry(0.19, 0.22, 0.06), pigment, x, -1.35);
      }
    }
    mergeStaticDecoration(murals);
    this.group.add(murals);
  }

  private addTorches(): void {
    const fractions = [0.12, 0.32, 0.5, 0.7, 0.89];
    const rightX = (yaw: number) => -Math.cos(yaw);
    const rightZ = (yaw: number) => Math.sin(yaw);

    fractions.forEach((fraction, index) => {
      const t = SHELL.from + (SHELL.to - SHELL.from) * fraction;
      const sample = this.sample(t);
      const side = index % 2 === 0 ? -1 : 1;
      const lateral = side * (WALL_OFFSET - WALL_THICKNESS / 2 - 0.24);
      const x = sample.x + rightX(sample.yaw) * lateral;
      const z = sample.z + rightZ(sample.yaw) * lateral;

      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.5, 0.5),
        celMaterial(0x8e6a3f),
      );
      bracket.position.set(x, sample.y + 3.55, z);
      bracket.rotation.y = sample.yaw;
      this.group.add(bracket);

      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.24, 0.3, 8),
        celMaterial(0xb07b35),
      );
      bowl.position.set(x, sample.y + 3.85, z);
      this.group.add(bowl);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 1.3, 6),
        new THREE.MeshBasicMaterial({
          color: glowColor(index % 2 ? 0xffc15c : 0xffd98a),
          transparent: true,
          opacity: 0.94,
        }),
      );
      flame.material.userData.outlineParameters = { visible: false };
      flame.position.set(x, sample.y + 4.62, z);
      this.group.add(flame);

      const light = new THREE.PointLight(0xffa24a, 55, 24, 1.6);
      light.position.set(x, sample.y + 4.5, z);
      this.group.add(light);
      this.torches.push({
        flame,
        light,
        phase: index * 1.7,
        baseIntensity: 55,
      });
    });
  }

  private addPortal(t: number, outwardPositive: boolean): void {
    const sample = this.sample(t);
    const group = new THREE.Group();
    group.position.set(sample.x, sample.y, sample.z);
    group.rotation.y = sample.yaw;
    this.group.add(group);

    const stone = mat(0xc89a57);
    const gold = mat(0xe8c76c);
    const teal = mat(0x1d7477);
    const dark = mat(0x7d5a34);

    for (const side of [-1, 1]) {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 12.4, 4.4),
        stone,
      );
      tower.position.set(side * 11.9, 6.2, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      group.add(tower);
      for (const y of [1.1, 5.8, 11.2]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.28, 4.6), y === 5.8 ? teal : gold);
        band.position.set(side * 11.9, y, 0);
        group.add(band);
      }
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.25, 1.5, 4), gold);
      cap.position.set(side * 11.9, 13.1, 0);
      cap.rotation.y = Math.PI / 4;
      group.add(cap);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(27.2, 2.2, 4.9), stone);
    lintel.position.set(0, 12.35, 0);
    lintel.castShadow = true;
    group.add(lintel);
    const lintelBand = new THREE.Mesh(new THREE.BoxGeometry(27.2, 0.34, 5.05), teal);
    lintelBand.position.set(0, 11.35, 0);
    group.add(lintelBand);
    const lintelGold = new THREE.Mesh(new THREE.BoxGeometry(27.2, 0.2, 5.08), gold);
    lintelGold.position.set(0, 13.45, 0);
    group.add(lintelGold);

    // Winged solar disc on the outer face: visible to those arriving and those leaving.
    group.add(this.createSolarDisc((outwardPositive ? 1 : -1) * 2.55));

    const threshold = new THREE.Mesh(
      new THREE.BoxGeometry(16.4, 0.06, 1.05),
      gold,
    );
    threshold.position.set(0, 0.05, 0);
    group.add(threshold);

    group.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const position = new THREE.Vector3(side * 11.9, 6.2, 0).applyMatrix4(
        group.matrixWorld,
      );
      this.colliders.push({
        center: { x: position.x, y: GROUND_Y + position.y, z: position.z },
        half: { x: 1.7, y: 6.2, z: 2.2 },
        yaw: sample.yaw,
      });
    }

    // Turquoise banners give the portal scale without competing with the disc.
    for (const side of [-1, 1]) {
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 4.4),
        new THREE.MeshToonMaterial({ color: 0x1d7477, side: THREE.DoubleSide }),
      );
      banner.material.userData.outlineParameters = { visible: false };
      banner.position.set(side * 7.2, 9.2, outwardPositive ? 2.48 : -2.48);
      group.add(banner);
      const emblem = new THREE.Mesh(
        new THREE.CircleGeometry(0.36, 12),
        new THREE.MeshBasicMaterial({ color: 0xe8c76c }),
      );
      emblem.material.userData.outlineParameters = { visible: false };
      emblem.position.set(side * 7.2, 9.8, outwardPositive ? 2.52 : -2.52);
      group.add(emblem);
      const tail = new THREE.Mesh(
        new THREE.ConeGeometry(0.57, 1.1, 3),
        new THREE.MeshBasicMaterial({ color: 0xe8c76c, side: THREE.DoubleSide }),
      );
      tail.material.userData.outlineParameters = { visible: false };
      tail.position.set(side * 7.2, 6.4, outwardPositive ? 2.52 : -2.52);
      tail.rotation.z = Math.PI;
      group.add(tail);
    }

    // Small stone crests in relief on the towers.
    for (const side of [-1, 1]) {
      const relief = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.4, 0.16), dark);
      relief.position.set(side * 11.9, 8.4, outwardPositive ? 2.26 : -2.26);
      group.add(relief);
      for (let row = 0; row < 3; row++) {
        const glyph = new THREE.Mesh(
          new THREE.BoxGeometry(0.8 - row * 0.13, 0.16, 0.06),
          gold,
        );
        glyph.position.set(
          side * 11.9,
          9.1 - row * 0.5,
          outwardPositive ? 2.36 : -2.36,
        );
        group.add(glyph);
      }
    }
  }

  private createSolarDisc(z: number): THREE.Group {
    const group = new THREE.Group();
    const gold = new THREE.MeshBasicMaterial({ color: 0xe8c76c });
    gold.userData.outlineParameters = { visible: false };
    const teal = new THREE.MeshBasicMaterial({ color: 0x1d7477 });
    teal.userData.outlineParameters = { visible: false };

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.18, 24), gold);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 9.95, z);
    group.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.12, 6, 24), teal);
    rim.position.set(0, 9.95, z);
    group.add(rim);

    for (const side of [-1, 1]) {
      for (let feather = 0; feather < 3; feather++) {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(1.6 - feather * 0.24, 0.28, 0.16),
          feather % 2 === 0 ? gold : teal,
        );
        wing.position.set(
          side * (2.1 + feather * 0.52),
          9.95 + (feather - 1) * 0.4,
          z,
        );
        wing.rotation.z = side * (feather - 1) * 0.12;
        group.add(wing);
      }
    }
    return group;
  }

  private addFloorEmblem(): void {
    const t = (SHELL.from + SHELL.to) / 2;
    const sample = this.sample(t);
    const group = new THREE.Group();
    group.position.set(sample.x, sample.y + 0.04, sample.z);
    group.rotation.y = sample.yaw;
    this.group.add(group);

    const gold = new THREE.MeshBasicMaterial({ color: 0xcaa24f });
    gold.userData.outlineParameters = { visible: false };
    const teal = new THREE.MeshBasicMaterial({ color: 0x2a7d7c });
    teal.userData.outlineParameters = { visible: false };

    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), gold);
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.45, 24), teal);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2;
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.35), gold);
      ray.rotation.x = -Math.PI / 2;
      ray.rotation.z = -angle;
      ray.position.set(
        Math.sin(angle) * 3.35,
        0,
        Math.cos(angle) * 3.35,
      );
      group.add(ray);
    }
  }
}
