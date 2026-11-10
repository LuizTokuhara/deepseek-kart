import * as THREE from "three";
import type { ColliderBox } from "../../../core/types";
import { RaceDecor, type Decoration, type DecorationFrame } from "../../../decor";
import { buildBuildings, type BuildingLot } from "../../../decor/city/buildings";
import {
  createStreetLamps,
  LAMP_COLOR,
  lampBulb,
  LightRig,
  type StreetLamp,
} from "../../../decor/city/street-lights";
import { mergeStaticDecoration } from "../../../decor/merge-static";
import { createGroundCover } from "../../../decor/nature/ground-cover";
import { neonSignMaterial } from "../../../decor/props/signs";
import { createRoadMarkings } from "../../../decor/race/road-markings";
import { celMaterial } from "../../../rendering/cel-shading";
import { glowColor } from "../../../rendering/glow";
import { createWetReflections, type ReflectedLight } from "../../../rendering/wet-reflections";
import { GROUND_Y } from "../../../core/config";
import type { TrackLike } from "../../track";
import { CornerSignals, lightSources, planStreetLamps, underDeckLights } from "./city-lights";
import { planCity, planSkyline } from "./city-plan";
import { createOverpassDressing } from "./overpass";
import { createParks, LAWN_COLOR, onLawn } from "./parks";

const SHOP_NAMES = ["PIZZA", "NOODLES", "DINER", "BOOKS", "24/7", "CAFE", "RECORDS", "ARCADE",
  "BAKERY", "FLOWERS", "TACOS", "VIDEO"];
const BILLBOARDS = ["KART CLUB", "NIGHT OWL", "VOLT COLA", "LUMEN FM"];
const NEON = ["#ff4fa3", "#38e8ff", "#ffd23f", "#7dff6a", "#c58bff", "#ff8a3d"];

/** Neon shop signs and panels atop some offices; shop signs mirror on the wet street. */
function createNeonSigns(lots: readonly BuildingLot[]): {
  group: THREE.Group;
  reflections: ReflectedLight[];
} {
  const group = new THREE.Group();
  const reflections: ReflectedLight[] = [];
  group.name = "neon-signs";
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  const material = (text: string, index: number) => {
    const key = `${text}:${index % NEON.length}`;
    const cached = materials.get(key) ?? neonSignMaterial(text, NEON[index % NEON.length]);
    materials.set(key, cached);
    return cached;
  };
  // Steel frame of the panel: light enough not to become a black hole.
  const frame = celMaterial(0x59606d, 0.002);
  let shop = 0;
  let billboard = 0;
  for (const lot of lots) {
    const forwardX = Math.sin(lot.yaw);
    const forwardZ = Math.cos(lot.yaw);
    if (lot.kind === "shop") {
      const width = Math.min(lot.width - 2, 4.6);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4),
        material(SHOP_NAMES[shop % SHOP_NAMES.length], shop * 7 + 1));
      sign.position.set(lot.x + forwardX * (lot.depth / 2 + 0.13), 4.55,
        lot.z + forwardZ * (lot.depth / 2 + 0.13));
      sign.rotation.y = lot.yaw;
      group.add(sign);
      reflections.push({
        position: sign.position.clone(),
        groundY: GROUND_Y,
        color: NEON[(shop * 7 + 1) % NEON.length],
        width: width * 0.3,
        intensity: 0.75,
      });
      shop++;
    } else if (lot.kind === "office" && lot.height > 26 && billboard < 8 && lot.width > 11) {
      const text = BILLBOARDS[billboard % BILLBOARDS.length];
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), material(text, billboard * 3));
      const edge = lot.depth / 2 - 0.6;
      panel.position.set(lot.x + forwardX * edge, lot.height + 2.6, lot.z + forwardZ * edge);
      panel.rotation.y = lot.yaw;
      const back = new THREE.Mesh(new THREE.BoxGeometry(8.3, 2.3, 0.15), frame);
      back.position.set(panel.position.x - forwardX * 0.1, panel.position.y,
        panel.position.z - forwardZ * 0.1);
      back.rotation.y = lot.yaw;
      group.add(panel, back);
      for (const offset of [-2.8, 2.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), frame);
        leg.position.set(back.position.x + Math.cos(lot.yaw) * offset, lot.height + 0.8,
          back.position.z - Math.sin(lot.yaw) * offset);
        group.add(leg);
      }
      billboard++;
    }
  }
  mergeStaticDecoration(group);
  return { group, reflections };
}

