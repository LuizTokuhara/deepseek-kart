# Deepseek Kart — MVP

A playable arcade kart racer prototype in **HTML + TypeScript + Three.js**.
The goal of this phase is to feel and tune the physics: five courses, five
karts, chase camera, acceleration, braking, reverse, steering, dirt, grass,
ice, sand, stone and asphalt surfaces, banked turns, ramps, holes, a covered
stone tunnel, a night city overpass that crosses over the track, collision,
hop/drift/mini-turbo, items and a 3-lap timed race.

The karts are low-poly and cartoon-styled, built procedurally from Three.js
primitives and custom geometry with a high-contrast three-tone cel ramp, fine
TSL inverted-hull ink outlines, and flat, readable silhouettes inspired by Jet
Set Radio.

There are no imported audio files: every sound is synthesized at runtime with the Web Audio API.
Final art is still pending.

## Run

```bash
npm install
npm run dev
```

Open the address printed by Vite (defaults to `http://localhost:5173`).

Rendering uses `WebGPURenderer` from Three.js. On browsers without WebGPU the
same scene falls back to the WebGL 2 backend automatically. Add `?webgl` to
the URL to force that fallback while testing. A boot overlay stays visible
while the GPU device starts and the scene shaders are precompiled.

Other commands:

```bash
npm run build     # typecheck + production build
npm test          # physics, collision, AI, race, items and grid tests
npm run preview   # preview the build
```

For GPU pixel regressions, open the Vite page, wait for the start screen, then
run this in the browser console (repeat with `?webgl`):

```js
const game = window.__deepseekKart;
await game.renderer.setAnimationLoop(null);
try {
  const { checkRenderingPixels, checkPostProcessingPixels } = await import('/tests/rendering-browser.ts');
  console.table(await checkRenderingPixels(game.renderer));
  console.table(await checkPostProcessingPixels(game.renderer));
} finally {
  game.start();
}
```

## Controls

| Key | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake; reverse after stopping |
| `A` / `←` | Steer left |
| `D` / `→` | Steer right |
| `Space` / `Shift` | Hop; hold + steer to drift |
| `E` | Use the current item |
| `R` | Restart race, kart and camera |
| `M` | Mute or unmute sound |
| `H` | Toggle help |
| `T` | Toggle debug HUD |

### Sound

- Every effect and the soundtrack are **procedurally synthesized** with the
  Web Audio API; the repository contains no audio files.
- The kart engine follows RPM, throttle and boost, with a separate positional
  engine for each rival. Tires hiss and squeal with lateral slip, the surface
  changes the rumble, and wind rises with speed.
- Drift charge, tier changes, mini-turbo and lightning boosts have their own
  layers. Items have pickup, launch and hit sounds, and nearby rivals are
  panned by distance.
- The race has countdown beeps, a **GO!** chord, lap jingles, a finish fanfare
  and crowd reactions. The music ducks on the results screen.
- Each course has its own original arcade theme, composed in its folder's
  `music.ts` and played by a small synthesized band: lead with vibrato and
  echo, harmony in thirds, comping, a bass line with chromatic approach notes
  and drums with fills and crash cymbals. Deepseek Raceway is a steel-drum
  calypso (144 BPM), Meadow Loop a brass-and-square-lead grand prix theme
  (152 BPM), Vanilla Lake a swung jazz tune with sleigh bells (168 BPM),
  Sunstone Ruins a phrygian-dominant reed melody over a maqsum groove (138 BPM)
  and Lamplight City a C-minor synth-funk with slap bass (126 BPM).
  The music starts on GO; on the final lap a fanfare plays and the main theme
  restarts 10–14% faster.
- **M** mutes or unmutes at any time. The start screen also has a **SOUND ON /
  SOUND OFF** button, and the preference is saved locally.
- Browsers only allow audio after a user gesture, so the context starts when
  the player presses **START RACE**.

### Drift and mini-turbo

- Above **6 m/s**, hold `Space`/`Shift` and steer to start a drift.
- The hop happens automatically when the drift starts.
- Grip drops to **45%** during the drift: the rear really slides, and the camera
  leans (yaw + roll) to communicate the drift.
