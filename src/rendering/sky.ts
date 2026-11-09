import * as THREE from "three/webgpu";
import {
  Fn,
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  normalize,
  positionGeometry,
  pow,
  sin,
  smoothstep,
  texture,
  uniform,
  vec3,
} from "three/tsl";
import { glowColor } from "./glow";
import { macroNoiseTexture } from "./macro-noise";

export interface SkyOptions {
  readonly zenith: number;
  readonly horizon: number;
  /** Normalized height where the zenith takes over; lower = blue sooner. */
  readonly blend?: number;
  /** Direction from the scene towards the sun. */
  readonly sunDirection: THREE.Vector3;
  readonly sunColor: number;
  /** Noise level above which sky clouds appear; higher = fewer clouds. */
  readonly cloudCover?: number;
  /**
   * Night sky: star density/brightness (0–1). The sun becomes a smaller,
   * mottled moon with a faint halo, and clouds take the night colours.
   */
  readonly stars?: number;
  /** Colour of the band just above the horizon (city glow at night). */
  readonly haze?: number;
}

const DEFAULT_CLOUD_COVER = 0.6;
/** Slow sideways drift of the painted cloud layer, in noise tiles per second. */
const CLOUD_DRIFT = new THREE.Vector2(0.004, 0.0015);

/** Sparse star field: one candidate per direction cell, twinkling slowly. */
const starField = Fn(([direction, skyTime, stars]: [any, any, any]) => {
  const scaled: any = direction.mul(180);
  const cell: any = floor(scaled);
  const seed: any = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))).mul(43758.5453));
  const centre = vec3(
    fract(seed.mul(13.1)),
    fract(seed.mul(31.7)),
    fract(seed.mul(7.3)),
  ).mul(0.5).add(0.25);
  const spot = float(1).sub(
    smoothstep(0.0, 0.32, length(fract(scaled).sub(centre))),
  );
  const twinkle = float(0.75).add(
    sin(skyTime.mul(float(1.3).add(seed.mul(2))).add(seed.mul(80))).mul(0.25),
  );
  const candidate = spot.mul(twinkle).mul(float(0.45).add(fract(seed.mul(97)).mul(0.75)));
  return seed.lessThan(float(1).sub(stars.mul(0.018))).select(float(0), candidate);
});

const cloudDensity = Fn(([uvNode, cloudNoise]: [any, any]) => {
  return texture(cloudNoise, uvNode).r.mul(0.65)
    .add(texture(cloudNoise, uvNode.mul(2.3).add(0.37)).r.mul(0.35));
});

/**
 * Camera-centred sky dome: zenith/horizon gradient whose horizon matches the
 * course fog, plus horizon haze, sun disc and halo, and a painted cloud layer.
 */
export class Sky {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicNodeMaterial>;
  private readonly cloudOffset: THREE.UniformNode<"vec2">;
  private readonly time: THREE.UniformNode<"float">;

