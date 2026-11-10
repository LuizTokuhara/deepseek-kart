import * as THREE from "three";
import { createPenguin } from "../decor/props/ice-props";
import { createInstancedOutline } from "../rendering/instanced-outline";
import { terrainMaterial, type TerrainFinish } from "../rendering/terrain-material";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  BARRIER_BLOCK_LENGTH,
  safetyBarrierGeometry,
  safetyBarrierMaterial,
} from "../decor/race/safety-barrier";
import { GROUND_Y } from "../core/config";
import { worldToLocal2D } from "../core/math";
import { celMaterial } from "../rendering/cel-shading";
import type { TrackDefinition } from "./definition";
import { ElevationProfile, LEVEL_EPSILON, pickLevel } from "./elevation";
import { GroundShape } from "./relief";
import { buildViaduct, DEFAULT_VIADUCT_COLORS } from "./viaduct";
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
  surface: Surface;
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

// The white edge is solid; the opening starts at the inner radius of the ring.
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
 * Minimal contract consumed by items, AI, scenery, HUD, and collision.
 * A second track only needs to produce this data; it does not need to be the
 * `Track` class or share the Deepseek Raceway layout.
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
  /**
   * Surface height at (x, z). With an overpass, `reference` (the current height of
   * the caller) chooses between the deck and the road below; without it,
   * the highest surface wins.
   */
  heightAt?(x: number, z: number, reference?: number): number;
  /** Height of the elevated deck on which something supported at `reference` rests; 0 on the ground. */
  levelAt?(x: number, z: number, reference?: number): number;
  /** Deck height at centerline point `index` (0 outside overpasses). */
  pathLevel?(index: number): number;
  /** Visual ground height (including relief and skirt), for placing scenery. */
  groundHeightAt?(x: number, z: number): number;
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
  private readonly roadFinish: TerrainFinish;
  private readonly ground: GroundShape;
  private readonly elevation: ElevationProfile;

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
          : definition.surface === "sand"
            ? "sand"
            : definition.surface === "stone"
              ? "stone"
              : "dirt";

    // The path is built before the mesh: height, bank, ramps, and holes
    // are derived from it and shared by physics, AI, HUD, and scenery.
    const curveLength = this.curve.getLength();
    const pathCount = Math.max(1, Math.ceil(curveLength / definition.sampleStep));
    for (let i = 0; i < pathCount; i++) {
      const point = this.curve.getPointAt(i / pathCount);
      this.path.push({ x: point.x, z: point.z });
    }
    this.pathSpacing = this.path.length > 0 ? curveLength / this.path.length : 1;
    this.ground = new GroundShape(this.path, this.bounds, definition.style.relief,
      definition.style.skirt);
    // Deck up to the outer face of the parapet; clear span where the track passes below.
    this.elevation = new ElevationProfile(this.curve, this.path,
      definition.features?.elevations ?? [],
      this.wallOffset + definition.style.wallThickness / 2, this.wallOffset + 3.5);

    this.resolveFeatures();

    this.addGrass();
    this.addStartAndCurve();
    this.addSurfaceOverlays();
    this.addMapWalls();
    if (this.elevation.active) {
      this.group.add(buildViaduct(this.curve, this.elevation, this.width / 2,
        definition.style.viaduct ?? DEFAULT_VIADUCT_COLORS));
    }
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
   * Index of the nearest centerline point. With `hint`, it searches only
   * in a local window so the AI does not "jump" to another part of the track.
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

  /** Yaw variation between the current point and a point ahead on the centerline. */
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
        return rect.surface;
      }
    }
    return this.definition.offroadSurface ?? "grass";
  }

  /** Track surface at a normalized position along the course. */
  surfaceAtT(t: number): Surface {
    const wrapped = ((t % 1) + 1) % 1;
    for (const zone of this.definition.surfaceZones ?? []) {
      if (zone.from <= zone.to) {
        if (wrapped >= zone.from && wrapped <= zone.to) return zone.surface;
      } else if (wrapped >= zone.from || wrapped <= zone.to) {
        // Band that crosses the lap seam.
        return zone.surface;
      }
    }
    return this.definition.surface;
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
   * Height relative to the track level. Banked turns change the lateral
   * height; ramps add the kicker profile; holes descend to the water.
   */
  heightAt(x: number, z: number, reference?: number): number {
    let height = this.levelHeightAt(x, z, reference);

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
      // Linear profile: the slope stays positive up to the kicker, so the
      // kart takes off instead of merely following the rounded top.
      height = Math.max(height, ramp.height * progress);
    }

    return height;
  }

  bankAt(x: number, z: number): number {
    return this.bankAtT(this.roadCoordinates(x, z).t);
  }

  levelAt(x: number, z: number, reference?: number): number {
    if (!this.elevation.active) return 0;
    return pickLevel([0, ...this.elevation.decksAt(x, z).map((deck) => deck.height)], reference);
  }

  pathLevel(index: number): number {
    return this.elevation.at(index / Math.max(1, this.path.length));
  }

  /** Ground-level road (with bank) or elevated deck, depending on the level. */
  private levelHeightAt(x: number, z: number, reference?: number): number {
    const ground = this.roadHeightAt(x, z);
    if (!this.elevation.active) return ground;
    const decks = this.elevation.decksAt(x, z).map((deck) =>
      deck.height + Math.tan(this.bankAtT(deck.t)) * deck.lateral);
    return pickLevel([ground, ...decks], reference);
  }

  /** Extrapolated rise over this displacement, only when crossing the kicker. */
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

  /** Continuous projection, with no steps when switching to the nearest point. */
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
    // Refine on the actual curve: the polyline projection is only the initial estimate.
    // Without this, the outside edge jumps between segments on tight turns.
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

  /** Safe point on the centerline, a few meters before the fall. */
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
      // Avoids returning the kart on top of a ramp or a very steep
      // banked turn; the center of the track should be at the base level.
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
        // Interval that crosses the lap seam.
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
    // Heightfield instead of a flat box: this way the snow follows the
    // lateral bank of the turns and does not cover the low side of the ice.
    const width = this.definition.bounds.width;
    const depth = this.definition.bounds.depth;
    // The mesh must also follow the turn transitions: large
    // triangles cross the ice on the low side, even with correct vertices.
    const step = this.bankRanges.length > 0 ? 1 : 3;
    const xs = this.ground.gridLines(-width / 2, width / 2, Math.max(32, Math.ceil(width / step)));
    const zs = this.ground.gridLines(-depth / 2, depth / 2, Math.max(32, Math.ceil(depth / step)));
    const geometry = gridGeometry(xs, zs, (x, z) => this.groundHeightAt(x, z));

    const groundFinish =
      this.definition.style.groundFinish ??
      (this.definition.surface === "ice"
        ? "snow"
        : this.definition.offroadSurface === "sand"
          ? "sand"
          : "grass");
    const grass = new THREE.Mesh(
      geometry,
      terrainMaterial(
        this.definition.style.grassColor, groundFinish, undefined, this.definition.style.wet,
      ),
    );
    grass.name = "track-ground";
    grass.position.y = 0;
    grass.receiveShadow = true;
    this.group.add(grass);
  }

  /** Visual ground height: base terrain, relief outside the corridor, and skirt. */
  groundHeightAt(x: number, z: number): number {
    return this.terrainHeightAt(x, z) + this.ground.offsetAt(x, z);
  }

  /**
   * Snow/grass height. Follows the track bank inside the corridor and
   * returns smoothly to the terrain level a few meters past the barriers.
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
    // Starting slightly after the beginning of the turn avoids the sloped tangent at the junction.
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

      // A small height variation avoids z-fighting between overlapping slabs.
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
        surface: this.surfaceAtT(t),
      });
    }

    const continuous = this.bankRanges.length > 0 || this.elevation.active;
    const road = continuous ? this.createBankedRoad() : buildInstancedMesh(
      roadInstances,
      terrainMaterial(this.definition.style.roadColor, this.roadFinish, {
        source: "slab",
        halfWidth: this.width / 2,
      }, this.definition.style.wet),
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

  /**
   * Special floor strips are drawn on top of the slabs, following the
   * same height and bank as the physics. The tunnel stone is the first of them.
   */
  private addSurfaceOverlays(): void {
    const finishes: Partial<Record<Surface, { color: number; finish: "stone" }>> = {
      stone: { color: 0xa9824f, finish: "stone" },
    };

    for (const zone of this.definition.surfaceZones ?? []) {
      const style = finishes[zone.surface];
      if (!style) continue;
      const from = Math.min(zone.from, zone.to);
      const to = Math.max(zone.from, zone.to);
      const length = this.curve.getLength() * (to - from);
      const segments = Math.max(2, Math.ceil(length / 0.8));
      const across = Math.max(2, Math.ceil(this.width));
      const positions: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i <= segments; i++) {
        const t = from + (to - from) * (i / segments);
        const point = this.curve.getPointAt(t);
        const tangent = this.curve.getTangentAt(t).normalize();
        for (let j = 0; j <= across; j++) {
          const lateral = (j / across - 0.5) * this.width;
          const x = point.x - tangent.z * lateral;
          const z = point.z + tangent.x * lateral;
          positions.push(x, GROUND_Y + this.heightAt(x, z, this.elevation.at(t)) + 0.012, z);
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
      geometry.computeVertexNormals();
      const strip = new THREE.Mesh(geometry, terrainMaterial(style.color, style.finish));
      strip.name = `${zone.surface}-road-overlay`;
      strip.receiveShadow = true;
      this.group.add(strip);
    }
  }

  /** The same continuous surface used by the wheel contact. */
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
        positions.push(x, GROUND_Y + this.roadHeightAt(x, z) + this.elevation.at(t), z);
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
    geometry.setAttribute("roadEdge", new THREE.Float32BufferAttribute(edges, 1));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, terrainMaterial(this.definition.style.roadColor, this.roadFinish, {
      source: "mesh",
      halfWidth: this.width / 2,
    }, this.definition.style.wet));
  }

  /** Blue stripe on the ice edges separates the track from the snow even at a distance. */
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
      result.y = this.heightAt(result.x, result.z, this.elevation.at(t));
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
        // The block is modeled at its real size; only its length stretches.
        sets[Math.floor(index / 3) % colors.length].push({
          ...block, sx: 1, sy: 1, sz: block.sz / BARRIER_BLOCK_LENGTH,
        });
        this.colliders.push(this.barrierCollider(block, this.elevation.at((index + 0.5) / count)));
      }
    }
    const { wallThickness, wallHeight } = this.definition.style;
    const geometry = safetyBarrierGeometry(wallThickness, wallHeight);
    sets.forEach((instances, index) => {
      const mesh = buildInstancedMesh(
        instances, safetyBarrierMaterial(colors[index], wallHeight), geometry,
      );
      mesh.name = "colored-safety-barriers";
      mesh.receiveShadow = true;
      this.group.add(mesh, createInstancedOutline(mesh));
    });
  }

  /**
   * With an overpass, the ground barriers do not block those on the deck; the
   * clear-span parapets exist only at the top, and those of the embankment descend to the ground.
   */
  private barrierCollider(block: InstanceSpec, level: number): ColliderBox {
    const center = { x: block.x, y: block.y, z: block.z };
    const half = { x: block.sx / 2, y: block.sy / 2, z: block.sz / 2 };
    if (!this.elevation.active) return { center, half, yaw: block.yaw };
    if (level < LEVEL_EPSILON) return { center, half, yaw: block.yaw, heightAware: true };
    if (this.elevation.openBelow(block.x, block.z)) return { center, half, yaw: block.yaw };
    const top = block.y + block.sy / 2;
    return { center: { ...center, y: top / 2 }, half: { ...half, y: top / 2 }, yaw: block.yaw };
  }

  private addRamps(): void {
    const style = this.definition.style.rampStyle ?? {
      color: 0xc7ebfb,
      finish: "ice" as const,
      edgeColor: 0xf8feff,
      chevronColor: 0x3f9fd5,
    };
    const material = terrainMaterial(style.color, style.finish);
    const edgeMaterial = celMaterial(style.edgeColor);
    const chevronMaterial = new THREE.MeshBasicMaterial({ color: style.chevronColor });
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
        0, 3, 2, 0, 2, 1, // top: normal pointing up, profile matching the physics
        0, 4, 7, 0, 7, 3, // left side
        1, 2, 6, 1, 6, 5, // right side
        4, 5, 6, 4, 6, 7, // base
        0, 1, 5, 0, 5, 4, // entry
        3, 7, 6, 3, 6, 2, // kicker face
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

    // With no visible wall, the ground continues to the skirt; the collision remains.
    if (this.definition.style.mapWallVisible === false) return;
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
    // Runoff area openings defined by the track itself.
    return this.definition.wallGaps.some(
      (gap) => gap.side === side && t > gap.from && t < gap.to,
    );
  }
}

/**
 * Ground mesh on a rectilinear grid (`xs` × `zs` lines, increasing), with the
 * same triangulation as the laid-down `PlaneGeometry` it replaces.
 */
function gridGeometry(
  xs: readonly number[],
  zs: readonly number[],
  heightAt: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const positions = new Float32Array(xs.length * zs.length * 3);
  let offset = 0;
  for (const z of zs) {
    for (const x of xs) {
      positions[offset++] = x;
      positions[offset++] = heightAt(x, z);
      positions[offset++] = z;
    }
  }
  const indices: number[] = [];
  const row = xs.length;
  for (let iz = 0; iz < zs.length - 1; iz++) {
    for (let ix = 0; ix < xs.length - 1; ix++) {
      const a = ix + row * iz;
      const b = ix + row * (iz + 1);
      const c = ix + 1 + row * (iz + 1);
      const d = ix + 1 + row * iz;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
