import * as THREE from "three/webgpu";
import { blendFogInSrgb } from "../src/rendering/srgb-fog";
import { kartCelMaterial } from "../src/rendering/cel-shading";
import { terrainMaterial } from "../src/rendering/terrain-material";
import { PostProcessing } from "../src/rendering/post-processing";

/** Real pixel checks. Run from the Vite page with its animation loop paused. */
export async function checkRenderingPixels(renderer: THREE.WebGPURenderer): Promise<string[]> {
  const checks: string[] = [];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const target = new THREE.RenderTarget(16, 16, { type: THREE.UnsignedByteType });
  const geometry = new THREE.PlaneGeometry(20, 20);
  const basic = new THREE.MeshBasicNodeMaterial();
  const mesh = new THREE.Mesh<THREE.PlaneGeometry, THREE.NodeMaterial>(geometry, basic);
  mesh.position.z = -5;
  scene.add(mesh);
  const previousTarget = renderer.getRenderTarget();
  const materials: THREE.Material[] = [mesh.material];
  const pixel = async () => {
    // Advance the frame so FRAME uniforms (including light intensities) refresh.
    await new Promise<void>((resolve) => {
      void renderer.setAnimationLoop(() => {
        void renderer.setAnimationLoop(null);
        resolve();
      });
    });
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const data = await renderer.readRenderTargetPixelsAsync(target, 8, 8, 1, 1);
    return Array.from(data).slice(0, 3).map((channel) => channel / 255);
  };
  const near = (actual: number[], expected: number[], label: string) => {
    if (actual.some((value, i) => !Number.isFinite(value) || Math.abs(value - expected[i]) > 0.012)) {
      throw new Error(`${label}: got ${actual}, expected ${expected}`);
    }
    checks.push(label);
  };

  try {
    const base = new THREE.Color(0.04, 0.16, 0.36);
    const fogColor = new THREE.Color(0.64, 0.25, 0.09);
    basic.color.copy(base);
    scene.fog = new THREE.Fog(fogColor, 0, 10);
    blendFogInSrgb(scene, scene.fog);
    const expected = base.clone().convertLinearToSRGB()
      .lerp(fogColor.clone().convertLinearToSRGB(), 0.5).convertSRGBToLinear();
    near(await pixel(), expected.toArray(), "fog blends in sRGB and returns linear color");
    scene.fog.near = 6;
    near(await pixel(), base.toArray(), "fog references follow near/far updates");
    scene.fog.near = 0;
    scene.fog.far = 4;
    near(await pixel(), fogColor.toArray(), "far fog reaches its exact artistic color");

    const kart = kartCelMaterial(0xffffff);
    kart.fog = false;
    materials.push(kart);
    mesh.material = kart;
    scene.add(new THREE.AmbientLight(0xffffff, Math.PI));
    near(await pixel(), [0.48, 0.53, 0.65], "kart indirect light retains the cool tint");

    const ice = terrainMaterial(0x94d3e6, "ice");
    materials.push(ice);
    mesh.material = ice;
    // Composition must precede fog; otherwise frost/glints would leak through it.
    near(await pixel(), fogColor.toArray(), "ice finish is composed before fog");
    ice.fog = false;
    scene.children.filter((child) => child instanceof THREE.Light)
      .forEach((light) => { (light as THREE.Light).intensity = 0; });
    const darkIce = await pixel();
    if (Math.max(...darkIce) < 0.03) throw new Error("Ice details were multiplied by lighting again");
    checks.push("ice internal layers remain visible after lighting");
    return checks;
  } finally {
    renderer.setRenderTarget(previousTarget);
    target.dispose();
    geometry.dispose();
    for (const material of materials) material.dispose();
  }
}