- You can **switch drift sides without releasing the button**: hold the
  counter-steer for ~0.12 s and the drift, camera and rear invert sides. Charge
  resets.
- Charge goes from 0 to 100% in **~1.6 s**; tiers change at **33% / 66% / 95%**.
- Release drift to trigger the mini-turbo:
  - tier 1: 0.45 s and +2.5 m/s top speed;
  - tier 2: 0.65 s and +4.0 m/s;
  - tier 3: 0.90 s and +5.5 m/s.
- The HUD shows `N1/N2/N3`, the charge percentage and the remaining `BOOST` time.

### Race

- The game opens on a start screen over the live starting grid, showing the
  selected track, its actual route, surface, lap count and field size. Use
  **NEXT** to switch circuits, and **CONTROLS** / `H` for help before racing.
  Press **START RACE**, `Enter` or `Space` on the start button to begin.
  The menu supports keyboard navigation and reduced-motion preferences;
  gameplay input stays disabled until the countdown starts.
- Starting the race plays a **circuit flyover**: the camera lifts off the grid,
  follows a smoothed route around the whole lap over 12.5 seconds and eases
  back behind the player. Press any key or click to skip it; reduced-motion
  preferences skip it automatically.
- **3 laps** per race with **five karts**: you and four CPU rivals.
- The start has a **3, 2, 1, GO!** countdown; throttle, brake, steering, drift
  and items stay locked until GO.
- The timer starts at GO, even if the player does not accelerate.
- There are **3 checkpoints**; they must be passed in order before the finish
  line counts the lap.
- The arcade HUD shows a large position at top left, race time at top right,
  lap count at bottom left, and a segmented speed arc at bottom right.
  Last lap, best lap and checkpoint progress are available in `T` telemetry.
- Driving against the track direction shows **`WRONG WAY`** after ~0.7 s.
- Falling into an **ice hole** or leaving the map triggers a **Lakitu rescue**:
  the kart drops for ~1.15 s, then returns to the last safe centerline point
  before the hazard. The timer keeps running, so the rescue costs time and
  position; the held item is kept.
- After 3 laps, the timer freezes, controls lock and a panel shows **position,
  standings, best lap and every lap time**.
- If all four CPUs finish before the player, the race also ends; the idle or
  slower player is classified last with a `—` total time (DNF).
- The finish panel matches the arcade HUD: large gold/silver placement, kart
  portraits, total race time and a green best-lap highlight. Click **RACE AGAIN**
  or press `R` to restart; **CHANGE TRACK** returns to the start screen to pick
  another circuit.
- `R` restarts the race, returns to the grid and repeats the countdown.

### AI and ranking

- **Four CPU rivals** in distinct liveries: red 02, green 03, violet 04 and
  amber 05. The player keeps the cyan 01 kart.
- All five karts start on a **staggered grid**; the CPUs launch at GO.
- Each CPU follows the centerline with ~1 s look-ahead, its own lane offset
  (from the inside line to the outside line) and a target speed of ~58 km/h.
- CPUs enter a **drift in corners** and can earn mini-turbos on exit.
- They **avoid oil slicks and ice holes** on their line by shifting the target
  lane, and the same rescue rule applies to them.
- They use items tactically: drop an oil can when chased, fire a missile when a
  rival is ahead, and save lightning for straights. Triple items are used one
  charge at a time.
- **Mild rubber-banding:** each CPU gets a small speed boost when it falls
  behind the player and a small slowdown when it gets too far ahead. Small
  pace differences between CPUs keep the field spread out.
- CPUs occasionally lift the throttle on straights so they do not feel robotic.
- Karts collide with each other; every CPU also collides with walls.
- The HUD shows all five karts in race order; ranking uses laps, checkpoints
  and distance to the next gate. Whoever finishes first is ahead.
- Finished CPUs keep driving instead of parking on the finish line.
- `R` returns all five karts to the grid and restarts the race.

### Items

- Procedural Three.js models: a white missile with red details, a red missile
  with yellow details, an oil can with a glossy puddle and a yellow lightning
  bolt. All use the same cel shading as the karts. Available items float above
  each kart, with one model per remaining charge; these inventory previews do
  not collide or provide a shield.
