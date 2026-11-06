import * as THREE from "three";
import { createPenguin } from "../../../decor/props/ice-props";
import { celMaterial } from "../../../rendering/cel-shading";
import { GROUND_Y } from "../../../core/config";
import type { ColliderBox, MovingObstacle } from "../../../core/types";
import type { TrackLike } from "../../track";

export const PENGUIN_TIMING = { wait: 4, warning: 1.5, crossing: 6.5 } as const;
export const PENGUIN_CROSSINGS = [
  { t: 0.355, scale: 1.0, delay: 0 },
  { t: 0.385, scale: 0.9, delay: 1.2 },
  { t: 0.414, scale: 1.07, delay: 2.4 },
] as const;

type CrossingPhase = "waiting" | "warning" | "crossing";

interface Walker {
  root: THREE.Group;
  model: THREE.Group;
  collider: ColliderBox;
  obstacle: MovingObstacle;
  lights: THREE.MeshBasicMaterial[];
  center: { x: number; z: number };
  right: { x: number; z: number };
  scale: number;
  delay: number;
  phase: CrossingPhase;
}

/** Relógio de corrida determinístico; visual, colisão e IA usam a mesma posição. */
export class PenguinCrossing {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  readonly movingObstacles: MovingObstacle[] = [];
  private readonly walkers: Walker[] = [];
  private elapsed = 0;

  constructor(private readonly track: TrackLike) {
    this.group.name = "penguin-crossings";
    for (const placement of PENGUIN_CROSSINGS) {
      const sample = placement.t * track.path.length;
      const index = Math.floor(sample);
      const a = track.path[index], b = track.path[(index + 1) % track.path.length];
      const fraction = sample - index;
      const center = { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction };
      const yaw = track.pathYaw(index);
      const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
      const root = new THREE.Group();
      root.name = "crossing-penguin";
      const model = createPenguin();
      model.scale.setScalar(placement.scale);
      root.add(model);
      this.group.add(root);
      const collider: ColliderBox = {
        center: { x: 0, y: 0, z: 0 },
        half: { x: 0.53 * placement.scale, y: 0.7 * placement.scale, z: 0.43 * placement.scale },
        yaw: 0,
        heightAware: true,
      };
      const obstacle: MovingObstacle = { x: 0, z: 0, radius: 0.65 * placement.scale, vx: 0, vz: 0 };
      const lights: THREE.MeshBasicMaterial[] = [];
      for (const side of [-1, 1]) {
        const x = center.x + right.x * side * (track.wallOffset + 1);
        const z = center.z + right.z * side * (track.wallOffset + 1);
        const sign = this.createWarningSign(lights);
        sign.position.set(x, GROUND_Y + (track.heightAt?.(x, z) ?? 0), z);
        sign.rotation.y = yaw + Math.PI;
        this.group.add(sign);
      }
      this.walkers.push({ root, model, collider, obstacle, lights, center, right,
        scale: placement.scale, delay: placement.delay, phase: "waiting" });
      this.colliders.push(collider);
      this.movingObstacles.push(obstacle);
    }
    this.reset();
  }

  get phases(): readonly CrossingPhase[] {
    return this.walkers.map((walker) => walker.phase);
  }

  reset(): void {
    this.elapsed = 0;
    this.placeWalkers();
  }

  fixedUpdate(dt: number): void {
    this.elapsed += Math.max(0, dt);
    this.placeWalkers();
  }

  private placeWalkers(): void {
    const { wait, warning, crossing } = PENGUIN_TIMING;
    const legDuration = wait + warning + crossing;
    const edge = this.track.width / 2 - 0.7;
    for (const walker of this.walkers) {
      const age = Math.max(0, this.elapsed - walker.delay);
      const local = age % (legDuration * 2);
      const direction = local < legDuration ? 1 : -1;
      const legTime = local % legDuration;
      const progress = THREE.MathUtils.clamp((legTime - wait - warning) / crossing, 0, 1);
      const lateral = direction * (-edge + edge * 2 * progress);
      walker.phase = legTime < wait ? "waiting" : legTime < wait + warning ? "warning" : "crossing";
      const x = walker.center.x + walker.right.x * lateral;
      const z = walker.center.z + walker.right.z * lateral;
      const height = GROUND_Y + (this.track.heightAt?.(x, z) ?? 0);
      const turn = age >= legDuration ? Math.PI * (1 - THREE.MathUtils.smoothstep(legTime, 0, 1)) : 0;
      const yaw = Math.atan2(walker.right.x * direction, walker.right.z * direction) + turn;
      walker.root.position.set(x, height, z);
      walker.root.rotation.y = yaw;
      const walking = walker.phase === "crossing";
      const anticipation = walker.phase === "warning";
      const stride = Math.sin(age * 10);
      walker.model.rotation.z = walking ? stride * 0.09 : anticipation ? Math.sin(age * 6) * 0.045 : 0;
      walker.model.position.y = walking ? Math.abs(stride) * 0.035 : 0;
      walker.root.userData.phase = walker.phase;
      Object.assign(walker.collider.center, { x, y: height + walker.collider.half.y, z });
      walker.collider.yaw = yaw;
      walker.obstacle.x = x;
      walker.obstacle.z = z;
      const speed = walking ? direction * edge * 2 / crossing : 0;
      walker.obstacle.vx = walker.right.x * speed;
      walker.obstacle.vz = walker.right.z * speed;
      for (const light of walker.lights) light.color.setHex(anticipation || walking ? 0xffc64b : 0x475866);
    }
  }

  private createWarningSign(lights: THREE.MeshBasicMaterial[]): THREE.Group {
    const sign = new THREE.Group();
    sign.name = "penguin-crossing-warning";
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.4, 6), celMaterial(0x49738b));
    pole.position.y = 1.2;
    sign.add(pole);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.1), celMaterial(0xffd165));
    plate.position.y = 2.15;
    plate.rotation.z = Math.PI / 4;
    sign.add(plate);
    const dark = new THREE.MeshBasicMaterial({ color: 0x244866 });
    dark.userData.outlineParameters = { visible: false };
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 7), dark);
    body.position.set(0, 2.13, 0.08);
    body.scale.set(0.75, 1.1, 0.12);
    sign.add(body);
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.13, 10), dark);
    head.position.set(0, 2.43, 0.08);
    sign.add(head);
    const material = new THREE.MeshBasicMaterial({ color: 0x475866 });
    material.userData.outlineParameters = { visible: false };
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 7), material);
    light.position.y = 3.04;
    sign.add(light);
    lights.push(material);
    return sign;
  }
}