/**
 * Street-level lamp lenses and the span lights under the overpass, mirrored on
 * the wet street. Lamps on the deck are left out: their flat mirror plane would
 * hang off the sloped, narrow deck.
 */
function lampReflections(lamps: readonly StreetLamp[]): ReflectedLight[] {
  const lampLights = lamps.filter((lamp) => lamp.y < 0.3).map((lamp) => ({
    position: lampBulb(lamp),
    groundY: GROUND_Y,
    color: LAMP_COLOR,
    width: 0.9,
    intensity: 0.85,
  }));
  const spanLights = underDeckLights().map((position) => ({
    position, groundY: GROUND_Y, color: LAMP_COLOR, width: 1, intensity: 0.7,
  }));
  return [...lampLights, ...spanLights];
}

/**
 * Lamplight City at midnight: blocks of houses, shops, and offices with
 * lit windows, squares, streetlights that illuminate the track, and the overpass above the start.
 */
export class LamplightCityDecor implements Decoration {
  readonly group = new THREE.Group();
  readonly colliders: ColliderBox[] = [];
  private readonly raceDecor: RaceDecor;
  private readonly rig: LightRig;
  private readonly signals: CornerSignals;
  private readonly beacons: THREE.MeshBasicMaterial[];
  private time = 0;

  constructor(track: TrackLike) {
    this.group.name = "lamplight-city";
    this.raceDecor = new RaceDecor(track, {
      banner: "LAMPLIGHT CITY", theme: "city", lineColor: 0x1d2029,
      // The crosswalks have no light of their own: dark tones so they do not glow at night.
      curbColors: [0x7c2b27, 0x8d8c95],
    });
    this.group.add(this.raceDecor.group);
    this.colliders.push(...this.raceDecor.colliders);

    const lots = planCity(track);
    const city = buildBuildings(lots);
    const skyline = buildBuildings(planSkyline(), { distant: true });
    this.beacons = [city.beacons, skyline.beacons];
    const neon = createNeonSigns(lots);
    this.group.add(city.group, skyline.group, neon.group);
    this.colliders.push(...city.colliders);

    const parks = createParks();
    this.group.add(parks.group);
    this.colliders.push(...parks.colliders);

    const lamps = [...planStreetLamps(track), ...parks.lamps];
    this.group.add(createStreetLamps(lamps), createOverpassDressing());
    // After the rain, every lamp and shop sign streaks across the wet street.
    this.group.add(createWetReflections([...lampReflections(lamps), ...neon.reflections]));
    this.rig = new LightRig(lightSources(lamps));
    this.group.add(this.rig.group);
    this.signals = new CornerSignals(track);
    this.group.add(this.signals.group);

    this.group.add(createRoadMarkings(track, {
      centerColor: 0xd9a83a, edgeColor: 0xe6e3dc, dash: 3, gap: 4,
      crosswalks: [0.19, 0.83],
    }));
    this.group.add(createGroundCover(track, {
      seed: 3301,
      grass: { base: LAWN_COLOR, tip: 0x86b25c, spacing: 0.8 },
      flowers: { colors: [0xffffff, 0xffd166, 0xff8fb8], spacing: 1.8 },
      bushes: { color: 0x4f7d45, spacing: 7 },
      avoid: this.colliders,
      exclude: (x, z) => !onLawn(x, z),
    }));
  }

  update(dt: number, frame?: DecorationFrame): void {
    this.time += dt;
    if (frame) this.rig.update(frame.view);
    this.signals.update(dt, frame?.reducedMotion);
    // Warning lights on tall buildings: a short flash every 1.6 s.
    const on = frame?.reducedMotion || this.time % 1.6 < 0.5;
    for (const beacon of this.beacons) {
      if (on) glowColor(0xff3b30, 2.6, beacon.color);
      else beacon.color.setHex(0x3a0d0b);
    }
  }

  setStartLights(label: string | null): void {
    this.raceDecor.setStartLights(label);
  }
}
