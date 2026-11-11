# How to add a track

Each course lives in a folder under `courses/`. The game receives a
`CourseDefinition` and reuses the same actors, items, physics, AI, HUD and
race rules. The track folder decides the route and the visual composition.

This guide covers the authoring flow. Durable implementation notes for the
registered courses live in [`AGENTS.md`](../../AGENTS.md#course-notes).

## 1. Create the folder

Use `courses/meadow-loop/` as a simple example or `courses/deepseek-raceway/`
as an example with animated scenery. Create these files:

```text
courses/my-track/
  layout.ts        route and data used by the simulation
  environment.ts   sky, fog and lighting
  music.ts         race music theme
  decor.ts         assembly of the scenery components
  index.ts         export of the complete course
```

## 2. Define the route in `layout.ts`

Export a `TrackDefinition` with a unique `id`. You can use
`createRoundedTrackCurve` from `../../curves`, `createFilletedCurve` (a street
polyline with rounded corners, which may cross itself) or provide your own
closed `THREE.CatmullRomCurve3` on the XZ plane. `curveTAt(curve, x, z)`
returns the `t` closest to a point, useful for positioning checkpoints,
boxes and elevated sections by coordinate.

- `width`: track width, in meters.
- `sampleStep`: approximate distance between AI path samples.
- `spawnT`: start position between 0 and 1 along the curve.
- `surface`: `dirt`, `asphalt`, `ice`, `sand` or `stone`; this is the base road
  surface. Outside it, the default is `grass`; use `offroadSurface` to switch it
  to `sand`, for example.
- `surfaceZones`: optional `{ from, to, surface }` ranges that change the surface
  around the lap. Physics, HUD, audio and particles read the same zone.
- `style.groundFinish`: ground texture outside the track (`grass`, `sand`,
  `snow` or `stone`, the city paving). Without this field, the texture is
  derived from the base surface.
- `style.viaduct`: viaduct colors (`wallColor` of the retaining walls,
  `girderColor` of the open-span girder and `walkwayColor` of the deck walkway).
- `style.relief`: ground undulations outside the corridor
  (`{ amplitude, wavelength, clearance, blend }`). The ground stays flat up to
  `clearance` meters from the centerline, so use it only where no props rest at
  `y = 0`, or position them with `track.groundHeightAt(x, z)`. It is purely
  visual: physics still reads the track height.
- `style.skirt`: visual ground beyond the bounds (`{ width, rise }`), rising to
  the horizon instead of ending at the wall. The mesh uses a wide step in that
  band.
- `style.mapWallVisible: false`: hides the boundary wall and keeps collision.
  Use it only when karts cannot reach the edge, as in Meadow Loop.
- `checkpointTs`: checkpoint positions, in race order.
- `checkpointRadius`: pass radius for checkpoints and the finish line.
- `itemRows`: `t` position of each row and lateral offsets of the boxes.
- `wallGaps`: barrier-free intervals, with `side` equal to -1 or 1.
- `obstacles`: solid objects defined relative to the route.
- `features`: ramps, ice holes and banked turns (optional).
- `bounds`: map width and depth, centered at the origin.
- `style`: colors and dimensions of the road, barriers and map bounds.

Import `DEFAULT_TRACK_STYLE` from `../../style` and override the properties
you need. When changing the width, also adjust `style.wallOffset` and
`style.startLine.width`. The `RaceDecor` gantry and checkered start line use the
track width automatically. The gantry banner (`decor/props/start-banner.ts`) is
drawn in Bungee at the panel's real size, so wider tracks get a wider poster
instead of stretched text; `theme` picks its palette and Grand Prix ribbon
(`wood`, `tropical`, `ice`, `desert`, `city`). Tests that build a course mock
that module, like `decor/props/signs`, because Node has no canvas.

Leave a straight section at the start to accommodate the five-kart grid.
Checkpoints must appear after the start, in order, before crossing it again.
Two sections may only cross if one of them passes above the other on a
viaduct (`features.elevations`, section 2.3). Checkpoints, the finish line and
item boxes are tested in 2D: keep them away from the crossing.

### 2.1 Ramps, holes and banked turns

`features` is resolved from the centerline itself. Positions use `t`
(0–1) and length/width measurements are in meters:

```ts
features: {
  banks: [{ from: 0.19, to: 0.29, angle: -0.2 }],
  ramps: [{ t: 0.072, length: 7, width: 5.2, height: 1.35, lateral: 2.2 }],
  holes: [{ t: 0.12, lateral: -3.6, radiusX: 1.8, radiusZ: 2.2 }],
}
```

- `banks`: lateral tilt smoothed at the edges of the interval. The outer side
  rises; the snowy ground follows the tilt and returns to ground level after
  the barriers.
- `ramps`: wedge with a linear profile and support for all four wheels. When
  crossing the kicker, `rampLaunchAt` converts the rise along the direction of
  movement into a vertical impulse, even with only two wheels on the ramp.
  Leaving through the side or descending in reverse gives no impulse. Gravity
  controls the flight and the landing. `style.rampStyle` defines color, texture,
  rails and chevrons; without it, the ramp uses Vanilla Lake's ice finish.
- `holes`: ellipse in the ice. The fall begins when the kart's center enters
  the opening and the kart reaches the water; jumps can cross it. The white rim
  is solid. `radiusX` is transverse and `radiusZ` is longitudinal; the opening
  matches the inner radius of the ring (92% of those radii). Wheels over the
  water do not pull the chassis down while the center remains on the ice.
- `heightAt`, `bankAt`, `rampLaunchAt`, `holeAt` and `recoveryPoint` live on
  `TrackLike` and are consumed by the kart, AI, items, camera and decoration.
  `hazards` exposes the holes so the AI can avoid them.

### 2.2 Falls and Lakitu

Falling into a hole or leaving the bounds no longer restarts the race. The kart
falls for `PHYSICS.fallDuration`, and then `recoveryPoint` returns the vehicle
to the centerline a few meters before the hazard, avoiding holes, ramps and
steeply banked turns. Race time continues; the equipped item is preserved.
The player sees the `LAKITU RESCUE!` notice, a water splash, sound and camera
shake. The AI uses the same rule and also avoids the holes.

### 2.3 Viaducts and two levels

`features.elevations` creates elevated sections along the lap:

```ts
features: {
  elevations: [{ from: tAt(0, -58), to: tAt(0, 58), height: 5.5, ramp: 44 }],
}
```

The deck rises smoothly over `ramp` meters from `from`, stays at `height`
and descends over `ramp` meters to `to`. Ramps of 44 m to 5.5 m give a maximum
slope of ~11°. Where another section of the track passes underneath (up to
`wallOffset + 3.5` m), the viaduct is an open span: the girder and underside
are 0.9 m below the deck, so the span is ~4.6 m and the camera fits underneath.
Elsewhere, the embankment is closed with retaining walls, pilasters and
abutments. `Track` builds this structure (`viaduct.ts`) and the walkway between
the asphalt and the parapet; the deck is the track mesh itself.

At a point (x, z) there can be two surfaces. `heightAt(x, z, reference)`
returns the highest one that something resting at `reference` can reach (a 1.5 m
step); without a reference, it returns the highest of all. Therefore:

- the kart, wheels, shadow, tire marks, oil slick and missiles pass their own
  height as the reference and stay on their level;
- `levelAt(x, z, reference)` gives the deck height under the kart, and the
  camera follows that level entirely (jumps still move the camera only in part);
- `pathLevel(index)` gives the deck height at each centerline point, used by
  stuck-AI recovery, by the posts and by the road paint;
- colliders whose base is above the kart's roof (`PHYSICS.kartHeight`) do not
  touch it. Ground barriers become `heightAware` (anything on the viaduct passes
  over them); open-span barriers only exist up high; embankment barriers descend
  to the ground. Karts and items on different levels neither collide nor hit
  each other;
- a kart that loses the ground by more than `PHYSICS.ledgeDrop` falls under
  gravity instead of settling at once.

Do not combine `banks` and `elevations` at the same crossing: the ground tilt
uses the nearest projection on the centerline. Ramps and holes in `features`
also do not follow the viaduct.

## 3. Define the environment in `environment.ts`

Export an `EnvironmentDefinition`, imported from
`../../../rendering/environment`. Configure `background`, the fog limits in
`fog`, the ambient light in `ambient`, and the sun's color, intensity and
relative position in `sun`. The optional `sky` field defines `zenith` (color of
the top of the sky), `ground` (color of the fill coming from the ground),
`blend` (height at which the zenith dominates; lower values let the blue show
closer to the horizon) and `cloudCover` (threshold for the clouds painted in
the sky; default 0.6, higher values leave the sky clearer). The sun disk, halo
and cloud tint derive from `sun`. Rendering follows the player with this light.

For night, `sky.stars` (0–1) lights stars, swaps the sun disk for a smaller
moon with a faint halo and darkens the clouds; `sky.haze` changes the color of
the horizon band (the city glow). `headlights: true` turns on headlights on
every kart (lamps and a beam on the asphalt) and a real spot light on the
player's kart. Keep `sun` (the moon) and the hemisphere weak: the warm light
comes from the street lights.

The optional `grade` field adjusts the final on-screen color, after bloom:
`contrast` and `saturation` (1 keeps them), `shadowTint` and `highlightTint`
(change the hue of shadows and highlights without changing brightness) and
`vignette` (0 to 1). Without `grade`, the image comes out as before.

Static batches created with `createBatch(..., shadows = true)` receive, in
addition to the real shadow near the player, soft elliptical shadows at a
distance. Therefore objects that move or disappear (penguins, breakable ice)
should not use this path; hand-built static instanced meshes can opt in with
`mesh.userData[BLOB_SHADOW_FLAG] = true`.

The road and grass use shared procedural textures from
`rendering/terrain-material.ts`, applied in world coordinates to avoid seams
between segments. The material accepts `grass`, `dirt`, `asphalt`, `snow`,
`ice`, `sand` and `stone`; ice tracks use `snow` on the ground and `ice` on the
road, while the desert uses `sand` on the ground and `stone` in the tunnel.
`style.wet` (`{ sheen }`) soaks the road and ground after rain: darker paint,
puddles and a sky sheen of the `sheen` color at grazing angles. Lights mirror on
the wet ground with `createWetReflections` (`rendering/wet-reflections.ts`);
Lamplight City feeds it its street-level lamps, span lights and shop neons.
Deck lamps are left out: the flat mirror plane would hang off the sloped deck.

`createBackdrop(width, depth, color, haze)` adds three rings of ranges outside
the map bounds; each track chooses their color and passes its `background` as
`haze`. Aerial perspective: every farther ring blends more toward the horizon,
with fainter ink (none on the last), and mist pools at the foot of each range.
The blend runs after lighting and fog, through the material's `outputNode`.

Light sources (lava, torches, lamps) use `glowColor()` from
`rendering/glow.ts` on the material color. The function raises luminance above
the bloom threshold without changing the hue: the surface still shows the
original color and only the halo reveals the glow. Ordinary materials should
stay below a linear luminance of ~1.4, or they start to glow; the
`bloom threshold` test covers the lighting of each track, so overly strong
sun/hemisphere/ambient light fails there.

## 3.1 Compose the theme in `music.ts`

Export a `SongDefinition`, imported from `../../../audio/music`. The soundtrack
is synthesized in real time; there are no audio files. Define:

- `bpm`, `finalLapTempo` (multiplier on the final lap, ~1.1) and, for jazz,
  `swing` (delay of the off-beat eighth in sixteenth notes; 0.6 ≈ triplet feel).
- `key`: tonic and mode (`major`, `minor` or `phrygian-dominant`). Third-based
  harmony and the bass neighbor note follow this scale.
- `voices`: lead timbre (`square`, `brass`, `steel`, `bell`, `reed`),
  accompaniment timbre (`brass`, `pluck`, `keys`, `steel`) and bass timbre
  (`slap`, `synth`, `upright`). The timbres already come out level-matched.
- `patterns`: grooves of one bar or more, one character per sixteenth note.
  In the bass, `r` root, `o` octave, `5` fifth, `3` third, `7` seventh,
  `n` scale neighbor and `a` chromatic approach to the next bar; in the
  accompaniment and drums, `x` attack, `X` accent, `g` ghost note,
  `-` sustain and `.` rest. `fill` replaces the drums in the last bar of
  each section; `lightDrums` serves sections with `drums: "light"`.
- `intro` (plays once at GO) and `loop` (repeats; the final lap restarts from it).

Each section provides chord symbols per bar (`"F | Dm | Gm7 C7 | F"`, with up to
four chords per bar) and the melody as notes with duration in sixteenth notes:
`"c6:3 a5:3 f5:2 g5:2 a5:2 c6:4 | ..."`, with `.` for a rest. Each bar
must add up to 16. `leadVoice` changes the lead timbre in the section and
`harmony: true` doubles the melody a third below. The cymbal enters on its own
in each section.

`tests/music.test.ts` compiles the theme of every registered track and checks
for complete bars, a loop of at least 40 s, the register of each layer, and that
the melody lands on a chord tone on every strong beat and chord change. Use
original themes: do not transcribe music from other games.

## 4. Build the decoration in `decor.ts`

Import the shared components from `../../../decor`. Track-specific assembly
belongs in the track folder; reusable geometry belongs in `src/decor/`.

```ts
import {
  buildHills,
  hillColliders,
  RaceDecor,
  type Decoration,
} from "../../../decor";
import type { TrackLike } from "../../track";

export function createDecor(track: TrackLike): Decoration {
  const decor = new RaceDecor(track, {
    banner: "MY TRACK",
    lineColor: 0xffd66b,
    curbColors: [0x3e8dd4, 0xfff3d6],
  });
  // In this oval track example, the hill sits in the infield, outside the road.
  const hills = [{ x: 0, z: 0, sx: 12, sy: 5, sz: 10 }];
  buildHills(hills, decor.group);
  decor.colliders.push(...hillColliders(hills));
  return decor;
}
```

Available components:

| Folder | Components |
|---|---|
| `decor/nature/` | Trees, palms, plants, rocks, flowers, hills, clouds, lagoon, volcano, ground cover and background forest |
| `decor/props/` | Grandstand, balloon and signs |
| `decor/race/` | Gantry, start lights, checkered start line, curbs, bunting and road paint |
| `decor/city/` | Houses, shops and offices with lit windows, street lights and a real light rig |

`Decoration` contains `group` and `colliders`, plus the optional methods
`update(dt, frame)` and `setStartLights(label)`. `frame` carries the camera
position (`view`) and the preference for less motion (`reducedMotion`). The game
calls these methods and merges the scenery colliders with the track's.
Compositions with multiple components should forward the methods to their
children, as `RacewayDecor` does.

`createLagoon(x, z)` and `createVolcano(x, z)` return components with their own
animation in `update(dt)` and their own colliders; their default positions are
the origin. Tree and cloud builders receive lists of positions and a parent
group. `buildHills` draws the mound and `hillColliders` returns its solid foot,
so compose both. Trees are drawn in batches: add the trunk colliders in the
composition, as in the `MeadowDecor` example. Check for free space in the
driving lanes, item boxes and the grid.

New vehicle models live in `src/actors/`; item behaviors and models live in
`src/items/`. These modules receive track data through contracts and must not
import a specific course folder.

## 5. Export and register

In `index.ts`, assemble the four parts:

```ts
import type { CourseDefinition } from "../../course";
import { layout } from "./layout";
import { environment } from "./environment";
import { music } from "./music";
import { createDecor } from "./decor";

export const myTrack: CourseDefinition = { layout, environment, music, createDecor };
```

Import `myTrack` in `src/tracks/registry.ts` and add it to the `courses` array.
Open `/?track=<layout-id>`. A missing or unknown identifier uses
the default track. There is no need to change `Game`.

## 6. Validate

Run `npm test` and `npm run build`. The `tests/courses.test.ts` test walks
through every registered course: it instantiates the scenery, karts and items;
checks the grid, free lanes and pickups; and simulates three laps with the AI
and colliders. Sign text textures are replaced in this test without a browser.

Open the new track in the browser to check the start screen, the start framing,
materials, shadows, animation and HUD, as well as driving and using items.
The start screen shows the name, surface and layout of the selected course.
The map is derived from `layout.curve`, and switching tracks uses the course
registry; newly registered tracks appear in the menu without UI changes.

## Course examples

The five registered courses show the shared components in different
combinations:

- **Deepseek Raceway** — tropical dirt circuit with a start village, lagoon
  bend, garden return, volcano and animated lagoon.
- **Meadow Loop** — asphalt reference with forest belt, grassy hills, clouds and
  a hidden map boundary.
- **Vanilla Lake** — ice circuit with banked turns, ramps, holes, breakable ice
  and penguin crossings.
- **Sunstone Ruins** — desert circuit with mixed surfaces, a covered stone
  tunnel, pyramids and an oasis.
- **Lamplight City** — night street circuit with a viaduct, city blocks, parks
  and a moving light rig.

Detailed implementation notes for each course, including layout features,
scenery, collision and lighting, live in
[`AGENTS.md`](../../AGENTS.md#course-notes).

## Shared scenery and lighting

Import reusable decoration from `src/decor`; the course folder owns placement and
colliders. `createGroundCover` and `createForestBelt` add vegetation without
collision. Trees and plants sway through `applyWind`, and the same wind must be
applied to their instanced outlines. See
[`AGENTS.md`](../../AGENTS.md#scenery-and-lighting) for the shared scenery and
lighting rules.
