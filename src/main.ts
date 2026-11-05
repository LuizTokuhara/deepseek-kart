import "./ui/style.css";
import { Game } from "./app/game";
import { getCourse } from "./tracks/registry";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Element #app not found");
}

const course = getCourse(new URLSearchParams(window.location.search).get("track"));
document.title = `Deepseek Kart — ${course.layout.name}`;
const game = new Game(root, course);
game.start();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__deepseekKart = game;
}
