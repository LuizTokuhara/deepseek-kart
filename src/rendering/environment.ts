import * as THREE from "three";
import { createSky } from "./sky";

export interface EnvironmentDefinition {
  readonly background: number;
  readonly sky?: { readonly zenith: number; readonly ground: number };
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

/** Shared lighting/shadow setup, with art direction supplied by the course. */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  private readonly sky: THREE.Mesh;
  private readonly shadowRight = new THREE.Vector3();
  private readonly shadowUp = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly definition: EnvironmentDefinition) {
    this.sky = createSky(definition.sky?.zenith ?? definition.background, definition.background);
    scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(
      definition.hemisphere?.sky ?? 0xc2e7ff,
      definition.hemisphere?.ground ?? definition.sky?.ground ?? 0x688451,
      definition.hemisphere?.intensity ?? 0.38,
    ));
    scene.background = new THREE.Color(definition.background);
    scene.fog = new THREE.Fog(definition.background, definition.fog.near, definition.fog.far);
    scene.add(new THREE.AmbientLight(definition.ambient.color, definition.ambient.intensity));
    this.sun = new THREE.DirectionalLight(definition.sun.color, definition.sun.intensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 130,
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

  follow(x: number, z: number): void {
    this.sky.position.set(x, 0, z);
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
  }
}
