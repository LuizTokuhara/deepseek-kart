import { Game } from "./app/game";
import { LoadingScreen } from "./ui/loading-screen";
import { StartScreen } from "./ui/start-screen";
import { TitleScreen } from "./ui/title-screen";
import { TitleLogoView } from "./ui/title-logo-view";
import { CINEMATIC } from "./core/config";
import { courses, getCourse } from "./tracks/registry";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Element #app not found");
}
const appRoot = root;

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const course = getCourse(params.get("track"));
  document.title = `Deepseek Kart — ${course.layout.name}`;

  const loading = new LoadingScreen();
  loading.set(0.02, "Loading circuit");
  // Let the HTML loading overlay paint before the synchronous scene build.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  // Canvas-drawn signs use the race font; they fall back to Arial Black without it.
  await document.fonts.load('64px "Bungee"').catch(() => undefined);

  const game = new Game(appRoot, course);
  try {
    const backend = await game.load((progress, label) => loading.set(progress, label));
    loading.setBackend(backend);
  } catch (error) {
    console.error("Unable to start the renderer", error);
    loading.fail("Could not start the 3D renderer. Try a browser with WebGPU or WebGL 2.");
    return;
  }

  loading.hide();
  // One 3D logo, shared by the title card and the track select.
  const logo = TitleLogoView.create();
  const openTrackSelect = (): void => {
    const startScreen = new StartScreen(
      course,
      (difficulty) => game.beginRace(difficulty),
      courses,
      logo,
    );
    game.onReturnToMenu = () => startScreen.show();
  };
  // A fresh visit opens with the cinematic and the title; changing track
  // reloads with ?track and goes straight back to the track select.
  if (params.has("track")) {
    openTrackSelect();
  } else {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) game.startAttract();
    new TitleScreen(() => {
      game.stopAttract();
      openTrackSelect();
    }, reducedMotion ? 0 : CINEMATIC.duration, logo);
  }
  document.getElementById("start-sound")?.addEventListener("click", () => {
    game.audio.toggleMuted();
  });
  game.start();

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__deepseekKart = game;
  }
}

void boot();
