"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { XROrigin, useXR, useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";

/** Movement request filled by whichever input is active, consumed by Player. */
export interface MoveInput {
  /** Desired horizontal direction in world space, length 0..1. */
  x: number;
  z: number;
  sprint: boolean;
  /** Yaw applied by snap turn, radians. */
  yaw: number;
}

export const DEAD_ZONE = 0.15;
const SNAP_DEGREES = 30;
const SNAP_THRESHOLD = 0.7;

/**
 * Quest controller input. The left stick drives movement relative to where the
 * player is actually looking (headset yaw + snap-turn yaw); the right stick
 * snap-turns, which is far more comfortable than smooth rotation.
 *
 * Movement is written into a shared ref rather than applied directly, so the
 * headset goes through exactly the same gravity/step/collision code as desktop.
 */
export function VrControls({
  input,
  onPlace,
  onBreak,
}: {
  input: React.RefObject<MoveInput>;
  onPlace: () => void;
  onBreak: () => void;
}) {
  const session = useXR((s) => s.session);
  const left = useXRInputSourceState("controller", "left");
  const right = useXRInputSourceState("controller", "right");
  const { camera } = useThree();

  const snapArmed = useRef(true);
  const triggerWas = useRef(false);
  const squeezeWas = useRef(false);
  const headDir = useRef(new THREE.Vector3());

  useFrame(() => {
    const move = input.current;
    if (!move || !session) return;

    const stick = left?.gamepad?.["xr-standard-thumbstick"];
    const sx = stick?.xAxis ?? 0;
    const sy = stick?.yAxis ?? 0;

    if (Math.hypot(sx, sy) > DEAD_ZONE) {
      // Forward is where the headset looks, flattened onto the ground plane.
      camera.getWorldDirection(headDir.current);
      headDir.current.y = 0;
      headDir.current.normalize();
      const rightVec = new THREE.Vector3(headDir.current.z, 0, -headDir.current.x);
      // thumbstick y is negative when pushed forward
      const vx = headDir.current.x * -sy + rightVec.x * sx;
      const vz = headDir.current.z * -sy + rightVec.z * sx;
      const len = Math.hypot(vx, vz) || 1;
      move.x = vx / len;
      move.z = vz / len;
    } else {
      move.x = 0;
      move.z = 0;
    }

    move.sprint = (left?.gamepad?.["xr-standard-squeeze"]?.state ?? "default") === "pressed";

    // right stick: snap turn, re-armed only after the stick returns to centre
    const turnStick = right?.gamepad?.["xr-standard-thumbstick"];
    const tx = turnStick?.xAxis ?? 0;
    if (Math.abs(tx) < 0.3) snapArmed.current = true;
    else if (snapArmed.current && Math.abs(tx) > SNAP_THRESHOLD) {
      move.yaw += (tx > 0 ? -1 : 1) * THREE.MathUtils.degToRad(SNAP_DEGREES);
      snapArmed.current = false;
    }

    // right trigger places, right grip removes — same actions as the mouse buttons
    const trigger = (right?.gamepad?.["xr-standard-trigger"]?.state ?? "default") === "pressed";
    if (trigger && !triggerWas.current) onPlace();
    triggerWas.current = trigger;

    const squeeze = (right?.gamepad?.["xr-standard-squeeze"]?.state ?? "default") === "pressed";
    if (squeeze && !squeezeWas.current) onBreak();
    squeezeWas.current = squeeze;
  });

  return null;
}

/**
 * Places the XR rig at the player's feet. The headset supplies eye height above
 * this, so we must NOT also apply our own eye offset or write to the camera.
 */
export function VrRig({
  feet,
  input,
}: {
  feet: React.RefObject<THREE.Vector3>;
  input: React.RefObject<MoveInput>;
}) {
  // Only mount the rig during a session; outside one there is no origin to place.
  const session = useXR((s) => s.session);
  if (!session) return null;
  return <VrRigActive feet={feet} input={input} />;
}

function VrRigActive({
  feet,
  input,
}: {
  feet: React.RefObject<THREE.Vector3>;
  input: React.RefObject<MoveInput>;
}) {
  const ref = useRef<THREE.Group>(null);

  // Reset yaw and snap to the base on VR entry so the user always starts
  // standing on the ground at the landing site.
  useEffect(() => {
    if (input.current) input.current.yaw = 0;
    const g = ref.current;
    if (g && feet.current) {
      g.position.copy(feet.current);
      g.rotation.y = 0;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const g = ref.current;
    if (!g || !feet.current) return;
    g.position.copy(feet.current);
    g.rotation.y = input.current?.yaw ?? 0;
  });
  return <XROrigin ref={ref} />;
}
