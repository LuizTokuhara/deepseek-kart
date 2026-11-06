import type { CourseDefinition } from "../../course";
import { SunstoneRuinsDecor } from "./decor";
import { sunstoneRuinsEnvironment } from "./environment";
import { sunstoneRuinsLayout } from "./layout";
import { sunstoneRuinsMusic } from "./music";

export const sunstoneRuins: CourseDefinition = {
  layout: sunstoneRuinsLayout,
  environment: sunstoneRuinsEnvironment,
  music: sunstoneRuinsMusic,
  createDecor: (track) => new SunstoneRuinsDecor(track),
};
