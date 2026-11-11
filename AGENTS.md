# AGENTS.md

## Project map

- HTML + TypeScript + Three.js arcade racer, no UI framework. Boot is
  `src/main.ts`; the scene, loop and wiring live in `src/app/game.ts`.
- Shared simulation is in `src/core`, `src/actors`, `src/race` and `src/items`;
  rendering is in `src/rendering`; courses are data compositions under
  `src/tracks/courses/` and are registered in `src/tracks/registry.ts`.
- Shared code must not import a specific course folder. `TrackLike`
  (`src/tracks/track.ts`) is the contract used by karts, AI, items, camera and
  scenery. Read `src/tracks/README.md` before adding or changing a track.
- Physics uses a fixed timestep; rendering interpolates it in `Game.render`.
  Keep gameplay updates out of render-only code.
- Boot order without `?track`: opening cinematic (`Game.startAttract`, filmed
  by `CinematicCamera`; every kart AI-driven, no HUD/sound/results) →
  title card (`TitleScreen`) → START → `Game.stopAttract` → start screen. With
  `?track` it boots straight into the start screen.
- The 3D logo (`TitleLogo`, rendered by `TitleLogoView` in its own
  transparent canvas) is created once in `main.ts` and shared: the title card
  and the start screen `attach` its canvas, `play` on show and `stop` on leave;
  each keeps its HTML title as fallback. It reads `src/assets/fonts/bungee-logo.typeface.json`, a
  Three.js typeface subset of the bundled Bungee TTF holding only D E P S K A R T
  (converted with opentype.js 1.3.4). Regenerate it if the logo text changes.
- Race start order is start screen → circuit flyover (`FlyByCamera`) →
  countdown → GO. The flyover advances in `tick` and only poses the camera in
  `render`; any key/click skips it, and reduced motion skips it entirely.
- Select a course with `?track=<layout.id>`; an unknown ID falls back to
  Deepseek Raceway. Registered IDs: `deepseek-raceway`, `meadow-loop`,
  `vanilla-lake`, `sunstone-ruins` and `lamplight-city`.
- Gameplay supports keyboard and touch. Phones play in landscape with
  on-screen gas/brake, jump/drift and item buttons plus gyroscope steering; a
  rotate gate pauses the race in portrait. There are no gamepad controls. See
  Known limitations.

## Repository layout

