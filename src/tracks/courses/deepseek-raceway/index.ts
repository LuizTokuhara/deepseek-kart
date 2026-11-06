import type { CourseDefinition } from "../../course";
import { RacewayDecor } from "./decor";
import { racewayEnvironment } from "./environment";
import { racewayLayout } from "./layout";
import { deepseekRacewayMusic } from "./music";

export const deepseekRaceway: CourseDefinition = {
  layout: racewayLayout,
  environment: racewayEnvironment,
  music: deepseekRacewayMusic,
  createDecor: (track) => new RacewayDecor(track),
};