  constructor(options: SkyOptions) {
    const horizon = new THREE.Color(options.horizon);
    const zenith = new THREE.Color(options.zenith);
    const sun = new THREE.Color(options.sunColor);
    const white = new THREE.Color(0xffffff);
    const night = (options.stars ?? 0) > 0;

    const cloudOffset = uniform(new THREE.Vector2());
    const skyTime = uniform(0);
    const cloudNoise = texture(macroNoiseTexture());

    const horizonUniform = uniform(horizon);
    const zenithUniform = uniform(zenith);
    const hazeColor = options.haze !== undefined
      ? new THREE.Color(options.haze)
      : horizon.clone().lerp(white, 0.4);
    const hazeUniform = uniform(hazeColor);
    const sunDirection = options.sunDirection.clone().normalize();
    const sunDirectionUniform = uniform(sunDirection);
    const sunHalo = horizon.clone().lerp(sun, 0.55).lerp(white, 0.2);
    const sunHaloUniform = uniform(sunHalo);
    const sunDisc = glowColor(sun.clone().lerp(white, 0.55).getHex());
    const sunDiscUniform = uniform(sunDisc);
    const cloudCover = options.cloudCover ?? DEFAULT_CLOUD_COVER;
    const cloudCoverUniform = uniform(cloudCover);
    const cloudLit = night
      ? horizon.clone().lerp(sun, 0.2)
      : white.clone().lerp(sun, 0.4);
    const cloudLitUniform = uniform(cloudLit);
    const cloudShade = night
      ? horizon.clone().lerp(zenith, 0.2)
      : horizon.clone().lerp(zenith, 0.35).multiplyScalar(0.92);
    const cloudShadeUniform = uniform(cloudShade);
    const starsUniform = uniform(options.stars ?? 0);

    const color = Fn(() => {
      const direction = normalize(positionGeometry);
      const height = max(direction.y, 0);
      let skyColor = mix(
        horizonUniform,
        zenithUniform,
        smoothstep(0, options.blend ?? 0.75, height),
      );

      // Light band just above the horizon; zero at the horizon itself so the
      // fogged ground still meets the sky without a seam.
      const hazeBand = smoothstep(0, 0.025, height).mul(exp(height.mul(-12)));
      skyColor = mix(skyColor, hazeUniform, hazeBand.mul(0.45));

      // Sun halo brightens the sun's side of the sky even when the disc is off screen.
      const sunDot = dot(direction, sunDirectionUniform);
      const halo = pow(max(sunDot, 0), 6).mul(0.35)
        .add(pow(max(sunDot, 0), 48).mul(0.45))
        .mul(night ? 0.35 : 1);
      skyColor = mix(skyColor, sunHaloUniform, clamp(halo, 0, 1));

      // Painted cumulus on a virtual ceiling: perspective squeezes them at the horizon.
      const cloudUv = direction.xz
        .div(direction.y.add(0.12))
        .mul(0.32)
        .add(cloudOffset);
      const density = cloudDensity(cloudUv, cloudNoise);
      const cloud = smoothstep(cloudCoverUniform, cloudCoverUniform.add(0.025), density);
      // Two painted tones: the cloud's sun-facing core is lit, its rim stays shaded.
      const core = smoothstep(
        cloudCoverUniform.add(0.05),
        cloudCoverUniform.add(0.075),
        density,
      );
      const cloudColor = mix(cloudShadeUniform, cloudLitUniform, core);
      const cloudBand = smoothstep(0.012, 0.05, height)
        .mul(float(1).sub(smoothstep(0.32, 0.55, height)));
      skyColor = mix(skyColor, cloudColor, cloud.mul(cloudBand));

      if (night) {
        const starFade = smoothstep(0.06, 0.3, height)
          .mul(float(1).sub(cloud.mul(cloudBand)));
        skyColor = skyColor.add(
          vec3(0.85, 0.9, 1.0)
            .mul(starField(direction, skyTime, starsUniform))
            .mul(starFade),
        );
      }

      // HDR disc so the bloom pass gives the sun its glow; clouds pass in front.
      const discEdge = night ? 0.99962 : 0.99935;
      const disc = smoothstep(discEdge, discEdge + 0.00025, sunDot)
        .mul(float(1).sub(cloud.mul(cloudBand)));
      const discColor = night
        ? sunDiscUniform
          .mul(float(0.78).add(texture(cloudNoise, direction.xy.mul(40)).r.mul(0.22)))
        : sunDiscUniform;
      skyColor = mix(skyColor, discColor, disc);

      return skyColor;
    })();

    const material = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    material.colorNode = color;
    material.name = "gradient-sky";
    material.userData.uniforms = {
      sunDisc: sunDiscUniform,
      sunDirection: sunDirectionUniform,
      haze: hazeUniform,
      horizon: horizonUniform,
      cloudLit: cloudLitUniform,
      cloudCover: cloudCoverUniform,
      cloudOffset,
    };
    this.cloudOffset = cloudOffset;
    this.time = skyTime;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), material);
    this.mesh.name = "gradient-sky";
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  /** Drifts the cloud layer; frozen when the player prefers reduced motion. */
  update(dt: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    this.cloudOffset.value.addScaledVector(CLOUD_DRIFT, Math.min(dt, 0.1));
    this.time.value += Math.min(dt, 0.1);
  }
}
