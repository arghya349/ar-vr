"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { surfaceHeightAt, type World } from "@/lib/game/worldgen";
import type { MoveInput } from "./vr";

const EYE = 1.7;
const RADIUS = 0.3;
const SPEED = 3.5;
const FAST = 6;
const GRAVITY = 9.8;
const STEP = 1.05; // auto-step a full block, so stairs and decks are walkable
const ACCEL = 12;
const DECEL = 7;
const MOUSE_SENS = 0.002;
const JUMP_VEL = 4.5;

export interface PlayerState {
  pos: THREE.Vector3;
  yaw: number;
  grounded: boolean;
  sprinting: boolean;
}

function groundUnder(world: World, x: number, z: number, fromY: number) {
  // Only surfaces whose TOP is within step range count. Searching from
  // feet+STEP would latch onto a corridor roof overhead and report it as ground.
  const from = fromY + STEP - 1;
  return Math.max(
    surfaceHeightAt(world, x - RADIUS, z - RADIUS, from),
    surfaceHeightAt(world, x + RADIUS, z - RADIUS, from),
    surfaceHeightAt(world, x - RADIUS, z + RADIUS, from),
    surfaceHeightAt(world, x + RADIUS, z + RADIUS, from)
  );
}

export default function Player({
  world,
  spawn,
  onState,
  inXR,
  moveInput,
  feetOut,
}: {
  world: World;
  spawn: THREE.Vector3;
  thirdPerson?: boolean;
  onState: (s: PlayerState) => void;
  /** Set while an XR session is running: the headset owns the camera, not us. */
  inXR: React.RefObject<boolean>;
  /** Movement request from VR controllers, in world space. */
  moveInput: React.RefObject<MoveInput>;
  /** Player feet, published every frame so the XR rig can follow. */
  feetOut: React.RefObject<THREE.Vector3>;
}) {
  const { camera, gl } = useThree();
  const pos = useRef(spawn.clone());
  const vel = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const vy = useRef(0);
  const grounded = useRef(false);
  const keys = useRef<Record<string, boolean>>({});
  const emit = useRef(0);
  const smoothY = useRef(spawn.y);
  const locked = useRef(false);

  // Start at the spawn instead of lerping in from the world origin.
  useEffect(() => {
    if (inXR.current) return;
    camera.position.set(spawn.x, spawn.y + EYE, spawn.z);
    camera.rotation.order = "YXZ";
  }, [camera, spawn, inXR]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = () => {
      if (!locked.current) {
        canvas.requestPointerLock();
      }
    };

    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return;
      yaw.current -= e.movementX * MOUSE_SENS;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - e.movementY * MOUSE_SENS,
        -Math.PI / 2 + 0.05,
        Math.PI / 2 - 0.05
      );
    };

    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === "Escape") {
        document.exitPointerLock();
      }
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };

    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const k = keys.current;

    const fwd = new THREE.Vector3(
      -Math.sin(yaw.current),
      0,
      -Math.cos(yaw.current)
    );
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    let inputZ = 0;
    let inputX = 0;
    if (k["ArrowUp"] || k["KeyW"]) inputZ += 1;
    if (k["ArrowDown"] || k["KeyS"]) inputZ -= 1;
    if (k["ArrowLeft"] || k["KeyA"]) inputX -= 1;
    if (k["ArrowRight"] || k["KeyD"]) inputX += 1;

    const vr = inXR.current;
    const vrMove = moveInput.current;
    const sprinting = vr
      ? !!vrMove?.sprint
      : !!(k["ShiftLeft"] || k["ShiftRight"]);
    const maxSpeed = sprinting ? FAST : SPEED;
    // In XR the direction already comes in world space, relative to the headset.
    const desired = vr
      ? new THREE.Vector3(vrMove?.x ?? 0, 0, vrMove?.z ?? 0)
      : fwd.clone().multiplyScalar(inputZ).add(right.clone().multiplyScalar(inputX));
    const hasInput = desired.lengthSq() > 0.0001;
    if (hasInput) desired.normalize().multiplyScalar(maxSpeed);

    const v = vel.current;
    if (hasInput) {
      v.x += (desired.x - v.x) * Math.min(1, ACCEL * dt);
      v.z += (desired.z - v.z) * Math.min(1, ACCEL * dt);
    } else {
      v.x *= Math.max(0, 1 - DECEL * dt);
      v.z *= Math.max(0, 1 - DECEL * dt);
      if (v.lengthSq() < 0.001) { v.x = 0; v.z = 0; }
    }

    if (k["Space"] && grounded.current) {
      vy.current = JUMP_VEL;
      grounded.current = false;
    }

    const p = pos.current;

    const mx = v.x * dt;
    const mz = v.z * dt;
    if (mx !== 0) {
      const nx = p.x + mx;
      if (groundUnder(world, nx, p.z, p.y) - p.y <= STEP) p.x = nx;
      else v.x *= -0.3;
    }
    if (mz !== 0) {
      const nz = p.z + mz;
      if (groundUnder(world, p.x, nz, p.y) - p.y <= STEP) p.z = nz;
      else v.z *= -0.3;
    }

    p.x = THREE.MathUtils.clamp(p.x, 1.5, world.W - 1.5);
    p.z = THREE.MathUtils.clamp(p.z, 1.5, world.D - 1.5);

    const ground = groundUnder(world, p.x, p.z, p.y);

    vy.current -= GRAVITY * dt;
    p.y += vy.current * dt;

    if (p.y <= ground) {
      p.y = ground;
      vy.current = 0;
      grounded.current = true;
    } else if (p.y - ground < STEP && vy.current <= 0) {
      p.y = ground;
      vy.current = 0;
      grounded.current = true;
    } else {
      grounded.current = false;
    }

    smoothY.current += (p.y - smoothY.current) * Math.min(1, 8 * dt);

    // Publish feet for the XR rig; the headset provides eye height above it.
    feetOut.current?.set(p.x, smoothY.current, p.z);

    if (!vr) {
      const camTarget = new THREE.Vector3(p.x, smoothY.current + EYE, p.z);
      camera.position.lerp(camTarget, Math.min(1, 20 * dt));
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
    }

    emit.current += dt;
    if (emit.current > 0.1) {
      emit.current = 0;
      onState({
        pos: p.clone(),
        yaw: yaw.current,
        grounded: grounded.current,
        sprinting,
      });
    }
  });

  return null;
}
