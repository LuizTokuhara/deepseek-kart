import * as THREE from "three";
import { celMaterial } from "../cel-shading";
import { GROUND_Y } from "../config";
import type { TrackLike } from "../track";
import type { ColliderBox } from "../types";
import { createBalloon } from "./balloon";
import { buildClouds, type CloudSpot } from "./clouds";
import { addBox, makeInstances, pseudoRandom } from "./common";
import { createGrandstand } from "./grandstand";
import { buildHills, type HillSpot } from "./hills";
import { signMaterial } from "./signs";
import { buildTrees, type TreeSpot } from "./trees";
import { TropicalScenery } from "./tropical-scenery";

const GRANDSTAND_A_CENTER_X = -4;
const GRANDSTAND_B_CENTER_X = 4;
const GRANDSTAND_FRONT_Z = 46;

export class TrackDecor {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];

  private readonly startLights: THREE.MeshBasicMaterial[] = [];
  private readonly boardMaterial: THREE.MeshBasicMaterial;
  private readonly balloon: THREE.Group;
  private readonly tropical: TropicalScenery;
  private readonly balloonBaseY = 14;
  private elapsed = 0;

  constructor(private readonly track: TrackLike) {
    this.boardMaterial = signMaterial("DEEPSEEK");
    this.addStartLine();
    this.addStartGantry();
    this.addBunting();
    this.addCurbs();
    this.addGrandstand(
      GRANDSTAND_A_CENTER_X,
      -GRANDSTAND_FRONT_Z,
      0,
      101,
    );
    this.addGrandstand(
      GRANDSTAND_B_CENTER_X,
      GRANDSTAND_FRONT_Z,
      Math.PI,
      202,
    );
    this.addTrees();
    this.addHills();
    this.addClouds();
    this.addTracksideBoards();
    this.balloon = this.addBalloon();
    this.tropical = new TropicalScenery(track);
    this.group.add(this.tropical.group);
    this.colliders.push(...this.tropical.colliders);
    this.setStartLights("3");
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.tropical.update(dt);
    this.balloon.position.y =
      this.balloonBaseY + Math.sin(this.elapsed * 0.45) * 0.45;
    this.balloon.rotation.y = Math.sin(this.elapsed * 0.1) * 0.12;
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
      new THREE.BoxGeometry(0.96, 0.02, 0.42),
      celMaterial(0x3479d5),
      12,
    );
    const dummy = new THREE.Object3D();
    let index = 0;

    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 12; column++) {
        if ((row + column) % 2 !== 0) {
          continue;
        }
        dummy.position.set(-5.5 + column, 0, -0.225 + row * 0.45);
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

    const frame = celMaterial(0xc88649, 0.0015);
    const accent = celMaterial(0x895530, 0.0015);
    const dark = celMaterial(0x172333, 0.0015);

    for (const side of [-1, 1]) {
      const pillar = addBox(
        group,
        0.75,
        5.8,
        0.75,
        frame,
        side * 7.6,
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
        side * 7.6,
        0.18,
        6,
      );
    }

    const beam = addBox(group, 16, 2, 1, frame, 0, 5.6, 6);
    beam.castShadow = true;
    addBox(group, 16.2, 0.18, 1.05, accent, 0, 6.7, 6);
    addBox(group, 16.2, 0.16, 1.05, accent, 0, 4.58, 6);
    for (const side of [-1, 1]) {
      const brace = addBox(group, 0.3, 2.1, 0.32, accent, side * 6.85, 3.9, 6);
      brace.rotation.z = side * -0.62;
      // Horizontal timber courses give the gantry a visible wooden structure.
      for (const y of [5.05, 5.65, 6.25]) {
        addBox(group, 1.8, 0.035, 0.025, accent, side * 6.7, y, 5.48);
      }
    }

    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 2),
      signMaterial("DEEPSEEK KART"),
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
      const position = new THREE.Vector3(side * 7.6, 2.9, 6).applyMatrix4(
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
    const wood = celMaterial(0xb77b42);
    const rope = celMaterial(0x6c6549);
    const material = celMaterial(0xffffff);
    material.side = THREE.DoubleSide;
    const colors = [0xed5a48, 0x458ce7, 0xf3ce43, 0x5cc64c];
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, 0, 0.48, -0.85, 0.12, 0.96, 0, 0,
    ], 3));
    triangle.computeVertexNormals();
    for (const distance of [22, 52]) {
      const group = new THREE.Group();
      group.name = "race-bunting";
      group.position.set(this.track.spawn.pos.x, GROUND_Y, this.track.spawn.pos.z);
      group.rotation.y = this.track.spawn.yaw;
      this.group.add(group);
      const height = (x: number): number => 6.3 - 0.7 * (1 - (x / 7.8) ** 2);
      const points = Array.from({ length: 17 }, (_, i) => {
        const x = (i / 16 * 2 - 1) * 7.8;
        return new THREE.Vector3(x, height(x), distance);
      });
      group.add(new THREE.Mesh(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points), 32, 0.018, 4, false,
      ), rope));
      for (const side of [-1, 1]) {
        addBox(group, 0.16, 6.4, 0.16, wood, side * 7.8, 3.2, distance);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), wood);
        cap.position.set(side * 7.8, 6.45, distance);
        group.add(cap);
      }
      const flags = makeInstances(triangle, material, 12);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      for (let index = 0; index < 12; index++) {
        const x = -7.2 + index * 1.22;
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
        const position = new THREE.Vector3(side * 7.8, 3.2, distance).applyMatrix4(group.matrixWorld);
        this.colliders.push({ center: { x: position.x, y: position.y, z: position.z },
          half: { x: 0.1, y: 3.2, z: 0.1 }, yaw: this.track.spawn.yaw });
      }
    }
  }

  private addCurbs(): void {
    const red: Array<{ x: number; z: number; yaw: number }> = [];
    const white: Array<{ x: number; z: number; yaw: number }> = [];

    for (let index = 0; index < this.track.path.length; index++) {
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
        const spot = {
          x: point.x + rightX * offset,
          z: point.z + rightZ * offset,
          yaw,
        };
        const target =
          (index + (side > 0 ? 1 : 0)) % 2 === 0 ? red : white;
        target.push(spot);
      }
    }

    const geometry = new THREE.BoxGeometry(0.55, 0.05, 2.4);
    const dummy = new THREE.Object3D();

    const addSet = (
      spots: Array<{ x: number; z: number; yaw: number }>,
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
        dummy.position.set(spot.x, GROUND_Y + 0.03, spot.z);
        dummy.rotation.set(0, spot.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    };

    addSet(red, 0xd83a2e);
    addSet(white, 0xf3efe4);
  }

  private addGrandstand(
    centerX: number,
    centerZ: number,
    rotationY: number,
    seed: number,
  ): void {
    const { group, collider } = createGrandstand({
      centerX,
      centerZ,
      rotationY,
      seed,
      boardMaterial: this.boardMaterial,
    });
    this.group.add(group);
    this.colliders.push(collider);
  }

  private addTrees(): void {
    const random = pseudoRandom(4242);
    const treeTs = [
      0.04, 0.08, 0.12, 0.2, 0.26, 0.33, 0.4, 0.47, 0.54, 0.61, 0.68, 0.75,
      0.82, 0.89, 0.95,
    ];
    const trees: TreeSpot[] = [];

    const nearGrandstand = (x: number, z: number): boolean =>
      (z < -42 && z > -56 && x > -36 && x < 28) ||
      (z > 42 && z < 56 && x > -28 && x < 36);

    const addTree = (
      x: number,
      z: number,
      outside: boolean,
    ): void => {
      if (
        x < this.track.bounds.minX + 4 ||
        x > this.track.bounds.maxX - 4 ||
        z < this.track.bounds.minZ + 4 ||
        z > this.track.bounds.maxZ - 4 ||
        nearGrandstand(x, z)
      ) {
        return;
      }

      const tree: TreeSpot = {
        x,
        z,
        scale: 0.85 + random() * 0.55,
        rotation: random() * Math.PI * 2,
        foliage: random() > 0.5 ? "a" : "b",
      };
      trees.push(tree);

      if (outside) {
        this.colliders.push({
          center: { x, y: 1.1, z },
          half: { x: 0.38, y: 1.1, z: 0.38 },
          yaw: 0,
        });
      }
    };

    for (const t of treeTs) {
      if ((t > 0.28 && t < 0.38) || (t > 0.66 && t < 0.755)) continue;
      const index = Math.min(
        this.track.path.length - 1,
        Math.round(t * this.track.path.length),
      );
      const point = this.track.path[index];
      const length = Math.hypot(point.x, point.z);
      if (length < 0.1) {
        continue;
      }

      const outwardX = point.x / length;
      const outwardZ = point.z / length;
      const outsideDistance = this.track.wallOffset + 4 + random() * 7;
      const infieldDistance = this.track.wallOffset + 4 + random() * 8;

      addTree(
        point.x + outwardX * outsideDistance,
        point.z + outwardZ * outsideDistance,
        true,
      );
      addTree(
        point.x - outwardX * infieldDistance,
        point.z - outwardZ * infieldDistance,
        false,
      );
    }

    buildTrees(trees, this.group);
  }

  private addHills(): void {
    const hills: HillSpot[] = [
      { x: -14, z: 0, sx: 17, sy: 7, sz: 15 },
      { x: 18, z: 10, sx: 11, sy: 5, sz: 10 },
      { x: 0, z: -116, sx: 38, sy: 16, sz: 28 },
      { x: -148, z: 18, sx: 30, sy: 13, sz: 24 },
      { x: 148, z: 34, sx: 32, sy: 14, sz: 26 },
    ];

    buildHills(hills, this.group);
  }

  private addClouds(): void {
    const random = pseudoRandom(777);
    const clusterCenters = [
      [-72, 38, -82],
      [30, 43, -88],
      [92, 36, 24],
      [-96, 40, 54],
      [6, 47, -14],
      [66, 34, 92],
    ];
    const spots: CloudSpot[] = [];

    for (const [x, y, z] of clusterCenters) {
      for (let index = 0; index < 3; index++) {
        spots.push({
          x: x + (random() - 0.5) * 10,
          y: y + (random() - 0.5) * 3,
          z: z + (random() - 0.5) * 8,
          scale: 2.2 + random() * 2.2,
        });
      }
    }

    buildClouds(spots, this.group);
  }

  private addTracksideBoards(): void {
    const backingMaterial = celMaterial(0x123b42);
    const ts = [0.09, 0.22, 0.42, 0.57, 0.72, 0.88];

    for (const t of ts) {
      const index = Math.min(
        this.track.path.length - 1,
        Math.round(t * this.track.path.length),
      );
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const outwardLength = Math.hypot(point.x, point.z);
      if (outwardLength < 0.1) {
        continue;
      }
      const outwardX = point.x / outwardLength;
      const outwardZ = point.z / outwardLength;
      const side = rightX * outwardX + rightZ * outwardZ >= 0 ? 1 : -1;
      const wallX = point.x + rightX * side * (this.track.wallOffset + 0.25);
      const wallZ = point.z + rightZ * side * (this.track.wallOffset + 0.25);

      const board = new THREE.Group();
      board.position.set(wallX, 1.85, wallZ);
      board.lookAt(point.x, 1.85, point.z);
      this.group.add(board);

      addBox(board, 6.3, 1.25, 0.12, backingMaterial, 0, 0, 0);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 1),
        this.boardMaterial,
      );
      face.position.set(0, 0, 0.075);
      board.add(face);

      for (const sidePost of [-1, 1]) {
        addBox(
          board,
          0.12,
          0.9,
          0.12,
          backingMaterial,
          sidePost * 2.4,
          -0.85,
          0,
        );
      }
    }
  }

  private addBalloon(): THREE.Group {
    const balloon = createBalloon();
    balloon.position.set(12, this.balloonBaseY, 0);
    this.group.add(balloon);
    return balloon;
  }
}
