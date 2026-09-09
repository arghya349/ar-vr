import * as THREE from "three";
import { getBlock, type World } from "./worldgen";

export interface TargetBlock {
  x: number;
  y: number;
  z: number;
  /** Outward normal of the face that was hit. */
  face: [number, number, number];
  /** Empty grid cell just outside that face — where a new block would go. */
  placeAt: [number, number, number];
}

/**
 * Amanatides & Woo voxel traversal: walks the ray one grid cell at a time
 * (not brute-force stepping) and returns the first solid block it hits.
 */
export function getTargetBlock(
  world: World,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxRange: number
): TargetBlock | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const dx = direction.x, dy = direction.y, dz = direction.z;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

  const boundaryFrac = (p: number, step: number) =>
    step > 0 ? 1 - (p - Math.floor(p)) : p - Math.floor(p);

  let tMaxX = dx === 0 ? Infinity : boundaryFrac(origin.x, stepX) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : boundaryFrac(origin.y, stepY) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : boundaryFrac(origin.z, stepZ) * tDeltaZ;

  let normal: [number, number, number] = [0, 0, 0];
  let t = 0;

  while (t <= maxRange) {
    if (getBlock(world, x, y, z) !== "air") {
      return { x, y, z, face: normal, placeAt: [x + normal[0], y + normal[1], z + normal[2]] };
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      normal = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      normal = [0, -stepY, 0];
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = [0, 0, -stepZ];
    }
  }

  return null;
}