/** Exercise the actual scene → bloom → display chain, including PassNode.setup(). */
export async function checkPostProcessingPixels(renderer: THREE.WebGPURenderer): Promise<string[]> {
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();
  const previousTarget = renderer.getRenderTarget();
  const target = new THREE.RenderTarget(128, 128, { type: THREE.UnsignedByteType });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  const material = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3, 3, 3) });
  const geometry = new THREE.PlaneGeometry(0.5, 0.5);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -5;
  scene.add(mesh);
  renderer.setPixelRatio(1);
  renderer.setSize(128, 128);
  const post = new PostProcessing(renderer, scene, camera);
  const checks: string[] = [];
  const frame = async () => {
    await new Promise<void>((resolve) => {
      void renderer.setAnimationLoop(() => { void renderer.setAnimationLoop(null); resolve(); });
    });
    renderer.setRenderTarget(target);
    post.render();
  };
  const read = async (x: number, y: number) => Array.from(
    await renderer.readRenderTargetPixelsAsync(target, x, y, 1, 1),
  ).slice(0, 3).map((channel) => channel / 255);
  try {
    await frame();
    const halo = await read(83, 64); // Beyond the source, whose edge is at x=80.
    if (post.hdr && Math.max(...halo) < 0.04) {
      throw new Error(`HDR light lost before bloom: no halo (${halo})`);
    }
    if (!post.hdr && Math.max(...halo) > 0.01) throw new Error("LDR fallback unexpectedly blooms");
    checks.push(post.hdr ? "HDR highlights produce a visible bloom halo" : "8-bit fallback renders without bloom");
    material.color.setRGB(0.5, 0.5, 0.5);
    await frame();
    if (Math.max(...await read(83, 64)) > 0.01) throw new Error("Ordinary paint leaked into bloom");
    checks.push("ordinary paint stays below the bloom threshold");

    // The optimized uniform branch must still smear when active, then return
    // to the exact sharp path. Sample just beyond the plane's right edge.
    const sharp = await read(81, 64);
    post.setBoost(1);
    await frame();
    const boosted = await read(81, 64);
    if (Math.max(...boosted) <= Math.max(...sharp) + 0.01) {
      throw new Error("Boost blur did not sample inward across the silhouette");
    }
    post.setBoost(0);
    await frame();
    const restored = await read(81, 64);
    if (restored.some((value, i) => Math.abs(value - sharp[i]) > 0.01)) {
      throw new Error("Boost blur did not restore the sharp frame");
    }
    checks.push("boost blur activates and returns to the sharp path without residual smear");

    const base = new THREE.Color(0.04, 0.16, 0.36);
    const haze = new THREE.Color(0.64, 0.25, 0.09);
    material.color.copy(base);
    mesh.scale.setScalar(10);
    scene.fog = new THREE.Fog(haze, 0, 10);
    blendFogInSrgb(scene, scene.fog);
    for (const [depth, factor] of [[1, 0.028], [5, 0.5], [10, 1]] as const) {
      mesh.position.z = -depth;
      await frame();
      const expected = base.clone().convertLinearToSRGB().lerp(haze.clone().convertLinearToSRGB(), factor).toArray();
      const actual = await read(64, 64);
      if (actual.some((value, i) => Math.abs(value - expected[i]) > 0.015)) {
        throw new Error(`Fog density changed in final pipeline at ${depth}: ${actual}, expected ${expected}`);
      }
    }
    checks.push("near, middle and far fog retain the legacy density through the full pipeline");
    return checks;
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.x, size.y);
    post.dispose();
    target.dispose();
    geometry.dispose();
    material.dispose();
  }
}

/** Keep kart ink visible around rounded bodywork across camera poses and aspect ratios. */
export async function checkOutlinePixels(renderer: THREE.WebGPURenderer): Promise<string[]> {
  const { createOutlineObject, releaseOutlineObject } = await import('../src/rendering/outline-material');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x888888);
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  const target = new THREE.RenderTarget(512, 256, { type: THREE.UnsignedByteType, stencilBuffer: true });
  const previousTarget = renderer.getRenderTarget();
  const material = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
  // Use the real kart stroke settings with unlit white paint for pixel detection.
  const kartPaint = kartCelMaterial(0xffffff, 0.0035);
  material.userData.outlineParameters = kartPaint.userData.outlineParameters;
  material.stencilWrite = kartPaint.stencilWrite;
  material.stencilRef = kartPaint.stencilRef;
  material.stencilFunc = kartPaint.stencilFunc;
  material.stencilZPass = kartPaint.stencilZPass;
  kartPaint.dispose();
  const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
  const geometry = new RoundedBoxGeometry(1.4, 0.6, 2, 4, 0.08);
  const mesh = new THREE.Mesh(geometry, material);
  const hull = createOutlineObject(mesh)!;
  mesh.add(hull);
  scene.add(mesh);
  const checks: string[] = [];
  try {
    for (const [width, height] of [[512, 256], [256, 512]]) {
      target.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setRenderTarget(target);
      for (const elevation of [0, 0.4, 0.9]) {
        for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
          camera.position.set(Math.sin(angle) * 8, elevation * 8, Math.cos(angle) * 8);
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
          const data = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
          const dark = (x: number, y: number) => data[(y * width + x) * 4] < 32;
          const white = (x: number, y: number) => data[(y * width + x) * 4] > 240;
          for (const vertical of [false, true]) {
            const length = vertical ? height : width;
            const sample = (i: number, predicate: typeof dark) => vertical
              ? predicate(width / 2, i) : predicate(i, height / 2);
            let first = -1, last = -1;
            for (let i = 0; i < length; i++) {
              if (sample(i, white)) { if (first < 0) first = i; last = i; }
            }
            const hasInk = (edge: number, direction: number) => [1, 2, 3, 4]
              .some(step => sample(edge + direction * step, dark));
            if (first < 0 || !hasInk(first, -1) || !hasInk(last, 1)) {
              throw new Error(`Ink missing: ${width}x${height}, angle=${angle}, elevation=${elevation}, vertical=${vertical}`);
            }
          }
        }
      }
    }
    checks.push("kart bodywork retains ink on all four sides across 30 camera/aspect combinations");
    return checks;
  } finally {
    renderer.setRenderTarget(previousTarget);
    releaseOutlineObject(hull);
    geometry.dispose(); material.dispose(); target.dispose();
  }
}

