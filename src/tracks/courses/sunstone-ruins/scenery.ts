import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createBatch, type Placement } from "../../../decor/common";
import { createInstancedOutline } from "../../../rendering/instanced-outline";
import { celMaterial } from "../../../rendering/cel-shading";
import { applyWind, windDepthMaterial, type WindOptions } from "../../../rendering/wind";
import { createPalmBatches } from "../../../decor/nature/palms";

export interface RockSpot {
  x: number;
  z: number;
  scale: number;
  rotation?: number;
}

export function buildDesertRocks(
  spots: readonly RockSpot[],
  parent: THREE.Group,
): void {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const shades = [0xb58a52, 0xa77c45, 0xc79c61];
  const groups: RockSpot[][] = shades.map(() => []);
  spots.forEach((spot, index) => groups[index % shades.length].push(spot));

  groups.forEach((groupSpots, index) => {
    if (groupSpots.length === 0) return;
    const mesh = createBatch(
      geometry,
      celMaterial(shades[index]),
      groupSpots.map((spot) => ({
        x: spot.x,
        y: spot.scale * 0.55,
        z: spot.z,
        scale: spot.scale,
        yaw: spot.rotation ?? 0,
      })),
      true,
    );
    mesh.name = `desert-rocks-${index}`;
    parent.add(mesh, createInstancedOutline(mesh, 0.55));
  });
}

/** Dry date-palm scrub and straw tufts, grouped instead of scattered cacti. */
const SCRUB_WIND: WindOptions = { strength: 0.08, from: 0.1, to: 1, speed: 1.9 };

export function buildDesertScrub(spots: readonly Placement[], parent: THREE.Group): void {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const blade = new THREE.ConeGeometry(0.075, 0.65 + (i % 3) * 0.19, 3);
    blade.translate(0, 0.4, 0);
    blade.rotateZ((i % 2 ? 1 : -1) * (0.18 + (i % 4) * 0.16));
    blade.rotateY(i * 2.4);
    blades.push(blade);
  }
  const geometry = mergeGeometries(blades)!;
  blades.forEach(blade => blade.dispose());
  const material = celMaterial(0x9b914f);
  applyWind(material, SCRUB_WIND);
  const mesh = createBatch(geometry, material, spots, true);
  mesh.name = "desert-palm-scrub";
  mesh.customDepthMaterial = windDepthMaterial(SCRUB_WIND);
  parent.add(mesh);
}

interface Ripple {
  mesh: THREE.Mesh;
  phase: number;
}

/** Oásis com margem recortada, juncos, vitórias-régias e palmeiras. */
export class Oasis {
  readonly group = new THREE.Group();
  private readonly ripples: Ripple[] = [];
  private time = 0;

  constructor(private readonly x: number, private readonly z: number) {
    this.group.name = "sunstone-oasis";
    this.group.position.set(x, 0, z);
    this.addPond();
    this.addPalms();
    this.addReeds();
  }

  update(dt: number): void {
    this.time += Math.min(dt, 0.05);
    for (const ripple of this.ripples) {
      const phase = (this.time * 0.22 + ripple.phase) % 1;
      ripple.mesh.scale.setScalar(0.55 + phase * 1.7);
      const material = ripple.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = (1 - phase) * 0.26;
    }
  }

