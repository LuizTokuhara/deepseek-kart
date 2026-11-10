import * as THREE from "three";

export type StartBannerTheme = "wood" | "tropical" | "ice" | "desert" | "city";

interface BannerPalette {
  readonly background: string;
  readonly stripe: string;
  readonly accent: string;
  readonly title: string;
  /** Extruded edge under the title, like the 3D logo. */
  readonly depth: string;
  readonly ribbon: string;
  readonly ribbonText: string;
  readonly subtitle: string;
  /** Night signs glow instead of casting a hard extrusion. */
  readonly glow?: string;
}

const INK = "#17191e";
const PAPER = "#fff8df";

const PALETTES: Record<StartBannerTheme, BannerPalette> = {
  wood: {
    background: "#a8642f", stripe: "#b8733a", accent: "#ffe05b",
    title: "#ffe05b", depth: "#b78930", ribbon: "#2f6fb4", ribbonText: PAPER,
    subtitle: "SPRING GRAND PRIX",
  },
  tropical: {
    background: "#1f5a50", stripe: "#256a5e", accent: "#f4cc75",
    title: PAPER, depth: "#3e8f7f", ribbon: "#f4cc75", ribbonText: INK,
    subtitle: "TROPICAL GRAND PRIX",
  },
  ice: {
    background: "#2f78a3", stripe: "#3b87b4", accent: "#e1f8ff",
    title: "#f4fdff", depth: "#7cc3e3", ribbon: "#e1f8ff", ribbonText: "#1b4d69",
    subtitle: "FROZEN GRAND PRIX",
  },
  desert: {
    background: "#c99450", stripe: "#d3a35f", accent: "#1d7477",
    title: "#fff0c2", depth: "#b9813f", ribbon: "#1d7477", ribbonText: "#f2d37e",
    subtitle: "DESERT GRAND PRIX",
  },
  city: {
    background: "#121733", stripe: "#171d40", accent: "#7ff6ff",
    title: "#ffe3f3", depth: "#ff3fa8", ribbon: "#121733", ribbonText: "#b8fbff",
    subtitle: "MIDNIGHT GRAND PRIX", glow: "#ff3fa8",
  },
};

/** Texture resolution, in pixels per meter of banner. */
const PIXELS_PER_METER = 128;
const FONT = '"Bungee", "Arial Black", Impact, sans-serif';
/** Italic lean shared with the 3D logo. */
const LEAN = -0.14;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawBackground(context: CanvasRenderingContext2D, palette: BannerPalette, width: number, height: number): void {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = palette.stripe;
  for (let x = -height; x < width; x += 90) {
    context.beginPath();
    context.moveTo(x, height);
    context.lineTo(x + 44, height);
    context.lineTo(x + 44 + height * 0.6, 0);
    context.lineTo(x + height * 0.6, 0);
    context.fill();
  }
}

/** Checkered flag blocks at both ends, framed like flag panels. */
function drawCheckeredEnds(context: CanvasRenderingContext2D, palette: BannerPalette, width: number, height: number): number {
  const inset = 22;
  const rows = 4;
  const square = (height - inset * 2) / rows;
  const columns = 3;
  const blockWidth = square * columns;
  for (const left of [inset, width - inset - blockWidth]) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        context.fillStyle = (row + column) % 2 === 0 ? PAPER : INK;
        context.fillRect(left + column * square, inset + row * square, square, square);
      }
    }
    context.lineWidth = 6;
    context.strokeStyle = palette.accent;
    context.strokeRect(left - 3, inset - 3, blockWidth + 6, height - inset * 2 + 6);
  }
  return inset + blockWidth + 6;
}

/** Largest font size, up to `maximum`, at which `text` fits in `width`. */
function fitFont(context: CanvasRenderingContext2D, text: string, width: number, maximum: number): number {
  let size = maximum;
  context.font = `${size}px ${FONT}`;
  while (size > 24 && context.measureText(text).width > width) {
    size -= 4;
    context.font = `${size}px ${FONT}`;
  }
  return size;
}

function drawTitle(
  context: CanvasRenderingContext2D, palette: BannerPalette, title: string,
  centerX: number, centerY: number, room: number,
): void {
  const size = fitFont(context, title, room, 118);
  context.save();
  context.translate(centerX, centerY);
  context.transform(1, 0, LEAN, 1, 0, 0);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  const depth = Math.round(size * 0.08);
  if (palette.glow) {
    context.shadowColor = palette.glow;
    context.shadowBlur = 28;
  } else {
    // Stacked copies give the letters the same extruded edge as the logo.
    for (let step = depth; step > 0; step--) {
      context.lineWidth = 16;
      context.strokeStyle = INK;
      context.strokeText(title, step * 0.6, step);
      context.fillStyle = palette.depth;
      context.fillText(title, step * 0.6, step);
    }
  }
  context.lineWidth = 16;
  context.strokeStyle = INK;
  context.strokeText(title, 0, 0);
  context.fillStyle = palette.title;
  context.fillText(title, 0, 0);
  context.restore();
}

function drawRibbon(
  context: CanvasRenderingContext2D, palette: BannerPalette, text: string,
  centerX: number, centerY: number,
): void {
  context.save();
  context.font = `26px ${FONT}`;
  context.letterSpacing = "5px";
  const width = context.measureText(text).width + 64;
  const height = 42;
  roundedRect(context, centerX - width / 2, centerY - height / 2, width, height, height / 2);
  context.fillStyle = palette.ribbon;
  if (palette.glow) {
    context.shadowColor = palette.accent;
    context.shadowBlur = 14;
  }
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = palette.glow ? palette.accent : INK;
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = palette.ribbonText;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, centerX + 2.5, centerY + 2);
  context.restore();
}

/** Draws the start-gantry banner: the course name in race-poster style. */
export function drawStartBanner(
  context: CanvasRenderingContext2D,
  title: string,
  theme: StartBannerTheme,
  width: number,
  height: number,
): void {
  const palette = PALETTES[theme];
  drawBackground(context, palette, width, height);
  const ends = drawCheckeredEnds(context, palette, width, height);
  const titleY = height * 0.42;
  drawTitle(context, palette, title, width / 2, titleY, width - ends * 2 - 70);
  drawRibbon(context, palette, palette.subtitle, width / 2, height - 44);
  // Ink frame with an inner accent line, like the HUD panels.
  context.lineWidth = 12;
  context.strokeStyle = INK;
  context.strokeRect(6, 6, width - 12, height - 12);
  context.lineWidth = 4;
  context.strokeStyle = palette.accent;
  context.strokeRect(15, 15, width - 30, height - 30);
}

/** Banner material for a `width` × `height` meter panel, without stretching the art. */
export function startBannerMaterial(
  title: string,
  theme: StartBannerTheme,
  width: number,
  height: number,
): THREE.MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * PIXELS_PER_METER);
  canvas.height = Math.round(height * PIXELS_PER_METER);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D unavailable for the start banner");
  drawStartBanner(context, title, theme, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  material.userData.outlineParameters = { visible: false };
  return material;
}
