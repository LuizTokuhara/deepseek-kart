import * as THREE from "three";
import { createPenguin } from "../decor/props/ice-props";
import { createInstancedOutline } from "../rendering/instanced-outline";
import { terrainMaterial } from "../rendering/terrain-material";
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

export interface TrackHazard {
  x: number;
  z: number;
  radius: number;
}

interface InstanceSpec {
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  pitch?: number;
  roll?: number;
}

interface OrientedRect {
  centerX: number;
  centerZ: number;
  halfX: number;
  halfZ: number;
  yaw: number;
}

interface ResolvedRamp {
  x: number;
  z: number;
  yaw: number;
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
  length: number;
  width: number;
  height: number;
}

interface ResolvedHole {
  x: number;
  z: number;
  yaw: number;
  radiusX: number;
  radiusZ: number;
}

// A borda branca é sólida; a abertura começa no raio interno do anel.
const HOLE_OPENING = 0.92;

function buildInstancedMesh(
  instances: InstanceSpec[],
  material: THREE.Material,
  geometry: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1),
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, instances.length));
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const rotation = new THREE.Euler(0, 0, 0, "YXZ");
  const scale = new THREE.Vector3();

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    position.set(instance.x, instance.y, instance.z);
    rotation.set(instance.pitch ?? 0, instance.yaw, instance.roll ?? 0);
    quaternion.setFromEuler(rotation);
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

