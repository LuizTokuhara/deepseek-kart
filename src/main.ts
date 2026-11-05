import "./style.css";
import { Game } from "./game";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Element #app not found");
}

const game = new Game(root);
game.start();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__deepseekKart = game;
}
