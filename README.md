# Deepseek Kart — MVP

A playable arcade kart racer prototype in **HTML + TypeScript + Three.js**.
The goal of this phase is to feel and tune the physics: two courses, five karts,
chase camera, acceleration, braking, reverse, steering, dirt and grass
surfaces, collision, hop/drift/mini-turbo, items and a 3-lap timed race.

The karts are low-poly and cartoon-styled, built procedurally from Three.js
primitives and custom geometry with a high-contrast three-tone cel ramp, fine ink outlines from
`OutlineEffect`, and flat, readable silhouettes inspired by Jet Set Radio.

There is no audio or final art.

## Run

```bash
npm install
npm run dev
```

Open the address printed by Vite (defaults to `http://localhost:5173`).

Other commands:

```bash
npm run build     # typecheck + production build
npm test          # physics, collision, AI, race, items and grid tests
npm run preview   # preview the build
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
| `H` | Toggle help |
| `F3` | Toggle debug HUD |

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
- **3 laps** per race with **five karts**: you and four CPU rivals.
- The start has a **3, 2, 1, GO!** countdown; throttle, brake, steering, drift
  and items stay locked until GO.
- The timer starts at GO, even if the player does not accelerate.
- There are **3 checkpoints**; they must be passed in order before the finish
  line counts the lap.
- The arcade HUD shows a large position at top left, race time at top right,
  lap count at bottom left, and a segmented speed arc at bottom right.
  Last lap, best lap and checkpoint progress are available in `F3` telemetry.
- Driving against the track direction shows **`WRONG WAY`** after ~0.7 s.
- After 3 laps, the timer freezes, controls lock and a panel shows **position,
  standings, best lap and every lap time**.
- If all four CPUs finish before the player, the race also ends; the idle or
  slower player is classified last with a `—` total time (DNF).
- The finish panel matches the arcade HUD: large gold/silver placement, kart
  portraits, total race time and a green best-lap highlight. Click **RACE AGAIN**
  or press `R` to restart; `Esc` closes the panel.
- `R` restarts the race, returns to the grid and repeats the countdown.

### AI and ranking

- **Four CPU rivals** in distinct liveries: red 02, green 03, violet 04 and
  amber 05. The player keeps the cyan 01 kart.
- All five karts start on a **staggered grid**; the CPUs launch at GO.
- Each CPU follows the centerline with ~1 s look-ahead, its own lane offset
  (from the inside line to the outside line) and a target speed of ~58 km/h.
- CPUs enter a **drift in corners** and can earn mini-turbos on exit.
- They **avoid bananas** on their line by shifting the target lane.
- They use items tactically: drop a banana when chased, fire a shell when a
  rival is ahead, and save mushrooms for straights. Triple items are used one
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

- Procedural Three.js models: a peeled banana, segmented green/red shells and
  a red mushroom with white spots. All use the same cel shading as the karts.
  Available items float above each kart, with one model per remaining charge;
  these inventory previews do not collide or provide a shield.
- **Item boxes** in 4 rows around the track (12 boxes total); each box respawns
  after 3 s.
- Rolls depend on ranking: the leader gets more bananas/shells; whoever is
  behind gets more red shells and triple items.
- **Banana:** drops behind the kart and makes the opponent lose speed, control
  and spin 360°.
- **Green shell:** fires forward, **bounces** off walls/obstacles and
  **disappears when it hits a kart**.
- **Red shell:** follows the track centerline, homes into the kart ahead in the
  final meters and disappears on impact.
- **Triple items:** triple banana, triple green shell and triple red shell hold
  three charges; each use consumes one and the HUD shows `×3`/`×2`.
- **Mushroom:** triggers a ~1.1 s boost with extra top speed.
- A kart that gets hit loses speed, spins 360° and is left without control for
  ~1 s.
- **Impact feedback:** camera shake, red damage flash and a particle burst when
  the player is hit.
- **Speed feedback:** boost and shell trails, tire skid marks and a subtle
  high-speed vignette.
- **Drift smoke/dust:** both rear tires emit surface-aware particles while
  drifting — light smoke on asphalt, tan dust on dirt and green-tinted dust on
  grass.
- Pickups burst into colorful particles; wall impacts also shake the camera.
- The AI also picks up items and decides when to use them based on the
  situation.
- The HUD shows the current item and remaining charges under `ITEM`.

## What is implemented

- Fixed **60 Hz** simulation with an accumulator and render interpolation.
- **~374 m** track built only from boxes: rounded rectangle, four 18 m radius
  corners, an S-chicane and two grass runoff areas.
- Dirt and grass with smooth acceleration, drag and grip transitions. The dirt
  road shares asphalt handling; the `asphalt` surface profile is ready for
  future tracks.
- Low-poly cartoon karts following the vehicle references in `plan/reference`:
  tapered nose, open cockpit, bucket seat, broad tires with subtle tread,
  recessed silver rims, twin inclined rear pods and a thick wing with raised
  tips. Continuous white stripes and numbers follow the nose and wing surfaces.
  Contact and directional ground shadows anchor the vehicles to the road.
- Shared three-tone cel shading on karts, items and scenery, with a warm key
  light and soft sky/ground fill. Discrete shadow, midtone and highlight bands
  preserve the painted look and fine ink outlines preserve small kart details.
- Procedural grass, dirt and asphalt textures use world-space mapping, so the
  pattern stays continuous across road slabs. Small shared textures use mipmaps
  and anisotropic filtering to reduce distant shimmer; no downloaded assets.
- A gradient sky meets the course fog at the horizon. Two layers of distant
  low-poly hills give the landscape depth without adding driving obstacles.
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
  `H` opens controls; `F3` opens surface, velocity, yaw, FPS and lap telemetry.
  The Bungee font is bundled locally under the SIL Open Font License.
- Impact feedback: camera shake, damage flash, hit/pickup particles, shell and
  boost trails, surface-aware drift smoke/dust, tire marks and a high-speed
  vignette.
- 3-lap race with sequential checkpoints, total timer, last and best lap.
- Start countdown, control lock, wrong-way alert and a results panel with lap
  times.
- Five-kart grid with four path-following CPUs, corner drift, banana
  avoidance, tactical items, mild rubber-banding and `P1–P5` ranking.
- Items: boxes, banana, green/red shells, mushrooms, triple banana/shells,
  hit/spin and tactical AI item use.
- `R` reset (full race) and automatic reset if a kart leaves the map.
- Unit tests for physics, collision, track, drift, race, race flow, AI,
  ranking, items and the five-racer grid.

## Current numbers

| Metric | Approximate value |
|---|---|
| Top speed on dirt/asphalt | 79 km/h (22 m/s) |
| 0 → 95% of top speed | ~4–5 s |
| Braking 79 → 0 | ~1.2 s |
| Reverse | 6 m/s (22 km/h) |
| Grass balance | ~47–50 km/h |
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
| AI banana look-ahead | 14 m |
| Item boxes | 12 |
| Box respawn | 3 s |
| Mushroom boost | ~1.1 s |
| Red shell speed | 30 m/s |
| Red shell life | 4.5 s |
| Triple item charges | 3 |
| Control loss when hit | 1 s |

Shared tuning lives in [`src/core/config.ts`](src/core/config.ts); each course owns its layout, environment and decoration settings.

## Structure

```text
src/
  main.ts                   bootstrap and course selection
  app/game.ts               scene wiring and game loop
  core/                     shared types, math, input, collision and tuning
  actors/
    racers.ts               reusable player/CPU roster and grid
    kart/                   physics, procedural model, AI and boost flame
  items/                    item system, behaviors, models and pickup boxes
  decor/
    nature/                 trees, palms, plants, hills, clouds, lagoon, volcano
    props/                  grandstand, balloon and sign builders
    race/                   start line, gantry, countdown lights, bunting, curbs
    types.ts                decoration lifecycle and colliders contract
    index.ts                reusable decoration API
  rendering/                cel shading, effects, camera and environment setup
  race/                     laps, countdown, wrong-way detection and ranking
  ui/                       HUD and CSS
  tracks/
    track.ts                generic road, walls, surfaces, path and checkpoints
    definition.ts           layout and style contracts
    curves.ts               reusable curve builders
    style.ts                shared construction defaults
    course.ts               layout + environment + decoration contract
    registry.ts             registered courses and default selection
    courses/
      deepseek-raceway/      original dirt circuit and tropical scenery
      meadow-loop/          asphalt circuit, trees, hills and a different environment
  assets/                   bundled fonts
