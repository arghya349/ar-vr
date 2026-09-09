"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getBlockMaterials } from "@/lib/game/blocks";
import { SHAPE_GEOMETRY, shapeQuaternion } from "@/lib/game/shapes";
import { getBlock, setBlock, type World } from "@/lib/game/worldgen";
import { getTargetBlock } from "@/lib/game/raycast";
import type { Part } from "./hotbar";
import { VrControls, type MoveInput } from "./vr";

const RANGE = 6;
const DOME_RADIUS = 7;

/** Hemispherical shell: glass panels turned to follow the curve, on a metal footing ring. */
function stampDome(world: World, cx: number, cy: number, cz: number) {
  for (let dy = 0; dy <= DOME_RADIUS; dy++) {
    for (let dz = -DOME_RADIUS; dz <= DOME_RADIUS; dz++) {
      for (let dx = -DOME_RADIUS; dx <= DOME_RADIUS; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (Math.abs(d - DOME_RADIUS) > 0.5) continue;
        if (dx > 0 && Math.abs(dz) <= 1 && dy <= 2) continue; // doorway

        const x = cx + dx, y = cy + dy, z = cz + dz;
        if (dy === 0) {
          setBlock(world, x, y, z, { block: "metal", shape: "cube", rot: 0 });
          continue;
        }
        const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        const rot = ay >= ax && ay >= az ? 0 : ax >= az ? 1 : 2;
        setBlock(world, x, y, z, { block: "glass", shape: "panel", rot });
      }
    }
  }
}

export default function BuildTool({
  world,
  part,
  rotation,
  onEdit,
  moveInput,
}: {
  world: World;
  part: Part;
  rotation: number;
  onEdit: () => void;
  moveInput: React.RefObject<MoveInput>;
}) {
  const { camera, gl } = useThree();
  const target = useRef<ReturnType<typeof getTargetBlock>>(null);

  const ghost = useMemo(() => {
    const spec = getBlockMaterials()[part.block].spec;
    const c = spec.top ?? spec.base;
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255),
      transparent: true,
      opacity: part.prefab ? 0.25 : 0.45,
      depthWrite: false,
      wireframe: !!part.prefab,
    });
    const geometry = part.prefab
      ? new THREE.SphereGeometry(DOME_RADIUS, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
      : SHAPE_GEOMETRY[part.shape];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 999;
    return mesh;
  }, [part]);

  // Input-agnostic actions: mouse buttons and controller trigger/grip share these.
  const place = useCallback(() => {
    if (part.explore) return;
    const t = target.current;
    if (!t) return;
    const [px, py, pz] = t.placeAt;
    if (part.prefab === "dome") {
      stampDome(world, px, py, pz);
      onEdit();
      return;
    }
    if (getBlock(world, px, py, pz) !== "air") return;
    setBlock(world, px, py, pz, { block: part.block, shape: part.shape, rot: rotation });
    onEdit();
  }, [world, part, rotation, onEdit]);

  const breakBlock = useCallback(() => {
    if (part.explore) return;
    const t = target.current;
    if (!t) return;
    setBlock(world, t.x, t.y, t.z, "air");
    onEdit();
  }, [world, part, onEdit]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) place();
      else if (e.button === 2) breakBlock();
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [gl, place, breakBlock]);

  useFrame(() => {
    if (part.explore) {
      ghost.visible = false;
      target.current = null;
      return;
    }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    target.current = getTargetBlock(world, camera.position, dir, RANGE);

    if (!target.current) {
      ghost.visible = false;
      return;
    }
    const [gx, gy, gz] = target.current.placeAt;
    ghost.visible = part.prefab ? true : getBlock(world, gx, gy, gz) === "air";
    ghost.position.set(gx + 0.5, gy + 0.5, gz + 0.5);
    if (!part.prefab) shapeQuaternion(part.shape, rotation, ghost.quaternion);
  });

  return (
    <>
      <primitive object={ghost} />
      <VrControls input={moveInput} onPlace={place} onBreak={breakBlock} />
    </>
  );
}
