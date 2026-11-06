import type { CourseDefinition } from "../../course";
import { LamplightCityDecor } from "./decor";
import { lamplightCityEnvironment } from "./environment";
import { lamplightCityLayout } from "./layout";
import { lamplightCityMusic } from "./music";

export const lamplightCity: CourseDefinition = {
  layout: lamplightCityLayout,
  environment: lamplightCityEnvironment,
  music: lamplightCityMusic,
  createDecor: (track) => new LamplightCityDecor(track),
};