- **Item boxes** in 4 rows around the track (12 boxes total); each box respawns
  after 3 s.
- Rolls depend on ranking: the leader gets more oil cans/white missiles;
  whoever is behind gets more red missiles and triple items.
- **Oil can:** drops behind the kart, spills into a dark puddle and makes the
  opponent lose speed, control and spin 360°.
- **White missile:** fires forward, **bounces** off walls/obstacles and
  **disappears when it hits a kart**.
- **Red missile:** follows the track centerline, homes into the kart ahead in
  the final meters and disappears on impact.
- **Triple items:** triple oil can, triple white missile and triple red missile
  hold three charges; each use consumes one and the HUD shows `×3`/`×2`.
- **Lightning:** triggers a ~1.1 s boost with extra top speed.
- A kart that gets hit loses speed, spins 360° and is left without control for
  ~1 s.
- **Impact feedback:** camera shake, red damage flash and a particle burst when
  the player is hit.
- **Speed feedback:** Auto Modellista-inspired peripheral speed strokes build
  during drift and intensify on mini-turbo release, leaving the center clear.
  They fade after boost and are disabled with `prefers-reduced-motion`.
  Faceted exhaust flames retain the blue/orange/purple turbo-tier colors.
- **Drift smoke/dust:** tapered, procedural brush strokes trail both rear tires
  and lengthen during dash. Surface tints distinguish asphalt smoke, tan dirt,
  grass and pale ice; loose surfaces also emit small debris flecks. Tire wakes
  use a fixed instance pool, with no downloaded textures.
- Pickups burst into colorful particles; wall impacts also shake the camera.
- The AI also picks up items and decides when to use them based on the
  situation.
- The HUD shows the current item and remaining charges under `ITEM`.

## What is implemented

- Fixed **60 Hz** simulation with an accumulator and render interpolation.
- The original **~374 m** course is built from procedural geometry: rounded
  rectangle, four 18 m radius corners, an S-chicane and two grass runoff areas.
  Vanilla Lake adds a heightfield ground, banked corners, kicker wedges and
  water holes on top of the same track builder.
- Dirt, grass, ice, sand and stone with smooth acceleration, drag and grip
  transitions. Ice keeps acceleration close to asphalt but drops lateral grip
  hard, so the kart slides through corners and drifts need earlier
  counter-steering. Sand behaves like a loose off-road surface, while the
  pyramid stone keeps most of the asphalt grip with a little extra rolling
  resistance. Surface changes are authored as `surfaceZones` along the route,
  so the same track can mix packed sand and stone without a second spline.
- Low-poly cartoon karts following the vehicle references in `plan/reference`:
  tapered nose, open cockpit, bucket seat, broad tires with subtle tread,
  recessed silver rims, twin inclined rear pods and a thick wing with raised
  tips. Continuous white stripes and numbers follow the nose and wing surfaces.
  Dense chassis/tire contact shadows with feathered edges conform to the road,
  fade during jumps and disappear during falls. Karts receive directional
  shadows as well as casting them.
- Shared three-tone cel shading on karts, items and scenery, with a warm key
  light and soft sky/ground fill. Discrete shadow, midtone and highlight bands
  preserve the painted look and fine ink outlines preserve small kart details.
  Vehicle paint uses deeper cool shadow bands and restrained ambient fill for
  a more graphic separation between lit panels and recessed parts, plus a hard
  sky-lit rim band on upward-facing silhouette edges.
- Post-processing draws the scene and ink outlines into a 4× MSAA HDR buffer
  and applies selective bloom: only light sources colored with `glowColor()`
  (lava, boost flames and sparks, countdown lights, tunnel torches) cross the
  threshold. The final pass divides by the peak channel, so glowing paint keeps
  its hue instead of clipping to white, and fog is blended in sRGB to match the
  original direct-to-canvas look. Without float render targets, bloom turns off
  and the MSAA buffer falls back to 8 bits.
- TSL ink hulls preserve the old clip-space extrusion and support mixed material
  groups. Scene mutation listeners attach outlines to newly spawned items without
  a per-frame traversal. Removing objects releases unused hull materials;
  `outlineParameters.keepAlive` retains them until the source material is disposed.
  Bloom retains the old five-level blur and mip rounding. As with OutlineEffect,
  thin/open or strongly concave meshes can still need custom outline geometry.
