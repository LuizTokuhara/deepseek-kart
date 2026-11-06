import { createBoostFlame, type BoostFlame } from "../actors/kart/boost-flame";
import * as THREE from "three";
import { GameAudio, type AudioRivalFrame } from "../audio";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { INK_COLOR, INK_THICKNESS } from "../rendering/cel-shading";
import {
  AI,
  CAMERA,
  FIXED_DT,
  GROUND_Y,
  ITEMS,
  MAX_FRAME_DT,
  RACE,
} from "../core/config";
import { ChaseCamera } from "../rendering/chase-camera";
import { CollisionWorld, resolveKartPair } from "../core/collision";
import { Effects } from "../rendering/effects";
import { SpeedLines } from "../rendering/speed-lines";
import { Hud, type HudRival, type HudStanding } from "../ui/hud";
import { Input } from "../core/input";
import { ItemSystem, itemLabel, type ItemRacer } from "../items";
import { Kart } from "../actors/kart/kart";
import { clamp, damp, lerp, lerpAngle } from "../core/math";
import {
  allRivalsFinished,
  formatTime,
  type Race,
} from "../race/race";
import { RaceCountdown, WrongWayDetector } from "../race/race-flow";
import { createRacers, type Racer } from "../actors/racers";
import { progressScore } from "../race/ranking";
import { Track } from "../tracks/track";
import type { Decoration } from "../decor/types";
import { Environment } from "../rendering/environment";
import type { CourseDefinition } from "../tracks/course";
import type { CameraTarget, DriveInput, KartState } from "../core/types";

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly outline: OutlineEffect;
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
  private readonly input = new Input(false);
  private readonly hud = new Hud(() => this.reset("Race restarted"));
  readonly audio = new GameAudio((muted) =>
    this.hud.toast(muted ? "Sound off — press M" : "Sound on"),
  );
  private readonly effects = new Effects();
  private readonly speedLines = new SpeedLines();

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
  private lastCountdownLabel: string | null = null;
  private resultsTimer = 0;
  private resultsShown = false;
  private raceOver = false;
  private raceStarted = false;
  private readonly introStartedAt = performance.now();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private shellTrailTimer = 0;
  private boostTrailTimer = 0;
  private driftTimer = 0;
  private skidTimer = 0;
  private impactCooldown = 0;
  private wasFalling = false;

  constructor(
    private readonly root: HTMLElement,
    readonly course: CourseDefinition,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(course.environment.background);
    this.root.appendChild(this.renderer.domElement);

    this.outline = new OutlineEffect(this.renderer, {
      defaultThickness: INK_THICKNESS,
      defaultColor: new THREE.Color(INK_COLOR).toArray(),
      defaultAlpha: 1,
    });
    this.outline.autoClear = true;

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

    this.chase = new ChaseCamera(this.camera);
    this.chase.reset(this.kart.state);

    this.syncVisualToSpawn();
    this.updateRanks();
    this.configureOutlines();
    this.lastCountdownLabel = this.countdown.label;
    this.hud.setCountdown(this.countdown.label);
    this.trackDecor.setStartLights?.(this.countdown.label);

    window.addEventListener("resize", this.onResize);
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** Libera o primeiro tick e inicia o countdown depois da tela inicial. */
  beginRace(): void {
    if (this.raceStarted) {
      return;
    }

    this.raceStarted = true;
    this.input.setEnabled(true);
    this.audio.startRace();
    this.chase.reset(this.kart.state);
    this.restartRaceFlow();
  }

  /** Debug/tuning: reposiciona o kart e a câmera. */
  teleport(x: number, z: number, yaw = this.kart.state.yaw): void {
    this.kart.teleport(x, z, yaw);
    this.resetRacers(true);
    this.boostFlame.group.visible = false;
    this.effects.reset();
    this.speedLines.reset();
    this.shellTrailTimer = 0;
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
    requestAnimationFrame(this.frame);
  };

  private tick(): void {
    if (!this.raceStarted) {
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
    this.stepKart(this.player, driveInput);
    this.ticks++;

    const state = this.kart.state;
    if (!Number.isFinite(state.pos.x) || !Number.isFinite(state.pos.z)) {
      this.reset("Race restarted");
      return;
    }

    // Quedas em buracos/fora dos limites são resolvidas pelo próprio kart:
    // ele cai, espera a penalidade e volta ao último ponto seguro da pista.
    if (state.falling && !this.wasFalling) {
      this.effects.splash(state.pos.x, state.pos.z);
      this.audio.splash();
      this.chase.shake(0.16, 0.3);
      this.hud.toast("Lakitu rescue!");
    } else if (!state.falling && this.wasFalling) {
      this.hud.toast("Back on track");
    }
    this.wasFalling = state.falling;

    const shouldRunAI =
      this.playerRace.state.started && !countdownStep.locked;

    if (shouldRunAI) {
      for (const racer of this.racers) {
        // Finished CPUs keep driving a cool-down lap instead of parking on
        // the finish line and blocking the player.
        if (racer.isPlayer || !racer.driver) {
          continue;
        }
        const aiInput = racer.driver.update(racer.kart, FIXED_DT, {
          bananas: this.itemSystem.bananaPositions,
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

    if (this.playerRace.state.started && !raceFinished) {
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
      isPlayer: racer.isPlayer,
      active: this.playerRace.state.started && !racer.race.state.finished,
    }));
    this.itemSystem.updateField(FIXED_DT, field);
    this.handleItemEvents();

    this.playerRace.update(FIXED_DT, state);
    this.handleRaceEvent();

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
    for (const event of this.itemSystem.consumeEvents()) {
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
        this.effects.hit(kart.state.pos.x, kart.state.pos.z, event.item);
        this.audio.hit(
          event.item,
          kart.state.pos.x,
          kart.state.pos.z,
          racer.isPlayer,
        );
        if (racer.isPlayer) {
          this.hud.flashDamage();
          this.chase.shake(0.24, 0.28);
          this.hud.toast(`${itemLabel(event.item)}!`);
        }
      }
    }
  }

  private handleRaceEvent(): void {
    const event = this.playerRace.consumeEvent();
    if (!event) {
      return;
    }

    switch (event.type) {
      case "start":
        // O overlay do countdown já mostra o GO.
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
    this.resetRacers();
    this.itemSystem.reset();
    this.boostFlame.group.visible = false;
    this.effects.reset();
    this.speedLines.reset();
    this.shellTrailTimer = 0;
    this.boostTrailTimer = 0;
    this.driftTimer = 0;
    this.skidTimer = 0;
    this.impactCooldown = 0;
    this.visualDriftYaw = 0;
    this.wasFalling = false;
    this.updateRanks();
    this.chase.reset(this.kart.state);
    this.restartRaceFlow();

    if (message) {
      this.hud.toast(message);
    }
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

  private restartRaceFlow(): void {
    this.trackDecor.reset?.();
    this.audio.resetRound();
    this.countdown.reset();
    this.lastCountdownLabel = this.countdown.label;
    this.hud.setCountdown(this.countdown.label);
    this.trackDecor.setStartLights?.(this.countdown.label);
    this.audio.countdown(this.countdown.label);
    this.wrongWay.reset();
    this.hud.setWrongWay(false);
    this.resultsTimer = 0;
    this.resultsShown = false;
    this.raceOver = false;
    this.hud.hideResults();
  }

  private configureOutlines(): void {
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) {
        return;
      }

      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      for (const material of materials) {
        if (material.userData.outlineParameters === undefined) {
          material.userData.outlineParameters = { visible: false };
        }
      }
    });
  }

  private updateFeedback(
    frameDt: number,
    state: KartState,
    racers: readonly Racer[],
  ): void {
    this.effects.update(frameDt);
    this.speedLines.update(frameDt, state, this.camera.aspect,
      this.raceStarted && !this.raceOver && !this.reducedMotion.matches);

    this.shellTrailTimer -= frameDt;
    if (this.shellTrailTimer <= 0) {
      this.shellTrailTimer = 0.035;
      for (const shell of this.itemSystem.shellProjectiles) {
        this.effects.shellTrail(shell.x, shell.z, shell.kind);
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
      const front = this.track.heightAt(x + forwardX * sample, z + forwardZ * sample);
      const back = this.track.heightAt(x - forwardX * sample, z - forwardZ * sample);
      const left = this.track.heightAt(x - rightX * sample, z - rightZ * sample);
      const right = this.track.heightAt(x + rightX * sample, z + rightZ * sample);
      const pitch = -Math.atan2(front - back, sample * 2);
      const roll = -Math.atan2(right - left, sample * 2);
      this.effects.skid(x, z, state.yaw, this.track.heightAt(x, z), pitch, roll, state.surface);
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

    let scale = 1;
    if (gap > AI.rubberBandDistance) {
      scale = AI.rubberBandBoost;
    } else if (gap < -AI.rubberBandDistance) {
      scale = AI.rubberBandSlow;
    }

    return clamp(
      scale * racer.paceBias,
      AI.paceScaleMin,
      AI.paceScaleMax,
    );
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

    // Exagera visualmente o ângulo de derrapagem: o nariz aponta para dentro
    // da curva e a traseira fica visivelmente mais solta.
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

    if (this.raceStarted) {
      this.cameraTarget.pos.x = x;
      this.cameraTarget.pos.z = z;
      this.cameraTarget.yaw = yaw;
      this.cameraTarget.speed = Math.hypot(state.vel.x, state.vel.z);
      this.cameraTarget.steer = state.steer;
      this.cameraTarget.vLateral = state.vLateral;
      // A câmera responde imediatamente à direção do input, mesmo antes de o
      // drift físico trocar de lado.
      const cameraDriftDirection: -1 | 0 | 1 = state.drifting
        ? state.steerInput > 0.2
          ? 1
          : state.steerInput < -0.2
            ? -1
            : state.driftDirection
        : 0;

      this.cameraTarget.height = state.height;
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

    if (state.miniTurboTimer > 0) {
      const tier = Math.max(1, state.miniTurboTier);
      this.boostFlame.material.color.setHex(
        tier >= 3 ? 0xc084fc : tier === 2 ? 0xfb923c : 0x38bdf8,
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

    this.environment.follow(x, z);
    this.environment.update(frameDt, this.camera.position, this.renderer.domElement.height, this.reducedMotion.matches);
    this.trackDecor.update?.(frameDt);
    this.outline.render(this.scene, this.camera);
  }

  /** Plano de apresentação: mira o grid por trás e faz uma leve deriva lateral. */
  private updateIntroCamera(): void {
    const state = this.kart.state;
    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = -Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);
    const elapsed = this.reducedMotion.matches ? 0 : (performance.now() - this.introStartedAt) / 1000;
    const sway = Math.sin(elapsed * 0.22) * 0.9;
    const centerX = state.pos.x + forwardX * 4.4;
    const centerZ = state.pos.z + forwardZ * 4.4;
    // Em retrato, afasta a câmera para o grid inteiro caber na cena.
    const portraitScale = clamp(
      0.85 / Math.min(1, this.camera.aspect),
      1,
      1.75,
    );
    const distance = 13.5 * portraitScale;

    this.camera.position.set(
      centerX - forwardX * distance + rightX * (5 + sway),
      4.35 + (portraitScale - 1) * 1.5 + Math.sin(elapsed * 0.35) * 0.06,
      centerZ - forwardZ * distance + rightZ * (5 + sway),
    );
    this.camera.lookAt(
      centerX + forwardX * 1.2,
      GROUND_Y + 1.05,
      centerZ + forwardZ * 1.2,
    );

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
  };
}
