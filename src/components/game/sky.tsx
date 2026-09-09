"use client";

import { useMemo } from "react";
import * as THREE from "three";

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
varying vec3 vDir;
uniform vec3 zenith;
uniform vec3 sunDir;
void main() {
  vec3 col = zenith;

  // Sharp unscattered sun disc — no atmosphere to soften it
  float sunDot = max(dot(normalize(vDir), sunDir), 0.0);
  col += vec3(1.0, 0.98, 0.92) * pow(sunDot, 2000.0) * 3.0;
  col += vec3(0.9, 0.85, 0.8) * pow(sunDot, 128.0) * 0.15;

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function Sky({ radius = 800 }: { radius?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color("#000000") },
          sunDir: { value: new THREE.Vector3(0.6, 0.35, 0.3).normalize() },
        },
      }),
    []
  );

  return (
    <>
      <mesh material={mat} frustumCulled={false}>
        <sphereGeometry args={[radius, 48, 24]} />
      </mesh>
      {/* Sun: about half a degree wide, blindingly bright, no glow to scatter */}
      <mesh position={[450, 180, 220]} frustumCulled={false}>
        <sphereGeometry args={[6, 24, 24]} />
        <meshBasicMaterial color={new THREE.Color(9, 8.6, 8)} toneMapped={false} fog={false} />
      </mesh>
      {/* Earth: a gibbous marble, lit from the same side as everything else */}
      <mesh position={[-300, 210, -120]} frustumCulled={false}>
        <sphereGeometry args={[11, 32, 32]} />
        <meshStandardMaterial
          color="#7ba2c8"
          emissive="#24425e"
          emissiveIntensity={0.55}
          roughness={1}
          metalness={0}
          fog={false}
        />
      </mesh>
    </>
  );
}
