import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { COLORS, GROUND_Y, ITEMS, RACE, TRACK, TRACK_SHAPE } from "./config";
import { worldToLocal2D } from "./math";
import { celMaterial } from "./cel-shading";
import type { ColliderBox, Spawn, Surface } from "./types";

export interface TrackCheckpoint {
  x: number;
  z: number;
}

export interface TrackPathPoint {
  x: number;
  z: number;
}

interface InstanceSpec {
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
}

interface OrientedRect {
  centerX: number;
  centerZ: number;
  halfX: number;
  halfZ: number;
  yaw: number;
}

function buildInstancedMesh(
  instances: InstanceSpec[],
  material: THREE.Material,
  geometry: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1),
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, instances.length));
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    position.set(instance.x, instance.y, instance.z);
    quaternion.setFromAxisAngle(axis, instance.yaw);
    scale.set(instance.sx, instance.sy, instance.sz);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }

  mesh.count = instances.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function pointInRect(x: number, z: number, rect: OrientedRect): boolean {
  const local = worldToLocal2D(x - rect.centerX, z - rect.centerZ, rect.yaw);
  return Math.abs(local.x) <= rect.halfX && Math.abs(local.z) <= rect.halfZ;
}

/**
 * Retângulo arredondado com uma chicane em S na reta de largada.
 * A curva é fechada; o primeiro ponto fica na reta inferior.
 */
