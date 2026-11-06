import * as THREE from "three";
import { glowColor } from "../../rendering/glow";

const BEAM_COLOR = 0xfff0d2;
let beamMaterial: THREE.MeshBasicMaterial | null = null;
let lampMaterial: THREE.MeshBasicMaterial | null = null;

/** Facho: claro junto ao para-choque, some à frente e nas bordas. */
function beamTexture(): THREE.DataTexture {
  const width = 32;
  const length = 64;
  const data = new Uint8Array(width * length * 4);
  for (let v = 0; v < length; v++) {
    for (let u = 0; u < width; u++) {
      const across = Math.abs((u + 0.5) / width - 0.5) * 2;
      const along = (v + 0.5) / length;
      const edge = 1 - THREE.MathUtils.smoothstep(across, 0.55, 1);
      const value = 255 * edge * (1 - along) ** 1.4 * THREE.MathUtils.smoothstep(along, 0, 0.08);
      data.set([value, value, value, 255], (v * width + u) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, width, length);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Trapézio no chão, estreito no kart e largo a `reach` metros. */
function beamGeometry(reach: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.75, 0, 1.15, 0.75, 0, 1.15, 3.4, 0, reach, -3.4, 0, reach,
  ], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  return geometry;
}

export interface Headlights {
  /** Lanternas, presas à carroceria (acompanham a suspensão). */
  readonly lamps: THREE.Group;
  /** Facho pintado no chão, preso ao grupo do kart (segue o piso). */
  readonly beam: THREE.Mesh;
}

/**
 * Faróis para corridas noturnas: duas lanternas acima do limiar do bloom e
 * um facho aditivo no asfalto. Materiais e textura são compartilhados.
 */
export function createHeadlights(): Headlights {
  lampMaterial ??= new THREE.MeshBasicMaterial({ color: glowColor(BEAM_COLOR, 2.8) });
  lampMaterial.userData.outlineParameters = { visible: false };
  beamMaterial ??= new THREE.MeshBasicMaterial({
    map: beamTexture(),
    color: new THREE.Color(BEAM_COLOR).multiplyScalar(0.32),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  beamMaterial.userData.outlineParameters = { visible: false };
  const lamps = new THREE.Group();
  lamps.name = "headlight-lamps";
  const lens = new THREE.BoxGeometry(0.15, 0.08, 0.05);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(lens, lampMaterial);
    lamp.position.set(side * 0.5, 0.2, 1.17);
    lamps.add(lamp);
  }
  const beam = new THREE.Mesh(beamGeometry(10), beamMaterial);
  beam.name = "headlight-beam";
  beam.position.y = 0.03;
  beam.renderOrder = 2;
  return { lamps, beam };
}

/** Luz real do farol do jogador: um spot sem sombra apontado para a pista. */
export function createHeadlightSpot(): THREE.SpotLight {
  const spot = new THREE.SpotLight(BEAM_COLOR, 40, 32, 0.5, 0.65, 1.4);
  spot.name = "headlight-spot";
  spot.position.set(0, 0.7, 1);
  spot.target.position.set(0, 0, 14);
  spot.add(spot.target);
  spot.castShadow = false;
  return spot;
}
