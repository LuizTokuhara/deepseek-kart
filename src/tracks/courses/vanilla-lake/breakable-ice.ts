import * as THREE from "three";
import { GROUND_Y } from "../../../core/config";
import type { ColliderBox, KartState } from "../../../core/types";
import { celMaterial } from "../../../rendering/cel-shading";
import type { TrackLike } from "../../track";

export const ICE_SPEED_RETAINED = 0.6;
export const ICE_ROWS = [
  { t: 0.658, laterals: [-4, 0] },
  { t: 0.690, laterals: [0, 4] },
  { t: 0.733, laterals: [-4, 0] },
  { t: 0.775, laterals: [0, 4] },
] as const;

interface IceBlock {
  mesh: THREE.Group;
  collider: ColliderBox;
  shards: THREE.Group;
  velocities: THREE.Vector3[];
  age: number;
}

/** One shared state per block: the first kart breaks it for every racer. */
export class BreakableIce {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly blocks: IceBlock[] = [];

  constructor(track: TrackLike) {
    this.group.name = "breakable-ice";
    const geometry = new THREE.BoxGeometry(1.65, 1.65, 1.65);
    const ice = celMaterial(0x67c9e8);
    const frost = celMaterial(0xe5faff);
    const shardGeometry = new THREE.TetrahedronGeometry(0.32);
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xe5faff });
    // Branching fractures on all four sides make these blocks recognizable.
    const fracture = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0.8, 0.834), new THREE.Vector3(-0.12, 0.23, 0.834),
      new THREE.Vector3(-0.12, 0.23, 0.834), new THREE.Vector3(0.2, -0.12, 0.834),
      new THREE.Vector3(0.2, -0.12, 0.834), new THREE.Vector3(0.05, -0.8, 0.834),
      new THREE.Vector3(-0.12, 0.23, 0.834), new THREE.Vector3(0.65, 0.42, 0.834),
    ]);
    for (const row of ICE_ROWS) {
      const sample = row.t * track.path.length;
      const index = Math.floor(sample);
      const a = track.path[index], b = track.path[(index + 1) % track.path.length];
      const yaw = track.pathYaw(index);
      for (const lateral of row.laterals) {
        const x = THREE.MathUtils.lerp(a.x, b.x, sample - index) - Math.cos(yaw) * lateral;
        const z = THREE.MathUtils.lerp(a.z, b.z, sample - index) + Math.sin(yaw) * lateral;
        const y = GROUND_Y + (track.heightAt?.(x, z) ?? 0) + 0.825;
        const mesh = new THREE.Group();
        mesh.name = "breakable-ice-block";
        mesh.position.set(x, y, z);
        mesh.rotation.y = yaw;
        const cube = new THREE.Mesh(geometry, ice);
        cube.castShadow = true;
        cube.receiveShadow = true;
        mesh.add(cube, new THREE.LineSegments(edges, edgeMaterial));
        for (let face = 0; face < 4; face++) {
          const cracks = new THREE.LineSegments(fracture, edgeMaterial);
          cracks.rotation.y = face * Math.PI / 2;
          mesh.add(cracks);
        }
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.055, 1.6), frost);
        cap.position.y = 0.82;
        mesh.add(cap);
        const shards = new THREE.Group();
        shards.name = "ice-shards";
        shards.position.copy(mesh.position);
        shards.visible = false;
        for (let i = 0; i < 12; i++) {
          const shard = new THREE.Mesh(shardGeometry, i % 3 === 0 ? frost : ice);
          shards.add(shard);
        }
        const collider: ColliderBox = {
          center: { x, y, z }, half: { x: 0.825, y: 0.825, z: 0.825 },
          yaw, heightAware: true, enabled: true,
        };
        const block: IceBlock = { mesh, collider, shards, velocities: [], age: 0 };
        collider.onKartContact = (state) => this.breakBlock(block, state);
        this.blocks.push(block);
        this.colliders.push(collider);
        this.group.add(mesh, shards);
      }
    }
  }

  reset(): void {
    for (const block of this.blocks) {
      block.collider.enabled = true;
      block.mesh.visible = true;
      block.shards.visible = false;
      block.age = 0;
    }
  }

  fixedUpdate(dt: number): void {
    for (const block of this.blocks) {
      if (!block.shards.visible) continue;
      block.age += Math.max(0, dt);
      if (block.age >= 0.9) {
        block.shards.visible = false;
        continue;
      }
      block.shards.children.forEach((shard, i) => {
        const velocity = block.velocities[i];
        const t = block.age;
        shard.position.set(velocity.x * t, velocity.y * t - 8 * t * t, velocity.z * t);
        shard.rotation.set(t * (i + 2), t * 4, t * (i % 3 - 1) * 5);
        shard.scale.setScalar(1 - THREE.MathUtils.smoothstep(t, 0.45, 0.9));
      });
    }
  }

  private breakBlock(block: IceBlock, state: KartState): void {
    if (!block.collider.enabled) return;
    block.collider.enabled = false;
    block.mesh.visible = false;
    block.shards.visible = true;
    block.age = 0;
    block.velocities = block.shards.children.map((shard, i) => {
      shard.position.set(0, 0, 0);
      shard.rotation.set(0, 0, 0);
      shard.scale.setScalar(1);
      const angle = i * Math.PI * 2 / 12;
      return new THREE.Vector3(
        Math.cos(angle) * (2 + i % 3) + state.vel.x * 0.1,
        2.5 + (i % 4) * 0.7,
        Math.sin(angle) * (2 + i % 3) + state.vel.z * 0.1,
      );
    });
    state.vel.x *= ICE_SPEED_RETAINED;
    state.vel.z *= ICE_SPEED_RETAINED;
    state.vForward *= ICE_SPEED_RETAINED;
    state.vLateral *= ICE_SPEED_RETAINED;
  }
}