function smoothStep(from: number, to: number, value: number): number {
  if (from === to) return value >= to ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
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
  readonly hazards?: readonly TrackHazard[];

  nearestPathIndex(
    x: number,
    z: number,
    hint?: number | null,
    window?: number,
  ): number;
  pathYaw(index: number): number;
  pathYawDelta(index: number, ahead: number): number;
  heightAt?(x: number, z: number): number;
  bankAt?(x: number, z: number): number;
  rampLaunchAt?(fromX: number, fromZ: number, toX: number, toZ: number): number;
  holeAt?(x: number, z: number): boolean;
  isOutOfBounds?(x: number, z: number): boolean;
  recoveryPoint?(x: number, z: number): Spawn;
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
  readonly hazards: TrackHazard[] = [];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  readonly width: number;
  readonly wallOffset: number;
  readonly pathSpacing: number;

  private readonly roadRects: OrientedRect[] = [];
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly ramps: ResolvedRamp[] = [];
  private readonly holes: ResolvedHole[] = [];
  private readonly bankRanges = [] as Array<{
    from: number;
    to: number;
    angle: number;
  }>;
  private readonly roadFinish: "asphalt" | "dirt" | "ice";

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
    this.roadFinish =
      definition.surface === "asphalt"
        ? "asphalt"
        : definition.surface === "ice"
          ? "ice"
          : "dirt";

    // O path é construído antes da malha: altura, inclinação, rampas e buracos
    // são derivados dele e compartilhados por física, IA, HUD e cenário.
    const curveLength = this.curve.getLength();
    const pathCount = Math.max(1, Math.ceil(curveLength / definition.sampleStep));
    for (let i = 0; i < pathCount; i++) {
      const point = this.curve.getPointAt(i / pathCount);
      this.path.push({ x: point.x, z: point.z });
    }
    this.pathSpacing = this.path.length > 0 ? curveLength / this.path.length : 1;

    this.resolveFeatures();

    this.addGrass();
    this.addStartAndCurve();
    this.addMapWalls();
    this.addRamps();
    this.addHoles();
    this.addObstacles();

    this.finishLine.x = this.spawn.pos.x;
    this.finishLine.z = this.spawn.pos.z;

    for (const t of definition.checkpointTs) {
      const point = this.curve.getPointAt(t);
      this.checkpoints.push({ x: point.x, z: point.z });
    }

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

  /**
   * Altura relativa ao nível da pista. Curvas inclinadas alteram a altura
   * lateral; rampas somam o perfil do kicker; buracos descem para a água.
   */
  heightAt(x: number, z: number): number {
    let height = this.roadHeightAt(x, z);

    for (const hole of this.holes) {
      if (this.insideHole(x, z, hole)) {
        return -1.8;
      }
    }

    for (const ramp of this.ramps) {
      const dx = x - ramp.x;
      const dz = z - ramp.z;
      const along = dx * ramp.forwardX + dz * ramp.forwardZ;
      const across = dx * ramp.rightX + dz * ramp.rightZ;
      if (
        Math.abs(across) > ramp.width / 2 ||
        along < -ramp.length / 2 ||
        along > ramp.length / 2
      ) {
        continue;
      }
      const progress = (along + ramp.length / 2) / ramp.length;
      // Perfil linear: a inclinação continua positiva até o kicker, então o
      // kart decola em vez de apenas acompanhar o topo arredondado.
      height = Math.max(height, ramp.height * progress);
    }

    return height;
  }

  bankAt(x: number, z: number): number {
    return this.bankAtT(this.roadCoordinates(x, z).t);
  }

  /** Subida extrapolada neste deslocamento, apenas ao cruzar o kicker. */
  rampLaunchAt(fromX: number, fromZ: number, toX: number, toZ: number): number {
    let rise = 0;
    for (const ramp of this.ramps) {
      const from = (fromX - ramp.x) * ramp.forwardX + (fromZ - ramp.z) * ramp.forwardZ;
      const to = (toX - ramp.x) * ramp.forwardX + (toZ - ramp.z) * ramp.forwardZ;
      const lip = ramp.length / 2;
      if (from < -lip || from > lip || to <= lip || to <= from) continue;
      const fraction = (lip - from) / (to - from);
      const x = fromX + (toX - fromX) * fraction;
      const z = fromZ + (toZ - fromZ) * fraction;
      const across = (x - ramp.x) * ramp.rightX + (z - ramp.z) * ramp.rightZ;
      if (Math.abs(across) <= ramp.width / 2) {
        rise = Math.max(rise, (to - from) * ramp.height / ramp.length);
      }
    }
    return rise;
  }

  /** Projeção contínua, sem degraus ao trocar o ponto mais próximo. */
  private roadCoordinates(x: number, z: number): { t: number; lateral: number } {
    const nearest = this.nearestPathIndex(x, z);
    const count = this.path.length;
    let bestDistance = Infinity;
    let t = nearest / count;
    for (const index of [(nearest - 1 + count) % count, nearest]) {
      const a = this.path[index];
      const b = this.path[(index + 1) % count];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const distance = (x - a.x - dx * u) ** 2 + (z - a.z - dz * u) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        t = ((index + u) / count) % 1;
      }
    }
    // Refina na curva real: a projeção na polilinha é só a estimativa inicial.
    // Sem isso, o lado externo salta entre segmentos nas curvas fechadas.
    const length = this.curve.getLength();
    for (let iteration = 0; iteration < 4; iteration++) {
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const correction = ((x - point.x) * tangent.x + (z - point.z) * tangent.z) / length;
      t = ((t + correction) % 1 + 1) % 1;
    }
    const point = this.curve.getPointAt(t);
    const tangent = this.curve.getTangentAt(t).normalize();
    return { t, lateral: -(x - point.x) * tangent.z + (z - point.z) * tangent.x };
  }

  private roadHeightAt(x: number, z: number): number {
    if (this.bankRanges.length === 0) return 0;
    const { t, lateral } = this.roadCoordinates(x, z);
    const corridor = this.wallOffset + 1.4;
    const blend = 1 - smoothStep(corridor, corridor + 6.5, Math.abs(lateral));
    return Math.tan(this.bankAtT(t)) * lateral * blend;
  }

  holeAt(x: number, z: number): boolean {
    return this.holes.some((hole) => this.insideHole(x, z, hole));
  }

  /** Ponto seguro na centerline, alguns metros antes da queda. */
  recoveryPoint(x: number, z: number): Spawn {
    const count = this.path.length;
    if (count === 0) {
      return this.spawn;
    }
    const start = this.nearestPathIndex(x, z);
    for (let back = 4; back <= Math.min(30, count - 1); back++) {
      const index = (start - back + count) % count;
      const point = this.path[index];
      if (this.holeAt(point.x, point.z)) {
        continue;
      }
      // Evita devolver o kart em cima de uma rampa ou de uma curva muito
      // inclinada; o centro da pista deve estar no nível base.
      if (Math.abs(this.heightAt(point.x, point.z)) > 0.2) {
        continue;
      }
      return {
        pos: { x: point.x, z: point.z },
        yaw: this.pathYaw(index),
      };
    }
    return this.spawn;
  }

  private resolveFeatures(): void {
    const features = this.definition.features;
    if (!features) {
      return;
    }

    for (const bank of features.banks ?? []) {
      this.bankRanges.push({
        from: bank.from,
        to: bank.to,
        angle: bank.angle,
      });
    }

    for (const ramp of features.ramps ?? []) {
      const point = this.curve.getPointAt(ramp.t);
      const tangent = this.curve.getTangentAt(ramp.t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      const rightX = -Math.cos(yaw);
      const rightZ = Math.sin(yaw);
      const lateral = ramp.lateral ?? 0;
      this.ramps.push({
        x: point.x + rightX * lateral,
        z: point.z + rightZ * lateral,
        yaw,
        forwardX: Math.sin(yaw),
        forwardZ: Math.cos(yaw),
        rightX,
        rightZ,
        length: ramp.length,
        width: ramp.width,
        height: ramp.height,
      });
    }

    for (const hole of features.holes ?? []) {
      const point = this.curve.getPointAt(hole.t);
      const tangent = this.curve.getTangentAt(hole.t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      const rightX = -Math.cos(yaw);
      const rightZ = Math.sin(yaw);
      const x = point.x + rightX * hole.lateral;
      const z = point.z + rightZ * hole.lateral;
      const resolved: ResolvedHole = {
        x,
        z,
        yaw,
        radiusX: hole.radiusX,
        radiusZ: hole.radiusZ,
      };
      this.holes.push(resolved);
      this.hazards.push({
        x,
        z,
        radius: Math.max(hole.radiusX, hole.radiusZ) + 1.7,
      });
    }
  }

  private bankAtT(t: number): number {
    let angle = 0;
    const wrapped = ((t % 1) + 1) % 1;
    for (const range of this.bankRanges) {
      let from = range.from;
      let to = range.to;
      let local = wrapped;
      if (from > to) {
        // Intervalo que atravessa a costura da volta.
        if (local < to) local += 1;
        to += 1;
      }
      if (local <= from || local >= to) {
        continue;
      }
      const fade = Math.min(0.035, (to - from) * 0.32);
      const enter = smoothStep(from, from + fade, local);
      const exit = 1 - smoothStep(to - fade, to, local);
      angle += range.angle * enter * exit;
    }
    return angle;
  }

  private insideHole(x: number, z: number, hole: ResolvedHole): boolean {
    const local = worldToLocal2D(x - hole.x, z - hole.z, hole.yaw);
    const nx = local.x / (hole.radiusX * HOLE_OPENING);
    const nz = local.z / (hole.radiusZ * HOLE_OPENING);
    return nx * nx + nz * nz <= 1;
  }

  private addGrass(): void {
    // Heightfield em vez de uma caixa plana: assim a neve acompanha a
    // inclinação lateral das curvas e não cobre o lado baixo do gelo.
    const width = this.definition.bounds.width;
    const depth = this.definition.bounds.depth;
    // A malha precisa acompanhar também a transição das curvas: triângulos
    // grandes atravessam o gelo no lado baixo, mesmo com vértices corretos.
    const step = this.bankRanges.length > 0 ? 1 : 3;
    const segmentsX = Math.max(32, Math.ceil(width / step));
    const segmentsZ = Math.max(32, Math.ceil(depth / step));
    const geometry = new THREE.PlaneGeometry(
      width,
      depth,
      segmentsX,
      segmentsZ,
    );
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index++) {
      position.setY(
        index,
        this.terrainHeightAt(position.getX(index), position.getZ(index)),
      );
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    const grass = new THREE.Mesh(
      geometry,
      terrainMaterial(
        this.definition.style.grassColor,
        this.definition.surface === "ice" ? "snow" : "grass",
      ),
    );
    grass.name = "track-ground";
    grass.position.y = 0;
    grass.receiveShadow = true;
    this.group.add(grass);
  }

  /**
   * Altura da neve/grama. Segue a inclinação da pista dentro do corredor e
   * volta suavemente ao nível do terreno alguns metros depois das barreiras.
   */
  private terrainHeightAt(x: number, z: number): number {
    const base = this.definition.surface === "ice" ? GROUND_Y - 0.12 : 0;
    return base + this.roadHeightAt(x, z);
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
        roll: -this.bankAtT(t),
      });

      this.roadRects.push({
        centerX: point.x,
        centerZ: point.z,
        halfX: this.width / 2,
        halfZ: this.definition.style.slabLength / 2,
        yaw,
      });
    }

    const road = this.bankRanges.length > 0 ? this.createBankedRoad() : buildInstancedMesh(
      roadInstances,
      terrainMaterial(this.definition.style.roadColor, this.roadFinish),
    );
    road.receiveShadow = true;
    road.name = "track-road";
    this.group.add(road);

    if (this.definition.surface === "ice") {
      this.addIceEdges(sampleCount);
    }

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

  /** A mesma superfície contínua usada pelo contato das rodas. */
  private createBankedRoad(): THREE.Mesh {
    const segments = Math.ceil(this.curve.getLength() / 0.5);
    const across = Math.ceil(this.width);
    const positions: number[] = [];
    const edges: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      for (let j = 0; j <= across; j++) {
        const lateral = (j / across - 0.5) * this.width;
        const x = point.x - tangent.z * lateral;
        const z = point.z + tangent.x * lateral;
        positions.push(x, GROUND_Y + this.roadHeightAt(x, z), z);
        edges.push(Math.abs(j / across - 0.5) * 2);
        if (i < segments && j < across) {
          const a = i * (across + 1) + j;
          const b = a + across + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.setAttribute("iceEdge", new THREE.Float32BufferAttribute(edges, 1));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, terrainMaterial(this.definition.style.roadColor, this.roadFinish, true));
  }

  /** Faixa azul nas bordas do gelo separa a pista da neve mesmo à distância. */
  private addIceEdges(sampleCount: number): void {
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x5ba9c9 });
    edgeMaterial.userData.outlineParameters = { visible: false };
    const instances: InstanceSpec[] = [];
    const lateral = this.width / 2 - 0.16;

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      const rightX = -Math.cos(yaw);
      const rightZ = Math.sin(yaw);
      const bank = this.bankAtT(t);
      for (const side of [-1, 1]) {
        const offset = lateral * side;
        instances.push({
          x: point.x + rightX * offset,
          y: GROUND_Y + Math.tan(bank) * offset + 0.012,
          z: point.z + rightZ * offset,
          yaw,
          sx: 0.26,
          sy: 0.025,
          sz: this.definition.style.slabLength,
          roll: -bank,
        });
      }
    }

    const mesh = buildInstancedMesh(
      instances,
      edgeMaterial,
      new THREE.BoxGeometry(1, 1, 1),
    );
    mesh.name = "ice-edge-stripes";
    this.group.add(mesh);
  }

  private addSafetyBarriers(): void {
    const colors = this.definition.style.barrierColors;
    const sets: InstanceSpec[][] = colors.map(() => []);
    const count = Math.ceil(this.curve.getLength() / 1.8);
    const offsetPoint = (t: number, side: number): THREE.Vector3 => {
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      const result = point.add(new THREE.Vector3(tangent.z, 0, -tangent.x)
        .normalize().multiplyScalar(side * this.wallOffset));
      result.y = this.heightAt(result.x, result.z);
      return result;
    };

    for (let index = 0; index < count; index++) {
      for (const side of [-1, 1] as const) {
        if (this.shouldSkipWall((index + 0.5) / count, side)) continue;
        const a = offsetPoint(index / count, side);
        const b = offsetPoint((index + 1) / count, side);
        const block: InstanceSpec = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2 + this.definition.style.wallHeight / 2,
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
      this.group.add(mesh, createInstancedOutline(mesh));
    });
  }

  private addRamps(): void {
    const material = terrainMaterial(0xc7ebfb, "ice");
    const edgeMaterial = celMaterial(0xf8feff);
    const chevronMaterial = new THREE.MeshBasicMaterial({ color: 0x3f9fd5 });
    chevronMaterial.userData.outlineParameters = { visible: false };

    for (const ramp of this.ramps) {
      const group = new THREE.Group();
      group.position.set(ramp.x, GROUND_Y, ramp.z);
      group.rotation.y = ramp.yaw;
      this.group.add(group);

      const halfWidth = ramp.width / 2;
      const halfLength = ramp.length / 2;
      const bottom = -0.12;
      const vertices = [
        -halfWidth, 0, -halfLength,
        halfWidth, 0, -halfLength,
        halfWidth, ramp.height, halfLength,
        -halfWidth, ramp.height, halfLength,
        -halfWidth, bottom, -halfLength,
        halfWidth, bottom, -halfLength,
        halfWidth, bottom, halfLength,
        -halfWidth, bottom, halfLength,
      ];
      const indices = [
        0, 3, 2, 0, 2, 1, // topo: normal para cima, perfil igual à física
        0, 4, 7, 0, 7, 3, // lateral esquerda
        1, 2, 6, 1, 6, 5, // lateral direita
        4, 5, 6, 4, 6, 7, // base
        0, 1, 5, 0, 5, 4, // entrada
        3, 7, 6, 3, 6, 2, // testa do kicker
      ];
      const indexed = new THREE.BufferGeometry();
      indexed.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      indexed.setIndex(indices);
      const geometry = indexed.toNonIndexed();
      indexed.dispose();
      geometry.computeVertexNormals();
      const wedge = new THREE.Mesh(geometry, material);
      wedge.name = "ramp-surface";
      wedge.receiveShadow = true;
      group.add(wedge);

      const slope = Math.atan2(ramp.height, ramp.length);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.12, ramp.length),
          edgeMaterial,
        );
        rail.position.set(side * (halfWidth - 0.08), ramp.height / 2 + 0.06, 0);
        rail.rotation.x = -slope;
        group.add(rail);
      }

      for (const progress of [0.38, 0.63, 0.88]) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(ramp.width * 0.7, 0.035, 0.36),
          chevronMaterial,
        );
        stripe.position.set(
          0,
          ramp.height * progress + 0.02,
          -halfLength + ramp.length * progress,
        );
        stripe.rotation.x = -slope;
        group.add(stripe);
      }
    }
  }

  private addHoles(): void {
    const water = new THREE.MeshBasicMaterial({ color: 0x2c6f96 });
    water.userData.outlineParameters = { visible: false };
    const deepWater = new THREE.MeshBasicMaterial({ color: 0x1d5878 });
    deepWater.userData.outlineParameters = { visible: false };
    const rimMaterial = celMaterial(0xe9fbff);
    const shardMaterial = celMaterial(0xb9e7f7);
    const shardGeometry = new THREE.BoxGeometry(0.36, 0.12, 0.7);

    for (const hole of this.holes) {
      const group = new THREE.Group();
      group.position.set(hole.x, GROUND_Y + 0.02, hole.z);
      group.rotation.y = hole.yaw;
      this.group.add(group);

      const deep = new THREE.Mesh(new THREE.CircleGeometry(1, 40), deepWater);
      deep.rotation.x = -Math.PI / 2;
      deep.scale.set(hole.radiusX * 1.08, hole.radiusZ * 1.08, 1);
      group.add(deep);

      const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 40), water);
      surface.rotation.x = -Math.PI / 2;
      surface.scale.set(hole.radiusX, hole.radiusZ, 1);
      surface.position.y = 0.008;
      group.add(surface);

      const highlight = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({ color: 0x5faac7, transparent: true, opacity: 0.75 }),
      );
      highlight.rotation.x = -Math.PI / 2;
      highlight.scale.set(hole.radiusX * 0.55, hole.radiusZ * 0.42, 1);
      highlight.position.set(-hole.radiusX * 0.18, 0.012, -hole.radiusZ * 0.2);
      group.add(highlight);

      const rim = new THREE.Mesh(new THREE.RingGeometry(HOLE_OPENING, 1.1, 40), rimMaterial);
      rim.rotation.x = -Math.PI / 2;
      rim.scale.set(hole.radiusX, hole.radiusZ, 1);
      rim.position.y = 0.018;
      group.add(rim);

      for (let index = 0; index < 9; index++) {
        const angle = (index / 9) * Math.PI * 2 + index * 0.17;
        const shard = new THREE.Mesh(shardGeometry, shardMaterial);
        shard.position.set(
          Math.cos(angle) * hole.radiusX * 0.98,
          0.03 + (index % 3) * 0.015,
          Math.sin(angle) * hole.radiusZ * 0.98,
        );
        shard.rotation.set(
          (index % 2 ? 1 : -1) * 0.2,
          angle + 0.3,
          (index % 3 ? 1 : -1) * 0.12,
        );
        shard.scale.setScalar(0.7 + (index % 4) * 0.12);
        group.add(shard);
      }
    }
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
      const ground = this.heightAt(x, z);

      const mesh = placement.shape === "penguin" ? createPenguin() : new THREE.Mesh(
        placement.shape === "rock"
          ? new THREE.DodecahedronGeometry(placement.size * 0.53, 0)
          : placement.shape === "ice"
            ? new RoundedBoxGeometry(placement.size, placement.size, placement.size, 1, 0.12)
            : new THREE.BoxGeometry(placement.size, placement.size, placement.size),
        celMaterial(this.definition.style.obstacleColor),
      );
      if (placement.shape === "penguin") mesh.scale.setScalar(placement.size / 1.4);
      mesh.name = `track-obstacle-${placement.shape ?? "box"}`;
      mesh.position.set(x, GROUND_Y + ground + (placement.shape === "penguin" ? 0 : placement.size / 2), z);
      mesh.rotation.y = yaw;
      this.group.add(mesh);

      this.colliders.push({
        center: { x, y: ground + placement.size / 2, z },
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
