import "./ui/style.css";
import { Game } from "./app/game";
import { StartScreen } from "./ui/start-screen";
import { courses, getCourse } from "./tracks/registry";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Element #app not found");
}

const course = getCourse(new URLSearchParams(window.location.search).get("track"));
document.title = `Deepseek Kart — ${course.layout.name}`;
const game = new Game(root, course);
new StartScreen(course, () => game.beginRace(), courses);
game.start();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__deepseekKart = game;
}
