import type { CourseDefinition } from "../../course";
import { VanillaLakeDecor } from "./decor";
import { vanillaLakeEnvironment } from "./environment";
import { vanillaLakeLayout } from "./layout";
import { vanillaLakeMusic } from "./music";

export const vanillaLake: CourseDefinition = {
  layout: vanillaLakeLayout,
  environment: vanillaLakeEnvironment,
  music: vanillaLakeMusic,
  createDecor: (track) => new VanillaLakeDecor(track),
};