```text
src/
  main.ts                   bootstrap and course selection
  app/game.ts               scene wiring and game loop
  audio/                    procedural engine, effects and mixing
    music/                  soundtrack notation, compiler, synth band and sequencer
  core/                     shared types, math, input, collision and tuning
  mobile/                   touch buttons, gyro steering and landscape gate
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
  race/                     laps, countdown, wrong-way detection, ranking and difficulty
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

## Commands

- `npm run dev` — Vite dev server.
- `npm test` — full Vitest suite.
- `npx vitest run tests/items.test.ts` — one test file; add `-t "substring"`
  to run one case.
- `npx tsc --noEmit` — fast typecheck.
- `npm run build` — typecheck plus production build. The >500 kB chunk warning
  is expected.
- There is no lint, formatter, codegen, migration or CI config. Do not invent
  commands for them.

## Rendering rules

- WebGPU is the primary backend through `three/webgpu`; `?webgl` forces the
  automatic WebGL 2 fallback. Validate rendering changes on both paths.
- Use `three/webgpu` for renderer/scene/node-material code and `three/tsl` for
  nodes; geometry-only modules may keep importing `three`.
- Use node materials (`MeshToonNodeMaterial`/TSL), `RenderPipeline`,
  `PostProcessing`, `OutlineManager`, `SceneColorPass` and `PaintedBloomNode`.
  `AmbientOcclusion` (GTAO) and the cinematic depth of field live inside
  `PostProcessing`; the DOF output joins the graph only through `setLens`.
  Do not reintroduce `WebGLRenderer`, `EffectComposer`, `OutlineEffect`,
  `ShaderMaterial` or `onBeforeCompile`.
- Scene fog must go through `blendFogInSrgb(scene, fog)`; the default linear fog
  node changes the art-directed colors.
- `src/core/visual-quality.ts` selects the high or low preset. Touch devices
  start low; `?quality=low|high` overrides it. Low reduces scenery/prop density,
  particles, lights, shadow size, MSAA, GTAO and the pixel budget. Never remove
  gameplay geometry, colliders, item boxes or obstacles with it. New decorative
  builders should accept an optional `VisualQuality` argument and default to
  `VISUAL_QUALITY`.
- `src/ui/style.css` is loaded by the render-blocking `<link>` in `index.html`,
  not imported from TypeScript. Preserve the loading overlay, `body.booting`
  and inert start-screen flow that prevent raw markup flashes.
- `tests/rendering-browser.ts` is a manual browser-only pixel check and is not
  part of `npm test` (its filename is not `*.test.ts`). The README has the
  console snippet; `window.__deepseekKart` exists only in development.

## Content and conventions

- All art and audio are procedural. Do not download models, textures, audio,
  fonts or other assets; the only bundled asset is the Bungee font and its OFL
  license.
- UI copy, code comments and tracked docs are English. The tracked docs are
  `README.md`, `AGENTS.md` and `src/tracks/README.md`.
- Current item IDs are `oil-can`, `missile`, `red-missile` and `lightning`;
  the old banana/shell/mushroom IDs no longer exist.
- Difficulty: `AIDriver` and `ItemSystem` default to `hard` for direct
  construction and tests; `Game.beginRace()` applies the selected mode. The
  start-screen choice persists in `localStorage` under
  `deepseek-kart-difficulty`.
- Telemetry is toggled with `T`, not `F3`.
- Commit only when explicitly asked. Never stage `.serena/`. `/docs`, `/plan`,
  `/tools`, `/dist` and `/.venv` are gitignored local directories.

## Tuning reference

Shared tuning lives in `src/core/config.ts`; each course owns its layout,
environment and decoration settings. Current reference points:

| Metric | Value |
|---|---|
| Fixed simulation rate | 60 Hz (`FIXED_DT = 1/60`) |
| Top speed on dirt/asphalt | 79 km/h (22 m/s) |
| 0 → 95% of top speed | ~4–5 s |
| Braking 79 → 0 | ~1.2 s |
| Reverse | 6 m/s (22 km/h) |
| Grip: asphalt / stone / ice | 12.0 / 10.4 / 2.8 |
| Full drift charge | ~1.6 s; tiers at 33%, 66%, 95% |
| Mini-turbo tier 3 top speed | ~99 km/h (27.5 m/s) |
| Laps / checkpoints | 3 / 3 |
| Countdown | 3 s + GO |
| Gyro full lock / dead zone | 25° / 2.5° |
| Low quality pixel budget / DPR cap | 1280×720 / 1.5 |
| Low quality shadow / MSAA | 1024² / off |
| Karts | 5 (player + 4 CPUs) |
| AI cruise speed | 20.5 m/s (~74 km/h) |
| AI pace biases | 1.0, 1.005, 1.015, 1.025 |
| AI lane offsets | 2.5, -1.7, 0.9 and 4.0 m |
| AI look-ahead | 1.05 s (6–24 m) |
| AI rubber-band window | 22 m |
| AI catch-up boost | 1.10× |
| AI pace, HARD | floor 1.0, ceiling 1.15× |
| AI pace, NORMAL | base 0.96×, leading ease-off 0.96×, floor 0.92× |
| AI hazard look-ahead | 18 m HARD, 13.5 m NORMAL |
| Item boxes / respawn | 12 / 3 s |
| Lightning boost | ~1.1 s |
| Red missile | 30 m/s, 4.5 s life |
| Triple item charges | 3 |
| Control loss when hit | 1 s |
| Sunstone tunnel | 84 m |
| Lamplight City overpass | 5.5 m high, 44 m ramps |

## Debug hooks

In development, `window.__deepseekKart` exposes the running game:

```js
window.__deepseekKart.getDebugState()
window.__deepseekKart.teleport(0, 0, 0)
window.__deepseekKart.racers // player + four CPUs
```

Use `T` telemetry to track `vF`, `vR`, surface and speed. Add `?touch=1` to
preview the mobile HUD on a desktop; `?touch=0` forces keyboard layout on a
touch device. Add `?quality=low` or `?quality=high` to override the automatic
visual budget for comparison. The recommended tuning order is in `plan/MVP.md`
(Portuguese), section 7.5; `plan/` is ignored local content.

## Known limitations

- Track elevation covers banked corners, kicker ramps and the Lamplight City
  overpass; there are no loops. The Sunstone tunnel is a covered passage at
  ground level, not a separate height layer.
- Collision is 2D in the XZ plane within a level; objects more than
  `PHYSICS.levelGap` (4 m) apart vertically do not interact. Height does not
  create wall sides.
- No multiplayer.
- All art and audio are procedural; there are no imported models or recorded
  voice lines.
- The AI follows the centerline; there is no full racing-line optimization or
  overtaking planner, though it avoids holes and oil slicks.
- Mobile requires a motion sensor for steering and runs in landscape only. iOS
  asks for motion access at START; on touch devices the first tap requests
  browser fullscreen, and orientation lock is best-effort. Desktop play stays in
  the browser window. The CSS rotate gate is the portable fallback, and iPhone
  Safari needs Add to Home Screen for a headerless standalone window. There are
  still no gamepad controls or touch steering fallback if motion access is
  denied.
