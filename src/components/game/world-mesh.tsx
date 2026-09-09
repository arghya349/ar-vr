"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getBlockMaterials, type BlockId } from "@/lib/game/blocks";
import { SHAPE_GEOMETRY, shapeQuaternion, type ShapeId } from "@/lib/game/shapes";
import {
  CHUNK,
  DIG_DEPTH,
  BUILD_HEIGHT,
  columnTouched,
  getBlock,
  getVoxel,
  isFullCube,
  subsurfaceBlock,
  type World,
} from "@/lib/game/worldgen";

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

function buildChunk(world: World, cx: number, cz: number) {
  const mats = getBlockMaterials();
  const buckets = new Map<string, { block: BlockId; shape: ShapeId; m: THREE.Matrix4[] }>();
  const { W, D, height, surface } = world;
  const x0 = Math.max(cx * CHUNK, 0);
  const z0 = Math.max(cz * CHUNK, 0);
  const x1 = Math.min(x0 + CHUNK, W);
  const z1 = Math.min(z0 + CHUNK, D);

  const put = (
    block: BlockId, shape: ShapeId, rot: number,
    x: number, y: number, z: number
  ) => {
    const key = `${block}|${shape}|${rot}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { block, shape, m: [] }));
    _pos.set(x + 0.5, y + 0.5, z + 0.5);
    shapeQuaternion(shape, rot, _quat);
    b.m.push(new THREE.Matrix4().compose(_pos, _quat, _scale));
  };

  const h = (x: number, z: number) =>
    x < 0 || z < 0 || x >= W || z >= D ? 0 : height[z * W + x];

  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const i = z * W + x;
      const top = height[i];

      if (!columnTouched(world, x, z)) {
        // Untouched terrain: derive the visible skin straight from the heightmap.
        // No getBlock calls — this path runs for ~all 583k columns.
        const s = surface[i];
        put(s, "cube", 0, x, top, z);
        const lowest = Math.min(h(x - 1, z), h(x + 1, z), h(x, z - 1), h(x, z + 1));
        const drop = Math.min(top - lowest, DIG_DEPTH);
        for (let d = 1; d <= drop; d++) put(subsurfaceBlock(s, d), "cube", 0, x, top - d, z);
        continue;
      }

      // Near a player edit: full scan with real 6-neighbour exposure.
      for (let y = Math.max(0, top - DIG_DEPTH); y <= top + BUILD_HEIGHT; y++) {
        const v = getVoxel(world, x, y, z);
        if (!v) continue;
        // Partial shapes are never hidden; full cubes are, but only by other full cubes.
        if (
          v.shape === "cube" &&
          isFullCube(world, x + 1, y, z) && isFullCube(world, x - 1, y, z) &&
          isFullCube(world, x, y + 1, z) && isFullCube(world, x, y - 1, z) &&
          isFullCube(world, x, y, z + 1) && isFullCube(world, x, y, z - 1)
        ) continue;
        put(v.block, v.shape, v.rot, x, y, z);
      }
    }
  }

  const out: { id: string; inst: THREE.InstancedMesh }[] = [];
  buckets.forEach(({ block, shape, m }, key) => {
    const inst = new THREE.InstancedMesh(SHAPE_GEOMETRY[shape], mats[block].material, m.length);
    m.forEach((mat, i) => inst.setMatrixAt(i, mat));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    out.push({ id: key, inst });
  });
  return out;
}

const DRAW_DISTANCE_DESKTOP = 900;
const DRAW_DISTANCE_VR = 260; // stereo at 72-90Hz cannot afford the far terrain

export default function WorldMesh({
  world,
  version,
  inXR,
}: {
  world: World;
  version: number;
  inXR: React.RefObject<boolean>;
}) {
  const cache = useRef(new Map<string, { id: string; inst: THREE.InstancedMesh }[]>());

  const chunks = useMemo(() => {
    const cxMax = Math.floor((world.W - 1) / CHUNK);
    const czMax = Math.floor((world.D - 1) / CHUNK);

    for (let cz = 0; cz <= czMax; cz++) {
      for (let cx = 0; cx <= cxMax; cx++) {
        const key = `${cx},${cz}`;
        if (!cache.current.has(key) || world.dirtyChunks.has(key)) {
          cache.current.get(key)?.forEach(({ inst }) => inst.dispose());
          cache.current.set(key, buildChunk(world, cx, cz));
        }
      }
    }
    world.dirtyChunks.clear();

    return Array.from(cache.current.entries()).flatMap(([key, meshes]) =>
      meshes.map(({ id, inst }) => ({ key: `${key}:${id}`, inst }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, version]);

  // Distance-cull whole chunks. Frustum culling already drops what is behind
  // you; this drops what is simply too far to matter, which is what makes the
  // headset viable.
  useFrame(({ camera }) => {
    const limit = inXR.current ? DRAW_DISTANCE_VR : DRAW_DISTANCE_DESKTOP;
    const limitSq = limit * limit;
    for (const { inst } of chunks) {
      const s = inst.boundingSphere;
      if (!s) continue;
      const d = camera.position.distanceToSquared(s.center);
      inst.visible = d < limitSq + s.radius * s.radius;
    }
  });

  return (
    <group>
      {chunks.map(({ key, inst }) => (
        <primitive key={key} object={inst} />
      ))}
    </group>
  );
}