- Procedural grass, dirt, asphalt, sand and pyramid-stone textures use
  world-space mapping, so the pattern stays continuous across road slabs. Small
  shared textures use mipmaps and anisotropic filtering to reduce distant
  shimmer; no downloaded assets. A tileable macro-noise layer, sampled twice at
  unrelated scales and angles, adds soft tonal blotches that hide the tile
  period, and the paved road darkens in a noisy 2 m gutter along its edges
  (ice frosts its edges instead).
- Off-road ground cover: instanced grass tufts that thicken at the foot of the
  barriers and form patches in the open, flower beds, pebbles and bushes,
  drawn in 32 m chunks that shrink into the ground with distance. Placement
  avoids colliders, water, paving and other flat scenery automatically.
- Wind: trees, palms, pines, ground plants, desert scrub, reeds and grass sway
  in a shared vertex-shader wind, with matching shadows and outlines. It stops
  with `prefers-reduced-motion`.
- Meadow Loop rolls its fields beyond the road and continues the ground past
  the map edge up to a faceted forest belt, so the horizon no longer ends at a
  wall; the Raceway gets a tropical belt behind its wall. Grassy hills carry
  trees on their crests.
- Each course has a final color grade (contrast, saturation, hue-only shadow
  and highlight tints, light vignette) applied after bloom.
- A gradient sky meets the course fog at the horizon, with a light haze band
  just above it, a sun-side halo, an HDR sun disc that blooms, and a two-tone
  painted cumulus layer that drifts slowly (frozen with reduced motion). Two
  layers of distant low-poly hills give the landscape depth without adding
  driving obstacles.
- The real shadow map covers ±28 m around the player. Beyond it, static
  scenery batches (trees, palms, pines, ice stacks) get soft ground ellipses
  stretched away from the sun in one instanced draw; they fade out wherever the
  shadow map already draws the real shadow, using an exact light-space test.
- Animated front-wheel steering, wheel spin, body roll/pitch and suspension bob.
- Driverless cockpit with a visible seat, dash and steering wheel, matching the
  reference karts.
- Player kart in light cyan with number 01; CPU karts in red (02), green (03),
  violet (04) and amber (05), each with a matching HUD portrait and minimap
  marker.
- A tropical **Deepseek Kart** presentation inspired by Mario Kart's Lakeside Park:
  sand-colored road, vivid grass, wooden start gantry with oversized lettering,
  overhead pennants, 3D countdown lights, blue/white checkered line and grid slots,
  rounded multicolor barriers, corner curbs, chevron signs, edge markings,
  subtle road flecks and tire marks. Grandstands, crowds and the hot-air balloon
  sit among palms, coconuts, ground plants, flowers and layered distant hills.
- A turquoise lagoon has animated ripples and a rocky shore; a faceted volcano
  with a lava ribbon and drifting smoke gives the course a distant landmark.
  Scenery uses procedural geometry and instanced batches, with no remote assets.
- **Vanilla Lake** is a 572 m frozen-lake circuit with a 17 m-wide ice road:
  a west-side starting straight, northern ramp crossing, penguin bend, eastern
  jump sequence and southern ice slalom. Three kicker ramps, six water holes
  and five banked sections share the same wheel-contact physics. The central
  lake has a jagged shoreline, a northern channel, floating ice and animated
  geysers. Snowmen, pine groves, crystal clusters, colored barriers and named
  sector boards follow the enlarged route. The reference map is adapted to
  existing jumping and rescue mechanics; there is no gliding or underwater mode.
  Cold, diffuse lighting and distance fog are joined by lightweight local snowfall.
  Ice has layered fractures, trapped bubbles, view-dependent sheen, frosted edges
  and pale tire scratches. Visual wheel travel follows the terrain, while landings
  compress a damped suspension and trigger ice chips and a small camera dip.
  Snowfall and the landing camera impulse respect reduced-motion preferences.
  Snowfall uses static instanced quads with GPU drift, wrapping and billboarding;
  only time and camera uniforms change per frame. Ice layers are composed after
  lighting and before fog, preserving the painted sheen without another pass.
  Penguins at Penguin Bend now cross in a repeatable 24-second round trip:
  4 seconds waiting, a 1.5-second amber warning and a 6.5-second crossing in
  each direction, staggered across three crossing points. Their colliders
  and AI avoidance positions follow the physics clock and reset with the race.
  CPUs anticipate their motion and slow down when the passing space is short.
  Eight cracked ice blocks form four staggered rows in the southern slalom.
  Contact shatters a block and removes 40% of the kart's speed without bouncing
  it back. The opening stays clear for all racers until the race restarts;
  sufficiently high jumps clear the blocks. Ice shards disappear after 0.9 seconds.
