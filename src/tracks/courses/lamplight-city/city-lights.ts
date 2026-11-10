import * as THREE from "three";
import { GROUND_Y } from "../../../core/config";
import { VISUAL_QUALITY } from "../../../core/visual-quality";
import { LAMP_ARM, lampBulb, type StreetLamp } from "../../../decor/city/street-lights";
import { celMaterial } from "../../../rendering/cel-shading";
import { glowColor } from "../../../rendering/glow";
import type { TrackLike } from "../../track";
import { lamplightCityLayout, STREET_CORNERS } from "./layout";

const SPACING = 24;
const BARRIER_TOP = lamplightCityLayout.style.wallHeight;

/** Some deck passes above (x, z): a streetlight does not fit there. */
const underDeck = (track: TrackLike, x: number, z: number): boolean =>
  (track.levelAt?.(x, z) ?? 0) > 0.5;

/**
 * Lamps on both sides, alternating every 12 m. On the ground they stand on the sidewalk,
 * behind the barrier; on the overpass, attached to the parapet. Under the deck there are no
 * lamps: the span lights (`underDeckLights`) go there.
 */
export function planStreetLamps(track: TrackLike): StreetLamp[] {
  const lamps: StreetLamp[] = [];
  const count = track.path.length;
  const lap = count * track.pathSpacing;
  const spacing = SPACING * VISUAL_QUALITY.streetLightSpacingScale;
  for (const side of [-1, 1]) {
    for (let distance = side > 0 ? 6 : 6 + spacing / 2; distance < lap; distance += spacing) {
      const index = Math.floor(distance / track.pathSpacing) % count;
      const point = track.path[index];
      const yaw = track.pathYaw(index);
      const level = track.pathLevel?.(index) ?? 0;
      const elevated = level > 0.3;
      const lateral = side * (elevated ? track.wallOffset : track.wallOffset + 1.3);
      const x = point.x + Math.cos(yaw) * lateral;
      const z = point.z - Math.sin(yaw) * lateral;
      const armYaw = Math.atan2(-side * Math.cos(yaw), side * Math.sin(yaw));
      if (!elevated && [0, LAMP_ARM].some((reach) => underDeck(track,
        x + Math.sin(armYaw) * reach, z + Math.cos(armYaw) * reach) ||
        underDeck(track, x + Math.sin(yaw) * 2.5, z + Math.cos(yaw) * 2.5) ||
        underDeck(track, x - Math.sin(yaw) * 2.5, z - Math.cos(yaw) * 2.5))) continue;
      const ahead = track.pathLevel?.((index + 1) % count) ?? 0;
      const behind = track.pathLevel?.((index - 1 + count) % count) ?? 0;
      const pitch = -Math.atan2(ahead - behind, track.pathSpacing * 2);
      // On the overpass the pool of light stays within the deck, without spilling over the edge.
      const poolLateral = side * (elevated ? 3.6 : track.wallOffset + 1.3 - LAMP_ARM);
      lamps.push({
        x, z, yaw: armYaw,
        y: elevated ? level + BARRIER_TOP : 0,
        height: elevated ? 4.4 : 6.2,
        pool: {
          x: point.x + Math.cos(yaw) * poolLateral,
          z: point.z - Math.sin(yaw) * poolLateral,
          y: GROUND_Y + level + 0.02,
          radius: elevated ? 4.5 : 7.2,
          yaw, pitch,
        },
      });
    }
  }
  return lamps;
}

/** Lights under the overpass span, above the start avenue. */
export function underDeckLights(): THREE.Vector3[] {
  const deck = lamplightCityLayout.features?.elevations?.[0].height ?? 0;
  return [-4, 4].map((x) => new THREE.Vector3(x, GROUND_Y + deck - 1.1, 0));
}

/** Real light sources: the lamp lenses and the span lights. */
export function lightSources(lamps: readonly StreetLamp[]): THREE.Vector3[] {
  return [...lamps.map(lampBulb), ...underDeckLights()];
}

/** Traffic lights flashing yellow at the corners: the street is closed for the race. */
export class CornerSignals {
  readonly group = new THREE.Group();
  private readonly amber = new THREE.MeshBasicMaterial({ color: 0x3a2a0c });
  private time = 0;

  constructor(track: TrackLike) {
    this.group.name = "corner-signals";
    this.amber.userData.outlineParameters = { visible: false };
    const metal = celMaterial(0x30343d, 0.002);
    const dark = new THREE.MeshBasicMaterial({ color: 0x1a1414 });
    dark.userData.outlineParameters = { visible: false };
    const count = STREET_CORNERS.length;
    STREET_CORNERS.forEach(([cx, cz], index) => {
      const [px, pz] = STREET_CORNERS[(index - 1 + count) % count];
      const [nx, nz] = STREET_CORNERS[(index + 1) % count];
      const inX = Math.sign(cx - px) || 0;
      const inZ = Math.sign(cz - pz) || 0;
      const outX = Math.sign(nx - cx) || 0;
      const outZ = Math.sign(nz - cz) || 0;
      // Only real corners; the diagonal points out of the turn.
      if (inX * outX + inZ * outZ !== 0) return;
      const ox = inX - outX;
      const oz = inZ - outZ;
      const length = Math.hypot(ox, oz);
      const x = cx + (ox / length) * (track.wallOffset - 1.5);
      const z = cz + (oz / length) * (track.wallOffset - 1.5);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.2, 7), metal);
      pole.position.set(x, 2.6, z);
      const head = new THREE.Group();
      head.position.set(x, 4.6, z);
      head.rotation.y = Math.atan2(-ox, -oz);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.2, 0.36), metal);
      head.add(box);
      [0.36, 0, -0.36].forEach((y, light) => {
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12),
          light === 1 ? this.amber : dark);
        lens.position.set(0, y, 0.185);
        head.add(lens);
      });
      this.group.add(pole, head);
    });
  }

  /** Flashes yellow once per second; steady and lit with reduced motion. */
  update(dt: number, reducedMotion = false): void {
    this.time += dt;
    const on = reducedMotion || this.time % 1.1 < 0.6;
    if (on) glowColor(0xffb020, 2.2, this.amber.color);
    else this.amber.color.setHex(0x3a2a0c);
  }
}
