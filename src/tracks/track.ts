import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GROUND_Y } from "../core/config";
import { worldToLocal2D } from "../core/math";
import { celMaterial } from "../rendering/cel-shading";
import type { TrackDefinition } from "./definition";
import type {
  ColliderBox,
  Spawn,
  Surface,
  SurfaceProvider,
} from "../core/types";

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
 * Contrato mínimo consumido por itens, IA, cenário, HUD e colisão.
 * Uma segunda pista só precisa produzir estes dados; não precisa ser a classe
 * `Track` nem compartilhar o layout da Deepseek Raceway.
 */
export interface TrackLike extends SurfaceProvider {
  readonly width: number;
  readonly wallOffset: number;
  readonly pathSpacing: number;
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly spawn: Spawn;
  readonly path: readonly TrackPathPoint[];
  readonly itemBoxes: readonly TrackCheckpoint[];
  readonly checkpoints: readonly TrackCheckpoint[];
  readonly finishLine: TrackCheckpoint;
  readonly colliders: readonly ColliderBox[];
  readonly checkpointRadius: number;

  nearestPathIndex(
    x: number,
    z: number,
    hint?: number | null,
    window?: number,
  ): number;
  pathYaw(index: number): number;
  pathYawDelta(index: number, ahead: number): number;
}

export class Track implements TrackLike {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  readonly spawn: Spawn = { pos: { x: 0, z: 0 }, yaw: 0 };
  readonly checkpoints: TrackCheckpoint[] = [];
  readonly finishLine: TrackCheckpoint = { x: 0, z: 0 };
  readonly checkpointRadius: number;
  readonly path: TrackPathPoint[] = [];
  readonly itemBoxes: TrackCheckpoint[] = [];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly width: number;
  readonly wallOffset: number;
  readonly pathSpacing: number;

  private readonly roadRects: OrientedRect[] = [];
  private readonly curve: THREE.CatmullRomCurve3;

