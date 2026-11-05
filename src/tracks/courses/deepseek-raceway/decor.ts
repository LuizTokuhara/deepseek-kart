import * as THREE from "three";
import { RaceDecor } from "../../../decor/race/race-decor";
import type { Decoration } from "../../../decor/types";
import { celMaterial } from "../../../rendering/cel-shading";
import type { TrackLike } from "../../track";
import type { ColliderBox } from "../../../core/types";
import { createBalloon } from "../../../decor/props/balloon";
import { buildClouds, type CloudSpot } from "../../../decor/nature/clouds";
import { addBox, pseudoRandom } from "../../../decor/common";
import { createGrandstand } from "../../../decor/props/grandstand";
import { buildHills, type HillSpot } from "../../../decor/nature/hills";
import { signMaterial } from "../../../decor/props/signs";
import { buildTrees, type TreeSpot } from "../../../decor/nature/trees";
import { TropicalScenery } from "./tropical-scenery";

const GRANDSTAND_A_CENTER_X = -4;
const GRANDSTAND_B_CENTER_X = 4;
const GRANDSTAND_A_FRONT_Z = 46;
// The chicane extends toward this stand; keep the outside lane unobstructed.
const GRANDSTAND_B_FRONT_Z = 52;

export class RacewayDecor implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];

  private readonly raceDecor: RaceDecor;
  private readonly boardMaterial: THREE.MeshBasicMaterial;
  private readonly balloon: THREE.Group;
  private readonly tropical: TropicalScenery;
  private readonly balloonBaseY = 14;
  private elapsed = 0;

  constructor(private readonly track: TrackLike) {
    this.boardMaterial = signMaterial("DEEPSEEK");
    this.raceDecor = new RaceDecor(track, {
      banner: "DEEPSEEK KART",
      buntingDistances: [22, 52],
    });
    this.group.add(this.raceDecor.group);
    this.colliders.push(...this.raceDecor.colliders);
    this.addGrandstand(
      GRANDSTAND_A_CENTER_X,
      -GRANDSTAND_A_FRONT_Z,
      0,
      101,
    );
    this.addGrandstand(
      GRANDSTAND_B_CENTER_X,
      GRANDSTAND_B_FRONT_Z,
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

  setStartLights(label: string | null): void {
    this.raceDecor.setStartLights(label);
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.tropical.update(dt);
    this.balloon.position.y =
      this.balloonBaseY + Math.sin(this.elapsed * 0.45) * 0.45;
    this.balloon.rotation.y = Math.sin(this.elapsed * 0.1) * 0.12;
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
      (z > 48 && z < 62 && x > -28 && x < 36);

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