- **Sunstone Ruins** is a 597 m Egyptian desert circuit with a 16 m-wide packed
  sand road, four banked sweeper sections, two sandstone kickers and an 84 m
  covered tunnel, under an orange sunset sky with low amber light and long
  shadows. The route leaves the Sphinx straight, climbs through the dune
  switchbacks, loops around a small central pyramid and returns through the
  tunnel of Ra. The tunnel floor is a separate stone surface zone with the same
  continuous height and bank queries as the rest of the track; its masonry
  walls, slab ceiling, hieroglyph friezes, animated torches, winged-sun portals
  and floor emblem are procedural. Sloped masonry pyramids rise behind a
  continuous landscape of wind-carved dune ridges. A ruined temple court,
  papyrus columns, painted steles, linen standards, pottery and scattered
  masonry define the route; the palm oasis has a stone quay and water stairs.
  The tunnel has painted ankh/solar panels and a continuous sand crest over
  its roof. Static details are merged by material; the dune mesh leaves an
  opening around banked road sections. Sand replaces grass outside the barriers, and the stone tunnel
  swaps physics, HUD, audio rumble and drift dust without interrupting the lap.
  The tunnel ceiling blocks the direct sun while local torch lights keep the
  exit readable from inside.
- **Lamplight City** is a 526 m night street circuit shaped like a figure
  eight. The start avenue runs under a 5.5 m overpass; half a lap later the
  route climbs a 44 m ramp, crosses over the start on an open span and comes
  down the other side. The track builder supports these elevated sections
  (`features.elevations`): each object reads the surface for its own level,
  so karts, shadows, wheels, items, AI, camera and skid marks stay on the deck
  or on the road below. Barriers, kart-to-kart contact and item hits only
  apply on the same level. The overpass has retaining walls, pilasters,
  abutments, a walkway, a girder span with a neon sign and lights under the deck.
- The city is laid out around the streets: shops with lit display windows,
  striped awnings and neon signs along the start, gabled houses with porch
  lights on the residential streets, office towers next to the overpass,
  three parks with paths, benches and a fountain, and a skyline ring beyond
  the map. Windows are drawn in a facade shader (one instanced draw for every
  building) and blend into an average color with distance, so they do not
  shimmer. Rooftop billboards, blinking aircraft beacons, amber corner signals,
  painted lane lines and crosswalks complete the streets.
- Night lighting: a starry sky with a moon and city glow on the horizon, moonlit
  shadows, and street lamps on the sidewalks and parapets. Every lamp has a
  bright lens and a light pool on the ground; eight real point lights follow
  the camera to the nearest lamps and fade out before they switch, so nothing
  pops. Karts switch on headlights with a beam on the asphalt, and the player's
  kart also has a real spotlight.
- Floating item boxes have a shared procedural rainbow texture and outlined
  question marks on every face. Pickups, respawn and item probabilities are unchanged.
  The sand-colored road reports `dirt`: it keeps asphalt grip but makes the rear
  tires kick up tan dust while drifting.
- Start lights follow the countdown. Barriers, tree trunks, grandstands,
  gantry pillars and the lagoon shore have matching colliders. New scenery
  leaves the driving lanes, item boxes and grass runoff corridors clear.
- Two-circle capsule for kart collision.
- Collision against wall/obstacle/map-boundary OBBs with substeps.
- Chase camera with exponential smoothing, speed-based FOV, drift lean/roll,
  boost pullback and extra FOV, and raycast pull-in.
