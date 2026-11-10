# How to add a track

Each course lives in a folder under `courses/`. The game receives a
`CourseDefinition` and reuses the same actors, items, physics, AI, HUD and
race rules. The track folder decides the route and the visual composition.

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

## Visual reference section

The first 60 meters of Deepseek Raceway use the composition in
`courses/deepseek-raceway/start-village.ts`: tropical gantry, planters,
animated flags, stone promenade and barrier trim. The palette combines teal,
cream, gold and coral. The grandstand next to the start uses the same palette.

The planter and flag models live in `decor/props/festival-props.ts`.
They return `Decoration`, including local colliders. The composition positions
the models and transforms their colliders into world space, keeping the objects
behind the barriers. `mergeStaticDecoration` groups static geometry by
material; the animated flag mesh remains separate. This helper consumes the
original static geometries, so use it only on groups that own them.

The first turn continues that visual direction in `lagoon-bend.ts`: continuous
coral/cream curbs, direction signs, two vegetation islands and a "LAGOON BEND"
marker. The outer band between `t=0.30` and `0.365` keeps the exit onto the
grass. Random vegetation is excluded from this composition area to preserve the
signs and the lagoon view. The sign model lives in
`decor/props/curve-marker.ts` and accepts left or right direction.

## Volcano and lagoon

`decor/nature/volcano.ts` builds the irregular profile, the sunken crater and
the branching lava flows. The lava is projected onto the rock mesh at creation
time; the animation only updates the hot color and the smoke instances.
`decor/nature/lagoon.ts` keeps the shore colliders and uses lower rocks on the
side facing the track. `rendering/painted-water.ts` draws the depth bands, foam
and soft glints in a shader, with no external images or reflection passes. Both
still receive their position and `update(dt)`.

## Reusable vegetation

`decor/nature/trees.ts` offers `round`, `spreading` and `column` canopies, with
asymmetric volumes, per-vertex tints and per-instance colors. `TreeSpot.variant`
is optional. `decor/nature/palms.ts` accepts `PalmPlacement.variant` as
`arching`, `compact` or `tall`, with their own heights and leans and two leaf
layers. Without an explicit variant, the position picks a stable shape
regardless of object order in the array.

Geometries and materials are shared; each variant uses instances.
Canopies and trunks get a thin pixel-width outline from `createInstancedOutline`;
open palm fronds still have no extrusion to avoid black faces. Tracks control
the groups, spacing and colliders: Raceway preserves the view of the shore near
the lagoon, and Meadow Loop uses small groves alternating with open spaces.
Trees check the distance to every track segment before being placed.

### Ground cover and background forest

`createGroundCover(track, options)` scatters grass tufts, flowers, rocks and
shrubs outside the barriers, in 32 m batches that fade with distance. The
grass is dense at the foot of the barriers and forms patches in the open field;
`grass.density` makes the ground sparse, as on snow and sand. Call it at the end
of the decoration constructor and pass:

- `avoid`: the scenery colliders; nothing spawns inside them, and rocks and
  shrubs keep a margin around them;
- `flatRoot`: the decoration group; ground-hugging pieces (paving, sand, water,
  planters) are detected automatically and kept clear;
- `exclude`: extra areas, such as the Vanilla Lake pond (`insideLake`).

Everything is decorative and has no collision: shrubs and rocks only appear
more than 3 m from the barriers. `createForestBelt(track, options)` rings the
map edge with faceted, cheap, shadowless trees that climb up the terrain skirt;
`exclude` makes room for landmarks such as the Raceway volcano.

Trees, palms, conifers, plants, grass and reeds sway with `applyWind`
(`rendering/wind.ts`). Only the part above `from` moves, all instances follow
the same wind direction, and the clock stops with `prefers-reduced-motion`.
The material's `positionNode` is also reused by the WebGPURenderer shadow pass,
so the shadow follows the sway. `windDepthMaterial` remains available for
compatibility, but it is not needed in the new pipeline. Apply the wind to the
outline material of `createInstancedOutline` too, so the line follows along.

