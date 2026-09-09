import type { BlockId } from "./blocks";
import type { ShapeId } from "./shapes";
import { setBlock, type World } from "./worldgen";

export const ROCKET_OFFSET = { x: -14, z: -24 };

const HULL_R = 4; // hull shell radius -> 7-wide interior
const DECK_GAP = 5; // vertical spacing between decks
export const DECKS = 4;
const BASE_H = 5; // hull floor sits this high, above the engines
const NOSE_H = 5;
const FIN_H = 9;
const FIN_OUT = 4;

const N = Math.SQRT1_2;
const DIAGONALS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * One straight flight of stairs per deck, each turned 90° from the last
 * (a switchback). Straight flights keep every tread orthogonally adjacent to
 * the next, which a 0.3m-radius walker can always negotiate — a tight spiral
 * cannot, because the walker's corners clip treads further up the helix.
 */
export function flightCells(deck: number): { dx: number; dz: number }[] {
  const out: { dx: number; dz: number }[] = [];
  for (let k = 0; k < DECK_GAP; k++) {
    const t = k - 2; // -2..2
    if (deck % 3 === 0) out.push({ dx: t, dz: 2 });
    else if (deck % 3 === 1) out.push({ dx: -2, dz: t });
    else out.push({ dx: -t, dz: -2 });
  }
  return out;
}

export function rocketOrigin(w: World) {
  const s = w.landingSite;
  return { rx: s.x + ROCKET_OFFSET.x, rz: s.z + ROCKET_OFFSET.z, g: s.y };
}

export function deckFloorY(g: number, i: number) {
  return g + BASE_H + i * DECK_GAP;
}

/**
 * The lander that brought the crew down. Hull on swept fins over a five-engine
 * cluster, four decks joined by switchback stairs, boarding gantry from the pad.
 * Every deck is reachable on foot.
 */