- Hop, three-tier drift charge, a visibly loose rear, mini-turbo with extra top
  speed and a boost flame.
- Mario Kart-inspired HUD with outlined Bungee lettering, kart portraits in
  race order, an item window with remaining charges, a transparent vertical
  minimap and a colored speed arc. Drift/boost indicators appear when active.
  `H` opens controls; `T` opens surface, velocity, yaw, FPS and lap telemetry.
  The Bungee font is bundled locally under the SIL Open Font License.
- Impact feedback: camera shake, damage flash, hit/pickup particles, missile
  and boost trails, surface-aware drift smoke/dust, tire marks and a high-speed
  vignette.
- Procedural audio: a layered kart engine for the player and four positional
  rival engines, tire hiss/squeal and surface rumble, wind, drift charge and
  mini-turbo layers, item pickup/use/hit sounds, countdown, lap and finish
  stingers, crowd reactions and a synthesized soundtrack. `M` mutes; the
  preference is stored locally. No audio files are downloaded.
- 3-lap race with sequential checkpoints, total timer, last and best lap.
- Pre-race circuit flyover, start countdown, control lock, wrong-way alert and
  a results panel with lap times and a return to track select.
- Five-kart grid with four path-following CPUs, corner drift, oil-slick
  avoidance, tactical items, mild rubber-banding and `P1–P5` ranking.
- Items: boxes, oil can/slick, white/red missiles, lightning, triple charges,
  hit/spin and tactical AI item use.
- `R` reset (full race). Falling into a hole or leaving the map now uses the
  Lakitu rescue instead of restarting the race.
- Banked-road height, ramp launch, hole detection, rescue points and ice grip
  covered by tests, in addition to physics, collision, track, drift, race, race
  flow, AI, ranking, items, audio helpers, soundtrack notation and harmony,
  scenery scatter, ground relief and wind, the five-racer grid, the flyover
  camera, and the two-level overpass (surfaces, barriers, kart contact, items,
  AI laps) and street lighting of Lamplight City.

## Current numbers

| Metric | Approximate value |
|---|---|
| Top speed on dirt/asphalt | 79 km/h (22 m/s) |
| 0 → 95% of top speed | ~4–5 s |
| Braking 79 → 0 | ~1.2 s |
| Reverse | 6 m/s (22 km/h) |
| Grass/sand balance | ~47–50 km/h |
| Pyramid stone grip | 10.4 (asphalt 12.0, ice 2.8) |
| Sunstone tunnel | 84 m |
| Lamplight City overpass | 5.5 m high, 44 m ramps |
| Corner radius at 79 km/h | ~17.5 m |
| Corner radius at 40 km/h | ~7.3 m |
| Mini-turbo tier 3 (top speed) | ~99 km/h (27.5 m/s) |
| Full drift charge | ~1.6 s |
| Boost extra FOV | +14° |
| Boost camera pullback | +1.4 m |
| Laps | 3 |
| Checkpoints | 3 |
| Countdown | 3 s + GO |
| Karts | 5 (you + 4 CPUs) |
| AI target speed | ~58 km/h (16 m/s) |
| AI lane offsets | 2.5 m, -1.7 m, 0.9 m and 4.0 m |
| AI look-ahead | ~1.0 s |
| AI drift entry | ~0.22 rad over 12 m |
| AI rubber-band range | ±25 m, ±6% speed |
| AI oil-slick look-ahead | 14 m |
| Item boxes | 12 |
| Box respawn | 3 s |
| Lightning boost | ~1.1 s |
| Red missile speed | 30 m/s |
| Red missile life | 4.5 s |
| Triple item charges | 3 |
| Control loss when hit | 1 s |

Shared tuning lives in [`src/core/config.ts`](src/core/config.ts); each course owns its layout, environment and decoration settings.

## Structure

