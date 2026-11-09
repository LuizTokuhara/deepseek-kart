import * as THREE from "three/webgpu";
import { createOutlineObject, releaseOutlineObject } from "./outline-material";

/** Watches scene mutations, with no scene traversal in the animation loop. */
export class OutlineManager {
  private readonly watched = new Set<THREE.Object3D>();
  private readonly owned = new Map<THREE.Mesh, THREE.Mesh>();
  private readonly added = (event: { child: THREE.Object3D }): void => { this.attach(event.child); };
  private readonly removed = (event: { child: THREE.Object3D }): void => { this.detach(event.child); };

  constructor(private readonly root: THREE.Object3D) { this.attach(root); }

  private attach(object: THREE.Object3D): void {
    if (object.userData.isOutline || this.watched.has(object)) return;
    this.watched.add(object);
    object.addEventListener("childadded", this.added);
    object.addEventListener("childremoved", this.removed);
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.outlineObject) {
      const hull = createOutlineObject(mesh);
      if (hull) {
        this.owned.set(mesh, hull);
        mesh.userData.outlineObject = hull;
        mesh.add(hull);
      }
    }
    for (const child of [...object.children]) this.attach(child);
  }

  private detach(object: THREE.Object3D): void {
    if (!this.watched.delete(object)) return;
    object.removeEventListener("childadded", this.added);
    object.removeEventListener("childremoved", this.removed);
    for (const child of [...object.children]) this.detach(child);
    const mesh = object as THREE.Mesh;
    const hull = this.owned.get(mesh);
    if (hull) {
      mesh.remove(hull);
      delete mesh.userData.outlineObject;
      this.owned.delete(mesh);
      releaseOutlineObject(hull);
    }
  }

  dispose(): void { this.detach(this.root); }
}