export function buildDemoRocket(w: World) {
  const { rx, rz, g } = rocketOrigin(w);

  const put = (x: number, y: number, z: number, block: BlockId, shape: ShapeId, rot = 0) =>
    setBlock(w, x, y, z, { block, shape, rot });

  const dist = (dx: number, dz: number) => Math.sqrt(dx * dx + dz * dz);
  const wallRot = (dx: number, dz: number) => (Math.abs(dx) >= Math.abs(dz) ? 1 : 2);

  const floor0 = deckFloorY(g, 0);
  const topDeck = deckFloorY(g, DECKS - 1);
  const hullTop = topDeck + DECK_GAP;
  const hatchZ = rz + HULL_R;

  // ---- blast scorch on the pad under the engines ----
  for (let dz = -13; dz <= 13; dz++)
    for (let dx = -13; dx <= 13; dx++) {
      const d = dist(dx, dz);
      if (d > 13) continue;
      const x = rx + dx, z = rz + dz;
      if (x < 0 || z < 0 || x >= w.W || z >= w.D) continue;
      const i = z * w.W + x;
      if (d < 7) w.surface[i] = "basalt";
      else if (d < 10) w.surface[i] = "shadow";
      else if ((dx + dz) % 3 === 0) w.surface[i] = "shadow";
    }

  // ---- switchback stairs, one flight per deck ----
  const stairAt = new Map<string, number>();
  for (let d = 0; d < DECKS - 1; d++) {
    const from = deckFloorY(g, d);
    flightCells(d).forEach(({ dx, dz }, k) => {
      const y = from + 1 + k;
      put(rx + dx, y, rz + dz, "metal", "cube", 0);
      stairAt.set(`${rx + dx},${rz + dz},${y}`, y);
    });
  }
  const flightFootprint = (deck: number) =>
    new Set(flightCells(deck).map(({ dx, dz }) => `${dx},${dz}`));

  // ---- decks, with a stairwell opening over each flight ----
  for (let d = 0; d < DECKS; d++) {
    const y = deckFloorY(g, d);
    const openTo = d > 0 ? flightFootprint(d - 1) : new Set<string>();
    for (let dz = -HULL_R; dz <= HULL_R; dz++) {
      for (let dx = -HULL_R; dx <= HULL_R; dx++) {
        if (dist(dx, dz) > HULL_R - 0.6) continue;
        if (openTo.has(`${dx},${dz}`)) continue; // stairwell
        put(rx + dx, y, rz + dz, "metal", "cube", 0);
      }
    }
  }

  // ---- hull: white plating, livery stripe, structural bands, windows, hatch ----
  for (let y = floor0; y <= hullTop; y++) {
    const isBand = [0, 1, 2, 3].some((d) => y === deckFloorY(g, d)) || y === hullTop;
    for (let dz = -HULL_R; dz <= HULL_R; dz++) {
      for (let dx = -HULL_R; dx <= HULL_R; dx++) {
        if (Math.abs(dist(dx, dz) - HULL_R) > 0.5) continue;
        const x = rx + dx, z = rz + dz;

        if (z === hatchZ && Math.abs(dx) <= 1 && y >= floor0 + 1 && y <= floor0 + 2) continue;

        const isWindow = [0, 1, 2, 3].some((d) => y === deckFloorY(g, d) + 2);
        if (isWindow && (dx + dz) % 2 === 0 && !(z === hatchZ && Math.abs(dx) <= 1)) {
          put(x, y, z, "glass", "panel", wallRot(dx, dz));
        } else if (isBand) {
          put(x, y, z, "metal", "cube", 0);
        } else if (dz === 0 && dx > 0) {
          put(x, y, z, "accent", "cube", 0); // livery stripe up one side
        } else {
          put(x, y, z, "hull", "cube", 0);
        }
      }
    }
  }

  // ---- nose cone in accent livery, with an antenna mast ----
  for (let i = 1; i <= NOSE_H; i++) {
    const r = HULL_R * (1 - i / (NOSE_H + 1));
    const y = hullTop + i;
    for (let dz = -HULL_R; dz <= HULL_R; dz++)
      for (let dx = -HULL_R; dx <= HULL_R; dx++) {
        const d = dist(dx, dz);
        if (d > r + 0.5) continue;
        if (i < NOSE_H && d < r - 0.6) continue;
        put(rx + dx, y, rz + dz, i % 2 === 0 ? "hull" : "accent", "cube", 0);
      }
  }
  for (let i = 1; i <= 3; i++) put(rx, hullTop + NOSE_H + i, rz, "metal", "beam", 0);
  put(rx, hullTop + NOSE_H + 4, rz, "glass", "panel", 0);

  // ---- five-engine cluster under the hull ----
  const nozzles: [number, number][] = [[0, 0], [2, 2], [2, -2], [-2, 2], [-2, -2]];
  for (const [ox, oz] of nozzles) {
    for (let i = 0; i < BASE_H - 1; i++) {
      const y = g + 1 + i;
      const r = (ox === 0 && oz === 0 ? 2.0 : 1.6) - i * 0.35; // bells flare downward
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dist(dx, dz) - r) > 0.6) continue;
          put(rx + ox + dx, y, rz + oz + dz, "engine", "cube", 0);
        }
    }
  }
  // thrust structure tying the cluster to the hull
  for (let dz = -3; dz <= 3; dz++)
    for (let dx = -3; dx <= 3; dx++)
      if (dist(dx, dz) <= 3.4) put(rx + dx, floor0 - 1, rz + dz, "foil", "cube", 0);

  // ---- four swept fins, doubling as landing legs ----
  for (const [ux, uz] of DIAGONALS) {
    for (let h = 0; h < FIN_H; h++) {
      const out = Math.round((1 - h / FIN_H) * FIN_OUT);
      const y = g + 1 + h;
      for (let o = 0; o <= out; o++) {
        const r = HULL_R + o;
        const x = rx + Math.round(ux * N * r);
        const z = rz + Math.round(uz * N * r);
        const edge = o === out;
        if (edge && h > 0) put(x, y, z, "accent", "wedge", ux > 0 ? (uz > 0 ? 3 : 0) : uz > 0 ? 2 : 1);
        else put(x, y, z, h < 2 ? "engine" : h < 4 ? "foil" : "hull", "cube", 0);
      }
    }
    // foot pad at the base of each fin
    const fr = HULL_R + FIN_OUT;
    const fx = rx + Math.round(ux * N * fr);
    const fz = rz + Math.round(uz * N * fr);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) put(fx + dx, g + 1, fz + dz, "metal", "cube", 0);
  }

  // ---- RCS thruster pods high on the hull ----
  for (const [ux, uz] of DIAGONALS) {
    const r = HULL_R + 1;
    const x = rx + Math.round(ux * N * r);
    const z = rz + Math.round(uz * N * r);
    const y = topDeck + 3;
    put(x, y, z, "engine", "cube", 0);
    put(x, y + 1, z, "metal", "beam", 1);
  }

  // ---- boarding gantry: one block of rise per step, down to the pad ----
  for (let i = 1; i <= BASE_H - 1; i++) {
    const z = hatchZ + i;
    const y = floor0 - i;
    for (let dx = -1; dx <= 1; dx++) put(rx + dx, y, z, "metal", "cube", 0);
    put(rx - 2, y + 1, z, "metal", "beam", 0);
    put(rx + 2, y + 1, z, "metal", "beam", 0);
  }
}
