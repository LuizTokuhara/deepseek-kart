import * as THREE from "three";

let detailTexture: THREE.DataTexture | undefined;

/** RGB stores fractures, frost and bubbles; one small texture is shared. */
export function iceDetailTexture(): THREE.DataTexture {
  if (detailTexture) return detailTexture;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 74183;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = x / size * Math.PI * 2, b = y / size * Math.PI * 2;
      const cloud = Math.sin(a + Math.cos(b * 2)) * 0.25 + Math.cos(b * 3 - Math.sin(a * 2)) * 0.18;
      const index = (y * size + x) * 4;
      data[index + 1] = Math.round(THREE.MathUtils.clamp(0.43 + cloud + random() * 0.1, 0, 1) * 255);
      data[index + 3] = 255;
    }
  }
  const dab = (x: number, y: number, radius: number, channel: number, strength: number) => {
    for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
      for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
        const distance = Math.hypot(dx, dy) / radius;
        if (distance > 1) continue;
        const ix = ((Math.round(x) + dx) % size + size) % size;
        const iy = ((Math.round(y) + dy) % size + size) % size;
        const index = (iy * size + ix) * 4 + channel;
        data[index] = Math.max(data[index], Math.round((1 - distance) * strength * 255));
      }
    }
  };
  const fracture = (x: number, y: number, angle: number, segments: number, strength: number) => {
    for (let segment = 0; segment < segments; segment++) {
      angle += (random() - 0.5) * 0.9;
      const length = 9 + random() * 22;
      for (let step = 0; step < length; step += 0.6) {
        dab(x + Math.cos(angle) * step, y + Math.sin(angle) * step, 1.35, 0, strength);
      }
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
    }
  };
  for (let i = 0; i < 5; i++) {
    const x = random() * size, y = random() * size, angle = random() * Math.PI * 2;
    fracture(x, y, angle, 4, 0.85);
    fracture(x, y, angle + 1.2, 2, 0.55);
  }
  for (let i = 0; i < 45; i++) dab(random() * size, random() * size, 1.2 + random() * 1.5, 2, 0.5);
  detailTexture = new THREE.DataTexture(data, size, size);
  detailTexture.name = "ice-fractures-frost-bubbles";
  detailTexture.wrapS = detailTexture.wrapT = THREE.RepeatWrapping;
  detailTexture.magFilter = THREE.LinearFilter;
  detailTexture.minFilter = THREE.LinearMipmapLinearFilter;
  detailTexture.generateMipmaps = true;
  detailTexture.anisotropy = 4;
  detailTexture.needsUpdate = true;
  return detailTexture;
}
