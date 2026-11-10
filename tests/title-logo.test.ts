import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import { TitleLogo } from "../src/rendering/title-logo";

function letterGroups(logo: TitleLogo): THREE.Group[] {
  return logo.group.children.filter(
    (child): child is THREE.Group =>
      child instanceof THREE.Group && child.children.some((mesh) => mesh instanceof THREE.Mesh &&
        !(mesh instanceof THREE.InstancedMesh)),
  );
}

describe("title logo", () => {
  it("builds one extruded letter per character of DEEPSEEK KART", () => {
    const logo = new TitleLogo();
    const letters = letterGroups(logo);
    expect(letters).toHaveLength("DEEPSEEK".length + "KART".length);
    for (const letter of letters) {
      const [body] = letter.children as THREE.Mesh[];
      body.geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      body.geometry.boundingBox!.getSize(size);
      expect(size.x).toBeGreaterThan(0.3);
      expect(size.y).toBeGreaterThan(0.6);
      expect(size.z).toBeGreaterThan(0.3);
    }
    logo.dispose();
  });

  it("centers both lines and keeps KART below DEEPSEEK", () => {
    const logo = new TitleLogo();
    const letters = letterGroups(logo);
    const top = letters.slice(0, 8).map((letter) => letter.position);
    const bottom = letters.slice(8).map((letter) => letter.position);
    const middle = (points: THREE.Vector3[]) =>
      (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2;
    expect(Math.abs(middle(top))).toBeLessThan(0.25);
    expect(Math.abs(middle(bottom))).toBeLessThan(0.25);
    expect(Math.max(...bottom.map((p) => p.y))).toBeLessThan(Math.min(...top.map((p) => p.y)));
    expect(logo.bounds.isEmpty()).toBe(false);
    logo.dispose();
  });

  it("hides the letters before they drop in and lands them on their rest pose", () => {
    const logo = new TitleLogo();
    const letters = letterGroups(logo);
    const rest = letters.map((letter) => letter.position.clone());

    logo.update(0, false);
    expect(letters.every((letter) => !letter.visible)).toBe(true);

    logo.update(0.1, false);
    expect(letters[0].visible).toBe(true);
    expect(letters[0].position.y).toBeGreaterThan(rest[0].y + 0.1);

    logo.update(3, true);
    letters.forEach((letter, index) => {
      expect(letter.visible).toBe(true);
      expect(letter.position.distanceTo(rest[index])).toBeLessThan(1e-6);
      expect(letter.rotation.x).toBeCloseTo(0, 6);
    });
    logo.dispose();
  });

  it("stays still under reduced motion", () => {
    const logo = new TitleLogo();
    logo.update(0, true);
    const first = logo.group.children.map((child) => child.position.clone());
    logo.update(4.2, true);
    logo.group.children.forEach((child, index) => {
      expect(child.position.distanceTo(first[index])).toBeLessThan(1e-9);
    });
    expect(logo.group.rotation.y).toBe(0);
    logo.dispose();
  });
});
