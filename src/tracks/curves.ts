import * as THREE from "three";

export interface TrackShape {
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly cornerRadius: number;
  readonly chicaneAmplitude: number;
  readonly straightSample: number;
  readonly cornerSteps: number;
}

/** Closed rounded rectangle, optionally with an S chicane. */
export function createRoundedTrackCurve(
  shape: TrackShape,
): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const push = (x: number, z: number): void => {
    const last = points[points.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 0.0001) {
      return;
    }
    points.push(new THREE.Vector3(x, 0, z));
  };

  const {
    halfWidth,
    halfDepth,
    cornerRadius,
    chicaneAmplitude,
    straightSample,
    cornerSteps,
  } = shape;

  const straightHalf = halfWidth - cornerRadius;
  const depthHalf = halfDepth - cornerRadius;
  const bottomSteps = Math.ceil((straightHalf * 2) / straightSample);

  // Reta inferior limpa, usada para acelerar e frear.
  for (let i = 0; i <= bottomSteps; i++) {
    const x = -straightHalf + (i / bottomSteps) * straightHalf * 2;
    push(x, -halfDepth);
  }

  // Curva inferior direita: -90° -> 0°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = -Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    push(
      straightHalf + Math.cos(angle) * cornerRadius,
      -depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta direita.
  const sideSteps = Math.ceil((depthHalf * 2) / straightSample);
  for (let i = 1; i <= sideSteps; i++) {
    const z = -depthHalf + (i / sideSteps) * depthHalf * 2;
    push(halfWidth, z);
  }

  // Curva superior direita: 0° -> 90°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = (i / cornerSteps) * (Math.PI / 2);
    push(
      straightHalf + Math.cos(angle) * cornerRadius,
      depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta superior, com a chicane suave.
  for (let i = 1; i <= bottomSteps; i++) {
    const x = straightHalf - (i / bottomSteps) * straightHalf * 2;
    const u = (x + straightHalf) / (straightHalf * 2);
    const offset =
      chicaneAmplitude *
      Math.sin(Math.PI * u) ** 2 *
      Math.sin(2 * Math.PI * u);
    push(x, halfDepth + offset);
  }

  // Curva superior esquerda: 90° -> 180°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    push(
      -straightHalf + Math.cos(angle) * cornerRadius,
      depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Reta esquerda.
  for (let i = 1; i <= sideSteps; i++) {
    const z = depthHalf - (i / sideSteps) * depthHalf * 2;
    push(-halfWidth, z);
  }

  // Curva inferior esquerda: 180° -> 270°. O ponto final coincide com o
  // primeiro ponto, então ele é omitido para não duplicar a junção fechada.
  for (let i = 1; i < cornerSteps; i++) {
    const angle = Math.PI + (i / cornerSteps) * (Math.PI / 2);
    push(
      -straightHalf + Math.cos(angle) * cornerRadius,
      -depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.5);
  curve.arcLengthDivisions = 2000;
  return curve;
}

/**
 * Curva fechada por uma poligonal de ruas com cantos arredondados, como num
 * traçado urbano. Os vértices podem passar duas vezes pelo mesmo ponto (um
 * oito com viaduto); vértices alinhados atravessam sem curva.
 *
 * @param vertices cantos da poligonal, na ordem da corrida; o primeiro é t = 0.
 * @param radius raio dos cantos, em metros.
 * @param step espaçamento dos pontos de controle nas retas, em metros.
 */
export function createFilletedCurve(
  vertices: readonly (readonly [number, number])[],
  radius: number,
  step = 4,
): THREE.CatmullRomCurve3 {
  const count = vertices.length;
  const at = (index: number) => {
    const [x, z] = vertices[((index % count) + count) % count];
    return new THREE.Vector2(x, z);
  };
  // Pontos de entrada e saída de cada canto e seu arco.
  const corners = vertices.map((_, index) => {
    const corner = at(index);
    const incoming = corner.clone().sub(at(index - 1)).normalize();
    const outgoing = at(index + 1).sub(corner).normalize();
    const turn = Math.atan2(incoming.x * outgoing.y - incoming.y * outgoing.x,
      incoming.dot(outgoing));
    if (Math.abs(turn) < 1e-3) return { enter: corner, exit: corner, arc: [] as THREE.Vector2[] };
    const cut = radius * Math.tan(Math.abs(turn) / 2);
    const enter = corner.clone().addScaledVector(incoming, -cut);
    const exit = corner.clone().addScaledVector(outgoing, cut);
    const normal = new THREE.Vector2(-incoming.y, incoming.x).multiplyScalar(Math.sign(turn));
    const center = enter.clone().addScaledVector(normal, radius);
    const start = Math.atan2(enter.y - center.y, enter.x - center.x);
    const steps = Math.max(2, Math.ceil(Math.abs(turn) / (Math.PI / 18)));
    const arc = Array.from({ length: steps - 1 }, (_, i) => {
      const angle = start + turn * ((i + 1) / steps);
      return new THREE.Vector2(center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius);
    });
    return { enter, exit, arc };
  });

  const points: THREE.Vector3[] = [];
  const push = (point: THREE.Vector2) => {
    const last = points[points.length - 1];
    if (last && Math.hypot(last.x - point.x, last.z - point.y) < 0.5) return;
    points.push(new THREE.Vector3(point.x, 0, point.y));
  };
  corners.forEach((corner, index) => {
    push(corner.enter);
    corner.arc.forEach(push);
    push(corner.exit);
    const next = corners[(index + 1) % count].enter;
    const length = corner.exit.distanceTo(next);
    const pieces = Math.max(1, Math.round(length / step));
    for (let piece = 1; piece < pieces; piece++) {
      push(corner.exit.clone().lerp(next, piece / pieces));
    }
  });
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal", 0.5);
  curve.arcLengthDivisions = 4000;
  return curve;
}

/** `t` (0–1, por comprimento) do ponto da curva mais próximo de (x, z). */
export function curveTAt(curve: THREE.Curve<THREE.Vector3>, x: number, z: number): number {
  let best = 0;
  let bestDistance = Infinity;
  const samples = 4000;
  for (let index = 0; index < samples; index++) {
    const point = curve.getPointAt(index / samples);
    const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index / samples;
    }
  }
  return best;
}