## In-race lighting

Each environment can configure `hemisphere` (sky/ground colors and intensity)
and `sun.shadow` (PCF filter intensity and radius). Raceway combines a warm sun
with a cooler fill and shadows at intensity 0.82; Meadow uses a slightly lower
fill. The shared gradient keeps three discrete bands, with the dark tone more
open to preserve detail.

`Environment.follow` aligns the center of the projection to the shadow map
texels in light space while keeping the sun direction fixed. This reduces
shimmering on static edges during movement without adding lights or render
passes. `tests/environment.test.ts` checks projection stability under small
displacements, negative coordinates and teleporting, including an overhead sun.
The map remains 2048 × 2048.

## Garden Return

`courses/deepseek-raceway/garden-return.ts` composes the chicane, the west turn
and the return straight (`t=0.50–0.94`). The “GROVE TURN” pavilion marks the
approach to the turn; planters and flags accompany the coral/cream grandstand,
and the groves leave the apex and exit clear. `inGardenReturn` reserves the area
for this composition and prevents overlap with procedural vegetation.

The `decor/props/garden-pavilion.ts` model accepts the sign text, returns local
colliders and can be placed on other tracks. Its roof seams, braces, post collars,
railings and backed benches are baked by material, preserving the open entrance. The `decor/race/course-edging.ts`
helper receives the route, definition and interval: it builds continuous curbs,
caps, bases and reflectors on top of the barriers, respecting `wallGaps`. Custom
intervals must be added to `RaceDecor`'s `curbExclusions` so they do not overlap
the generic curbs.

Static objects are grouped by material; trees and plants use instances, and only
the four flags update their geometry. The `Garden Return runoff` test preserves
the inner runoff strip between `t=0.675` and `0.74`. The original obstacle in
that strip keeps its position and collider, with a rock visual shape instead of
a box.

## Vanilla Lake

`courses/vanilla-lake/` is the reference for a track with ice and elevation
change. The layout uses `surface: "ice"`, a hand-drawn curve of approximately
572 m and a width of 17 m. The start is on the west side; the route passes
through the north crossing, Penguin Bend, the jump sequence to the east and
the ice slalom to the south. There are five banked sections (including a
left-hand turn), three ramps, six holes, eight breakable ice blocks and three
penguin crossings. The blocks form four staggered rows in the south slalom; the
penguins alternate crossings with pauses that clear the center line.

`lake-scenery.ts` builds the cut-out central lake, the north channel, the
floating ice sheets and the animated geysers. The decorative water stays outside
the track; drivable openings remain defined in `features.holes`. The reference
was adapted to the current mechanics: jumping and rescue, with no gliding
flight or underwater driving. The shores use a hollow ring so two coplanar water
and ice surfaces do not overlap.

The decoration combines `buildSnowPines`, `buildSnowmen`, `buildIceBlocks`,
`buildIceCrystals`, `buildSnowDrifts`, `createFrozenPond` and `createPenguin`,
plus the `RaceDecor` gantry with `theme: "ice"` and sector signs. The scenery
filters consider the entire corridor and the lake polygon.

`penguin-crossing.ts` controls the three crossing points in the northeast
sector. Each direction has a 4 s wait, a 1.5 s amber warning and a 6.5 s walk;
the round trip takes 24 s, with 0 / 1.2 / 2.4 s offsets between the penguins.
They stop inside the track edges without crossing the barriers.
`Decoration.fixedUpdate` advances the obstacles before the karts; `update`
remains reserved for visual effects. The initial countdown does not advance the
crossings and `reset` restores the default when the race restarts. The same
collision objects are updated in place, keeping the model, projectiles and
camera in sync. `movingObstacles` reports position and velocity to the AI, which
predicts the crossing and slows down when necessary. Moving colliders with
`heightAware` allow jumping over when the kart is above the penguin.

