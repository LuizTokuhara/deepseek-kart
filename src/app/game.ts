import { createBoostFlame, type BoostFlame } from "../actors/kart/boost-flame";
import * as THREE from "three/webgpu";
import { GameAudio, type AudioRivalFrame } from "../audio";
import { OutlineManager } from "../rendering/outline-manager";
import { GLOW_LUMINANCE, glowColor } from "../rendering/glow";
import { PostProcessing } from "../rendering/post-processing";
import {
  CAMERA,
  FIXED_DT,
  GROUND_Y,
  ITEMS,
  MAX_FRAME_DT,
  RACE,
} from "../core/config";
import { ChaseCamera } from "../rendering/chase-camera";
import { FlyByCamera } from "../rendering/flyby-camera";
import { CinematicCamera, type CinematicSubject } from "../rendering/cinematic-camera";
import { computeGridCameraPose, type GridCameraPose } from "../rendering/grid-camera";
import { CollisionWorld, resolveKartPair } from "../core/collision";
import { Effects } from "../rendering/effects";
import { SpeedLines } from "../rendering/speed-lines";
import { Hud, type HudRival, type HudStanding } from "../ui/hud";
import { Input } from "../core/input";
import { ItemSystem, itemHitLabel, itemLabel, type ItemRacer } from "../items";
import { Kart } from "../actors/kart/kart";
import { AIDriver } from "../actors/kart/ai";
import { clamp, damp, lerp, lerpAngle } from "../core/math";
import {
  allRivalsFinished,
  formatTime,
  type Race,
} from "../race/race";
import { RaceCountdown, WrongWayDetector } from "../race/race-flow";
import { createRacers, type Racer } from "../actors/racers";
import { progressScore } from "../race/ranking";
import {
  DEFAULT_DIFFICULTY,
  paceScaleForGap,
  type Difficulty,
} from "../race/difficulty";
import { Track } from "../tracks/track";
import type { Decoration } from "../decor/types";
import { Environment } from "../rendering/environment";
import { createHeadlights, createHeadlightSpot } from "../actors/kart/headlights";
import type { CourseDefinition } from "../tracks/course";
import type { CameraTarget, DriveInput, ItemType, KartState } from "../core/types";

export class Game {
  private readonly renderer: THREE.WebGPURenderer;
  private postProcessing!: PostProcessing;
  private outlines!: OutlineManager;
  private readonly scene = new THREE.Scene();
  private readonly environment: Environment;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly track: Track;
  private readonly trackDecor: Decoration;
  private readonly collision: CollisionWorld;
  readonly racers: readonly Racer[];
  private readonly player: Racer;
  private readonly kart: Kart;
  private readonly playerRace: Race;
  private readonly itemSystem: ItemSystem;
  private readonly countdown: RaceCountdown;
  private readonly wrongWay: WrongWayDetector;
  private readonly boostFlame: BoostFlame;
  private readonly chase: ChaseCamera;
  private readonly flyBy: FlyByCamera;
  private readonly cinematic: CinematicCamera;
  /** Drives the player's kart while the opening cinematic films a demo race. */
  private readonly autopilot: AIDriver;
  private readonly cinematicSubjects: CinematicSubject[];
  private readonly input = new Input(false);
  private readonly hud = new Hud(
    () => this.reset("Race restarted"),
    () => this.returnToMenu(),
  );
  readonly audio: GameAudio;
  /** Set by the bootstrap to reopen the track select after the results. */
  onReturnToMenu: (() => void) | null = null;
  private difficulty: Difficulty = DEFAULT_DIFFICULTY;
  private readonly effects = new Effects();
  private readonly speedLines = new SpeedLines();
  private readonly introPose: GridCameraPose = {
    position: new THREE.Vector3(),
    look: new THREE.Vector3(),
  };

  private readonly previousPosition = { x: 0, z: 0 };
  private previousYaw = 0;
  private readonly cameraTarget: CameraTarget = {
    pos: { x: 0, z: 0 },
    yaw: 0,
    speed: 0,
    steer: 0,
    vLateral: 0,
    height: 0,
    drifting: false,
    driftDirection: 0,
    boosting: false,
  };

  private lastTime = 0;
  private accumulator = 0;
  private fps = 60;
  private ticks = 0;
  private visualDriftYaw = 0;
  private boostBlur = 0;
  private lastCountdownLabel: string | null = null;
  private resultsTimer = 0;
  private resultsShown = false;
  private raceOver = false;
  private raceStarted = false;
  private flyByActive = false;
  private flyBySkipArmed = false;
  private attractActive = false;
  private readonly introStartedAt = performance.now();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private missileTrailTimer = 0;
  private boostTrailTimer = 0;
  private driftTimer = 0;
  private skidTimer = 0;
  private impactCooldown = 0;
  private wasFalling = false;
  private loaded = false;