  constructor(readonly definition: TrackDefinition) {
    this.checkpointRadius = definition.checkpointRadius;
    this.width = definition.width;
    this.wallOffset = definition.style.wallOffset;
    this.bounds = {
      minX: -definition.bounds.width / 2,
      maxX: definition.bounds.width / 2,
      minZ: -definition.bounds.depth / 2,
      maxZ: definition.bounds.depth / 2,
    };

    this.curve = definition.curve;
    this.addGrass();
    this.addStartAndCurve();
    this.addMapWalls();
    this.addObstacles();

    this.finishLine.x = this.spawn.pos.x;
    this.finishLine.z = this.spawn.pos.z;

    for (const t of definition.checkpointTs) {
      const point = this.curve.getPointAt(t);
      this.checkpoints.push({ x: point.x, z: point.z });
    }

    const curveLength = this.curve.getLength();
    const pathCount = Math.max(1, Math.ceil(curveLength / definition.sampleStep));
    for (let i = 0; i < pathCount; i++) {
      const point = this.curve.getPointAt(i / pathCount);
      this.path.push({ x: point.x, z: point.z });
    }
    this.pathSpacing = this.path.length > 0 ? curveLength / this.path.length : 1;

    for (const row of definition.itemRows) {
      const point = this.curve.getPointAt(row.t);
      const tangent = this.curve.getTangentAt(row.t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      const rightX = -Math.cos(yaw);
      const rightZ = Math.sin(yaw);

      for (const lateral of row.lateral) {
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
        return this.definition.surface;
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
      new THREE.BoxGeometry(
        this.definition.bounds.width,
        0.2,
        this.definition.bounds.depth,
      ),
      celMaterial(this.definition.style.grassColor),
    );
    grass.position.y = -0.1;
    grass.receiveShadow = true;
    this.group.add(grass);
  }

  private addStartAndCurve(): void {
    const curve = this.curve;
    const length = curve.getLength();
    const sampleCount = Math.max(
      1,
      Math.ceil(length / this.definition.sampleStep),
    );

    const roadInstances: InstanceSpec[] = [];
    // Um pouco depois do início da curva evita a tangente inclinada da junção.
    const startT = this.definition.spawnT;
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
        GROUND_Y -
        this.definition.style.roadThickness / 2 +
        (i % 2) * 0.0004;

      roadInstances.push({
        x: point.x,
        y: roadCenterY,
        z: point.z,
        yaw,
        sx: this.width,
        sy: this.definition.style.roadThickness,
        sz: this.definition.style.slabLength,
      });

      this.roadRects.push({
        centerX: point.x,
        centerZ: point.z,
        halfX: this.width / 2,
        halfZ: this.definition.style.slabLength / 2,
        yaw,
      });
    }

    const roadMaterial = celMaterial(this.definition.style.roadColor);
    const road = buildInstancedMesh(roadInstances, roadMaterial);
    road.receiveShadow = true;
    this.group.add(road);

    this.addSafetyBarriers();

    const startLine = new THREE.Mesh(
      new THREE.BoxGeometry(
        this.definition.style.startLine.width,
        this.definition.style.startLine.height,
        this.definition.style.startLine.depth,
      ),
      celMaterial(this.definition.style.startLineColor),
    );
    startLine.position.set(
      startPoint.x,
      GROUND_Y + this.definition.style.startLine.height / 2 + 0.001,
      startPoint.z,
    );
    startLine.rotation.y = startYaw;
    startLine.receiveShadow = true;
    this.group.add(startLine);
  }

  private addSafetyBarriers(): void {
    const colors = this.definition.style.barrierColors;
    const sets: InstanceSpec[][] = colors.map(() => []);
    const count = Math.ceil(this.curve.getLength() / 1.8);
    const offsetPoint = (t: number, side: number): THREE.Vector3 => {
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      return point.add(new THREE.Vector3(tangent.z, 0, -tangent.x)
        .normalize().multiplyScalar(side * this.wallOffset));
    };

    for (let index = 0; index < count; index++) {
      for (const side of [-1, 1] as const) {
        if (this.shouldSkipWall((index + 0.5) / count, side)) continue;
        const a = offsetPoint(index / count, side);
        const b = offsetPoint((index + 1) / count, side);
        const block: InstanceSpec = {
          x: (a.x + b.x) / 2,
          y: this.definition.style.wallHeight / 2,
          z: (a.z + b.z) / 2,
          yaw: Math.atan2(b.x - a.x, b.z - a.z),
          sx: this.definition.style.wallThickness,
          sy: this.definition.style.wallHeight,
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
    const height = this.definition.style.mapWallHeight;
    const thickness = this.definition.style.mapWallThickness;
    const width = this.definition.bounds.width + thickness * 2;
    const depth = this.definition.bounds.depth + thickness * 2;
    const y = height / 2;

    const specs: InstanceSpec[] = [
      { x: 0, y, z: -this.definition.bounds.depth / 2, yaw: 0, sx: width, sy: height, sz: thickness },
      { x: 0, y, z: this.definition.bounds.depth / 2, yaw: 0, sx: width, sy: height, sz: thickness },
      {
        x: -this.definition.bounds.width / 2,
        y,
        z: 0,
        yaw: 0,
        sx: thickness,
        sy: height,
        sz: depth,
      },
      {
        x: this.definition.bounds.width / 2,
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

    const material = celMaterial(this.definition.style.mapWallColor);
    this.group.add(buildInstancedMesh(specs, material));
  }

  private addObstacles(): void {
    const curve = this.curve;

    for (const placement of this.definition.obstacles) {
      const point = curve.getPointAt(placement.t);
      const tangent = curve.getTangentAt(placement.t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const x = point.x + rightX * placement.lateral * placement.side;
      const z = point.z + rightZ * placement.lateral * placement.side;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(placement.size, placement.size, placement.size),
        celMaterial(this.definition.style.obstacleColor),
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

  private shouldSkipWall(t: number, side: -1 | 1): boolean {
    // Aberturas para área de escape definidas pela própria pista.
    return this.definition.wallGaps.some(
      (gap) => gap.side === side && t > gap.from && t < gap.to,
    );
  }
}