The environment defines `snowfall: { count: 520, radius: 30 }`. The volume
follows the camera, recycles flakes as instanced camera-facing quads and uses a
single draw call; reduced motion hides the snow. `ice-detail.ts` provides a
shared procedural texture for cracks, frost and bubbles. On the track mesh, the
`roadEdge` attribute concentrates frost at the edges; ramps keep the same ice
layer without that lateral mask. The light skid marks follow the ground height
and tilt, and are not emitted in the air or over water openings.

The landing impulse is detected in the physics tick and sent to the visual
suspension, particles and camera. The damper uses substeps; it does not modify
the physics trajectory. The camera respects reduced motion and hole recovery is
not treated as a landing. Wheels extend in flight and adjust contact
individually.

The ice on the turns uses a continuous mesh generated by the same height
function used by physics. The continuous projection on the turn avoids steps
between samples. The ground is a heightfield that follows `bankAt` inside the
track corridor and blends into the base level outside the barriers. The snow
has enough resolution not to clip through the low side at turn entries and
exits. The ice edges get a continuous blue band to keep the track readable
against the snow. The `tests/vanilla-lake.test.ts` test covers lower grip on
ice, outward banking, mesh-to-physics correspondence, contact through
transitions, takeoff and landing on two or four wheels at 30/60/120 Hz, hole
edges, jumps over the water and Lakitu rescue.

The ice/snow textures and the new props are procedural; no external asset is
loaded. When repositioning snow, pines, crystals or blocks, keep the colliders
outside the driving lanes and item boxes, as the other tracks do.

`breakable-ice.ts` keeps the visuals and collision of the eight blocks in the
same state. The capsule's first contact breaks the block, preserves 60% of the
speed and opens the passage for all racers until `reset()`. There is no bounce
or respawn during the lap. `ColliderBox.enabled` also removes the volume from
projectile and camera queries; `heightAware` allows jumps above the block. The
shards are reused and animated in `fixedUpdate`, disappearing after 0.9 seconds.
The ice stacks outside the track remain static scenery.

## Sunstone Ruins

`courses/sunstone-ruins/` is the reference for a track with mixed surfaces and
Egyptian scenery. The layout is approximately 597 m long and 16 m wide, with a
hand-drawn curve with four banked sections, two sandstone ramps and an 84 m
stone tunnel (`t=0.5723–0.7131`). The start is on the sphinx straight, there is
a dune sequence to the east, and the inner loop wraps around a small pyramid.

The base track reports `dirt` (compacted sand), but `offroadSurface: "sand"`
makes the outer area slow down like loose ground and emit light dust. The buried
section uses `surfaceZones`, not a second track mesh: the same `surfaceAt`
returns `stone` to wheels, AI, HUD, audio and particles. The stone floor is
drawn by `Track.addSurfaceOverlays()`, which samples the centerline, `heightAt`
and the turn banking. It sits 12 mm above the base slab and uses the procedural
`stone` texture with irregular joints and blocks.

`tunnel.ts` closes the corridor with instanced blocks in three tones, a ceiling
of dark slabs, beams, hieroglyph bands, five torches with animated point lights
and two portals with a winged sun disk. The walls follow the centerline and sit
at `±9.25 m`; the colliders replace the generic barriers removed by `wallGaps`
between `t=0.567` and `0.718`. The entire group receives `GROUND_Y`, and the
colliders add the same height to stay aligned with the road. The sun symbol on
the floor is purely visual.

`monuments.ts` builds pyramids with sloped faces and a gilded apex, a sphinx
with a striped nemes, obelisks and broken columns. `pyramid-masonry.ts` builds
staggered stone courses with beveled joints, recessed blocks and patches of
missing casing, all in one vertex-colored mesh. The core and facing leave an
actual opening behind the stone portal; its solar relief follows the slope. `dunes.ts` generates a
continuous 560 m mesh with sinuous ridges, gentle windward ramps and steeper
leeward faces. The clearings preserve the monument bases; triangles near the
track are removed so they do not cover banked turns. The tunnel ceiling also
uses a continuous ridge, without overlapping half-domes.

