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
- Select a course with `?track=<layout.id>`; an unknown ID falls back to
  Deepseek Raceway.

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
  Do not reintroduce `WebGLRenderer`, `EffectComposer`, `OutlineEffect`,
  `ShaderMaterial` or `onBeforeCompile`.
- Scene fog must go through `blendFogInSrgb(scene, fog)`; the default linear fog
  node changes the art-directed colors.
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
- UI copy, code comments and tracked README/docs are English. The tracked
  READMEs are `README.md` and `src/tracks/README.md`.
- Current item IDs are `oil-can`, `missile`, `red-missile` and `lightning`;
  the old banana/shell/mushroom IDs no longer exist.
- Telemetry is toggled with `T`, not `F3`.
- Commit only when explicitly asked. Never stage `.serena/`. `/docs`, `/plan`,
  `/tools`, `/dist` and `/.venv` are gitignored local directories.
