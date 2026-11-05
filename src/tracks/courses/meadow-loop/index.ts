import type { CourseDefinition } from "../../course";
import { MeadowDecor } from "./decor";
import { meadowEnvironment } from "./environment";
import { meadowLayout } from "./layout";

export const meadowLoop: CourseDefinition = {
  layout: meadowLayout,
  environment: meadowEnvironment,
  createDecor: (track) => new MeadowDecor(track),
};