function createTrackCurve(): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const push = (x: number, z: number): void => {
    const last = points[points.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 0.0001) {
      return;
    }
    points.push(new THREE.Vector3(x, 0, z));
  };

  const {
    halfWidth,
    halfDepth,
    cornerRadius,
    chicaneAmplitude,
    straightSample,
    cornerSteps,
  } = TRACK_SHAPE;

  const straightHalf = halfWidth - cornerRadius;
  const depthHalf = halfDepth - cornerRadius;
  const bottomSteps = Math.ceil((straightHalf * 2) / straightSample);

  // Reta inferior limpa, usada para acelerar e frear.
  for (let i = 0; i <= bottomSteps; i++) {
    const x = -straightHalf + (i / bottomSteps) * straightHalf * 2;
    push(x, -halfDepth);
  }

  // Curva inferior direita: -90° -> 0°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = -Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    push(
      straightHalf + Math.cos(angle) * cornerRadius,
      -depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta direita.
  const sideSteps = Math.ceil((depthHalf * 2) / straightSample);
  for (let i = 1; i <= sideSteps; i++) {
    const z = -depthHalf + (i / sideSteps) * depthHalf * 2;
    push(halfWidth, z);
  }

  // Curva superior direita: 0° -> 90°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = (i / cornerSteps) * (Math.PI / 2);
    push(
      straightHalf + Math.cos(angle) * cornerRadius,
      depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta superior, com a chicane suave.
  for (let i = 1; i <= bottomSteps; i++) {
    const x = straightHalf - (i / bottomSteps) * straightHalf * 2;
    const u = (x + straightHalf) / (straightHalf * 2);
    const offset =
      chicaneAmplitude *
      Math.sin(Math.PI * u) ** 2 *
      Math.sin(2 * Math.PI * u);
    push(x, halfDepth + offset);
  }

  // Curva superior esquerda: 90° -> 180°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    push(
      -straightHalf + Math.cos(angle) * cornerRadius,
      depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta esquerda.
  for (let i = 1; i <= sideSteps; i++) {
    const z = depthHalf - (i / sideSteps) * depthHalf * 2;
    push(-halfWidth, z);
  }

  // Curva inferior esquerda: 180° -> 270°. O ponto final coincide com o
  // primeiro ponto, então ele é omitido para não duplicar a junção fechada.
  for (let i = 1; i < cornerSteps; i++) {
    const angle = Math.PI + (i / cornerSteps) * (Math.PI / 2);
    push(
      -straightHalf + Math.cos(angle) * cornerRadius,
      -depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.5);
  curve.arcLengthDivisions = 2000;
  return curve;
}

export class Track {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  readonly spawn: Spawn = { pos: { x: 0, z: 0 }, yaw: 0 };
  readonly checkpoints: TrackCheckpoint[] = [];
  readonly finishLine: TrackCheckpoint = { x: 0, z: 0 };
  readonly checkpointRadius = RACE.checkpointRadius;
  readonly path: TrackPathPoint[] = [];
  readonly itemBoxes: TrackCheckpoint[] = [];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  private readonly roadRects: OrientedRect[] = [];
  private readonly curve: THREE.CatmullRomCurve3;

  constructor() {
    this.bounds = {
      minX: -TRACK.grassWidth / 2,
      maxX: TRACK.grassWidth / 2,
      minZ: -TRACK.grassDepth / 2,
      maxZ: TRACK.grassDepth / 2,
    };

    this.curve = createTrackCurve();
    this.addGrass();
    this.addStartAndCurve();
    this.addMapWalls();
    this.addObstacles();

    this.finishLine.x = this.spawn.pos.x;
    this.finishLine.z = this.spawn.pos.z;

    for (const t of RACE.checkpointTs) {
      const point = this.curve.getPointAt(t);
      this.checkpoints.push({ x: point.x, z: point.z });
    }

    const pathCount = Math.max(1, Math.ceil(this.curve.getLength() / TRACK.sampleStep));
    for (let i = 0; i < pathCount; i++) {
      const point = this.curve.getPointAt(i / pathCount);
      this.path.push({ x: point.x, z: point.z });
    }

    for (const t of ITEMS.boxRows) {
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      const rightX = -Math.cos(yaw);
      const rightZ = Math.sin(yaw);

      for (const lateral of ITEMS.boxLateral) {
        this.itemBoxes.push({
          x: point.x + rightX * lateral,
          z: point.z + rightZ * lateral,
        });
      }
    }
  }

  /**
   * Índice do ponto da centerline mais próximo. Com `hint`, procura apenas
   * numa janela local para o AI não "pular" para outra parte da pista.
   */
  nearestPathIndex(
    x: number,
    z: number,
    hint: number | null = null,
    window = 24,
  ): number {
    const count = this.path.length;
    if (count === 0) {
      return 0;
    }

    let bestIndex = 0;
    let bestDistanceSq = Infinity;
    const start = hint === null ? 0 : hint - window;
    const end = hint === null ? count - 1 : hint + window;

    for (let i = start; i <= end; i++) {
      const index = ((i % count) + count) % count;
      const point = this.path[index];
      const dx = point.x - x;
      const dz = point.z - z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  pathYaw(index: number): number {
    const count = this.path.length;
    if (count === 0) {
      return 0;
    }
    const previous = this.path[(index - 1 + count) % count];
    const next = this.path[(index + 1) % count];
    return Math.atan2(next.x - previous.x, next.z - previous.z);
  }

  /** Variação de yaw entre o ponto atual e um ponto à frente na centerline. */
  pathYawDelta(index: number, ahead: number): number {
    const count = this.path.length;
    if (count === 0) {
      return 0;
    }
    const from = this.pathYaw(((index % count) + count) % count);
    const to = this.pathYaw((((index + ahead) % count) + count) % count);
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }

  surfaceAt(x: number, z: number): Surface {
    for (const rect of this.roadRects) {
      if (pointInRect(x, z, rect)) {
        return "asphalt";
      }
    }
    return "grass";
  }

  isOutOfBounds(x: number, z: number): boolean {
    const margin = 2;
    return (
      x < this.bounds.minX - margin ||
      x > this.bounds.maxX + margin ||
      z < this.bounds.minZ - margin ||
      z > this.bounds.maxZ + margin
    );
  }

  private addGrass(): void {
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK.grassWidth, 0.2, TRACK.grassDepth),
      celMaterial(COLORS.grass),
    );
    grass.position.y = -0.1;
    grass.receiveShadow = true;
    this.group.add(grass);
  }

  private addStartAndCurve(): void {
    const curve = this.curve;
    const length = curve.getLength();
    const sampleCount = Math.max(1, Math.ceil(length / TRACK.sampleStep));

    const roadInstances: InstanceSpec[] = [];
    // Um pouco depois do início da curva evita a tangente inclinada da junção.
    const startT = 0.015;
    const startPoint = curve.getPointAt(startT);
    const startTangent = curve.getTangentAt(startT).normalize();
    const startYaw = Math.atan2(startTangent.x, startTangent.z);

    this.spawn.pos.x = startPoint.x;
    this.spawn.pos.z = startPoint.z;
    this.spawn.yaw = startYaw;

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);

      // Pequena variação de altura evita z-fighting entre lajes sobrepostas.
      const roadCenterY =
        GROUND_Y - TRACK.roadThickness / 2 + (i % 2) * 0.0004;

      roadInstances.push({
        x: point.x,
        y: roadCenterY,
        z: point.z,
        yaw,
        sx: TRACK.width,
        sy: TRACK.roadThickness,
        sz: TRACK.slabLength,
      });

      this.roadRects.push({
        centerX: point.x,
        centerZ: point.z,
        halfX: TRACK.width / 2,
        halfZ: TRACK.slabLength / 2,
        yaw,
      });
    }

    const roadMaterial = celMaterial(COLORS.asphalt);
    const road = buildInstancedMesh(roadInstances, roadMaterial);
    road.receiveShadow = true;
    this.group.add(road);

    this.addSafetyBarriers();

    const startLine = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK.startLineWidth, TRACK.startLineHeight, TRACK.startLineDepth),
      celMaterial(COLORS.startLine),
    );
    startLine.position.set(
      startPoint.x,
      GROUND_Y + TRACK.startLineHeight / 2 + 0.001,
      startPoint.z,
    );
    startLine.rotation.y = startYaw;
    startLine.receiveShadow = true;
    this.group.add(startLine);
  }

  private addSafetyBarriers(): void {
    const colors = [0xf15b49, 0x438df0, 0xf5ce45, 0x59c54d];
    const sets: InstanceSpec[][] = colors.map(() => []);
    const count = Math.ceil(this.curve.getLength() / 1.8);
    const offsetPoint = (t: number, side: number): THREE.Vector3 => {
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      return point.add(new THREE.Vector3(tangent.z, 0, -tangent.x)
        .normalize().multiplyScalar(side * TRACK.wallOffset));
    };

    for (let index = 0; index < count; index++) {
      for (const side of [-1, 1]) {
        if (this.shouldSkipWall((index + 0.5) / count, side)) continue;
        const a = offsetPoint(index / count, side);
        const b = offsetPoint((index + 1) / count, side);
        const block: InstanceSpec = {
          x: (a.x + b.x) / 2,
          y: TRACK.wallHeight / 2,
          z: (a.z + b.z) / 2,
          yaw: Math.atan2(b.x - a.x, b.z - a.z),
          sx: TRACK.wallThickness,
          sy: TRACK.wallHeight,
          sz: a.distanceTo(b) - 0.055,
        };
        sets[Math.floor(index / 3) % colors.length].push(block);
        this.colliders.push({
          center: { x: block.x, y: block.y, z: block.z },
          half: { x: block.sx / 2, y: block.sy / 2, z: block.sz / 2 },
          yaw: block.yaw,
        });
      }
    }
    const geometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.07);
    sets.forEach((instances, index) => {
      const mesh = buildInstancedMesh(instances, celMaterial(colors[index]), geometry);
      mesh.name = "colored-safety-barriers";
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
  }

  private addMapWalls(): void {
    const height = TRACK.mapWallHeight;
    const thickness = TRACK.mapWallThickness;
    const width = TRACK.grassWidth + thickness * 2;
    const depth = TRACK.grassDepth + thickness * 2;
    const y = height / 2;

    const specs: InstanceSpec[] = [
      { x: 0, y, z: -TRACK.grassDepth / 2, yaw: 0, sx: width, sy: height, sz: thickness },
      { x: 0, y, z: TRACK.grassDepth / 2, yaw: 0, sx: width, sy: height, sz: thickness },
      {
        x: -TRACK.grassWidth / 2,
        y,
        z: 0,
        yaw: 0,
        sx: thickness,
        sy: height,
        sz: depth,
      },
      {
        x: TRACK.grassWidth / 2,
        y,
        z: 0,
        yaw: 0,
        sx: thickness,
        sy: height,
        sz: depth,
      },
    ];

    for (const spec of specs) {
      this.colliders.push({
        center: { x: spec.x, y: spec.y, z: spec.z },
        half: { x: spec.sx / 2, y: spec.sy / 2, z: spec.sz / 2 },
        yaw: spec.yaw,
      });
    }

    const material = celMaterial(0x547c49);
    this.group.add(buildInstancedMesh(specs, material));
  }

  private addObstacles(): void {
    const curve = this.curve;

    const placements = [
      { t: 0.335, side: 1, lateral: 9.0, size: 1.4 },
      { t: 0.355, side: 1, lateral: 11.0, size: 1.2 },
      { t: 0.705, side: -1, lateral: 9.0, size: 1.4 },
    ];

    for (const placement of placements) {
      const point = curve.getPointAt(placement.t);
      const tangent = curve.getTangentAt(placement.t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const x = point.x + rightX * placement.lateral * placement.side;
      const z = point.z + rightZ * placement.lateral * placement.side;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(placement.size, placement.size, placement.size),
        celMaterial(0x475569),
      );
      mesh.position.set(x, placement.size / 2, z);
      mesh.rotation.y = yaw;
      this.group.add(mesh);

      this.colliders.push({
        center: { x, y: placement.size / 2, z },
        half: {
          x: placement.size / 2,
          y: placement.size / 2,
          z: placement.size / 2,
        },
        yaw,
      });
    }
  }

  private shouldSkipWall(t: number, side: number): boolean {
    // Duas aberturas para área de escape: uma à direita e uma à esquerda.
    if (side === 1 && t > 0.30 && t < 0.365) {
      return true;
    }
    if (side === -1 && t > 0.675 && t < 0.74) {
      return true;
    }
    return false;
  }
}
