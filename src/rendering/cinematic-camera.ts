import * as THREE from "three";
import { CINEMATIC, GROUND_Y } from "../core/config";
import { damp, lerpAngle } from "../core/math";
import type { TrackLike } from "../tracks/track";

/** Render-interpolated pose of one kart, as the director frames it. */
export interface CinematicSubject {
  x: number;
  /** Height of the kart above GROUND_Y. */
  y: number;
  z: number;
  yaw: number;
}

export type ShotKind = "grid" | "trackside" | "chase" | "front" | "wheel" | "helicopter";

/** Shallow-focus lens for the post pipeline; distances in meters. */
export interface LensFocus {
  /** Distance of the focal plane along the view direction. */
  distance: number;
  /** How far from the focal plane things go fully out of focus. */
  range: number;
  /** Artistic bokeh size; 0 keeps everything sharp. */
  bokeh: number;
}

interface Shot {
  readonly kind: ShotKind;
  /** Race position framed by the shot, 1 = leader. */
  readonly rank: number;
  readonly duration: number;
  readonly fov: number;
  /** Lens: long lenses get a narrow focus band and bigger bokeh. */
  readonly range: number;
  readonly bokeh: number;
}

/** Racing shots after the grid shot, cycled in order. */
const SEQUENCE: readonly Shot[] = [
  { kind: "trackside", rank: 1, duration: 4.2, fov: 34, range: 12, bokeh: 2.2 },
  { kind: "chase", rank: 2, duration: 3.8, fov: 64, range: 12, bokeh: 1.3 },
  { kind: "front", rank: 1, duration: 3.6, fov: 48, range: 9, bokeh: 1.8 },
  { kind: "wheel", rank: 3, duration: 3.2, fov: 72, range: 6, bokeh: 1.8 },
  { kind: "helicopter", rank: 1, duration: 4.6, fov: 52, range: 22, bokeh: 1.1 },
  { kind: "trackside", rank: 4, duration: 4.0, fov: 38, range: 12, bokeh: 2 },
  { kind: "chase", rank: 1, duration: 3.6, fov: 64, range: 12, bokeh: 1.3 },
];

/** Closest focal plane, in meters. */
const MIN_FOCUS_DISTANCE = 1;

const GRID_SHOT = { kind: "grid", rank: 1, fov: 44, range: 12, bokeh: 1.6 } as const;

/**
 * Attract-mode director: cuts between broadcast-style angles of a CPU-only
 * race. Render-only; it reads interpolated kart poses and never touches the
 * simulation.
 */
