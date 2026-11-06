import * as THREE from "three";
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

const vertexShader = /* glsl */ `
  varying vec3 vSkyDirection;
  void main() {
    vSkyDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform float blend;
  uniform vec3 sunDirection;
  uniform vec3 sunDisc;
  uniform vec3 sunHalo;
  uniform vec3 haze;
  uniform sampler2D cloudNoise;
  uniform float cloudCover;
  uniform vec2 cloudOffset;
  uniform vec3 cloudLit;
  uniform vec3 cloudShade;
  uniform float stars;
  uniform float discEdge;
  uniform float haloStrength;
  uniform float skyTime;
  varying vec3 vSkyDirection;

  // Sparse star field: one candidate per direction cell, twinkling slowly.
  float starField(vec3 direction) {
    vec3 scaled = direction * 180.0;
    vec3 cell = floor(scaled);
    float seed = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    if (seed < 1.0 - 0.018 * stars) return 0.0;
    vec3 centre = vec3(fract(seed * 13.1), fract(seed * 31.7), fract(seed * 7.3)) * 0.5 + 0.25;
    float spot = smoothstep(0.32, 0.0, length(fract(scaled) - centre));
    float twinkle = 0.75 + 0.25 * sin(skyTime * (1.3 + seed * 2.0) + seed * 80.0);
    return spot * twinkle * (0.45 + 0.75 * fract(seed * 97.0));
  }

  float cloudDensity(vec2 uv) {
    return texture2D(cloudNoise, uv).r * 0.65 + texture2D(cloudNoise, uv * 2.3 + 0.37).r * 0.35;
  }

  void main() {
    vec3 direction = normalize(vSkyDirection);
    float height = max(direction.y, 0.0);
    vec3 color = mix(horizon, zenith, smoothstep(0.0, blend, height));

    // Light band just above the horizon; zero at the horizon itself so the
    // fogged ground still meets the sky without a seam.
    float hazeBand = smoothstep(0.0, 0.025, height) * exp(-height * 12.0);
    color = mix(color, haze, hazeBand * 0.45);

    // Sun halo brightens the sun's side of the sky even when the disc is off screen.
    float sunDot = dot(direction, sunDirection);
    float halo = (pow(max(sunDot, 0.0), 6.0) * 0.35 + pow(max(sunDot, 0.0), 48.0) * 0.45) *
      haloStrength;
    color = mix(color, sunHalo, clamp(halo, 0.0, 1.0));

    // Painted cumulus on a virtual ceiling: perspective squeezes them at the horizon.
    vec2 cloudUv = direction.xz / (direction.y + 0.12) * 0.32 + cloudOffset;
    float density = cloudDensity(cloudUv);
    float cloud = smoothstep(cloudCover, cloudCover + 0.025, density);
    // Two painted tones: the cloud's sun-facing core is lit, its rim stays shaded.
    float core = smoothstep(cloudCover + 0.05, cloudCover + 0.075, density);
    vec3 cloudColor = mix(cloudShade, cloudLit, core);
    float cloudBand = smoothstep(0.012, 0.05, height) * (1.0 - smoothstep(0.32, 0.55, height));
    color = mix(color, cloudColor, cloud * cloudBand);

    if (stars > 0.0) {
      float starFade = smoothstep(0.06, 0.3, height) * (1.0 - cloud * cloudBand);
      color += vec3(0.85, 0.9, 1.0) * starField(direction) * starFade;
    }

    // HDR disc so the bloom pass gives the sun its glow; clouds pass in front.
    float disc = smoothstep(discEdge, discEdge + 0.00025, sunDot) * (1.0 - cloud * cloudBand);
    // At night the disc is the moon: grey maria from the shared noise.
    vec3 discColor = stars > 0.0
      ? sunDisc * (0.78 + 0.22 * texture2D(cloudNoise, direction.xy * 40.0).r)
      : sunDisc;
    color = mix(color, discColor, disc);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Camera-centred sky dome: zenith/horizon gradient whose horizon matches the
 * course fog, plus horizon haze, sun disc and halo, and a painted cloud layer.
 */
export class Sky {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly cloudOffset: THREE.Vector2;
  private readonly time: THREE.IUniform<number>;

  constructor(options: SkyOptions) {
    const horizon = new THREE.Color(options.horizon);
    const zenith = new THREE.Color(options.zenith);
    const sun = new THREE.Color(options.sunColor);
    const white = new THREE.Color(0xffffff);
    const night = (options.stars ?? 0) > 0;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: zenith },
        horizon: { value: horizon },
        blend: { value: options.blend ?? 0.75 },
        sunDirection: { value: options.sunDirection.clone().normalize() },
        sunDisc: { value: glowColor(sun.clone().lerp(white, 0.55).getHex()) },
        sunHalo: { value: horizon.clone().lerp(sun, 0.55).lerp(white, 0.2) },
        haze: { value: options.haze !== undefined
          ? new THREE.Color(options.haze)
          : horizon.clone().lerp(white, 0.4) },
        cloudNoise: { value: macroNoiseTexture() },
        cloudCover: { value: options.cloudCover ?? DEFAULT_CLOUD_COVER },
        cloudOffset: { value: new THREE.Vector2() },
        // Sun-tinted tops: near white at noon, peach under a sunset key light.
        // At night clouds are thin moonlit veils, a little lighter than the sky.
        cloudLit: { value: night
          ? horizon.clone().lerp(sun, 0.2)
          : white.clone().lerp(sun, 0.4) },
        cloudShade: { value: night
          ? horizon.clone().lerp(zenith, 0.2)
          : horizon.clone().lerp(zenith, 0.35).multiplyScalar(0.92) },
        stars: { value: options.stars ?? 0 },
        // The moon is smaller than the sun, with a dimmer halo.
        discEdge: { value: night ? 0.99962 : 0.99935 },
        haloStrength: { value: night ? 0.35 : 1 },
        skyTime: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    material.userData.outlineParameters = { visible: false };
    this.cloudOffset = material.uniforms.cloudOffset.value as THREE.Vector2;
    this.time = material.uniforms.skyTime;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), material);
    this.mesh.name = "gradient-sky";
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  /** Drifts the cloud layer; frozen when the player prefers reduced motion. */
  update(dt: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    this.cloudOffset.addScaledVector(CLOUD_DRIFT, Math.min(dt, 0.1));
    this.time.value += Math.min(dt, 0.1);
  }
}
