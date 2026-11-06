import type { CourseDefinition } from "../../course";
import { VanillaLakeDecor } from "./decor";
import { vanillaLakeEnvironment } from "./environment";
import { vanillaLakeLayout } from "./layout";

export const vanillaLake: CourseDefinition = {
  layout: vanillaLakeLayout,
  environment: vanillaLakeEnvironment,
  createDecor: (track) => new VanillaLakeDecor(track),
};
