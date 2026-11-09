import { Game } from "./app/game";
import { LoadingScreen } from "./ui/loading-screen";
import { StartScreen } from "./ui/start-screen";
import { courses, getCourse } from "./tracks/registry";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Element #app not found");
}
const appRoot = root;

async function boot(): Promise<void> {
  const course = getCourse(new URLSearchParams(window.location.search).get("track"));
  document.title = `Deepseek Kart — ${course.layout.name}`;

  const loading = new LoadingScreen();
  loading.set(0.02, "Loading circuit");
  // Let the HTML loading overlay paint before the synchronous scene build.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

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
  const startScreen = new StartScreen(course, () => game.beginRace(), courses);
  game.onReturnToMenu = () => startScreen.show();
  document.getElementById("start-sound")?.addEventListener("click", () => {
    game.audio.toggleMuted();
  });
  game.start();

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__deepseekKart = game;
  }
}

void boot();
