import * as THREE from "three";

export interface EnvironmentDefinition {
  readonly background: number;
  readonly fog: { readonly near: number; readonly far: number };
  readonly ambient: { readonly color: number; readonly intensity: number };
  readonly sun: {
    readonly color: number;
    readonly intensity: number;
    readonly offset: { readonly x: number; readonly y: number; readonly z: number };
  };
}

/** Shared lighting/shadow setup, with art direction supplied by the course. */
export class Environment {
  readonly sun: THREE.DirectionalLight;

  constructor(scene: THREE.Scene, private readonly definition: EnvironmentDefinition) {
    scene.background = new THREE.Color(definition.background);
    scene.fog = new THREE.Fog(definition.background, definition.fog.near, definition.fog.far);
    scene.add(new THREE.AmbientLight(definition.ambient.color, definition.ambient.intensity));
    this.sun = new THREE.DirectionalLight(definition.sun.color, definition.sun.intensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 130,
    });
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.0002;
    scene.add(this.sun, this.sun.target);
  }

  follow(x: number, z: number): void {
    const offset = this.definition.sun.offset;
    this.sun.position.set(x + offset.x, offset.y, z + offset.z);
    this.sun.target.position.set(x, 0, z);
  }
}
