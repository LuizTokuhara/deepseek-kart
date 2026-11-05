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
