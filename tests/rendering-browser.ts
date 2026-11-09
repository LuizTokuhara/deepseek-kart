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
