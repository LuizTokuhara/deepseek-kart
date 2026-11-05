import type { Decoration } from "../decor/types";
import type { EnvironmentDefinition } from "../rendering/environment";
import type { TrackDefinition } from "./definition";
import type { TrackLike } from "./track";

/** Everything specific to a circuit lives behind this contract. */
export interface CourseDefinition {
  readonly layout: TrackDefinition;
  readonly environment: EnvironmentDefinition;
  createDecor(track: TrackLike): Decoration;
}
