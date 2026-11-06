import type { SongDefinition } from "../audio/music";
import type { Decoration } from "../decor/types";
import type { EnvironmentDefinition } from "../rendering/environment";
import type { TrackDefinition } from "./definition";
import type { TrackLike } from "./track";

/** Everything specific to a circuit lives behind this contract. */
export interface CourseDefinition {
  readonly layout: TrackDefinition;
  readonly environment: EnvironmentDefinition;
  /** Race soundtrack, composed in the course folder's `music.ts`. */
  readonly music: SongDefinition;
  createDecor(track: TrackLike): Decoration;
}
