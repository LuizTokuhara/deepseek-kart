import * as THREE from "three/webgpu";
import { Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import bungeeLogo from "../assets/fonts/bungee-logo.typeface.json";
import { celMaterial, INK_COLOR } from "./cel-shading";

interface LineStyle {
  readonly text: string;
  readonly size: number;
  readonly face: number;
  readonly side: number;
  /** Baseline-independent vertical center of the line. */
  readonly y: number;
}

const LINES: readonly LineStyle[] = [
  { text: "DEEPSEEK", size: 1, face: 0xfff8df, side: 0x415db3, y: 0.62 },
  { text: "KART", size: 1.55, face: 0xffe05b, side: 0xb78930, y: -0.5 },
];
/** Extrusion depth, per unit of font size. */
const DEPTH = 0.38;
/** Italic lean, as in the HTML title. */
const SKEW = 0.14;
/** Letter spacing, per unit of font size. */
const TRACKING = -0.02;
/** Sticker outline around each letter, per unit of font size. */
const OUTLINE = 0.075;
const SHADOW = new THREE.Vector2(0.05, -0.07);
const CHECKER_CELL = 0.17;

const font = new Font(bungeeLogo as unknown as FontData);

interface Letter {
  readonly group: THREE.Group;
  readonly rest: THREE.Vector3;
  readonly delay: number;
  readonly phase: number;
}

function easeOutBack(value: number): number {
  const t = Math.min(Math.max(value, 0), 1) - 1;
  return 1 + t * t * (2.6 * t + 1.6);
}

function smoothstep01(value: number): number {
  const t = Math.min(Math.max(value, 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The DEEPSEEK KART title as cel-shaded, extruded Bungee letters with an ink
 * sticker outline and a checkered strip. Every letter drops in on its own,
 * then the logo floats and a glint sweeps across it. Pure scene content;
 * `TitleLogoView` owns the renderer.
 */
export class TitleLogo {
  readonly group = new THREE.Group();
  /** Size of the settled logo, for framing the camera. */
  readonly bounds = new THREE.Box3();
  private readonly letters: Letter[] = [];
  private readonly checker = new THREE.Group();
  private readonly glint = new THREE.PointLight(0xfff4c8, 0, 6, 2);
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    const ink = new THREE.MeshBasicNodeMaterial({ color: INK_COLOR });
    this.disposables.push(ink);
    let order = 0;
    for (const line of LINES) {
      const face = celMaterial(line.face, 0, { hatch: false });
      const side = celMaterial(line.side, 0, { hatch: false });
      this.disposables.push(face, side);
      order = this.buildLine(line, [face, side], ink, order);
    }
    this.buildChecker(ink);
    this.group.rotation.z = THREE.MathUtils.degToRad(-2.5);
    this.group.updateMatrixWorld(true);
    this.bounds.setFromObject(this.group);

    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(-3, 5, 7);
    this.group.add(
      new THREE.HemisphereLight(0xe4efff, 0x2a3350, 1.1),
      key,
      this.glint,
    );
  }

  /** Poses the logo `seconds` after it appears; `reducedMotion` holds the rest pose. */
  update(seconds: number, reducedMotion: boolean): void {
    const t = reducedMotion ? 10 : seconds;
    for (const letter of this.letters) {
      const local = (t - letter.delay) / 0.75;
      const drop = easeOutBack(local);
      const bob = reducedMotion ? 0 : Math.sin(t * 2.1 + letter.phase) * 0.035;
      letter.group.position.set(
        letter.rest.x,
        letter.rest.y + (1 - drop) * 3.2 + bob,
        letter.rest.z + (1 - drop) * 2.5,
      );
      letter.group.rotation.x = (1 - drop) * -1.4;
      letter.group.visible = local > 0;
    }

    const strip = smoothstep01((t - 0.75) / 0.45);
    this.checker.scale.set(Math.max(strip, 0.0001), 1, 1);

    if (reducedMotion) {
      this.group.rotation.x = 0;
      this.group.rotation.y = 0;
      this.glint.intensity = 0;
      return;
    }
    this.group.rotation.x = Math.sin(t * 0.47) * 0.05;
    this.group.rotation.y = Math.sin(t * 0.6) * 0.14;
    // A glint crosses the face every few seconds once the letters landed.
    const sweep = ((t - 1.2) % 3.6) / 1.1;
    const active = t > 1.2 && sweep < 1;
    this.glint.position.set(
      THREE.MathUtils.lerp(this.bounds.min.x - 1, this.bounds.max.x + 1, sweep),
      0.4,
      1.6,
    );
    this.glint.intensity = active ? Math.sin(sweep * Math.PI) * 26 : 0;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
        object.geometry.dispose();
      }
    });
    for (const resource of this.disposables) resource.dispose();
  }

  private buildLine(
    line: LineStyle,
    materials: THREE.Material[],
    ink: THREE.Material,
    order: number,
  ): number {
    const scale = line.size / font.data.resolution;
    const advances = [...line.text].map(
      (char) => (font.data.glyphs[char]?.ha ?? 0) * scale + TRACKING * line.size,
    );
    const width = advances.reduce((sum, advance) => sum + advance, 0) - TRACKING * line.size;
    const shear = new THREE.Matrix4().makeShear(0, 0, SKEW, 0, 0, 0);
    let cursor = -width / 2;
    [...line.text].forEach((char, index) => {
      const shapes = font.generateShapes(char, line.size);
      const depth = DEPTH * line.size;
      const body = new THREE.ExtrudeGeometry(shapes, {
        depth,
        curveSegments: 6,
        bevelEnabled: true,
        bevelThickness: 0.035 * line.size,
        bevelSize: 0.022 * line.size,
        bevelSegments: 2,
      });
      // The plate only needs outer contours; offsetting counters would fold them.
      const outer = shapes.map((shape) => new THREE.Shape(shape.getPoints(6)));
      const plate = new THREE.ExtrudeGeometry(outer, {
        depth: 0.04 * line.size,
        curveSegments: 6,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: OUTLINE * line.size * 0.5,
        bevelOffset: OUTLINE * line.size * 0.5,
        bevelSegments: 1,
      });
      body.applyMatrix4(shear);
      plate.applyMatrix4(shear);
      plate.translate(SHADOW.x * line.size, SHADOW.y * line.size, -depth * 0.55);

      // Pivot each letter around its own center so it can tumble in.
      body.computeBoundingBox();
      const center = new THREE.Vector3();
      body.boundingBox!.getCenter(center);
      body.translate(-center.x, -center.y, -depth / 2);
      plate.translate(-center.x, -center.y, -depth / 2);

      const group = new THREE.Group();
      group.add(new THREE.Mesh(body, materials), new THREE.Mesh(plate, ink));
      const rest = new THREE.Vector3(cursor + center.x, line.y, 0);
      group.position.copy(rest);
      this.group.add(group);
      this.letters.push({ group, rest, delay: order * 0.065, phase: order * 0.55 });
      cursor += advances[index];
      order++;
    });
    return order;
  }

  private buildChecker(ink: THREE.Material): void {
    const kart = LINES[LINES.length - 1];
    const kartBox = new THREE.Box3();
    for (const letter of this.letters.slice(-kart.text.length)) {
      kartBox.expandByObject(letter.group);
    }
    const left = kartBox.min.x;
    const right = kartBox.max.x;
    const columns = Math.round((right - left) / CHECKER_CELL);
    const paper = new THREE.MeshBasicNodeMaterial({ color: 0xfff8df });
    this.disposables.push(paper);
    const cell = new THREE.BoxGeometry(CHECKER_CELL, CHECKER_CELL, 0.06);
    const dark = new THREE.InstancedMesh(cell, ink, columns);
    const light = new THREE.InstancedMesh(cell.clone(), paper, columns);
    const matrix = new THREE.Matrix4();
    let darkCount = 0;
    let lightCount = 0;
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < columns; column++) {
        matrix.makeTranslation(
          (column + 0.5) * CHECKER_CELL - (columns * CHECKER_CELL) / 2,
          -row * CHECKER_CELL,
          0,
        );
        if ((row + column) % 2 === 0) dark.setMatrixAt(darkCount++, matrix);
        else light.setMatrixAt(lightCount++, matrix);
      }
    }
    dark.count = darkCount;
    light.count = lightCount;
    this.checker.add(dark, light);
    this.checker.position.set((left + right) / 2, kartBox.min.y - 0.12 - CHECKER_CELL / 2, -0.1);
    this.group.add(this.checker);
  }
}
