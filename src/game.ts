import * as THREE from "three";
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
import { clamp, damp, lerp, lerpAngle } from "./math";
import { formatTime, Race } from "./race";
import { RaceCountdown, WrongWayDetector } from "./race-flow";
import { progressScore } from "./ranking";
import { Track } from "./track";
import type { CameraTarget, DriveInput, KartState, Spawn } from "./types";

function createBoostFlame(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.16, 0.9),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  mesh.position.set(0, 0.42, -1.35);
  mesh.visible = false;
  return mesh;
}

function createKartMesh(
  bodyColor: number = COLORS.kart,
  accentColor = 0x0e7490,
): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.5, 2.2),
    new THREE.MeshLambertMaterial({ color: bodyColor }),
  );
  body.position.y = 0.55;
  group.add(body);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.22, 0.5),
    new THREE.MeshLambertMaterial({ color: COLORS.kartNose }),
  );
  nose.position.set(0, 0.76, 0.95);
  group.add(nose);

  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 0.12, 0.3),
    new THREE.MeshLambertMaterial({ color: accentColor }),
  );
  spoiler.position.set(0, 0.9, -0.95);
  group.add(spoiler);

  const wheelGeometry = new THREE.BoxGeometry(0.24, 0.5, 0.5);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: COLORS.kartWheel });
  for (const x of [-0.58, 0.58]) {
    for (const z of [-0.7, 0.7]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.position.set(x, 0.25, z);
      group.add(wheel);
    }
  }

  return group;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly track: Track;
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
  private readonly kartMesh: THREE.Group;
  private readonly aiMesh: THREE.Group;
  private readonly boostFlame: THREE.Mesh;
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
    this.renderer.setClearColor(COLORS.background);
    this.root.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.Fog(COLORS.background, 70, 280);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.baseFov,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );

    const hemisphere = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.6);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(60, 90, 30);
    this.scene.add(sun);

    this.track = new Track();
    this.scene.add(this.track.group);

    this.collision = new CollisionWorld(this.track.colliders);
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

    this.kartMesh = createKartMesh();
    this.boostFlame = createBoostFlame();
    this.kartMesh.add(this.boostFlame);
    this.scene.add(this.kartMesh);

    this.aiMesh = createKartMesh(COLORS.aiKart, 0x881337);
    this.scene.add(this.aiMesh);

    this.chase = new ChaseCamera(this.camera);
    this.chase.reset(this.kart.state);

    this.syncVisualToSpawn();
    this.updatePositions();
    this.lastCountdownLabel = this.countdown.label;
    this.hud.setCountdown(this.countdown.label);

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
        this.hud.toast(`Item: ${itemLabel(event.item)}`);
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
    this.wrongWay.reset();
    this.hud.setWrongWay(false);
    this.resultsTimer = 0;
    this.resultsShown = false;
    this.hud.hideResults();
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

    this.kartMesh.position.set(x, GROUND_Y + state.height, z);
    this.kartMesh.rotation.y = visualYaw;

    const aiState = this.aiKart.state;
    const aiX = lerp(this.previousAiPosition.x, aiState.pos.x, alpha);
    const aiZ = lerp(this.previousAiPosition.z, aiState.pos.z, alpha);
    const aiYaw = lerpAngle(this.previousAiYaw, aiState.yaw, alpha);
    const aiSpin =
      aiState.spinTimer > 0
        ? (1 - clamp(aiState.spinTimer / ITEMS.spinTime, 0, 1)) * Math.PI * 2
        : 0;
    this.aiMesh.position.set(aiX, GROUND_Y + aiState.height, aiZ);
    this.aiMesh.rotation.y = aiYaw + aiSpin;

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
      const material = this.boostFlame.material as THREE.MeshBasicMaterial;
      material.color.setHex(tier >= 3 ? 0xc084fc : tier === 2 ? 0xfb923c : 0x38bdf8);
      const pulse = 1 + 0.12 * Math.sin(performance.now() * 0.035);
      this.boostFlame.visible = true;
      this.boostFlame.scale.set(
        0.85 + tier * 0.08,
        0.9,
        pulse * (0.85 + tier * 0.12),
      );
    } else {
      this.boostFlame.visible = false;
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
      itemLabel: itemLabel(state.item),
      raceFinished: raceState.finished,
    });

    this.renderer.render(this.scene, this.camera);
  }

  private syncVisualToSpawn(): void {
    this.previousPosition.x = this.kart.state.pos.x;
    this.previousPosition.z = this.kart.state.pos.z;
    this.previousYaw = this.kart.state.yaw;
    this.kartMesh.position.set(
      this.kart.state.pos.x,
      GROUND_Y + this.kart.state.height,
      this.kart.state.pos.z,
    );
    this.kartMesh.rotation.y = this.kart.state.yaw;

    this.previousAiPosition.x = this.aiKart.state.pos.x;
    this.previousAiPosition.z = this.aiKart.state.pos.z;
    this.previousAiYaw = this.aiKart.state.yaw;
    this.aiMesh.position.set(
      this.aiKart.state.pos.x,
      GROUND_Y + this.aiKart.state.height,
      this.aiKart.state.pos.z,
    );
    this.aiMesh.rotation.y = this.aiKart.state.yaw;
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