  constructor(
    private readonly root: HTMLElement,
    readonly course: CourseDefinition,
  ) {
    this.audio = new GameAudio(course.music, (muted) =>
      this.hud.toast(muted ? "Sound off — press M" : "Sound on"),
    );
    // WebGPU is the main backend; three falls back to WebGL 2 automatically.
    // Use ?webgl to force the fallback when validating both paths.
    const forceWebGL = new URLSearchParams(window.location.search).has("webgl");
    // MSAA lives on the post-processing scene buffer; the canvas only shows the result.
    this.renderer = new THREE.WebGPURenderer({
      antialias: false,
      powerPreference: "high-performance",
      forceWebGL,
      // Only the already graded display uses this buffer. Scene HDR is explicit.
      outputBufferType: THREE.UnsignedByteType,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(course.environment.background);
    this.root.appendChild(this.renderer.domElement);

    this.environment = new Environment(this.scene, course.environment);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );

    this.track = new Track(course.layout);
    this.hud.setTrack(this.track.path, this.track.finishLine);
    this.scene.add(this.track.group);
    this.trackDecor = course.createDecor(this.track);
    this.scene.add(this.trackDecor.group);
    this.environment.addBlobShadows(this.trackDecor.group);

    this.collision = new CollisionWorld([
      ...this.track.colliders,
      ...this.trackDecor.colliders,
    ]);
    this.racers = createRacers(this.track, this.collision);
    this.player = this.racers[0];
    this.kart = this.player.kart;
    this.playerRace = this.player.race;

    this.itemSystem = new ItemSystem(this.track, this.collision);
    this.scene.add(this.itemSystem.group);
    this.countdown = new RaceCountdown();
    this.wrongWay = new WrongWayDetector(this.track);

    this.boostFlame = createBoostFlame();
    this.player.model.body.add(this.boostFlame.group);
    for (const racer of this.racers) {
      this.scene.add(racer.model.group);
    }
    this.scene.add(this.effects.group);
    this.scene.add(this.speedLines.mesh);
    for (const racer of this.racers) {
      racer.model.group.traverse((object) => {
        if (object instanceof THREE.Mesh && !object.material.transparent) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
    }
    if (course.environment.headlights) this.addHeadlights();

    this.chase = new ChaseCamera(this.camera);
    this.flyBy = new FlyByCamera(this.camera, this.track);
    this.cinematic = new CinematicCamera(this.camera, this.track);
    this.autopilot = new AIDriver(this.track, 0);
    this.cinematicSubjects = this.racers.map(() => ({ x: 0, y: 0, z: 0, yaw: 0 }));
    this.chase.reset(this.kart.state);

    this.syncVisualToSpawn();
    this.updateRanks();
    this.configureOutlines();
    this.lastCountdownLabel = this.countdown.label;
    this.hud.setCountdown(this.countdown.label);
    this.trackDecor.setStartLights?.(this.countdown.label);

    window.addEventListener("resize", this.onResize);
  }

  /**
   * Creates the GPU device and compiles the scene before the start screen is
   * revealed. The caller drives a loading overlay from the progress callback.
   */
  async load(
    onProgress: (progress: number, label: string) => void = () => {},
  ): Promise<string> {
    if (this.loaded) return this.backendName();

    onProgress(0.04, "Starting GPU device");
    await this.renderer.init();
    this.postProcessing = new PostProcessing(
      this.renderer, this.scene, this.camera, this.course.environment.grade,
    );
    const backend = this.backendName();
    if (import.meta.env.DEV) {
      console.info(`[deepseek-kart] Rendering with ${backend}`);
    }
    onProgress(0.16, `${backend} ready`);

    // Warm every material now instead of hitching on the first frames.
    await this.renderer.compileAsync(this.scene, this.camera, null, (event) => {
      const total = event.total || 0;
      const ratio = total > 0 ? Math.min(1, event.loaded / total) : 0;
      onProgress(0.18 + ratio * 0.7, "Compiling shaders");
    });

    onProgress(0.92, "Painting the grid");
    this.warmup();
    onProgress(0.99, "Ready");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    onProgress(1, `${backend} ready`);
    this.loaded = true;
    return backend;
  }

  start(): void {
    // Also initialize capability-dependent buffers when called without load().
    void this.load().then(() => {
      this.lastTime = performance.now();
      return this.renderer.setAnimationLoop(this.frame);
    }).catch((error: unknown) => {
      console.error("Unable to start the WebGPU/WebGL 2 renderer", error);
    });
  }

  private backendName(): string {
    return (this.renderer.backend as { isWebGPUBackend?: boolean })
      .isWebGPUBackend ? "WebGPU" : "WebGL 2";
  }

  /** Renders one representative intro frame, compiling the post pipeline too. */
  private warmup(): void {
    const state = this.kart.state;
    this.environment.follow(state.pos.x, state.pos.z);
    this.updateIntroCamera();
    this.environment.update(
      0,
      this.camera.position,
      this.renderer.domElement.height,
      this.reducedMotion.matches,
    );
    this.trackDecor.update?.(0, {
      view: this.camera.position,
      reducedMotion: this.reducedMotion.matches,
    });
    this.postProcessing.render();
  }

  /**
   * Opening cinematic: every kart, the player's included, is driven by the AI
   * through a full race while the director cuts between camera angles. No
   * input, HUD, results or sound; `stopAttract` returns everything to the grid.
   */
  startAttract(): void {
    if (this.raceStarted) {
      return;
    }

    this.attractActive = true;
    this.input.setEnabled(false);
    this.setDifficulty("hard");
    this.autopilot.setDifficulty("hard");
    this.restartAttractRace();
  }

  /** Ends the demo race and puts the field back on the grid for the start screen. */
  stopAttract(): void {
    if (!this.attractActive) {
      return;
    }

    this.attractActive = false;
    this.resetRoundState(false);
    this.autopilot.reset();
  }

  private restartAttractRace(): void {
    this.resetRoundState(false);
    this.autopilot.reset();
    this.cinematic.start();
  }

  private setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    for (const racer of this.racers) {
      racer.driver?.setDifficulty(difficulty);
    }
    this.itemSystem.setDifficulty(difficulty);
  }

  /** Releases the first tick and starts the countdown after the start screen. */
  beginRace(difficulty: Difficulty = DEFAULT_DIFFICULTY): void {
    if (this.raceStarted) {
      return;
    }
    this.stopAttract();

    this.setDifficulty(difficulty);
    this.raceStarted = true;
    this.input.setEnabled(true);
    this.audio.startRace();
    if (this.reducedMotion.matches) {
      this.chase.reset(this.kart.state);
      this.restartRaceFlow();
      return;
    }
    this.startFlyBy();
  }

  /** Lifts the camera off the grid and into the pre-race circuit flyover. */
  private startFlyBy(): void {
    this.flyByActive = true;
    this.flyBySkipArmed = false;
    this.flyBy.start(this.kart.state);
    this.restartRaceFlow(false);
    document.body.classList.add("flyby");
    window.addEventListener("keydown", this.onFlyBySkipKey);
    window.addEventListener("pointerdown", this.onFlyBySkipPointer);
    // Arm the skip after the start-screen activation event has finished.
    requestAnimationFrame(() => {
      this.flyBySkipArmed = this.flyByActive;
    });
  }

  private endFlyBy(skipped: boolean): void {
    if (!this.flyByActive) {
      return;
    }

    this.flyByActive = false;
    this.flyBySkipArmed = false;
    window.removeEventListener("keydown", this.onFlyBySkipKey);
    window.removeEventListener("pointerdown", this.onFlyBySkipPointer);
    document.body.classList.remove("flyby");
    // A skipped shot can be anywhere on the circuit; snap instead of panning
    // the chase camera across the scenery.
    if (skipped) {
      this.chase.reset(this.kart.state);
    } else {
      this.flyBy.apply(0);
      this.chase.easeFromCurrentPose();
    }
    this.input.clearQueuedActions();
    this.restartRaceFlow();
  }

  private readonly onFlyBySkipKey = (event: KeyboardEvent): void => {
    if (!this.flyBySkipArmed || event.repeat) {
      return;
    }
    if (/^(Shift|Control|Alt|Meta)(Left|Right)?$/.test(event.code)) {
      return;
    }
    this.endFlyBy(true);
  };

  private readonly onFlyBySkipPointer = (event: PointerEvent): void => {
    if (this.flyBySkipArmed && event.button === 0) {
      this.endFlyBy(true);
    }
  };

  /**
   * Debug/tuning: repositions the kart and the camera. `level` selects the overpass or the
   * lower road where both exist.
   */
  teleport(x: number, z: number, yaw = this.kart.state.yaw, level?: number): void {
    this.kart.teleport(x, z, yaw, level);
    this.resetRacers(true);
    this.boostFlame.group.visible = false;
    this.effects.reset();
    this.speedLines.reset();
    this.boostBlur = 0;
    this.postProcessing.setBoost(0);
    this.missileTrailTimer = 0;
    this.boostTrailTimer = 0;
    this.driftTimer = 0;
    this.skidTimer = 0;
    this.impactCooldown = 0;
    this.visualDriftYaw = 0;
    this.wasFalling = false;
    this.updateRanks();
    this.chase.reset(this.kart.state);
    this.restartRaceFlow();
    this.hud.toast("Teleported");
  }

  getDebugState(): Readonly<KartState> {
    return this.kart.state;
  }

  private readonly frame = (now: number): void => {
    const frameDt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
    this.lastTime = now;
    this.accumulator += frameDt;

    while (this.accumulator >= FIXED_DT) {
      this.previousPosition.x = this.kart.state.pos.x;
      this.previousPosition.z = this.kart.state.pos.z;
      this.previousYaw = this.kart.state.yaw;
      for (const racer of this.racers) {
        racer.previousPosition.x = racer.kart.state.pos.x;
        racer.previousPosition.z = racer.kart.state.pos.z;
        racer.previousYaw = racer.kart.state.yaw;
      }
      this.tick();
      this.accumulator -= FIXED_DT;
    }

    if (frameDt > 0.0001) {
      const instantaneousFps = 1 / frameDt;
      this.fps = this.fps * 0.9 + instantaneousFps * 0.1;
    }

    this.render(this.accumulator / FIXED_DT, frameDt);
  };

  private tick(): void {
    if (!this.raceStarted && !this.attractActive) {
      return;
    }
    const demo = this.attractActive;

    if (this.flyByActive) {
      if (this.flyBy.advance(FIXED_DT)) {
        this.endFlyBy(false);
      }
      return;
    }

    if (this.input.consumeReset()) {
      this.reset("Race restarted");
      return;
    }

    if (this.input.consumeHelp()) {
      this.hud.toggleHelp();
    }

    if (this.input.consumeDebug()) {
      this.hud.toggleDebug();
    }

    const countdownStep = this.countdown.update(FIXED_DT);
    if (countdownStep.label !== this.lastCountdownLabel) {
      this.lastCountdownLabel = countdownStep.label;
      this.hud.setCountdown(countdownStep.label);
      this.trackDecor.setStartLights?.(countdownStep.label);
      this.audio.countdown(countdownStep.label);
    }
    if (countdownStep.startedNow) {
      for (const racer of this.racers) {
        racer.race.start();
      }
    }

    const raceFinished =
      this.playerRace.state.finished || this.raceOver;
    const controlsLocked = countdownStep.locked || raceFinished;

    const itemPressed = this.input.consumeItemUse();
    if (itemPressed && !controlsLocked) {
      this.itemSystem.useItem(this.kart, "player");
    }

    const driveInput: DriveInput = controlsLocked
      ? { throttle: 0, brake: 0, steer: 0, drift: false }
      : this.input.drive;
    if (!countdownStep.locked) this.trackDecor.fixedUpdate?.(FIXED_DT);
    const preImpactSpeed = this.kart.speed;
    if (!demo) this.stepKart(this.player, driveInput);
    this.ticks++;

    const state = this.kart.state;
    if (!Number.isFinite(state.pos.x) || !Number.isFinite(state.pos.z)) {
      this.reset("Race restarted");
      return;
    }

    // Falls into holes/out of bounds are handled by the kart itself:
    // it falls, waits out the penalty and returns to the last safe point on the track.
    if (state.falling && !this.wasFalling) {
      this.effects.splash(state.pos.x, state.pos.z);
      if (!demo) {
        this.audio.splash();
        this.chase.shake(0.16, 0.3);
        this.hud.toast("Lakitu rescue!");
      }
    } else if (!state.falling && this.wasFalling && !demo) {
      this.hud.toast("Back on track");
    }
    this.wasFalling = state.falling;

    const shouldRunAI =
      this.playerRace.state.started && !countdownStep.locked;

    if (shouldRunAI) {
      const rivalKarts = this.racers.map((racer) => ({
        x: racer.kart.state.pos.x,
        z: racer.kart.state.pos.z,
        y: racer.kart.state.height,
      }));
      for (const racer of this.racers) {
        // Finished CPUs keep driving a cool-down lap instead of parking on
        // the finish line and blocking the player.
        const driver = racer.isPlayer ? (demo ? this.autopilot : null) : racer.driver;
        if (!driver) {
          continue;
        }
        const aiInput = driver.update(racer.kart, FIXED_DT, {
          oilSlicks: this.itemSystem.oilSlickPositions,
          rivals: rivalKarts,
          paceScale: this.aiPaceScale(racer),
          movingObstacles: this.trackDecor.movingObstacles,
        });
        this.stepKart(racer, aiInput);
      }
    }

    for (let first = 0; first < this.racers.length; first++) {
      for (let second = first + 1; second < this.racers.length; second++) {
        resolveKartPair(
          this.racers[first].kart.state,
          this.racers[second].kart.state,
        );
      }
    }
    for (const racer of this.racers) {
      this.collision.resolveKart(racer.kart.state);
    }

    for (const racer of this.racers) {
      if (racer.isPlayer) {
        continue;
      }
      const aiState = racer.kart.state;
      if (
        !Number.isFinite(aiState.pos.x) ||
        !Number.isFinite(aiState.pos.z)
      ) {
        racer.kart.reset();
        racer.race.reset();
        racer.driver?.reset();
        racer.previousPosition.x = aiState.pos.x;
        racer.previousPosition.z = aiState.pos.z;
        racer.previousYaw = aiState.yaw;
      }
    }

    this.impactCooldown = Math.max(0, this.impactCooldown - FIXED_DT);
    const impact = preImpactSpeed - this.kart.speed;
    if (
      !demo &&
      impact > 4 &&
      preImpactSpeed > 8 &&
      this.impactCooldown <= 0 &&
      state.spinTimer <= 0
    ) {
      this.effects.impact(state.pos.x, state.pos.z);
      this.chase.shake(0.09, 0.18);
      this.audio.impact(impact);
      this.impactCooldown = 0.45;
    }

    if (!demo && this.playerRace.state.started && !raceFinished) {
      const wrongWay = this.wrongWay.update(state, FIXED_DT);
      this.hud.setWrongWay(wrongWay);
      this.audio.setWrongWay(wrongWay);
    } else {
      this.hud.setWrongWay(false);
      this.audio.setWrongWay(false);
    }

    this.updateRanks();
    const field: ItemRacer[] = this.racers.map((racer) => ({
      id: racer.id,
      kart: racer.kart,
      rank: racer.rank,
      // In the demo the AI also uses the player's items.
      isPlayer: racer.isPlayer && !demo,
      active: this.playerRace.state.started && !racer.race.state.finished,
    }));
    this.itemSystem.updateField(FIXED_DT, field);
    this.handleItemEvents();

    this.playerRace.update(FIXED_DT, state);
    if (demo) {
      this.playerRace.consumeEvent();
    } else {
      this.handleRaceEvent();
    }

    for (const racer of this.racers) {
      if (racer.isPlayer) {
        continue;
      }
      racer.race.update(FIXED_DT, racer.kart.state);
      racer.race.consumeEvent();
    }
    this.updateRanks();

    const rivalsFinished = this.racers
      .filter((racer) => !racer.isPlayer)
      .map((racer) => racer.race.state.finished);
    if (
      allRivalsFinished(
        this.playerRace.state.finished,
        rivalsFinished,
      )
    ) {
      if (demo) {
        // Behind the title, the demo race loops from the grid.
        if (this.playerRace.state.finished) this.restartAttractRace();
        return;
      }
      this.finishRace(false);
    }

    if (this.resultsTimer > 0) {
      this.resultsTimer = Math.max(0, this.resultsTimer - FIXED_DT);
      if (this.resultsTimer <= 0 && !this.resultsShown) {
        this.showResults();
      }
    }
  }

  private handleItemEvents(): void {
    const events = this.itemSystem.consumeEvents();
    if (this.attractActive) {
      // The demo is silent and has no HUD; keep only the explosions.
      for (const event of events) {
        const kart = this.racers.find((entry) => entry.id === event.kart)?.kart;
        if (kart && event.type === "hit") this.showItemHit(event.item, kart.state);
      }
      return;
    }
    for (const event of events) {
      const racer = this.racers.find((entry) => entry.id === event.kart);
      if (!racer) {
        continue;
      }
      const kart = racer.kart;

      if (event.type === "pickup") {
        this.effects.pickup(kart.state.pos.x, kart.state.pos.z);
        this.audio.pickup(
          event.item,
          event.count,
          kart.state.pos.x,
          kart.state.pos.z,
          racer.isPlayer,
        );
        if (racer.isPlayer) {
          this.hud.toast(`Item: ${itemLabel(event.item, event.count)}`);
        }
      } else if (event.type === "use") {
        this.audio.useItem(
          event.item,
          kart.state.pos.x,
          kart.state.pos.z,
          racer.isPlayer,
        );
      } else if (event.type === "hit") {
        this.showItemHit(event.item, kart.state);
        this.audio.hit(
          event.item,
          kart.state.pos.x,
          kart.state.pos.z,
          racer.isPlayer,
        );
        if (racer.isPlayer) {
          this.hud.flashDamage();
          this.chase.shake(0.24, 0.28);
          this.hud.toast(`${itemHitLabel(event.item)}!`);
        }
      }
    }
  }

  private showItemHit(item: ItemType, state: KartState): void {
    if (item === "missile" || item === "red-missile") {
      this.effects.missileExplosion(
        state.pos.x,
        state.pos.z,
        item === "red-missile" ? "red" : "white",
        state.height,
      );
    } else {
      this.effects.hit(state.pos.x, state.pos.z, item);
    }
  }

  private handleRaceEvent(): void {
    const event = this.playerRace.consumeEvent();
    if (!event) {
      return;
    }

    switch (event.type) {
      case "start":
        // The countdown overlay already shows GO.
        break;
      case "lap":
        this.audio.lap(event.lap, event.totalLaps);
        this.hud.toast(
          `Lap ${event.lap}/${event.totalLaps} — ${formatTime(event.lapTime)}`,
        );
        break;
      case "finish":
        this.finishRace(true);
        break;
      default:
        break;
    }
  }

  /**
   * Schedules the results screen once the player finishes or every rival is
   * done. The latter keeps an idle player from leaving the race open forever.
   */
  private finishRace(playerFinished: boolean): void {
    if (this.raceOver) {
      return;
    }

    this.raceOver = true;
    this.resultsTimer = RACE.resultsDelay;
    this.hud.setWrongWay(false);
    this.audio.setWrongWay(false);
    if (playerFinished) {
      this.audio.finishRace(this.player.rank === 1);
    } else {
      this.audio.raceOver();
    }
    this.hud.toast(playerFinished ? "Checkered flag!" : "Race over!");
  }

  private showResults(): void {
    this.resultsShown = true;
    this.updateRanks();

    const ordered = [...this.racers].sort((a, b) => a.rank - b.rank);
    const standings = ordered.map((racer) => ({
      name: racer.isPlayer ? "YOU" : racer.name,
      time: racer.race.state.finished
        ? formatTime(racer.race.state.raceTime)
        : "—",
      isPlayer: racer.isPlayer,
      color: racer.color,
    }));
    const player = this.playerRace.state;

    this.hud.showResults({
      position: this.player.rank,
      bestLap: player.bestLapTime,
      lapTimes: player.lapTimes,
      standings,
    });
  }

  private reset(message?: string): void {
    this.resetRoundState();
    if (message) {
      this.hud.toast(message);
    }
  }

  /** Returns every racer to the grid and clears the round and its effects. */
  private resetRoundState(announceCountdown = true): void {
    this.resetRacers();
    this.itemSystem.reset();
    this.boostFlame.group.visible = false;
    this.effects.reset();
    this.speedLines.reset();
    this.boostBlur = 0;
    this.postProcessing.setBoost(0);
    this.missileTrailTimer = 0;
    this.boostTrailTimer = 0;
    this.driftTimer = 0;
    this.skidTimer = 0;
    this.impactCooldown = 0;
    this.visualDriftYaw = 0;
    this.wasFalling = false;
    this.updateRanks();
    this.chase.reset(this.kart.state);
    this.restartRaceFlow(announceCountdown);
  }

  /** Closes the results and reopens the track select on the reset grid. */
  private returnToMenu(): void {
    if (this.flyByActive) {
      this.flyByActive = false;
      this.flyBySkipArmed = false;
      window.removeEventListener("keydown", this.onFlyBySkipKey);
      window.removeEventListener("pointerdown", this.onFlyBySkipPointer);
      document.body.classList.remove("flyby");
    }
    this.resetRoundState(false);
    this.raceStarted = false;
    this.input.setEnabled(false);
    this.audio.returnToMenu();
    this.onReturnToMenu?.();
  }

  /**
   * Resets every racer's physical state and race timer. `keepPlayer` is used
   * by teleport so the player keeps the requested position.
   */
  private resetRacers(keepPlayer = false): void {
    for (const racer of this.racers) {
      if (!racer.isPlayer || !keepPlayer) {
        racer.kart.reset();
      }
      racer.race.reset();
      racer.driver?.reset();
      racer.model.reset();
      racer.previousPosition.x = racer.kart.state.pos.x;
      racer.previousPosition.z = racer.kart.state.pos.z;
      racer.previousYaw = racer.kart.state.yaw;
    }

    this.previousPosition.x = this.kart.state.pos.x;
    this.previousPosition.z = this.kart.state.pos.z;
    this.previousYaw = this.kart.state.yaw;
  }

  private restartRaceFlow(announceCountdown = true): void {
    this.trackDecor.reset?.();
    this.audio.resetRound();
    this.countdown.reset();
    this.lastCountdownLabel = this.countdown.label;
    this.hud.setCountdown(this.countdown.label);
    this.trackDecor.setStartLights?.(this.countdown.label);
    if (announceCountdown) {
      this.audio.countdown(this.countdown.label);
    }
    this.wrongWay.reset();
    this.hud.setWrongWay(false);
    this.resultsTimer = 0;
    this.resultsShown = false;
    this.raceOver = false;
    this.hud.hideResults();
  }

  /**
   * WebGPURenderer has no OutlineEffect, so every outlined mesh receives a
   * back-face TSL hull child. Materials keep the same `outlineParameters`
   * contract; instanced batches already create their hull explicitly.
   */
  private configureOutlines(): void {
    this.outlines = new OutlineManager(this.scene);
  }

  private updateFeedback(
    frameDt: number,
    state: KartState,
    racers: readonly Racer[],
  ): void {
    this.effects.update(frameDt);
    this.speedLines.update(frameDt, state, this.camera.aspect,
      this.raceStarted && !this.raceOver && !this.reducedMotion.matches);

    this.missileTrailTimer -= frameDt;
    if (this.missileTrailTimer <= 0) {
      this.missileTrailTimer = 0.028;
      for (const missile of this.itemSystem.missileProjectiles) {
        this.effects.missileTrail(missile.x, missile.z, missile.kind, missile.y);
      }
    }

    this.boostTrailTimer -= frameDt;
    if (state.miniTurboTimer > 0) {
      if (this.boostTrailTimer <= 0) {
        this.boostTrailTimer = 0.028;
        const forwardX = Math.sin(state.yaw);
        const forwardZ = Math.cos(state.yaw);
        const rightX = -Math.cos(state.yaw);
        const rightZ = Math.sin(state.yaw);
        const tier = Math.max(1, state.miniTurboTier);
        const color =
          tier >= 3 ? 0xc084fc : tier === 2 ? 0xfb923c : 0x38bdf8;
        for (const side of [-1, 1]) {
          if (state.grounded && !state.falling) {
            this.effects.tireWake.emit(
              state.pos.x - forwardX * 0.7 + rightX * side * 0.73,
              state.height,
              state.pos.z - forwardZ * 0.7 + rightZ * side * 0.73,
              state.yaw, state.surface === "grass" && this.course.layout.surface === "ice" ? "ice" : state.surface,
              state.vForward, true, state.groundPitch, state.groundRoll,
            );
          }
          this.effects.boostTrail(
            state.pos.x - forwardX * 1.0 + rightX * side * 0.46,
            GROUND_Y + state.height + 0.66,
            state.pos.z - forwardZ * 1.0 + rightZ * side * 0.46,
            -forwardX,
            -forwardZ,
            color,
          );
        }
      }
    } else {
      this.boostTrailTimer = 0;
    }

    this.driftTimer -= frameDt;
    if (this.driftTimer <= 0) {
      this.driftTimer = 0.03;
      for (const racer of racers) {
        this.emitDriftParticles(racer.kart.state);
      }
    }

    this.skidTimer -= frameDt;
    if (this.skidTimer <= 0) {
      this.skidTimer = 0.055;
      for (const racer of racers) {
        this.emitSkidMarks(racer.kart.state);
      }
    }
  }

  /** Radial smear during mini-turbo and lightning boosts; the center stays sharp. */
  private updateBoostBlur(state: KartState, frameDt: number): void {
    const active =
      this.raceStarted &&
      !this.raceOver &&
      !this.reducedMotion.matches &&
      state.miniTurboTimer > 0;
    const tier = clamp(Math.max(1, state.miniTurboTier), 1, 3);
    const target = active ? 0.55 + tier * 0.15 : 0;
    const dt = Math.min(frameDt, 0.05);
    this.boostBlur = damp(this.boostBlur, target, active ? 20 : 9, dt);
    this.postProcessing.setBoost(this.boostBlur);
  }

  private emitDriftParticles(state: KartState): void {
    const sliding = state.drifting || Math.abs(state.vLateral) > 3;
    if (!state.grounded || state.falling || !sliding || Math.abs(state.vForward) < 3) {
      return;
    }

    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);
    for (const side of [-1, 1]) {
      this.effects.tireWake.emit(
        state.pos.x - forwardX * 0.7 + rightX * side * 0.73,
        state.height,
        state.pos.z - forwardZ * 0.7 + rightZ * side * 0.73,
        state.yaw, state.surface === "grass" && this.course.layout.surface === "ice" ? "ice" : state.surface,
        state.vForward, false, state.groundPitch, state.groundRoll,
      );
      this.effects.driftParticle(
        state.pos.x - forwardX * 0.7 + rightX * side * 0.68,
        state.pos.z - forwardZ * 0.7 + rightZ * side * 0.68,
        state.yaw,
        state.surface === "grass" && this.course.layout.surface === "ice" ? "ice" : state.surface,
        state.height,
      );
    }
  }

  private emitSkidMarks(state: KartState): void {
    const sliding = state.drifting || Math.abs(state.vLateral) > 3;
    if (
      !state.grounded || state.falling || !sliding ||
      Math.abs(state.vForward) < 3 ||
      state.surface === "grass" ||
      state.surface === "sand"
    ) {
      return;
    }

    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);
    for (const side of [-1, 1]) {
      const x = state.pos.x - forwardX * 0.7 + rightX * side * 0.68;
      const z = state.pos.z - forwardZ * 0.7 + rightZ * side * 0.68;
      if (this.track.holeAt(x, z)) continue;
      const sample = 0.15;
      if ([
        [x + forwardX * sample, z + forwardZ * sample],
        [x - forwardX * sample, z - forwardZ * sample],
        [x - rightX * sample, z - rightZ * sample],
        [x + rightX * sample, z + rightZ * sample],
      ].some(([sx, sz]) => this.track.holeAt(sx, sz))) continue;
      const level = state.height;
      const front = this.track.heightAt(x + forwardX * sample, z + forwardZ * sample, level);
      const back = this.track.heightAt(x - forwardX * sample, z - forwardZ * sample, level);
      const left = this.track.heightAt(x - rightX * sample, z - rightZ * sample, level);
      const right = this.track.heightAt(x + rightX * sample, z + rightZ * sample, level);
      const pitch = -Math.atan2(front - back, sample * 2);
      const roll = -Math.atan2(right - left, sample * 2);
      this.effects.skid(x, z, state.yaw, this.track.heightAt(x, z, level), pitch, roll,
        state.surface);
    }
  }

