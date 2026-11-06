import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { fractalNoise2D, valueNoise2D } from "../src/core/noise";
import { ExclusionMask, RoadDistanceField, scatterPoints } from "../src/decor/nature/scatter";
import { applyWind, advanceWind } from "../src/rendering/wind";
import { insideLake } from "../src/tracks/courses/vanilla-lake/lake-scenery";
import { meadowLayout } from "../src/tracks/courses/meadow-loop/layout";
import { vanillaLakeLayout } from "../src/tracks/courses/vanilla-lake/layout";
import { courses } from "../src/tracks/registry";
import { GroundShape, pathDistance } from "../src/tracks/relief";
import { Track } from "../src/tracks/track";

// Only canvas text rendering needs a browser; geometry and placement stay real.
vi.mock("../src/decor/props/signs", () => ({
  signMaterial: () => new THREE.MeshBasicMaterial(),
}));

const SQUARE_PATH = [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }];
const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

describe("value noise", () => {
  it("should stay in [0, 1), repeat for the same seed and vary smoothly", () => {
    for (let index = 0; index < 200; index++) {
      const x = index * 0.37 - 30;
      const z = index * 0.71 - 50;
      const value = fractalNoise2D(x, z, 7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(fractalNoise2D(x, z, 7)).toBe(value);
      expect(Math.abs(valueNoise2D(x + 0.01, z, 7) - valueNoise2D(x, z, 7))).toBeLessThan(0.05);
    }
  });
});

describe("ground shape", () => {
  it("should measure the distance to a closed centerline", () => {
    expect(pathDistance(SQUARE_PATH, 0, -10)).toBeCloseTo(0);
    expect(pathDistance(SQUARE_PATH, 0, 0)).toBeCloseTo(10);
    expect(pathDistance(SQUARE_PATH, 13, 14)).toBeCloseTo(5);
  });

  it("should keep the old flat grid when neither relief nor skirt is set", () => {
    const shape = new GroundShape(SQUARE_PATH, BOUNDS);

    expect(shape.offsetAt(30, -40)).toBe(0);
    expect(shape.gridLines(-50, 50, 4)).toEqual([-50, -25, 0, 25, 50]);
  });

  it("should keep the road corridor flat and roll the ground beyond it", () => {
    const relief = { amplitude: 2, wavelength: 12, clearance: 6, blend: 4 };
    const shape = new GroundShape(SQUARE_PATH, BOUNDS, relief);
    const far: number[] = [];
    for (let x = -45; x <= 45; x += 3) far.push(Math.abs(shape.offsetAt(x, 40)));

    for (const point of SQUARE_PATH) expect(shape.offsetAt(point.x, point.z)).toBe(0);
    expect(shape.offsetAt(0, -14)).toBe(0);
    expect(Math.max(...far)).toBeGreaterThan(0.3);
    expect(Math.max(...far)).toBeLessThanOrEqual(2);
  });

  it("should extend the grid beyond the bounds and raise the skirt with distance", () => {
    const shape = new GroundShape(SQUARE_PATH, BOUNDS, undefined, { width: 80, rise: 20 });
    const lines = shape.gridLines(-50, 50, 4);

    expect(lines[0]).toBe(-130);
    expect(lines[lines.length - 1]).toBe(130);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(shape.offsetAt(49, 0)).toBe(0);
    expect(shape.offsetAt(130, 0)).toBeGreaterThan(shape.offsetAt(70, 0));
    expect(shape.offsetAt(70, 0)).toBeGreaterThan(0);
  });
});

describe("track ground", () => {
  it("should keep the Meadow road at ground level while hiding only the map wall mesh", () => {
    const track = new Track(meadowLayout);
    const visibleWall = new Track({
      ...meadowLayout,
      style: { ...meadowLayout.style, mapWallVisible: true },
    });

    for (const point of track.path) expect(track.groundHeightAt(point.x, point.z)).toBe(0);
    expect(track.colliders.length).toBe(visibleWall.colliders.length);
    expect(track.group.children.length).toBe(visibleWall.group.children.length - 1);
  });

  it("should reach the skirt edge with the Meadow ground mesh", () => {
    const track = new Track(meadowLayout);
    const ground = track.group.getObjectByName("track-ground") as THREE.Mesh;
    ground.geometry.computeBoundingBox();

    expect(ground.geometry.boundingBox!.max.x).toBeCloseTo(110 + meadowLayout.style.skirt!.width);
  });

  it("should leave courses without a skirt on their original grid", () => {
    const track = new Track(vanillaLakeLayout);
    const ground = track.group.getObjectByName("track-ground") as THREE.Mesh;
    const { width, depth } = vanillaLakeLayout.bounds;
    ground.geometry.computeBoundingBox();

    expect(ground.geometry.getAttribute("position").count).toBe((width + 1) * (depth + 1));
    expect(ground.geometry.boundingBox!.max.x).toBeCloseTo(width / 2);
    expect(ground.geometry.boundingBox!.min.z).toBeCloseTo(-depth / 2);
  });
});

describe("scatter", () => {
  const track = new Track(meadowLayout);

  it("should approximate the centerline distance on its coarse grid", () => {
    const field = new RoadDistanceField(track);
    for (const [x, z] of [[0, 0], [-60, 30], [70, -45], [12.3, -41.7]]) {
      expect(Math.abs(field.at(x, z) - pathDistance(track.path, x, z))).toBeLessThan(1);
    }
  });

  it("should fill an area evenly and honour the density", () => {
    const area = { minX: 0, maxX: 40, minZ: 0, maxZ: 40 };
    const all = scatterPoints(area, 2, 3, () => 1);
    const half = scatterPoints(area, 2, 3, (x) => (x < 20 ? 1 : 0));

    expect(all.length).toBe(400);
    expect(half.every((point) => point.x < 20)).toBe(true);
    expect(half.length).toBeGreaterThan(150);
  });

  it("should block colliders fully and keep a solid-only margin around them", () => {
    const mask = new ExclusionMask(BOUNDS);
    mask.addColliders([{ center: { x: 10, y: 1, z: 10 }, half: { x: 2, y: 1, z: 1 }, yaw: 0 }], 1);

    expect(mask.level(10, 10)).toBe(2);
    expect(mask.level(12.6, 10)).toBe(1);
    expect(mask.level(15, 10)).toBe(0);
  });

  it("should block flat ground pieces but not tall props", () => {
    const root = new THREE.Group();
    const pond = new THREE.Mesh(new THREE.CircleGeometry(5, 32));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-20, 0.02, 0);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
    pillar.position.set(20, 2, 0);
    root.add(pond, pillar);
    const mask = new ExclusionMask(BOUNDS);
    mask.addFlatFootprints(root);

    expect(mask.level(-20, 0)).toBe(2);
    expect(mask.level(-16.5, 0)).toBe(2);
    // Fora do círculo, mesmo dentro da caixa que o contém.
    expect(mask.level(-15.6, 4.4)).toBe(0);
    expect(mask.level(20, 0)).toBe(0);
  });
});

