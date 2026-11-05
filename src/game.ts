import * as THREE from "three";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { INK_COLOR, INK_THICKNESS } from "./cel-shading";
import {
  AI,
  CAMERA,
  COLORS,
  FIXED_DT,
  GROUND_Y,
  ITEMS,
  MAX_FRAME_DT,
  RACE,
} from "./config";
import { AIDriver } from "./ai";
import { ChaseCamera } from "./chase-camera";
import { CollisionWorld, resolveKartPair } from "./collision";
import { Hud } from "./hud";
import { Input } from "./input";
import { ItemSystem, itemLabel } from "./items";
import { Kart } from "./kart";
import { AI_PALETTE, KartModel, PLAYER_PALETTE } from "./kart-model";
import { clamp, damp, lerp, lerpAngle } from "./math";
import { formatTime, Race } from "./race";
import { RaceCountdown, WrongWayDetector } from "./race-flow";
import { progressScore } from "./ranking";
import { Track } from "./track";
import { TrackDecor } from "./track-decor";
import type { CameraTarget, DriveInput, KartState, Spawn } from "./types";

interface BoostFlame {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
}

function createBoostFlame(): BoostFlame {
  const material = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.16, 0.7),
      material,
    );
    flame.position.set(side * 0.46, 1.04, -1.5);
    flame.rotation.set(0.34, side * -0.14, 0);
    group.add(flame);
  }

  group.visible = false;
  return { group, material };
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly outline: OutlineEffect;
  private readonly scene = new THREE.Scene();
  private readonly sun = new THREE.DirectionalLight(0xfff3de, 2.8);
  private readonly camera: THREE.PerspectiveCamera;
  private readonly track: Track;
  private readonly trackDecor: TrackDecor;
  private readonly collision: CollisionWorld;
  private readonly kart: Kart;
  private readonly aiKart: Kart;
  private readonly playerRace: Race;
  private readonly aiRace: Race;
  private readonly aiDriver: AIDriver;
  private readonly aiSpawn: Spawn;
  private readonly itemSystem: ItemSystem;
  private readonly countdown: RaceCountdown;
  private readonly wrongWay: WrongWayDetector;
  private readonly playerModel: KartModel;
  private readonly aiModel: KartModel;
  private readonly boostFlame: BoostFlame;
  private readonly chase: ChaseCamera;
  private readonly totalRacers = 2;
  private readonly input = new Input();
  private readonly hud = new Hud();

  private readonly previousPosition = { x: 0, z: 0 };
  private previousYaw = 0;
  private readonly previousAiPosition = { x: 0, z: 0 };
  private previousAiYaw = 0;
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
  private playerPosition = 1;
  private lastCountdownLabel: string | null = null;
  private resultsTimer = 0;
  private resultsShown = false;

  constructor(private readonly root: HTMLElement) {
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
    this.renderer.setClearColor(COLORS.background);
    this.root.appendChild(this.renderer.domElement);

    this.outline = new OutlineEffect(this.renderer, {
      defaultThickness: INK_THICKNESS,
      defaultColor: new THREE.Color(INK_COLOR).toArray(),
      defaultAlpha: 1,
    });
    this.outline.autoClear = true;

    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.Fog(COLORS.background, 110, 300);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );

    // Uniform cool fill preserves the two-tone cut instead of introducing
    // another smooth gradient over the painted shadows.
    this.scene.add(new THREE.AmbientLight(0xa6baff, 0.28));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 130;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.0002;
    this.scene.add(this.sun, this.sun.target);

    this.track = new Track();
    this.scene.add(this.track.group);
    this.trackDecor = new TrackDecor(this.track);
    this.scene.add(this.trackDecor.group);

    this.collision = new CollisionWorld([
      ...this.track.colliders,
      ...this.trackDecor.colliders,
    ]);
    this.kart = new Kart(this.track.spawn, this.track, this.collision);

    const spawn = this.track.spawn;
    const forwardX = Math.sin(spawn.yaw);
    const forwardZ = Math.cos(spawn.yaw);
    const rightX = -Math.cos(spawn.yaw);
    const rightZ = Math.sin(spawn.yaw);

    this.aiSpawn = {
      pos: {
        x: spawn.pos.x + forwardX * 4.5 + rightX * 3.0,
        z: spawn.pos.z + forwardZ * 4.5 + rightZ * 3.0,
      },
      yaw: spawn.yaw,
    };
    this.aiKart = new Kart(this.aiSpawn, this.track, this.collision);

    this.playerRace = new Race({
      checkpoints: this.track.checkpoints,
      finish: this.track.finishLine,
      radius: this.track.checkpointRadius,
      laps: RACE.laps,
    });
    this.aiRace = new Race({
      checkpoints: this.track.checkpoints,
      finish: this.track.finishLine,
      radius: this.track.checkpointRadius,
      laps: RACE.laps,
    });
    this.aiDriver = new AIDriver(this.track);
    this.itemSystem = new ItemSystem(this.track, this.collision);
    this.scene.add(this.itemSystem.group);
    this.countdown = new RaceCountdown();
    this.wrongWay = new WrongWayDetector(this.track);

    this.playerModel = new KartModel(PLAYER_PALETTE);
    this.boostFlame = createBoostFlame();
    this.playerModel.body.add(this.boostFlame.group);
    this.scene.add(this.playerModel.group);

    this.aiModel = new KartModel(AI_PALETTE);
    this.scene.add(this.aiModel.group);
    for (const model of [this.playerModel, this.aiModel]) {
      model.group.traverse((object) => {
        if (object instanceof THREE.Mesh && !object.material.transparent) {
          object.castShadow = true;
        }
      });
    }

    this.chase = new ChaseCamera(this.camera);
    this.chase.reset(this.kart.state);

    this.syncVisualToSpawn();
    this.updatePositions();
    this.configureOutlines();
    this.lastCountdownLabel = this.countdown.label;
    this.hud.setCountdown(this.countdown.label);
    this.trackDecor.setStartLights(this.countdown.label);

    window.addEventListener("resize", this.onResize);
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** Debug/tuning: reposiciona o kart e a câmera. */
  teleport(x: number, z: number, yaw = this.kart.state.yaw): void {
    this.kart.teleport(x, z, yaw);
    this.playerRace.reset();
    this.aiKart.reset();
    this.aiRace.reset();
    this.aiDriver.reset();
    this.itemSystem.reset();
    this.playerModel.reset();
    this.aiModel.reset();
    this.boostFlame.group.visible = false;
    this.playerPosition = 1;
    this.previousPosition.x = this.kart.state.pos.x;
    this.previousPosition.z = this.kart.state.pos.z;
    this.previousYaw = this.kart.state.yaw;
    this.previousAiPosition.x = this.aiKart.state.pos.x;
    this.previousAiPosition.z = this.aiKart.state.pos.z;
    this.previousAiYaw = this.aiKart.state.yaw;
    this.visualDriftYaw = 0;
    this.updatePositions();
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
      this.previousAiPosition.x = this.aiKart.state.pos.x;
      this.previousAiPosition.z = this.aiKart.state.pos.z;
      this.previousAiYaw = this.aiKart.state.yaw;
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
      this.trackDecor.setStartLights(countdownStep.label);
    }
    if (countdownStep.startedNow) {
      this.playerRace.start();
      this.aiRace.start();
    }

    const raceFinished = this.playerRace.state.finished;
    const controlsLocked = countdownStep.locked || raceFinished;

    const itemPressed = this.input.consumeItemUse();
    if (itemPressed && !controlsLocked) {
      this.itemSystem.useItem(this.kart, "player");
    }

    const driveInput: DriveInput = controlsLocked
      ? { throttle: 0, brake: 0, steer: 0, drift: false }
      : this.input.drive;
    this.kart.update(FIXED_DT, driveInput);
    this.ticks++;

    const state = this.kart.state;
    if (
      !Number.isFinite(state.pos.x) ||
      !Number.isFinite(state.pos.z) ||
      this.track.isOutOfBounds(state.pos.x, state.pos.z)
    ) {
      this.reset("Out of bounds — race restarted");
      return;
    }

    const shouldRunAI =
      this.playerRace.state.started &&
      !controlsLocked &&
      !this.aiRace.state.finished;

    if (shouldRunAI) {
      const aiInput = this.aiDriver.update(this.aiKart, FIXED_DT, {
        bananas: this.itemSystem.bananaPositions,
        paceScale: this.aiPaceScale(),
      });
      this.aiKart.update(FIXED_DT, aiInput);
    }

    resolveKartPair(state, this.aiKart.state);
    this.collision.resolveKart(state);
    this.collision.resolveKart(this.aiKart.state);

    const aiState = this.aiKart.state;
    if (
      !Number.isFinite(aiState.pos.x) ||
      !Number.isFinite(aiState.pos.z) ||
      this.track.isOutOfBounds(aiState.pos.x, aiState.pos.z)
    ) {
      this.aiKart.reset();
      this.aiRace.reset();
      this.aiDriver.reset();
      this.previousAiPosition.x = this.aiKart.state.pos.x;
      this.previousAiPosition.z = this.aiKart.state.pos.z;
      this.previousAiYaw = this.aiKart.state.yaw;
    }

    if (this.playerRace.state.started && !raceFinished) {
      this.hud.setWrongWay(this.wrongWay.update(state, FIXED_DT));
    } else {
      this.hud.setWrongWay(false);
    }

    this.itemSystem.update(
      FIXED_DT,
      this.kart,
      this.aiKart,
      this.playerPosition,
      !this.aiRace.state.finished,
    );
    this.handleItemEvents();

    this.playerRace.update(FIXED_DT, state);
    this.handleRaceEvent();

    this.aiRace.update(FIXED_DT, this.aiKart.state);
    this.aiRace.consumeEvent();
    this.updatePositions();

    if (this.resultsTimer > 0) {
      this.resultsTimer = Math.max(0, this.resultsTimer - FIXED_DT);
      if (this.resultsTimer <= 0 && !this.resultsShown) {
        this.showResults();
      }
    }
  }

  private handleItemEvents(): void {
    for (const event of this.itemSystem.consumeEvents()) {
      if (event.kart !== "player") {
        continue;
      }

      if (event.type === "pickup") {
        this.hud.toast(`Item: ${itemLabel(event.item, event.count)}`);
      } else if (event.type === "hit") {
        this.hud.toast(`${itemLabel(event.item)}!`);
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
        this.hud.toast(
          `Lap ${event.lap}/${event.totalLaps} — ${formatTime(event.lapTime)}`,
        );
        break;
      case "finish":
        this.resultsTimer = RACE.resultsDelay;
        this.hud.setWrongWay(false);
        this.hud.toast("Checkered flag!");
        break;
      default:
        break;
    }
  }

  private showResults(): void {
    this.resultsShown = true;

    const player = this.playerRace.state;
    const ai = this.aiRace.state;
    const aiTime = ai.finished ? ai.raceTime : null;
    const youFirst = aiTime === null || player.raceTime <= aiTime;
    const aiLabel = aiTime === null ? "—" : formatTime(aiTime);
    const standings = youFirst
      ? [
          { name: "YOU", time: formatTime(player.raceTime), isPlayer: true },
          { name: "AI", time: aiLabel, isPlayer: false },
        ]
      : [
          { name: "AI", time: aiLabel, isPlayer: false },
          { name: "YOU", time: formatTime(player.raceTime), isPlayer: true },
        ];

    this.hud.showResults({
      position: youFirst ? 1 : 2,
      bestLap: player.bestLapTime,
      lapTimes: player.lapTimes,
      standings,
    });
  }

  private reset(message?: string): void {
    this.kart.reset();
    this.playerRace.reset();
    this.aiKart.reset();
    this.aiRace.reset();
    this.aiDriver.reset();
    this.itemSystem.reset();
    this.playerModel.reset();
    this.aiModel.reset();
    this.boostFlame.group.visible = false;
    this.playerPosition = 1;
    this.previousPosition.x = this.kart.state.pos.x;
    this.previousPosition.z = this.kart.state.pos.z;
    this.previousYaw = this.kart.state.yaw;
    this.previousAiPosition.x = this.aiKart.state.pos.x;
    this.previousAiPosition.z = this.aiKart.state.pos.z;
    this.previousAiYaw = this.aiKart.state.yaw;
    this.visualDriftYaw = 0;
    this.updatePositions();
    this.chase.reset(this.kart.state);
    this.restartRaceFlow();

    if (message) {
      this.hud.toast(message);
    }
  }

  private restartRaceFlow(): void {
    this.countdown.reset();
    this.lastCountdownLabel = this.countdown.label;
    this.hud.setCountdown(this.countdown.label);
    this.trackDecor.setStartLights(this.countdown.label);
    this.wrongWay.reset();
    this.hud.setWrongWay(false);
    this.resultsTimer = 0;
    this.resultsShown = false;
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

  private aiPaceScale(): number {
    const playerScore = progressScore(
      this.playerRace.state,
      this.kart.state.pos,
      this.track.checkpoints,
      this.track.finishLine,
    );
    const aiScore = progressScore(
      this.aiRace.state,
      this.aiKart.state.pos,
      this.track.checkpoints,
      this.track.finishLine,
    );
    const gap = playerScore - aiScore;

    if (gap > AI.rubberBandDistance) {
      return AI.rubberBandBoost;
    }
    if (gap < -AI.rubberBandDistance) {
      return AI.rubberBandSlow;
    }
    return 1;
  }

  private updatePositions(): void {
    const playerScore = progressScore(
      this.playerRace.state,
      this.kart.state.pos,
      this.track.checkpoints,
      this.track.finishLine,
    );
    const aiScore = progressScore(
      this.aiRace.state,
      this.aiKart.state.pos,
      this.track.checkpoints,
      this.track.finishLine,
    );
    this.playerPosition = playerScore >= aiScore ? 1 : 2;
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
    const playerSpin =
      state.spinTimer > 0
        ? (1 - clamp(state.spinTimer / ITEMS.spinTime, 0, 1)) * Math.PI * 2
        : 0;
    const visualYaw = yaw + this.visualDriftYaw + playerSpin;

    this.playerModel.group.position.set(x, GROUND_Y + state.height, z);
    this.playerModel.group.rotation.y = visualYaw;
    this.playerModel.update(frameDt, state);

    const aiState = this.aiKart.state;
    const aiX = lerp(this.previousAiPosition.x, aiState.pos.x, alpha);
    const aiZ = lerp(this.previousAiPosition.z, aiState.pos.z, alpha);
    const aiYaw = lerpAngle(this.previousAiYaw, aiState.yaw, alpha);
    const aiSpin =
      aiState.spinTimer > 0
        ? (1 - clamp(aiState.spinTimer / ITEMS.spinTime, 0, 1)) * Math.PI * 2
        : 0;
    this.aiModel.group.position.set(aiX, GROUND_Y + aiState.height, aiZ);
    this.aiModel.group.rotation.y = aiYaw + aiSpin;
    this.aiModel.update(frameDt, aiState);

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

    this.chase.update(Math.min(frameDt, 0.05), this.cameraTarget, this.collision);

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

    const speedKmh = Math.hypot(state.vel.x, state.vel.z) * 3.6;
    const raceState = this.playerRace.state;
    this.hud.update({
      speedKmh,
      surface: state.surface,
      vForward: state.vForward,
      vLateral: state.vLateral,
      yaw,
      x,
      z,
      fps: this.fps,
      ticks: this.ticks,
      drifting: state.drifting,
      driftTier: state.driftTier,
      driftCharge: state.driftCharge,
      miniTurboTimer: state.miniTurboTimer,
      miniTurboTier: state.miniTurboTier,
      lapLabel: raceState.finished
        ? "FINISH"
        : `${raceState.lap}/${raceState.totalLaps}`,
      raceTime: formatTime(raceState.raceTime),
      lastLap: formatTime(raceState.lastLapTime),
      bestLap: formatTime(raceState.bestLapTime),
      checkpointLabel: `${raceState.nextCheckpoint}/${this.playerRace.checkpointCount}`,
      positionLabel: `${this.playerPosition}/${this.totalRacers}`,
      itemLabel: itemLabel(state.item, state.itemCount),
      raceFinished: raceState.finished,
    });

    this.sun.position.set(x - 35, 55, z + 25);
    this.sun.target.position.set(x, 0, z);
    this.trackDecor.update(frameDt);
    this.outline.render(this.scene, this.camera);
  }

  private syncVisualToSpawn(): void {
    this.previousPosition.x = this.kart.state.pos.x;
    this.previousPosition.z = this.kart.state.pos.z;
    this.previousYaw = this.kart.state.yaw;
    this.playerModel.group.position.set(
      this.kart.state.pos.x,
      GROUND_Y + this.kart.state.height,
      this.kart.state.pos.z,
    );
    this.playerModel.group.rotation.y = this.kart.state.yaw;

    this.previousAiPosition.x = this.aiKart.state.pos.x;
    this.previousAiPosition.z = this.aiKart.state.pos.z;
    this.previousAiYaw = this.aiKart.state.yaw;
    this.aiModel.group.position.set(
      this.aiKart.state.pos.x,
      GROUND_Y + this.aiKart.state.height,
      this.aiKart.state.pos.z,
    );
    this.aiModel.group.rotation.y = this.aiKart.state.yaw;
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