/** Regress the real kart silhouette at the race-start rear camera, not a proxy shape. */
export async function checkKartOutlinePixels(renderer: THREE.WebGPURenderer): Promise<string[]> {
  const { KartModel, PLAYER_PALETTE } = await import('../src/actors/kart/kart-model');
  const { OutlineManager } = await import('../src/rendering/outline-manager');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaaaaaa);
  const kart = new KartModel(PLAYER_PALETTE);
  const paints = new Map<THREE.Material, THREE.MeshBasicNodeMaterial>();
  // White paint isolates silhouette coverage from the naturally black tyres/shadows.
  kart.group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === "kart-contact-shadow") { mesh.visible = false; return; }
    const white = (source: THREE.Material) => {
      let material = paints.get(source);
      if (!material) {
        material = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
        material.userData.outlineParameters = source.userData.outlineParameters;
        material.stencilWrite = source.stencilWrite;
        material.stencilRef = source.stencilRef;
        material.stencilFunc = source.stencilFunc;
        material.stencilZPass = source.stencilZPass;
        paints.set(source, material);
      }
      return material;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(white) : white(mesh.material);
  });
  scene.add(kart.group);
  const outlines = new OutlineManager(scene);
  const hulls: THREE.Object3D[] = [];
  kart.group.traverse(object => { if (object.userData.isOutline) hulls.push(object); });
  const width = 768, height = 384;
  const target = new THREE.RenderTarget(width, height, { type: THREE.UnsignedByteType, stencilBuffer: true });
  const previousTarget = renderer.getRenderTarget();
  const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 100);
  const checks: string[] = [];
  const read = async () => {
    renderer.render(scene, camera);
    return await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
  };
  try {
    renderer.setRenderTarget(target);
    for (const angle of [0, 0.6, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      // Local -Z is directly behind the kart, matching Deepseek Raceway's grid camera.
      camera.position.set(Math.sin(angle) * 6.5, 2.8, -Math.cos(angle) * 6.5);
      camera.lookAt(0, 0.62, 0);
      hulls.forEach(hull => { hull.visible = false; });
      const plain = await read();
      hulls.forEach(hull => { hull.visible = true; });
      const inked = await read();
      let boundary = 0, covered = 0;
      for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
          const index = (y * width + x) * 4;
          if (plain[index] > 240) {
            if (inked[index] < 240) throw new Error(`Kart ink covered the paint at angle ${angle}`);
            continue;
          }
          if (![index - 4, index + 4, index - width * 4, index + width * 4]
            .some(neighbour => plain[neighbour] > 240)) continue;
          boundary++;
          if (inked[index] < 40) covered++;
        }
      }
      const coverage = covered / boundary;
      if (boundary < 100 || coverage < 0.8) {
        throw new Error(`Real kart outline incomplete: angle=${angle}, coverage=${coverage}, boundary=${boundary}`);
      }
      checks.push(`real kart ink covers ${(coverage * 100).toFixed(1)}% of silhouette boundary at angle ${angle.toFixed(2)}`);
    }
    // The visible silhouette must still be hidden by opaque scenery in front of it.
    camera.position.set(0, 2.8, -6.5);
    camera.lookAt(0, 0.62, 0);
    const wallGeometry = new THREE.PlaneGeometry(8, 8);
    const wallMaterial = new THREE.MeshBasicNodeMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(0, 1, -3);
    scene.add(wall);
    const occluded = await read();
    scene.remove(wall);
    wallGeometry.dispose(); wallMaterial.dispose();
    for (let index = 0; index < occluded.length; index += 4) {
      if (occluded[index] < 40) throw new Error("Kart outline showed through foreground scenery");
    }
    checks.push("foreground scenery hides kart ink correctly");
    return checks;
  } finally {
    renderer.setRenderTarget(previousTarget);
    outlines.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    kart.group.traverse(object => { if ((object as THREE.Mesh).isMesh) geometries.add((object as THREE.Mesh).geometry); });
    geometries.forEach(geometry => geometry.dispose());
    paints.forEach(material => material.dispose());
    target.dispose();
  }
}