```text
src/
  main.ts                   bootstrap and course selection
  app/game.ts               scene wiring and game loop
  audio/                    procedural engine, effects and mixing
    music/                  soundtrack notation, compiler, synth band and sequencer
  core/                     shared types, math, input, collision and tuning
  actors/
    racers.ts               reusable player/CPU roster and grid
    kart/                   physics, procedural model, AI, boost flame and headlights
  items/                    item system, behaviors, models and pickup boxes
  decor/
    nature/                 trees, palms, pines, hills, clouds, lagoon, volcano,
                            ground cover, forest belt and scatter placement
    props/                  grandstand, balloon, ice props and sign builders
    city/                   buildings, street lamps and the light rig
    race/                   start line, gantry, countdown lights, bunting, curbs,
                            road markings
    types.ts                decoration lifecycle and colliders contract
    index.ts                reusable decoration API
  rendering/                cel shading, wind, facades, effects, camera, environment
                            and post-processing
  race/                     laps, countdown, wrong-way detection and ranking
  ui/                       HUD and CSS
  tracks/
    track.ts                generic road, walls, surfaces, path and checkpoints
    relief.ts               visual ground relief and the skirt beyond the map
    elevation.ts            elevated sections (overpass) and level picking
    viaduct.ts              retaining walls, span and abutments of an overpass
    definition.ts           layout and style contracts
    curves.ts               reusable curve builders
    style.ts                shared construction defaults
    course.ts               layout + environment + decoration contract
    registry.ts             registered courses and default selection
    courses/
      deepseek-raceway/      original dirt circuit and tropical scenery
      meadow-loop/          asphalt circuit, trees, hills and a different environment
      vanilla-lake/         ice circuit with ramps, holes, banked turns and snow props
      sunstone-ruins/       desert circuit with stone tunnel, pyramids and an oasis
      lamplight-city/       night street circuit with an overpass, city blocks and lamps
  assets/                   bundled fonts
```

Physics does not depend on the graphics backend. Shared actors, items,
rendering and track builders do not import any specific course. Course folders
compose those components and own their placement decisions.

## Adding another track

Each folder under `src/tracks/courses/` has:

- `layout.ts`: closed curve, road width/surface, optional surface zones and
  off-road surface, checkpoints, item rows, obstacles, wall gaps, bounds and
  visual style;
- `environment.ts`: sky/fog colors, fog distances, ambient light and sun;
- `decor.ts`: placements of shared decoration builders, colliders and animation;
- `index.ts`: a `CourseDefinition` joining those pieces.

Register the exported course in `src/tracks/registry.ts`. The game can start
any registered course through `?track=<layout.id>`:

- `/` or `/?track=deepseek-raceway`: original tropical dirt circuit;
- `/?track=meadow-loop`: asphalt course demonstrating shared components;
- `/?track=vanilla-lake`: ice course with ramps, holes and banked turns;
- `/?track=sunstone-ruins`: desert course with a stone tunnel, pyramids and an oasis.

An unknown ID falls back to Deepseek Raceway. Changing the course does not
require edits to `Game`, the karts, AI, item logic, HUD or race rules.

See [`src/tracks/README.md`](src/tracks/README.md) for a step-by-step guide.

## Debug and tuning

In development mode, the game is exposed on `window.__deepseekKart`:

```js
window.__deepseekKart.getDebugState()
window.__deepseekKart.teleport(0, 0, 0)
window.__deepseekKart.racers // player + four CPUs
```

Use the HUD to track `vF`, `vR`, surface and speed. The recommended tuning order
is in [`plan/MVP.md`](plan/MVP.md) (in Portuguese), section 7.5.

## Known limitations

- Track elevation is limited to banked corners and kicker ramps; the Sunstone
  tunnel is a covered stone passage at ground level, not a separate height
  layer. There are no loops or height-based wall collisions.
- No multiplayer.
- No imported models or audio; the soundtrack and effects are synthesized at
  runtime, so there are no recorded voice lines or licensed samples.
- Collision is still 2D in the XZ plane; kart height affects the floor, ramps
  and falls, but wall and kart-to-kart collision ignore height.
- The AI still follows the centerline; it has no full racing-line optimization
  or overtaking planner, though it now avoids holes as well as oil slicks.

## Next steps

1. Tune AI pace, item timing and the drift/mini-turbo feel based on playtesting.
2. Add more items and projectile types.
3. Add more course folders with new layouts, environments and scenery compositions.
