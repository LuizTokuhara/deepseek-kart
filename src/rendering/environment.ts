import * as THREE from "three";
import { BlobShadows, collectFootprints } from "./blob-shadows";
import { Snowfall, type SnowfallOptions } from "./snowfall";
import { Sky } from "./sky";
import { advanceWind } from "./wind";
import { blendFogInSrgb } from "./srgb-fog";
import { keyLight } from "./hatching";
import { VISUAL_QUALITY, type VisualQuality } from "../core/visual-quality";

/** Final course color grade, applied on screen after bloom. */
export interface ColorGrade {
  /** Contrast around mid-gray; 1 keeps it unchanged. */
  readonly contrast?: number;
  /** Saturation; 1 keeps it unchanged, 0 is black and white. */
  readonly saturation?: number;
  /** Tint in shadows and highlights (split toning); changes hue, not brightness. */
  readonly shadowTint?: number;
  readonly highlightTint?: number;
  /** Corner darkening, from 0 to 1. */
  readonly vignette?: number;
}

export interface EnvironmentDefinition {
  readonly background: number;
  /** Night race: the karts turn on their headlights. */
  readonly headlights?: boolean;
  readonly grade?: ColorGrade;
  readonly snowfall?: SnowfallOptions;
  readonly sky?: {
    readonly zenith: number;
    readonly ground: number;
    /** Normalized height where the zenith takes over; lower = blue sooner. */
    readonly blend?: number;
    /** Noise threshold for the painted sky clouds; higher = fewer clouds. */
    readonly cloudCover?: number;
    /** Night sky: star density (0–1); the sun becomes the moon. */
    readonly stars?: number;
    /** Color of the band just above the horizon (city glow at night). */
    readonly haze?: number;
  };
  readonly fog: { readonly near: number; readonly far: number };
  readonly ambient: { readonly color: number; readonly intensity: number };
  readonly hemisphere?: {
    readonly sky: number;
    readonly ground: number;
    readonly intensity: number;
  };
  readonly sun: {
    readonly color: number;
    readonly intensity: number;
    readonly offset: { readonly x: number; readonly y: number; readonly z: number };
    readonly shadow?: { readonly intensity: number; readonly radius: number };
  };
}

/** Half size of the real shadow map around the player, in meters. */
const SHADOW_EXTENT = 28;

/** Shared lighting/shadow setup, with art direction supplied by the course. */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  private readonly sky: Sky;
  private readonly snowfall?: Snowfall;
  private readonly shadowRight = new THREE.Vector3();
  private readonly shadowUp = new THREE.Vector3();
  private blobShadows?: BlobShadows;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly definition: EnvironmentDefinition,
    quality: VisualQuality = VISUAL_QUALITY,
  ) {
    if (definition.snowfall) {
      this.snowfall = new Snowfall({
        ...definition.snowfall,
        count: Math.max(0, Math.round(definition.snowfall.count * quality.snowfallDensity)),
      });
      scene.add(this.snowfall.mesh);
    }
    const sunOffset = definition.sun.offset;
    this.sky = new Sky({
      zenith: definition.sky?.zenith ?? definition.background,
      horizon: definition.background,
      blend: definition.sky?.blend,
      sunDirection: new THREE.Vector3(sunOffset.x, sunOffset.y, sunOffset.z),
      sunColor: definition.sun.color,
      cloudCover: definition.sky?.cloudCover,
      stars: definition.sky?.stars,
      haze: definition.sky?.haze,
    });
    scene.add(this.sky.mesh);
    scene.add(new THREE.HemisphereLight(
      definition.hemisphere?.sky ?? 0xc2e7ff,
      definition.hemisphere?.ground ?? definition.sky?.ground ?? 0x688451,
      definition.hemisphere?.intensity ?? 0.38,
    ));
    scene.background = new THREE.Color(definition.background);
    scene.fog = new THREE.Fog(definition.background, definition.fog.near, definition.fog.far);
    blendFogInSrgb(scene, scene.fog);
    scene.add(new THREE.AmbientLight(definition.ambient.color, definition.ambient.intensity));
    this.sun = new THREE.DirectionalLight(definition.sun.color, definition.sun.intensity);
    // Hatching and kart glints measure light against this key (sun or moon).
    const { r, g, b } = this.sun.color;
    keyLight.value = Math.max(0.001, (0.2126 * r + 0.7152 * g + 0.0722 * b) * this.sun.intensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    Object.assign(this.sun.shadow.camera, {
      left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT,
      near: 1, far: 130,
    });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.intensity = definition.sun.shadow?.intensity ?? 1;
    this.sun.shadow.radius = definition.sun.shadow?.radius ?? 1;
    const offset = definition.sun.offset;
    const direction = new THREE.Vector3(offset.x, offset.y, offset.z).normalize();
    // Match the shadow camera's lookAt basis, including a vertical sun.
    if (Math.abs(direction.y) > 0.9999) this.sun.shadow.camera.up.set(0, 0, 1);
    this.shadowRight.crossVectors(this.sun.shadow.camera.up, direction).normalize();
    this.shadowUp.crossVectors(direction, this.shadowRight).normalize();
    scene.add(this.sun, this.sun.target);
  }

  update(dt: number, cameraPosition: THREE.Vector3, viewportHeight: number, reducedMotion = false): void {
    this.snowfall?.update(dt, cameraPosition, viewportHeight, reducedMotion);
    this.sky.update(dt, reducedMotion);
    advanceWind(dt, reducedMotion);
  }

  follow(x: number, z: number): void {
    this.sky.mesh.position.set(x, 0, z);
    const offset = this.definition.sun.offset;
    const target = this.sun.target.position.set(x, 0, z);
    const camera = this.sun.shadow.camera;
    const texelX = (camera.right - camera.left) / this.sun.shadow.mapSize.x;
    const texelY = (camera.top - camera.bottom) / this.sun.shadow.mapSize.y;
    const lightX = target.dot(this.shadowRight);
    const lightY = target.dot(this.shadowUp);
    // Move in whole shadow texels, keeping static edges stable while driving.
    target.addScaledVector(this.shadowRight, Math.round(lightX / texelX) * texelX - lightX);
    target.addScaledVector(this.shadowUp, Math.round(lightY / texelY) * texelY - lightY);
    this.sun.position.set(target.x + offset.x, target.y + offset.y, target.z + offset.z);
    this.blobShadows?.follow(target);
  }

  /** Stand-in shadows for flagged static scenery beyond the real shadow map. */
  addBlobShadows(root: THREE.Object3D): void {
    const offset = this.definition.sun.offset;
    this.blobShadows = new BlobShadows(collectFootprints(root), {
      sunDirection: new THREE.Vector3(offset.x, offset.y, offset.z).normalize(),
      shadowRight: this.shadowRight,
      shadowUp: this.shadowUp,
      shadowExtent: SHADOW_EXTENT,
      opacity: 0.5 * (this.definition.sun.shadow?.intensity ?? 1),
    });
    this.scene.add(this.blobShadows.mesh);
  }
}