export class CinematicCamera {
  private shot: Shot = { ...GRID_SHOT, duration: CINEMATIC.gridShot };
  private shotIndex = -1;
  private shotTime = 0;
  private trackside = 0;
  private smoothedYaw = 0;
  private readonly anchor = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly focusPoint = new THREE.Vector3();
  /** Focus on the framed kart, refreshed by every `update`. */
  readonly lens: LensFocus = { distance: 10, range: GRID_SHOT.range, bokeh: GRID_SHOT.bokeh };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly track: TrackLike,
  ) {}

  get shotKind(): ShotKind {
    return this.shot.kind;
  }

  /** Opens on the starting grid; racing shots follow once the lights go out. */
  start(): void {
    this.shot = { ...GRID_SHOT, duration: CINEMATIC.gridShot };
    this.shotIndex = -1;
    this.shotTime = 0;
    this.trackside = 0;
  }

  /** `subjects` must be ordered by race position, leader first. */
  update(dt: number, subjects: readonly CinematicSubject[]): void {
    this.shotTime += dt;
    let cut = false;
    const shotOver =
      this.shotTime >= this.shot.duration ||
      (this.shot.kind === "grid" && this.fieldPassedGridCamera(subjects));
    if (shotOver && subjects.length > 0) {
      this.shotIndex = (this.shotIndex + 1) % SEQUENCE.length;
      this.shot = SEQUENCE[this.shotIndex];
      this.shotTime = 0;
      cut = true;
    }

    if (this.shot.kind === "grid" || subjects.length === 0) {
      this.poseGrid();
      // Focus on the middle of the grid, not on the empty road ahead of it.
      const { pos } = this.track.spawn;
      this.focusOn(this.focusPoint.set(pos.x, GROUND_Y + this.surfaceAt(pos.x, pos.z) + 0.5, pos.z));
    } else {
      const subject = subjects[Math.min(this.shot.rank, subjects.length) - 1];
      if (cut) this.cutTo(subject);
      this.poseRacing(dt, subject, cut);
      this.focusOn(this.focusPoint.set(subject.x, GROUND_Y + subject.y + 0.5, subject.z));
    }

    if (Math.abs(this.camera.fov - this.shot.fov) > 0.0001) {
      this.camera.fov = this.shot.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private cutTo(subject: CinematicSubject): void {
    this.smoothedYaw = subject.yaw;
    if (this.shot.kind === "trackside") {
      // Stand beside the road ahead of the subject, alternating sides.
      this.trackside++;
      const count = this.track.path.length;
      const from = this.track.nearestPathIndex(subject.x, subject.z);
      const ahead = Math.round(CINEMATIC.tracksideAhead / Math.max(1, this.track.pathSpacing));
      const index = (from + ahead) % count;
      const point = this.track.path[index];
      const yaw = this.track.pathYaw(index);
      const side = this.trackside % 2 === 0 ? 1 : -1;
      const lateral = side * (this.track.width / 2 + this.track.wallOffset) / 2;
      const x = point.x - Math.cos(yaw) * lateral;
      const z = point.z + Math.sin(yaw) * lateral;
      this.anchor.set(x, GROUND_Y + this.surfaceAt(x, z) + CINEMATIC.tracksideHeight, z);
    }
  }

  private poseRacing(dt: number, subject: CinematicSubject, cut: boolean): void {
    const kind = this.shot.kind;
    this.smoothedYaw = lerpAngle(
      this.smoothedYaw,
      subject.yaw,
      1 - Math.exp(-(kind === "wheel" ? 12 : 4) * dt),
    );
    const forwardX = Math.sin(this.smoothedYaw);
    const forwardZ = Math.cos(this.smoothedYaw);
    const rightX = -Math.cos(this.smoothedYaw);
    const rightZ = Math.sin(this.smoothedYaw);
    const baseY = GROUND_Y + subject.y;
    const position = this.camera.position;

    switch (kind) {
      case "trackside":
        position.copy(this.anchor);
        this.target.set(subject.x, baseY + 0.6, subject.z);
        break;
      case "chase":
        position.set(subject.x - forwardX * 5.2, baseY + 1.5, subject.z - forwardZ * 5.2);
        this.target.set(subject.x + forwardX * 5, baseY + 0.7, subject.z + forwardZ * 5);
        break;
      case "front":
        // Ahead of the subject, looking back at it and the pursuers.
        position.set(
          subject.x + forwardX * 7.5 + rightX * 1.2,
          baseY + 1.4,
          subject.z + forwardZ * 7.5 + rightZ * 1.2,
        );
        this.target.set(subject.x - forwardX * 3, baseY + 0.6, subject.z - forwardZ * 3);
        break;
      case "wheel":
        position.set(
          subject.x + rightX * 1.25 - forwardX * 0.2,
          baseY + 0.42,
          subject.z + rightZ * 1.25 - forwardZ * 0.2,
        );
        this.target.set(subject.x + forwardX * 12, baseY + 0.5, subject.z + forwardZ * 12);
        break;
      case "helicopter": {
        const angle = this.smoothedYaw + Math.PI * 0.78 + this.shotTime * 0.22;
        position.set(
          subject.x + Math.sin(angle) * 16,
          baseY + 11,
          subject.z + Math.cos(angle) * 16,
        );
        this.target.set(subject.x, baseY + 0.5, subject.z);
        break;
      }
      default:
        break;
    }

    // The trackside operator pans after the kart; mounted cameras stay locked on.
    if (cut || kind !== "trackside") {
      this.look.copy(this.target);
    } else {
      this.look.set(
        damp(this.look.x, this.target.x, 7, dt),
        damp(this.look.y, this.target.y, 7, dt),
        damp(this.look.z, this.target.z, 7, dt),
      );
    }
    this.camera.lookAt(this.look);
  }

  /** Cuts away as soon as the last kart has driven past the grid camera. */
  private fieldPassedGridCamera(subjects: readonly CinematicSubject[]): boolean {
    const last = subjects[subjects.length - 1];
    if (!last) return false;
    const { pos, yaw } = this.track.spawn;
    const ahead = (last.x - pos.x) * Math.sin(yaw) + (last.z - pos.z) * Math.cos(yaw);
    return ahead > this.gridCameraAhead() + CINEMATIC.gridCutPast;
  }

  /** Distance of the grid camera ahead of the spawn; it dollies toward the grid. */
  private gridCameraAhead(): number {
    return CINEMATIC.gridCameraAhead - Math.min(this.shotTime, this.shot.duration) * 0.5;
  }

  /** Low shot in front of the grid; the field launches past it at GO. */
  private poseGrid(): void {
    const { pos, yaw } = this.track.spawn;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = -Math.cos(yaw);
    const rightZ = Math.sin(yaw);
    const ahead = this.gridCameraAhead();
    const x = pos.x + forwardX * ahead - rightX * 6.5;
    const z = pos.z + forwardZ * ahead - rightZ * 6.5;
    this.camera.position.set(x, GROUND_Y + this.surfaceAt(x, z) + 1.6, z);
    const lookX = pos.x + forwardX * 4.5;
    const lookZ = pos.z + forwardZ * 4.5;
    this.look.set(lookX, GROUND_Y + this.surfaceAt(lookX, lookZ) + 0.6, lookZ);
    this.camera.lookAt(this.look);
  }

  /** Puts the focal plane through `point`, measured along the view direction. */
  private focusOn(point: THREE.Vector3): void {
    // lookAt just turned the camera; refresh its matrix so a cut focuses at once.
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.forward);
    const { x, y, z } = this.camera.position;
    const depth =
      this.forward.x * (point.x - x) + this.forward.y * (point.y - y) + this.forward.z * (point.z - z);
    // The wheel camera rides beside its kart: focus on the bodywork in view.
    this.lens.distance = Math.max(MIN_FOCUS_DISTANCE, depth);
    this.lens.range = this.shot.range;
    this.lens.bokeh = this.shot.bokeh;
  }

  private surfaceAt(x: number, z: number): number {
    return this.track.heightAt?.(x, z) ?? 0;
  }
}
