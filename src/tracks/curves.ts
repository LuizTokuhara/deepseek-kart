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

  // Clean bottom straight, used for accelerating and braking.
  for (let i = 0; i <= bottomSteps; i++) {
    const x = -straightHalf + (i / bottomSteps) * straightHalf * 2;
    push(x, -halfDepth);
  }

  // Bottom-right corner: -90° -> 0°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = -Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    push(
      straightHalf + Math.cos(angle) * cornerRadius,
      -depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Right straight.
  const sideSteps = Math.ceil((depthHalf * 2) / straightSample);
  for (let i = 1; i <= sideSteps; i++) {
    const z = -depthHalf + (i / sideSteps) * depthHalf * 2;
    push(halfWidth, z);
  }

  // Top-right corner: 0° -> 90°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = (i / cornerSteps) * (Math.PI / 2);
    push(
      straightHalf + Math.cos(angle) * cornerRadius,
      depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Top straight, with the gentle chicane.
  for (let i = 1; i <= bottomSteps; i++) {
    const x = straightHalf - (i / bottomSteps) * straightHalf * 2;
    const u = (x + straightHalf) / (straightHalf * 2);
    const offset =
      chicaneAmplitude *
      Math.sin(Math.PI * u) ** 2 *
      Math.sin(2 * Math.PI * u);
    push(x, halfDepth + offset);
  }

  // Top-left corner: 90° -> 180°.
  for (let i = 1; i <= cornerSteps; i++) {
    const angle = Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
    push(
      -straightHalf + Math.cos(angle) * cornerRadius,
      depthHalf + Math.sin(angle) * cornerRadius,
    );
  }

  // Left straight.
  for (let i = 1; i <= sideSteps; i++) {
    const z = depthHalf - (i / sideSteps) * depthHalf * 2;
    push(-halfWidth, z);
  }

  // Bottom-left corner: 180° -> 270°. The final point coincides with the
  // first point, so it is omitted to avoid duplicating the closed junction.
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
 * Closed curve formed by a polyline of streets with rounded corners, as in an
 * urban layout. Vertices may pass through the same point twice (a figure
 * eight with an overpass); aligned vertices pass through without a corner.
 *
 * @param vertices polyline corners, in race order; the first is t = 0.
 * @param radius corner radius, in meters.
 * @param step control point spacing on the straights, in meters.
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
  // Entry and exit points of each corner and its arc.
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

/** `t` (0–1, by length) of the curve point nearest to (x, z). */
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