describe("wind", () => {
  const stubShader = () => ({
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: "#include <common>\nvoid main() {\n#include <project_vertex>\n}",
    fragmentShader: "",
  });

  it("should inject the sway after projection and keep earlier shader hooks", () => {
    const material = new THREE.MeshToonMaterial();
    let earlier = false;
    material.onBeforeCompile = () => { earlier = true; };
    applyWind(material, { strength: 0.1, from: 0, to: 1 });
    const shader = stubShader();
    material.onBeforeCompile(shader as never, undefined as never);

    expect(earlier).toBe(true);
    expect(shader.vertexShader).toContain("uniform float windTime;");
    expect(shader.vertexShader.indexOf("windOffset")).toBeGreaterThan(
      shader.vertexShader.indexOf("#include <project_vertex>"),
    );
  });

  it("should give different sway settings different shader programs", () => {
    const a = new THREE.MeshToonMaterial();
    const b = new THREE.MeshToonMaterial();
    applyWind(a, { strength: 0.1, from: 0, to: 1 });
    applyWind(b, { strength: 0.2, from: 0, to: 1 });

    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });

  it("should freeze the shared clock under reduced motion", () => {
    const material = new THREE.MeshToonMaterial();
    applyWind(material, { strength: 0.1, from: 0, to: 1 });
    const shader = stubShader();
    material.onBeforeCompile(shader as never, undefined as never);
    const before = shader.uniforms.windTime.value as number;

    advanceWind(0.5, true);
    expect(shader.uniforms.windTime.value).toBe(before);
    advanceWind(0.5, false);
    expect(shader.uniforms.windTime.value).toBeCloseTo(before + 0.5);
  });
});

describe.each(courses)("$layout.name ground cover", (course) => {
  const track = new Track(course.layout);
  const decor = course.createDecor(track);
  const cover = decor.group.getObjectByName("ground-cover");
  const field = new RoadDistanceField(track);
  decor.group.updateMatrixWorld(true);

  it("should grow plants only outside the barriers, colliders and lakes", () => {
    expect(cover).toBeDefined();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    let plants = 0;
    cover!.traverse((object) => {
      // Outlines repeat the instances of the mesh they draw around.
      if (!(object instanceof THREE.InstancedMesh)) return;
      if (object.material instanceof THREE.ShaderMaterial) return;
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix.premultiply(object.matrixWorld));
        plants++;
        expect(field.at(position.x, position.z)).toBeGreaterThan(track.wallOffset + 0.3);
        if (course.layout.id === "vanilla-lake") {
          expect(insideLake(position.x, position.z)).toBe(false);
        }
      }
    });
    expect(plants).toBeGreaterThan(1000);
  });

  it("should keep plants out of every scenery collider", () => {
    const mask = new ExclusionMask(track.bounds);
    mask.addColliders(decor.colliders, 0);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    cover!.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix.premultiply(object.matrixWorld));
        expect(mask.level(position.x, position.z)).toBeLessThan(2);
      }
    });
  });
});
