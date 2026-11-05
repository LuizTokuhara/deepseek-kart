import type { CourseDefinition } from "../../course";
import { RacewayDecor } from "./decor";
import { racewayEnvironment } from "./environment";
import { racewayLayout } from "./layout";

export const deepseekRaceway: CourseDefinition = {
  layout: racewayLayout,
  environment: racewayEnvironment,
  createDecor: (track) => new RacewayDecor(track),
};
