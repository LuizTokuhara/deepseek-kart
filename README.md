# Deepseek Kart — MVP

A playable arcade kart racer prototype in **HTML + TypeScript + Three.js**.
The goal of this phase is to feel and tune the physics: one track, two karts,
chase camera, acceleration, braking, reverse, steering, grass, collision,
hop/drift/mini-turbo, items and a 3-lap timed race.

The karts are low-poly and cartoon-styled, built procedurally from Three.js
primitives and custom geometry with a high-contrast two-tone cel ramp, fine ink outlines from
`OutlineEffect`, and flat, readable silhouettes inspired by Jet Set Radio.

There is no menu, start screen, audio or final art.

## Run

```bash
npm install
npm run dev
```

Open the address printed by Vite (defaults to `http://localhost:5173`).

Other commands:

```bash
npm run build     # typecheck + production build
npm test          # physics, collision and track tests
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

- **3 laps** per race.
- The start has a **3, 2, 1, GO!** countdown; throttle, brake, steering, drift
  and items stay locked until GO.
- The timer starts at GO, even if the player does not accelerate.
- There are **3 checkpoints**; they must be passed in order before the finish
  line counts the lap.
- The top HUD shows lap, total time, last lap, best lap and checkpoint progress
  (`CP 0/3`).
- Driving against the track direction shows **`WRONG WAY`** after ~0.7 s.
- After 3 laps, the timer freezes, controls lock and a panel shows **position,
  standings, best lap and every lap time**.
- `R` restarts the race, returns to the grid and repeats the countdown.

### AI and ranking

- A second red kart races against the player.
- The AI starts alongside at GO.
- It follows the centerline with ~1 s look-ahead, a 2.5 m line offset and a
  target speed of ~58 km/h.
- It enters a **drift in corners** and can earn mini-turbos on exit.
- It **avoids bananas** on its line by shifting its target lane.
- It uses items tactically: drops a banana when chased, fires a shell only when
  the player is ahead, and saves mushrooms for straights. Triple items are used
  one charge at a time.
- **Mild rubber-banding:** the AI gets a small speed boost when it falls behind
  and a small slowdown when it gets too far ahead.
- It occasionally lifts the throttle on straights so it does not feel robotic.
- Karts collide with each other; the AI also collides with walls.
- The HUD shows `POS 1/2`; ranking uses laps, checkpoints and distance to the
  next gate. Whoever finishes first is ahead.
- `R` returns both karts to the grid and restarts the race.

### Items

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
- The AI also picks up items and decides when to use them based on the
  situation.
- The HUD shows the current item and remaining charges under `ITEM`.

## What is implemented

- Fixed **60 Hz** simulation with an accumulator and render interpolation.
- **~374 m** track built only from boxes: rounded rectangle, four 18 m radius
  corners, an S-chicane and two grass runoff areas.
- Asphalt and grass with smooth acceleration, drag and grip transitions.
- Low-poly cartoon karts following the vehicle references in `plan/reference`:
  tapered nose, open cockpit, bucket seat, broad tires with subtle tread,
  recessed silver rims, twin inclined rear pods and a thick wing with raised
  tips. Continuous white stripes and numbers follow the nose and wing surfaces.
  Contact and directional ground shadows anchor the vehicles to the road.
- Shared two-tone cel shading on karts, items and scenery, with a warm key
  light, uniform cool shadow fill and a daylight palette. The nearest-filtered
  ramp puts the light/shadow cut at `N·L = 0.25`; ambient fill stays low so it
  does not wash out the bands. Fine ink outlines preserve small kart details.
- Animated front-wheel steering, wheel spin, body roll/pitch and suspension bob.
- Driverless cockpit with a visible seat, dash and steering wheel, matching the
  reference karts.
- Player kart in light cyan with number 01; AI kart in red with number 02.
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
  The sand color is visual; the road keeps its existing asphalt handling.
- Start lights follow the countdown. Barriers, tree trunks, grandstands,
  gantry pillars and the lagoon shore have matching colliders. New scenery
  leaves the driving lanes, item boxes and grass runoff corridors clear.
- Two-circle capsule for kart collision.
- Collision against wall/obstacle/map-boundary OBBs with substeps.
- Chase camera with exponential smoothing, speed-based FOV, drift lean/roll,
  boost pullback and extra FOV, and raycast pull-in.
- Hop, three-tier drift charge, a visibly loose rear, mini-turbo with extra top
  speed and a boost flame.
- HUD with speed, surface, `vF`/`vR`, drift/boost, yaw, position, FPS and ticks.
- 3-lap race with sequential checkpoints, total timer, last and best lap.
- Start countdown, control lock, wrong-way alert and a results panel with lap
  times.
- Second kart with path-following AI, corner drift, banana avoidance, tactical
  items, mild rubber-banding and `P1/P2` ranking.
- Items: boxes, banana, green/red shells, mushrooms, triple banana/shells,
  hit/spin and tactical AI item use.
- `R` reset (full race) and automatic reset if a kart leaves the map.
- Unit tests for physics, collision, track, drift, race, race flow, AI, ranking
  and items.

## Current numbers

| Metric | Approximate value |
|---|---|
| Top speed on asphalt | 79 km/h (22 m/s) |
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
| Karts | 2 |
| AI target speed | ~58 km/h (16 m/s) |
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

All tuning numbers live in [`src/config.ts`](src/config.ts).

## Structure

```text
src/
  main.ts              bootstrap
  game.ts              scene, loop, kart visuals, wiring
  config.ts            physics, camera and track constants
  input.ts             keyboard
  math.ts              clamp, damp, angles, 2D rotations
  types.ts             shared types
  track.ts             track generation, surfaces and colliders
  kart.ts              state and physics step
  kart-model.ts        procedural low-poly cartoon kart model and animation
  cel-shading.ts       shared two-tone lighting ramp and ink outline materials
  track-decor.ts       start gantry, checkered line, curbs, grandstands, scenery
  tropical-scenery.ts  palms, lagoon, volcano, road details and curve signs
  collision.ts         circle vs OBB, capsule, raycast, kart collision
  race.ts              laps, checkpoints, timer and lap times
  race-flow.ts         start countdown and wrong-way detector
  ai.ts                path following, drift, avoidance and AI control
  ranking.ts           progress scoring and ranking
  items.ts             boxes, banana, green/red shells, triples and hit/spin
  item-box-visual.ts   procedural rainbow question-mark item box material
  chase-camera.ts      chase camera
  hud.ts               debug overlay and race HUD
tests/
  kart.test.ts
  kart-model.test.ts
  collision.test.ts
  track.test.ts
  race.test.ts
  race-flow.test.ts
  ai.test.ts
  ranking.test.ts
  items.test.ts
```

Physics does not depend on WebGL: `kart.ts` and `collision.ts` can run in
headless tests. Three.js is used for rendering and track math.

## Debug and tuning

In development mode, the game is exposed on `window.__deepseekKart`:

```js
window.__deepseekKart.getDebugState()
window.__deepseekKart.teleport(0, 0, 0)
```

Use the HUD to track `vF`, `vR`, surface and speed. The recommended tuning order
is in [`plan/MVP.md`](plan/MVP.md) (in Portuguese), section 7.5.

## Known limitations

- Completely flat track; there are no ramps or jumps (the hop is vertical, but
  it does not let a kart cross walls).
- No multiplayer.
- No audio, textures, imported models or menu.
- Collision is 2D in the XZ plane; hop height is ignored by collision.
- The AI still follows the centerline; it has no full racing-line optimization
  or overtaking planner.

## Next steps

1. Tune AI pace, item timing and the drift/mini-turbo feel based on playtesting.
2. Add more items and shell types.
3. Expand to more tracks and presentation.
