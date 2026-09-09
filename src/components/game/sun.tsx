"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const EXTENT = 70; // half-width of the shadow box, in metres
const OFFSET = new THREE.Vector3(90, 120, 46); // sun direction, scaled

/**
 * The sun. Airless bodies have no scattering, so shadows are hard-edged and
 * nearly black — hence a plain (non-soft) shadow map. The shadow camera is a
 * tight box that follows the player, so map resolution stays on what is nearby
 * instead of being spread across the whole 848x688 world.
 */
export default function Sun({ follow }: { follow: THREE.Vector3 }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  const target = useRef(new THREE.Object3D());

  useFrame(() => {
    const light = ref.current;
    if (!light) return;
    // snap to whole metres so the shadow map does not shimmer while walking
    const fx = Math.round(follow.x);
    const fy = Math.round(follow.y);
    const fz = Math.round(follow.z);
    light.position.set(fx + OFFSET.x, fy + OFFSET.y, fz + OFFSET.z);
    target.current.position.set(fx, fy, fz);
    target.current.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={target.current} />
      <directionalLight
        ref={ref}
        intensity={3.9}
        color="#fff4e6"
        castShadow
        target={target.current}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-EXTENT}
        shadow-camera-right={EXTENT}
        shadow-camera-top={EXTENT}
        shadow-camera-bottom={-EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={340}
        shadow-bias={-0.0012}
        shadow-normalBias={0.04}
      />
    </>
  );
}
