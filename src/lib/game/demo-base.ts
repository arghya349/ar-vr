import type { BlockId } from "./blocks";
import type { ShapeId } from "./shapes";
import { setBlock, type World } from "./worldgen";

const R = 4; // habitat half-width -> 9x9 footprint
const WALL_H = 4; // wall height in blocks
const DOME_R = 6;

/**
 * Reference home base on the landing pad: framed habitat with a pitched roof,
 * a corridor, and a glazed dome. Built only from parts on the hotbar, so a
 * player can reproduce every piece of it by hand.
 *
 * Floors replace the top pad block rather than sitting on it, so every
 * threshold is flush and you can walk straight in (step height is only 0.4m).
 */
export function buildDemoBase(w: World) {
  const site = w.landingSite;
  const g = site.y; // topmost solid pad block
  const bx = site.x;
  const bz = site.z - 13; // in front of the spawn, facing the player

  const put = (x: number, y: number, z: number, block: BlockId, shape: ShapeId, rot = 0) =>
    setBlock(w, x, y, z, { block, shape, rot });

  // ---- floor, flush with the pad ----
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) put(bx + dx, g, bz + dz, "metal", "cube", 0);

  // ---- corner posts ----
  for (const [sx, sz] of [[-R, -R], [R, -R], [-R, R], [R, R]])
    for (let h = 1; h <= WALL_H; h++) put(bx + sx, g + h, bz + sz, "metal", "beam", 0);

  // ---- walls: plate below, glazing at eye level, doorway facing the spawn ----
  for (let d = -R + 1; d <= R - 1; d++) {
    for (let h = 1; h <= WALL_H; h++) {
      const window = h === 3;
      const block: BlockId = window ? "glass" : "metal";
      const shape: ShapeId = window ? "panel" : "cube";
      const doorGap = Math.abs(d) <= 1 && h <= 2;

      // ±Z walls face along Z -> upright panel is rot 2
      if (!doorGap) put(bx + d, g + h, bz + R, block, shape, window ? 2 : 0);
      put(bx + d, g + h, bz - R, block, shape, window ? 2 : 0);

      // ±X walls face along X -> upright panel is rot 1
      put(bx - R, g + h, bz + d, block, shape, window ? 1 : 0);
      if (!doorGap) put(bx + R, g + h, bz + d, block, shape, window ? 1 : 0);
    }
  }

  // ---- top rails ----
  const railY = g + WALL_H + 1;
  for (let d = -R; d <= R; d++) {
    put(bx + d, railY, bz - R, "metal", "beam", 1);
    put(bx + d, railY, bz + R, "metal", "beam", 1);
    put(bx - R, railY, bz + d, "metal", "beam", 2);
    put(bx + R, railY, bz + d, "metal", "beam", 2);
  }

  // ---- pitched roof: deck, then a raised ridge with sloped edges ----
  for (let dz = -R + 1; dz <= R - 1; dz++)
    for (let dx = -R + 1; dx <= R - 1; dx++)
      put(bx + dx, railY, bz + dz, "metal", "panel", 0);

  for (let dx = -R + 1; dx <= R - 1; dx++)
    for (let dz = -2; dz <= 2; dz++)
      if (Math.abs(dz) === 2) put(bx + dx, railY + 1, bz + dz, "metal", "wedge", dz < 0 ? 0 : 2);
      else put(bx + dx, railY + 1, bz + dz, "metal", "panel", 0);

  // ---- eaves: overhanging wedges sloping away from the building ----
  for (let d = -R; d <= R; d++) {
    put(bx + d, railY, bz - (R + 1), "metal", "wedge", 0);
    put(bx + d, railY, bz + (R + 1), "metal", "wedge", 2);
    put(bx - (R + 1), railY, bz + d, "metal", "wedge", 1);
    put(bx + (R + 1), railY, bz + d, "metal", "wedge", 3);
  }

  // ---- corridor from the +X wall out to the dome ----
  const domeX = bx + 16;
  for (let x = bx + R; x <= domeX - DOME_R; x++) {
    for (let dz = -1; dz <= 1; dz++) put(x, g, bz + dz, "metal", "cube", 0);
    for (let h = 1; h <= 2; h++) {
      put(x, g + h, bz - 1, "glass", "panel", 2);
      put(x, g + h, bz + 1, "glass", "panel", 2);
    }
    put(x, g + 3, bz, "metal", "panel", 0);
    if ((x - bx) % 2 === 0) {
      put(x, g + 3, bz - 1, "metal", "beam", 2);
      put(x, g + 3, bz + 1, "metal", "beam", 2);
    }
  }

  // ---- glazed dome, doorway facing the corridor ----
  for (let dy = 0; dy <= DOME_R; dy++) {
    for (let dz = -DOME_R; dz <= DOME_R; dz++) {
      for (let dx = -DOME_R; dx <= DOME_R; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (Math.abs(dist - DOME_R) > 0.5) continue;
        if (dx < 0 && Math.abs(dz) <= 1 && dy <= 2) continue; // walk-through doorway

        const x = domeX + dx, y = g + dy, z = bz + dz;
        if (dy === 0) {
          put(x, y, z, "metal", "cube", 0); // footing ring, flush with the pad
          continue;
        }
        const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        put(x, y, z, "glass", "panel", ay >= ax && ay >= az ? 0 : ax >= az ? 1 : 2);
      }
    }
  }

  // ---- beacons marking the landing pad ----
  for (const [mx, mz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const px = site.x + mx * (site.radius - 2);
    const pz = site.z + mz * (site.radius - 2);
    for (let h = 1; h <= 3; h++) put(px, g + h, pz, "metal", "beam", 0);
    put(px, g + 4, pz, "glass", "panel", 0);
  }
}
