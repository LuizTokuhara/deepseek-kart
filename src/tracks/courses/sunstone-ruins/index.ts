import type { CourseDefinition } from "../../course";
import { SunstoneRuinsDecor } from "./decor";
import { sunstoneRuinsEnvironment } from "./environment";
import { sunstoneRuinsLayout } from "./layout";

export const sunstoneRuins: CourseDefinition = {
  layout: sunstoneRuinsLayout,
  environment: sunstoneRuinsEnvironment,
  createDecor: (track) => new SunstoneRuinsDecor(track),
};
