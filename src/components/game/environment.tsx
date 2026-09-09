"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Black sky, sunlit regolith below — the only two things there are to reflect.
const FRAG = `
varying vec3 vDir;
void main() {
  float h = normalize(vDir).y;
  vec3 ground = vec3(0.42, 0.40, 0.38);
  vec3 sky = vec3(0.004, 0.005, 0.008);
  float t = smoothstep(-0.12, 0.06, h);
  gl_FragColor = vec4(mix(ground, sky, t), 1.0);
}
`;

/**
 * Procedural image-based lighting. Without an environment map a metallic PBR
 * surface has nothing to reflect and renders black, so aluminium and MLI foil
 * need this to look like metal rather than flat grey.
 */
export default function LunarEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(20, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide })
    );
    envScene.add(shell);

    // the sun itself, so metal picks up a hard specular highlight
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 13.2, 12.2) })
    );
    sun.position.set(11, 8.5, 5);
    envScene.add(sun);

    const rt = pmrem.fromScene(envScene, 0.02);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55;

    shell.geometry.dispose();
    (shell.material as THREE.Material).dispose();
    sun.geometry.dispose();
    (sun.material as THREE.Material).dispose();
    pmrem.dispose();

    return () => {
      scene.environment = null;
      rt.dispose();
    };
  }, [gl, scene]);

  return null;
}