`decor/props/stone-shapes.ts` supplies irregular boulders, chipped masonry and
fractured column drums. Rocks keep their original placement radius and use
shared instances; ruin columns are baked by material. The temple has broken
lintels and a partially collapsed rear wall, with the rubble inside the court.
The same boulder builder serves the Raceway shore and tropical ground rocks.

`details.ts` composes the temple courtyard, papyrus columns, stelae, pottery,
linen banners and the oasis staircase. Static meshes are grouped by material and
the new colliders stay outside the driving lane. `scenery.ts` groups rocks, dry
vegetation and the oasis (cut-out pond, reeds, water lilies, palms and ripples).
The tunnel gets painted panels of ankhs and sun disks. The main pyramids, sphinx
and obelisks keep their own colliders.

The environment represents late afternoon around 18:00: copper and orange sky,
apricot-colored haze, low amber light and long shadows. The tunnel ceiling
blocks direct sunlight; the torches warm the interior and keep the exit
readable. `signMaterial(..., "desert")` and the `RaceDecor(theme: "desert")`
banner share the sandstone and turquoise palette.

`tests/sunstone-ruins.test.ts` covers the surface change at the tunnel edges,
sand outside the track, stone grip between asphalt and ice, deceleration on
sand and wall colliders outside the drivable lane. It also uses raycasts to
verify that the dunes do not cover the banked turns, validates the free space of
the new colliders and limits the decoration geometry batches.
`tests/courses.test.ts` also simulates three laps with the AI and validates the
grid, items and complete scenery.

## Lamplight City

`courses/lamplight-city/` is the reference for a night track with a viaduct. The
~526 m layout is an urban figure eight made with `createFilletedCurve` (16 m
corners): the start is on the east–west avenue, which passes under the
north–south avenue viaduct. The checkpoints and boxes stay away from the
crossing.

`city-plan.ts` distributes the lots: facades facing each street (shops at the
start and to the south, houses to the west and north, offices next to the
viaduct), a taller second row behind them and a grid that fills the rest of the
map. No lot intrudes on the sidewalk (`wallOffset + 4.6` m from the centerline),
the parks or the corridor under the viaduct. `planSkyline` places the horizon
towers outside the map, with no collision or shadow.

The buildings live in `decor/city/buildings.ts`: one instanced body per building,
with framed windows, shutters, selected shallow balconies and roof seams on
houses; striped awnings, mullions and recessed sign plates on shops; and floor
bands, entrances, open parapets and rooftop equipment on offices. Lower-floor
relief shares instance batches and skips outlines on fine details. Skyline
lots retain their simpler geometry. Neon sign planes remain in front of the
shop plates. Windows are
drawn by `rendering/facade-material.ts` (per-instance `facade` attribute: seed,
lit fraction, style and floor height). Far from the camera, when a window
occupies few pixels, the facade becomes the average color and does not shimmer.
Shop windows light up on the ground floor of the front face.

`decor/city/street-lights.ts` draws the street lights (pole structure, lens
above the bloom threshold and an additive light pool on the ground, tilted on
ramps) and the `LightRig`: eight fixed `PointLight`s that, every frame, move to
the lights closest to the camera. Intensity falls to zero near the distance
cutoff, so no light flickers when switching poles. `city-lights.ts` positions
the poles on the sidewalk or on the viaduct parapet, never under the deck, and
adds the span lights and the flashing-yellow traffic lights at the corners.

`decor/race/road-markings.ts` paints the center line, edge lines and crosswalks
following `pathLevel`. Neon signs use `neonSignMaterial` from
`decor/props/signs.ts`; like the signs, it needs a canvas, so tests that build
the scenery replace both. `tests/lamplight-city.test.ts` covers the two levels
at the crossing, the track mesh against physics, parapets and barriers per
level, karts and oil slicks on different levels, the AI passing above and below
on the same lap, the buildings outside the sidewalks and the smooth switching
of `LightRig` lights.
