import * as THREE from "three";
import { GROUND_Y } from "../../../core/config";
import { signMaterial } from "../../../decor/props/signs";
import { celMaterial } from "../../../rendering/cel-shading";
import { glowColor } from "../../../rendering/glow";
import { lamplightCityLayout, lamplightOverpass } from "./layout";
import { underDeckLights } from "./city-lights";

/**
 * Finish of the overpass above the start: signs attached to the outer face of the
 * span, facing the avenue (from the top of the overpass the parapet hides them),
 * and lights under the deck. The span is at x = 0, above the avenue at z = 0.
 */
export function createOverpassDressing(): THREE.Group {
  const group = new THREE.Group();
  group.name = "overpass-dressing";
  const { style } = lamplightCityLayout;
  const deckTop = GROUND_Y + lamplightOverpass.height;
  const outer = style.wallOffset + style.wallThickness / 2;
  const frame = celMaterial(0x2c3240, 0.002);
  const banner = signMaterial("LAMPLIGHT CITY", "city");

  for (const side of [-1, 1]) {
    const sign = new THREE.Group();
    const width = 10.5;
    const height = width / 6;
    // Between the underside of the girder and the top of the parapet, without reducing the span.
    sign.position.set(side * (outer + 0.08), deckTop - 0.82 + height / 2, 0);
    sign.rotation.y = side * Math.PI / 2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, height + 0.12, 0.12), frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), banner);
    face.position.z = 0.07;
    sign.add(back, face);
    sign.traverse((part) => {
      part.castShadow = true;
    });
    group.add(sign);
  }

  const fixture = new THREE.MeshBasicMaterial({ color: glowColor(0xffd9a0, 2.4) });
  fixture.userData.outlineParameters = { visible: false };
  for (const light of underDeckLights()) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.35), fixture);
    bar.position.set(light.x, light.y + 0.95, light.z);
    group.add(bar);
  }
  return group;
}
