import * as THREE from "three";
import { CAMERA, COLORS, FIXED_DT, GROUND_Y, MAX_FRAME_DT } from "./config";
import { ChaseCamera } from "./chase-camera";
import { CollisionWorld } from "./collision";
import { Hud } from "./hud";
import { Input } from "./input";
import { Kart } from "./kart";
import { clamp, damp, lerp, lerpAngle } from "./math";
import { Track } from "./track";
import type { CameraTarget, DriveInput, KartState } from "./types";

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

function createKartMesh(): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.5, 2.2),
    new THREE.MeshLambertMaterial({ color: COLORS.kart }),
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
    new THREE.MeshLambertMaterial({ color: 0x0e7490 }),
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
  private readonly kartMesh: THREE.Group;
  private readonly boostFlame: THREE.Mesh;
  private readonly chase: ChaseCamera;
  private readonly input = new Input();
  private readonly hud = new Hud();

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
    this.kartMesh = createKartMesh();
    this.boostFlame = createBoostFlame();
    this.kartMesh.add(this.boostFlame);
    this.scene.add(this.kartMesh);

    this.chase = new ChaseCamera(this.camera);
    this.chase.reset(this.kart.state);

    this.syncVisualToSpawn();

    window.addEventListener("resize", this.onResize);
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** Debug/tuning: reposiciona o kart e a câmera. */
  teleport(x: number, z: number, yaw = this.kart.state.yaw): void {
    this.kart.teleport(x, z, yaw);
    this.previousPosition.x = this.kart.state.pos.x;
    this.previousPosition.z = this.kart.state.pos.z;
    this.previousYaw = this.kart.state.yaw;
    this.visualDriftYaw = 0;
    this.chase.reset(this.kart.state);
    this.hud.toast("Teleportado");
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
      this.reset("Kart resetado");
      return;
    }

    if (this.input.consumeHelp()) {
      this.hud.toggleHelp();
    }

    if (this.input.consumeDebug()) {
      this.hud.toggleDebug();
    }

    const driveInput: DriveInput = this.input.drive;
    this.kart.update(FIXED_DT, driveInput);
    this.ticks++;

    const state = this.kart.state;
    if (
      !Number.isFinite(state.pos.x) ||
      !Number.isFinite(state.pos.z) ||
      this.track.isOutOfBounds(state.pos.x, state.pos.z)
    ) {
      this.reset("Fora dos limites — resetado");
    }
  }

  private reset(message?: string): void {
    this.kart.reset();
    this.previousPosition.x = this.kart.state.pos.x;
    this.previousPosition.z = this.kart.state.pos.z;
    this.previousYaw = this.kart.state.yaw;
    this.visualDriftYaw = 0;
    this.chase.reset(this.kart.state);

    if (message) {
      this.hud.toast(message);
    }
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
    const visualYaw = yaw + this.visualDriftYaw;

    this.kartMesh.position.set(x, GROUND_Y + state.height, z);
    this.kartMesh.rotation.y = visualYaw;

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