```

Physics does not depend on WebGL. Shared actors, items, rendering and
track builders do not import any specific course. Course folders compose
those components and own their placement decisions.

## Adding another track

Each folder under `src/tracks/courses/` has:

- `layout.ts`: closed curve, road width/surface, checkpoints, item rows,
  obstacles, wall gaps, bounds and visual style;
- `environment.ts`: sky/fog colors, fog distances, ambient light and sun;
- `decor.ts`: placements of shared decoration builders, colliders and animation;
- `index.ts`: a `CourseDefinition` joining those pieces.

Register the exported course in `src/tracks/registry.ts`. The game can start
any registered course through `?track=<layout.id>`:

- `/` or `/?track=deepseek-raceway`: original tropical dirt circuit;
- `/?track=meadow-loop`: second course demonstrating shared components.

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

- Completely flat track; there are no ramps or jumps (the hop is vertical, but
  it does not let a kart cross walls).
- No multiplayer.
- No audio, imported models or menu.
- Collision is 2D in the XZ plane; hop height is ignored by collision.
- The AI still follows the centerline; it has no full racing-line optimization
  or overtaking planner.

## Next steps

1. Tune AI pace, item timing and the drift/mini-turbo feel based on playtesting.
2. Add more items and shell types.
3. Add more course folders with new layouts, environments and scenery compositions.
