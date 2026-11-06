import * as THREE from "three";
import { celMaterial, outlinedMaterial } from "../../rendering/cel-shading";
import { GROUND_Y } from "../../core/config";
import type { ColliderBox } from "../../core/types";
import type { TrackLike } from "../../tracks/track";
import type { Decoration } from "../types";
import { addBox, makeInstances } from "../common";
import { signMaterial } from "../props/signs";

export interface RaceDecorOptions {
  banner: string;
  theme?: "wood" | "tropical" | "ice";
  buntingDistances?: readonly number[];
  lineColor?: number;
  curbColors?: readonly [number, number];
  curbExclusions?: readonly { from: number; to: number }[];
}

/** Start line, gantry, countdown lights and curbs, fitted to any track. */
export class RaceDecor implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly startLights: THREE.MeshBasicMaterial[] = [];

  constructor(
    private readonly track: TrackLike,
    private readonly options: RaceDecorOptions,
  ) {
    this.group.name = "race-infrastructure";
    this.addStartLine();
    this.addStartGantry();
    this.addBunting();
    this.addCurbs();
    this.setStartLights("3");
  }

  setStartLights(label: string | null): void {
    const lit =
      label === "3" ? 1 : label === "2" ? 2 : label === "1" ? 3 : 0;
    const go = label === "GO!";

    for (let index = 0; index < this.startLights.length; index++) {
      this.startLights[index].color.setHex(
        go ? 0x4ade80 : index < lit ? 0xff3b30 : 0x2c2c2c,
      );
    }
  }

  private addStartLine(): void {
    const group = new THREE.Group();
    group.position.set(
      this.track.spawn.pos.x,
      GROUND_Y + 0.03,
      this.track.spawn.pos.z,
    );
    group.rotation.y = this.track.spawn.yaw;
    this.group.add(group);

    const squares = makeInstances(
      new THREE.BoxGeometry((this.track.width / 12) * 0.96, 0.02, 0.42),
      celMaterial(this.options.lineColor ?? 0x3479d5),
      12,
    );
    const dummy = new THREE.Object3D();
    let index = 0;

    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 12; column++) {
        if ((row + column) % 2 !== 0) {
          continue;
        }
        dummy.position.set(
          (-5.5 + column) * this.track.width / 12,
          0,
          -0.225 + row * 0.45,
        );
        dummy.updateMatrix();
        squares.setMatrixAt(index++, dummy.matrix);
      }
    }
    squares.count = index;
    squares.instanceMatrix.needsUpdate = true;
    group.add(squares);
  }

  private addStartGantry(): void {
    const group = new THREE.Group();
    group.position.set(
      this.track.spawn.pos.x,
      GROUND_Y,
      this.track.spawn.pos.z,
    );
    group.rotation.y = this.track.spawn.yaw;
    this.group.add(group);

    const frame = outlinedMaterial(
      this.options.theme === "tropical"
        ? 0x287367
        : this.options.theme === "ice"
          ? 0x3a7fa8
          : 0xc88649,
      0.0015,
    );
    const accent = outlinedMaterial(
      this.options.theme === "tropical"
        ? 0xf4cc75
        : this.options.theme === "ice"
          ? 0xe1f8ff
          : 0x895530,
      0.0015,
    );
    const dark = outlinedMaterial(0x172333, 0.0015);

    for (const side of [-1, 1]) {
      const pillar = addBox(
        group,
        0.75,
        5.8,
        0.75,
        frame,
        side * (this.track.width / 2 + 1.6),
        2.9,
        6,
      );
      pillar.castShadow = true;
      addBox(
        group,
        1.35,
        0.35,
        1.35,
        dark,
        side * (this.track.width / 2 + 1.6),
        0.18,
        6,
      );
    }

    const beam = addBox(group, this.track.width + 4, 2, 1, frame, 0, 5.6, 6);
    beam.castShadow = true;
    addBox(group, this.track.width + 4.2, 0.18, 1.05, accent, 0, 6.7, 6);
    addBox(group, this.track.width + 4.2, 0.16, 1.05, accent, 0, 4.58, 6);
    for (const side of [-1, 1]) {
      const brace = addBox(group, 0.3, 2.1, 0.32, accent, side * (this.track.width / 2 + 0.85), 3.9, 6);
      brace.rotation.z = side * -0.62;
      // Horizontal timber courses give the gantry a visible wooden structure.
      for (const y of [5.05, 5.65, 6.25]) {
        addBox(group, 1.8, 0.035, 0.025, accent, side * (this.track.width / 2 + 0.7), y, 5.48);
      }
    }

    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(this.track.width, 2),
      signMaterial(this.options.banner, this.options.theme),
    );
    banner.position.set(0, 5.6, 5.47);
    banner.rotation.y = Math.PI;
    group.add(banner);

    addBox(group, 4.7, 0.62, 0.18, dark, 0, 4.15, 5.4);
    const lightGeometry = new THREE.SphereGeometry(0.17, 8, 6);
    for (let index = 0; index < 3; index++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x3b1414 });
      material.userData.outlineParameters = { visible: false };
      this.startLights.push(material);
      const light = new THREE.Mesh(lightGeometry, material);
      light.position.set(-1.35 + index * 1.35, 4.15, 5.28);
      group.add(light);
    }

    group.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const position = new THREE.Vector3(side * (this.track.width / 2 + 1.6), 2.9, 6).applyMatrix4(
        group.matrixWorld,
      );
      this.colliders.push({
        center: { x: position.x, y: 2.9, z: position.z },
        half: { x: 0.55, y: 2.9, z: 0.55 },
        yaw: this.track.spawn.yaw,
      });
    }
  }

  private addBunting(): void {
    const wood = outlinedMaterial(0xb77b42);
    const rope = outlinedMaterial(0x6c6549);
    const material = celMaterial(0xffffff);
    material.side = THREE.DoubleSide;
    const colors = [0xed5a48, 0x458ce7, 0xf3ce43, 0x5cc64c];
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, 0, 0.48, -0.85, 0.12, 0.96, 0, 0,
    ], 3));
    triangle.computeVertexNormals();
    for (const distance of this.options.buntingDistances ?? []) {
      const group = new THREE.Group();
      group.name = "race-bunting";
      group.position.set(this.track.spawn.pos.x, GROUND_Y, this.track.spawn.pos.z);
      group.rotation.y = this.track.spawn.yaw;
      this.group.add(group);
      const height = (x: number): number => 6.3 - 0.7 * (1 - (x / (this.track.width / 2 + 1.8)) ** 2);
      const points = Array.from({ length: 17 }, (_, i) => {
        const x = (i / 16 * 2 - 1) * (this.track.width / 2 + 1.8);
        return new THREE.Vector3(x, height(x), distance);
      });
      group.add(new THREE.Mesh(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points), 32, 0.018, 4, false,
      ), rope));
      for (const side of [-1, 1]) {
        addBox(group, 0.16, 6.4, 0.16, wood, side * (this.track.width / 2 + 1.8), 3.2, distance);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), wood);
        cap.position.set(side * (this.track.width / 2 + 1.8), 6.45, distance);
        group.add(cap);
      }
      const flags = makeInstances(triangle, material, 12);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      for (let index = 0; index < 12; index++) {
        const x = (-7.2 + index * 1.22) * (this.track.width + 3.6) / 15.6;
        dummy.position.set(x, height(x), distance);
        dummy.rotation.z = Math.atan((height(x + 0.96) - height(x)) / 0.96);
        dummy.updateMatrix();
        flags.setMatrixAt(index, dummy.matrix);
        flags.setColorAt(index, color.setHex(colors[index % colors.length]));
      }
      flags.instanceMatrix.needsUpdate = true;
      group.add(flags);
      group.updateMatrixWorld(true);
      for (const side of [-1, 1]) {
        const position = new THREE.Vector3(side * (this.track.width / 2 + 1.8), 3.2, distance).applyMatrix4(group.matrixWorld);
        this.colliders.push({ center: { x: position.x, y: position.y, z: position.z },
          half: { x: 0.1, y: 3.2, z: 0.1 }, yaw: this.track.spawn.yaw });
      }
    }
  }

  private addCurbs(): void {
    const red: Array<{ x: number; z: number; yaw: number; y: number; roll: number }> = [];
    const white: Array<{ x: number; z: number; yaw: number; y: number; roll: number }> = [];

    for (let index = 0; index < this.track.path.length; index++) {
      const t = index / this.track.path.length;
      if (this.options.curbExclusions?.some(range => t >= range.from && t <= range.to)) continue;
      const curvature = Math.abs(this.track.pathYawDelta(index, 2));
      if (curvature < 0.045) {
        continue;
      }

      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      for (const side of [-1, 1]) {
        const offset = side * (this.track.width / 2 - 0.32);
        const x = point.x + rightX * offset;
        const z = point.z + rightZ * offset;
        const spot = {
          x,
          z,
          yaw,
          y: GROUND_Y + (this.track.heightAt?.(x, z) ?? 0) + 0.03,
          roll: -(this.track.bankAt?.(x, z) ?? 0),
        };
        const target =
          (index + (side > 0 ? 1 : 0)) % 2 === 0 ? red : white;
        target.push(spot);
      }
    }

    const geometry = new THREE.BoxGeometry(0.55, 0.05, 2.4);
    const dummy = new THREE.Object3D();

    const addSet = (
      spots: Array<{ x: number; z: number; yaw: number; y: number; roll: number }>,
      color: number,
    ): void => {
      if (spots.length === 0) {
        return;
      }
      const material = new THREE.MeshBasicMaterial({ color });
      material.userData.outlineParameters = { visible: false };
      const mesh = makeInstances(geometry, material, spots.length);
      for (let index = 0; index < spots.length; index++) {
        const spot = spots[index];
        dummy.position.set(spot.x, spot.y, spot.z);
        dummy.rotation.set(0, spot.yaw, spot.roll);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    };

    addSet(red, this.options.curbColors?.[0] ?? 0xd83a2e);
    addSet(white, this.options.curbColors?.[1] ?? 0xf3efe4);
  }
}