  private aiPaceScale(racer: Racer): number {
    const playerScore = progressScore(
      this.playerRace.state,
      this.kart.state.pos,
      this.track.checkpoints,
      this.track.finishLine,
    );
    const aiScore = progressScore(
      racer.race.state,
      racer.kart.state.pos,
      this.track.checkpoints,
      this.track.finishLine,
    );
    const gap = playerScore - aiScore;
    return paceScaleForGap(gap, racer.paceBias, this.difficulty);
  }

  private stepKart(racer: Racer, input: DriveInput): void {
    const state = racer.kart.state;
    const airborne = !state.grounded && !state.falling;
    const verticalSpeed = state.verticalVelocity;
    racer.kart.update(FIXED_DT, input);
    if (!airborne || !state.grounded || state.falling) return;
    const impact = Math.max(0, -verticalSpeed);
    racer.model.land(impact);
    const particleSurface = state.surface === "grass" && this.course.layout.surface === "ice" ? "ice" : state.surface;
    if (impact > 1.5) this.effects.landing(state.pos.x, state.height, state.pos.z, state.yaw, particleSurface, impact);
    if (racer.isPlayer && !this.reducedMotion.matches) this.chase.land(impact);
  }

  private updateRanks(): void {
    const ordered = this.racers
      .map((racer) => ({
        racer,
        score: progressScore(
          racer.race.state,
          racer.kart.state.pos,
          this.track.checkpoints,
          this.track.finishLine,
        ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score || a.racer.id.localeCompare(b.racer.id),
      );

    ordered.forEach((entry, index) => {
      entry.racer.rank = index + 1;
    });
  }

  private render(alpha: number, frameDt: number): void {
    const state = this.kart.state;
    const x = lerp(this.previousPosition.x, state.pos.x, alpha);
    const z = lerp(this.previousPosition.z, state.pos.z, alpha);
    const yaw = lerpAngle(this.previousYaw, state.yaw, alpha);

    // Visually exaggerates the drift angle: the nose points into the
    // corner and the rear visibly steps out more.
    const targetVisualDrift = state.drifting
      ? clamp(state.vLateral * 0.02, -0.12, 0.12)
      : 0;
    this.visualDriftYaw = damp(this.visualDriftYaw, targetVisualDrift, 10, frameDt);
    const rivals: HudRival[] = [];
    const audioRivals: AudioRivalFrame[] = [];
    for (const racer of this.racers) {
      const racerState = racer.kart.state;
      let racerX = x;
      let racerZ = z;
      let racerYaw = yaw;

      if (!racer.isPlayer) {
        racerX = lerp(
          racer.previousPosition.x,
          racerState.pos.x,
          alpha,
        );
        racerZ = lerp(
          racer.previousPosition.z,
          racerState.pos.z,
          alpha,
        );
        racerYaw = lerpAngle(
          racer.previousYaw,
          racerState.yaw,
          alpha,
        );
        rivals.push({
          x: racerX,
          z: racerZ,
          yaw: racerYaw,
          color: racer.color,
        });
        audioRivals.push({
          x: racerX,
          z: racerZ,
          speed: Math.hypot(racerState.vel.x, racerState.vel.z),
        });
      }

      const spin =
        racerState.spinTimer > 0
          ? (1 -
              clamp(racerState.spinTimer / ITEMS.spinTime, 0, 1)) *
            Math.PI *
            2
          : 0;
      racer.model.group.position.set(
        racerX,
        GROUND_Y + racerState.height,
        racerZ,
      );
      racer.model.group.rotation.order = "YXZ";
      racer.model.group.rotation.set(
        racerState.groundPitch,
        racerYaw + spin + (racer.isPlayer ? this.visualDriftYaw : 0),
        racerState.groundRoll,
      );
      racer.model.update(frameDt, racerState, this.track);
      if (this.attractActive) {
        const subject = this.cinematicSubjects[racer.rank - 1];
        subject.x = racerX;
        subject.y = racerState.height;
        subject.z = racerZ;
        subject.yaw = racerYaw;
      }
      racer.heldItems.update(
        racerState.item,
        racerState.itemCount,
        frameDt,
      );
    }
    const drive = this.input.drive;
    this.audio.update(frameDt, {
      x,
      z,
      yaw,
      speed: Math.hypot(state.vel.x, state.vel.z),
      throttle: drive.throttle,
      brake: drive.brake,
      drifting: state.drifting,
      driftCharge: state.driftCharge,
      driftTier: state.driftTier,
      lateral: state.vLateral,
      surface: state.surface,
      grounded: state.grounded,
      boostTimer: state.miniTurboTimer,
      boostTier: state.miniTurboTier,
      rivals: audioRivals,
    });
    this.updateFeedback(frameDt, state, this.racers);

    if (this.flyByActive) {
      this.flyBy.apply(alpha * FIXED_DT);
    } else if (this.attractActive) {
      this.cinematic.update(Math.min(frameDt, 0.05), this.cinematicSubjects);
    } else if (this.raceStarted) {
      this.cameraTarget.pos.x = x;
      this.cameraTarget.pos.z = z;
      this.cameraTarget.yaw = yaw;
      this.cameraTarget.speed = Math.hypot(state.vel.x, state.vel.z);
      this.cameraTarget.steer = state.steer;
      this.cameraTarget.vLateral = state.vLateral;
      // The camera responds immediately to the input direction, even before the
      // physical drift switches sides.
      const cameraDriftDirection: -1 | 0 | 1 = state.drifting
        ? state.steerInput > 0.2
          ? 1
          : state.steerInput < -0.2
            ? -1
            : state.driftDirection
        : 0;

      this.cameraTarget.height = state.height;
      this.cameraTarget.level = this.track.levelAt(x, z, state.height);
      this.cameraTarget.drifting = state.drifting;
      this.cameraTarget.driftDirection = cameraDriftDirection;
      this.cameraTarget.boosting = state.miniTurboTimer > 0;

      this.chase.update(
        Math.min(frameDt, 0.05),
        this.cameraTarget,
        this.collision,
      );
    } else {
      this.updateIntroCamera();
    }

    this.updateBoostBlur(state, frameDt);

    if (state.miniTurboTimer > 0) {
      const tier = Math.max(1, state.miniTurboTier);
      glowColor(
        tier >= 3 ? 0xc084fc : tier === 2 ? 0xfb923c : 0x38bdf8,
        GLOW_LUMINANCE,
        this.boostFlame.material.color,
      );
      const pulse = 1 + 0.12 * Math.sin(performance.now() * 0.035);
      this.boostFlame.group.visible = true;
      this.boostFlame.group.scale.set(
        0.85 + tier * 0.08,
        0.9,
        pulse * (0.85 + tier * 0.12),
      );
    } else {
      this.boostFlame.group.visible = false;
    }

    if (this.raceStarted) {
      const speedKmh = Math.hypot(state.vel.x, state.vel.z) * 3.6;
      const raceState = this.playerRace.state;
      const standings: HudStanding[] = [...this.racers]
        .sort((a, b) => a.rank - b.rank)
        .map((racer) => ({
          name: racer.isPlayer ? "YOU" : racer.name,
          color: racer.color,
          isPlayer: racer.isPlayer,
        }));
      this.hud.update({
        speedKmh,
        surface: state.surface,
        vForward: state.vForward,
        vLateral: state.vLateral,
        yaw,
        x,
        z,
        rivals,
        standings,
        fps: this.fps,
        ticks: this.ticks,
        drifting: state.drifting,
        driftTier: state.driftTier,
        driftCharge: state.driftCharge,
        miniTurboTimer: state.miniTurboTimer,
        miniTurboTier: state.miniTurboTier,
        lapLabel: raceState.finished || this.raceOver
          ? "FINISH"
          : `${raceState.lap}/${raceState.totalLaps}`,
        raceTime: formatTime(raceState.raceTime),
        lastLap: formatTime(raceState.lastLapTime),
        bestLap: formatTime(raceState.bestLapTime),
        checkpointLabel: `${raceState.nextCheckpoint}/${this.playerRace.checkpointCount}`,
        position: this.player.rank,
        totalRacers: this.racers.length,
        item: state.item,
        itemCount: state.itemCount,
        itemLabel: itemLabel(state.item, state.itemCount),
        raceFinished: raceState.finished || this.raceOver,
      });
    }

    const followCamera = this.flyByActive || this.attractActive;
    this.environment.follow(
      followCamera ? this.camera.position.x : x,
      followCamera ? this.camera.position.z : z,
    );
    this.environment.update(frameDt, this.camera.position, this.renderer.domElement.height, this.reducedMotion.matches);
    this.trackDecor.update?.(frameDt, {
      view: this.camera.position,
      reducedMotion: this.reducedMotion.matches,
    });
    this.postProcessing.render();
  }

  /** Night race: headlights and beam on every kart; actual light only on the player's. */
  private addHeadlights(): void {
    for (const racer of this.racers) {
      const { lamps, beam } = createHeadlights();
      racer.model.body.add(lamps);
      racer.model.group.add(beam);
      if (racer.isPlayer) racer.model.group.add(createHeadlightSpot());
    }
  }

  /** Intro shot: aims at the grid from behind and drifts slightly sideways. */
  private updateIntroCamera(): void {
    const elapsed = this.reducedMotion.matches
      ? 0
      : (performance.now() - this.introStartedAt) / 1000;
    computeGridCameraPose(
      this.kart.state,
      this.camera.aspect,
      elapsed,
      this.introPose,
    );
    this.camera.position.copy(this.introPose.position);
    this.camera.lookAt(this.introPose.look);

    if (this.camera.fov !== CAMERA.baseFov) {
      this.camera.fov = CAMERA.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private syncVisualToSpawn(): void {
    for (const racer of this.racers) {
      racer.previousPosition.x = racer.kart.state.pos.x;
      racer.previousPosition.z = racer.kart.state.pos.z;
      racer.previousYaw = racer.kart.state.yaw;
      racer.model.group.position.set(
        racer.kart.state.pos.x,
        GROUND_Y + racer.kart.state.height,
        racer.kart.state.pos.z,
      );
      racer.model.group.rotation.order = "YXZ";
      racer.model.group.rotation.set(
        racer.kart.state.groundPitch,
        racer.kart.state.yaw,
        racer.kart.state.groundRoll,
      );
    }

    this.previousPosition.x = this.kart.state.pos.x;
    this.previousPosition.z = this.kart.state.pos.z;
    this.previousYaw = this.kart.state.yaw;
  }

  private readonly onResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.postProcessing?.setSize(width, height, pixelRatio);
  };
}
