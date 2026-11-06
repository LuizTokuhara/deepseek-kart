import type { CourseDefinition } from "../../course";
import { MeadowDecor } from "./decor";
import { meadowEnvironment } from "./environment";
import { meadowLayout } from "./layout";
import { meadowLoopMusic } from "./music";

export const meadowLoop: CourseDefinition = {
  layout: meadowLayout,
  environment: meadowEnvironment,
  music: meadowLoopMusic,
  createDecor: (track) => new MeadowDecor(track),
};