  private addPond(): void {
    const waterShape = new THREE.Shape();
    const rimShape = new THREE.Shape();
    const points: THREE.Vector2[] = [];
    const outer: THREE.Vector2[] = [];
    const segments = 40;
    for (let index = 0; index < segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
      const wobble =
        1 + Math.sin(angle * 3 + 0.7) * 0.055 + Math.cos(angle * 5) * 0.035;
      points.push(new THREE.Vector2(Math.cos(angle) * 13 * wobble, Math.sin(angle) * 8 * wobble));
      outer.push(new THREE.Vector2(Math.cos(angle) * 14.4 * wobble, Math.sin(angle) * 9.1 * wobble));
    }
    waterShape.setFromPoints(points);
    rimShape.setFromPoints(outer);
    rimShape.holes.push(new THREE.Path(points));

    const water = new THREE.Mesh(
      new THREE.ShapeGeometry(waterShape, 1),
      new THREE.MeshToonMaterial({ color: 0x2b8c91 }),
    );
    water.material.userData.outlineParameters = { visible: false };
    water.geometry.rotateX(-Math.PI / 2);
    water.position.y = 0.025;
    this.group.add(water);

    const rim = new THREE.Mesh(
      new THREE.ShapeGeometry(rimShape, 1),
      celMaterial(0xecd393),
    );
    rim.material.userData.outlineParameters = { visible: false };
    rim.geometry.rotateX(-Math.PI / 2);
    rim.position.y = 0.018;
    this.group.add(rim);

    const deep = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x1f6f77 }),
    );
    deep.material.userData.outlineParameters = { visible: false };
    deep.rotation.x = -Math.PI / 2;
    deep.scale.set(7.6, 4.2, 1);
    deep.position.set(-1.3, 0.03, 0.8);
    this.group.add(deep);

    for (let index = 0; index < 3; index++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x9fe3d5,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
      material.userData.outlineParameters = { visible: false };
      const ripple = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 36), material);
      ripple.rotation.x = -Math.PI / 2;
      ripple.scale.set(9 + index * 1.5, 5.4 + index, 1);
      ripple.position.set(0, 0.04 + index * 0.002, 0);
      this.group.add(ripple);
      this.ripples.push({ mesh: ripple, phase: index * 0.29 });
    }

    // Ilhota central com uma pedra e capim.
    const islet = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.6, 0.35, 12),
      celMaterial(0xc9a465),
    );
    islet.position.set(2.4, 0.16, -1.4);
    this.group.add(islet);
    const isletTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.85, 2.05, 0.14, 12),
      celMaterial(0x6f9e56),
    );
    isletTop.position.set(2.4, 0.38, -1.4);
    this.group.add(isletTop);

    for (let index = 0; index < 5; index++) {
      const lily = new THREE.Mesh(
        new THREE.CircleGeometry(0.75, 8, 0.2, Math.PI * 1.8),
        celMaterial(0x64a35a),
      );
      lily.rotation.x = -Math.PI / 2;
      lily.position.set(
        Math.sin(index * 2.3) * 7,
        0.05,
        Math.cos(index * 2.3) * 3.4,
      );
      lily.rotation.z = index;
      this.group.add(lily);
    }
  }

  private addPalms(): void {
    const placements = [
      { x: -14.5, y: 0, z: 1.5, scale: 1.05, variant: "tall" as const },
      { x: -10.8, y: 0, z: 7.2, scale: 0.9, variant: "arching" as const },
      { x: 1.2, y: 0, z: 8.6, scale: 1.0, variant: "compact" as const },
      { x: 11.4, y: 0, z: 3.1, scale: 1.1, variant: "tall" as const },
      { x: 9.4, y: 0, z: -6.2, scale: 0.88, variant: "arching" as const },
      { x: -2.5, y: 0, z: -8.4, scale: 0.95, variant: "compact" as const },
      { x: -13.1, y: 0, z: -5.2, scale: 1.02, variant: "tall" as const },
      { x: 3.2, y: 0, z: -9.2, scale: 0.72, variant: "compact" as const },
    ];
    createPalmBatches(this.group, placements);
  }

  private addReeds(): void {
    const geometry = new THREE.ConeGeometry(0.1, 1.5, 4);
    geometry.translate(0, 0.75, 0);
    const placements = Array.from({ length: 34 }, (_, index) => {
      const angle = (index / 34) * Math.PI * 2 + Math.sin(index) * 0.2;
      const radius = 12.2 + (index % 4) * 0.55;
      return {
        x: Math.cos(angle) * radius,
        y: 0.02,
        z: Math.sin(angle) * radius * 0.67,
        scale: 0.7 + (index % 5) * 0.12,
        yaw: index * 0.7,
      };
    });
    const material = celMaterial(0x7b9b4f);
    material.userData.outlineParameters = { visible: false };
    applyWind(material, { strength: 0.1, from: 0.2, to: 1.5, speed: 1.6 });
    const mesh = createBatch(geometry, material, placements);
    mesh.name = "oasis-reeds";
    this.group.add(mesh);
  }
}
