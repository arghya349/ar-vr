import type { BlockId } from "./blocks";
import type { ShapeId } from "./shapes";
import { getBlock, setBlock, type World } from "./worldgen";
import { buildDemoBase } from "./demo-base";
import { buildDemoRocket } from "./demo-rocket";

/**
 * The colony laid out across the levelled landing site. Modules are joined by
 * pressurised corridors; every interior, deck and tower level is reachable on
 * foot without jumping (see the walk/BFS checks that accompany this build).
 *
 * Convention throughout: floors replace the top pad block rather than sitting
 * on it, so every threshold is flush. Corridors are cut through whatever they
 * meet, which is what forms the doorways into each module.
 */

type Ctx = {
  w: World;
  g: number; // top solid pad block
  cx: number;
  cz: number;
  put: (x: number, y: number, z: number, b: BlockId, s: ShapeId, rot?: number) => void;
  clear: (x: number, y: number, z: number) => void;
  /** Every cell any corridor walks through — never wall these off. */
  walkway: Set<string>;
};

const wallRot = (dx: number, dz: number) => (Math.abs(dx) >= Math.abs(dz) ? 1 : 2);

/** Rectangular pressurised module: flush floor, framed walls, window band, eaved roof. */
function habitat(c: Ctx, ox: number, oz: number, rx: number, rz: number, wallH: number) {
  const { g, put } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;

  for (let dz = -rz; dz <= rz; dz++)
    for (let dx = -rx; dx <= rx; dx++) put(x0 + dx, g, z0 + dz, "metal", "cube", 0);

  for (const [sx, sz] of [[-rx, -rz], [rx, -rz], [-rx, rz], [rx, rz]])
    for (let h = 1; h <= wallH; h++) put(x0 + sx, g + h, z0 + sz, "metal", "beam", 0);

  for (let h = 1; h <= wallH; h++) {
    const win = h === 3;
    const b: BlockId = win ? "glass" : "hull";
    const s: ShapeId = win ? "panel" : "cube";
    for (let dx = -rx + 1; dx <= rx - 1; dx++) {
      put(x0 + dx, g + h, z0 - rz, b, s, win ? 2 : 0);
      put(x0 + dx, g + h, z0 + rz, b, s, win ? 2 : 0);
    }
    for (let dz = -rz + 1; dz <= rz - 1; dz++) {
      put(x0 - rx, g + h, z0 + dz, b, s, win ? 1 : 0);
      put(x0 + rx, g + h, z0 + dz, b, s, win ? 1 : 0);
    }
  }

  const roofY = g + wallH + 1;
  for (let dz = -rz; dz <= rz; dz++)
    for (let dx = -rx; dx <= rx; dx++) put(x0 + dx, roofY, z0 + dz, "metal", "panel", 0);
  for (let dx = -rx; dx <= rx; dx++) {
    put(x0 + dx, roofY, z0 - (rz + 1), "metal", "wedge", 0);
    put(x0 + dx, roofY, z0 + (rz + 1), "metal", "wedge", 2);
  }
  for (let dz = -rz; dz <= rz; dz++) {
    put(x0 - (rx + 1), roofY, z0 + dz, "metal", "wedge", 1);
    put(x0 + (rx + 1), roofY, z0 + dz, "metal", "wedge", 3);
  }
}

/** Glazed dome on a metal footing ring, hollow inside. */
function dome(c: Ctx, ox: number, oz: number, r: number) {
  const { g, put } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;
  for (let dy = 0; dy <= r; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (Math.abs(d - r) > 0.5) continue;
        if (dy === 0) { put(x0 + dx, g, z0 + dz, "metal", "cube", 0); continue; }
        const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        put(x0 + dx, g + dy, z0 + dz, "glass", "panel", ay >= ax && ay >= az ? 0 : ax >= az ? 1 : 2);
      }
  // planting beds inside, so it reads as a greenhouse
  for (let dz = -r + 2; dz <= r - 2; dz += 3)
    for (let dx = -r + 2; dx <= r - 2; dx++) {
      if (Math.hypot(dx, dz) > r - 2) continue;
      put(x0 + dx, g, z0 + dz, "regolith", "cube", 0);
    }
}

/**
 * L-shaped pressurised corridor. It clears head height along its centreline
 * first, which is what punches the doorways through any module wall it meets.
 */
function corridor(c: Ctx, ax: number, az: number, bx: number, bz: number) {
  const { w, g, put, clear } = c;
  const x1 = c.cx + ax, z1 = c.cz + az, x2 = c.cx + bx, z2 = c.cz + bz;
  const cells: [number, number, boolean][] = []; // x, z, runsAlongX

  const stepX = Math.sign(x2 - x1);
  for (let x = x1; x !== x2 + stepX && stepX !== 0; x += stepX) cells.push([x, z1, true]);
  const stepZ = Math.sign(z2 - z1);
  for (let z = z1; z !== z2 + stepZ && stepZ !== 0; z += stepZ) cells.push([x2, z, false]);

  for (const [x, z] of cells) c.walkway.add(`${x},${z}`);

  for (const [x, z, alongX] of cells) {
    put(x, g, z, "metal", "cube", 0);
    clear(x, g + 1, z);
    clear(x, g + 2, z);

    const sides: [number, number][] = alongX ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [sx, sz] of sides) {
      // Never wall a cell another corridor walks through — that is what sealed
      // the corners of L-shaped runs and cut the network into islands.
      if (c.walkway.has(`${x + sx},${z + sz}`)) continue;
      for (let h = 1; h <= 2; h++) {
        if (getBlock(w, x + sx, g + h, z + sz) === "air")
          put(x + sx, g + h, z + sz, "glass", "panel", wallRot(sx, sz));
      }
      if (getBlock(w, x + sx, g, z + sz) === "air") put(x + sx, g, z + sz, "metal", "cube", 0);
    }
    if (getBlock(w, x, g + 3, z) === "air") put(x, g + 3, z, "metal", "panel", 0);
  }
}

/** Observation tower: square shaft with switchback stairs and a glazed top deck. */
function tower(c: Ctx, ox: number, oz: number, levels: number) {
  const { g, put, clear } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;
  const R = 3;
  const GAP = 5;

  const flight = (level: number) => {
    const out: { dx: number; dz: number }[] = [];
    for (let k = 0; k < GAP; k++) {
      const t = k - 2;
      if (level % 3 === 0) out.push({ dx: t, dz: 2 });
      else if (level % 3 === 1) out.push({ dx: -2, dz: t });
      else out.push({ dx: -t, dz: -2 });
    }
    return out;
  };

  for (let l = 0; l < levels; l++) {
    const y = g + l * GAP;
    const open = l > 0 ? new Set(flight(l - 1).map((f) => `${f.dx},${f.dz}`)) : new Set<string>();
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        if (open.has(`${dx},${dz}`)) continue;
        put(x0 + dx, y, z0 + dz, "metal", "cube", 0);
      }
    if (l < levels - 1)
      flight(l).forEach(({ dx, dz }, k) => put(x0 + dx, y + 1 + k, z0 + dz, "metal", "cube", 0));
  }

  const topY = g + (levels - 1) * GAP;
  for (let y = g + 1; y < topY; y++) {
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
        const corner = Math.abs(dx) === R && Math.abs(dz) === R;
        if (corner) put(x0 + dx, y, z0 + dz, "metal", "beam", 0);
        else if (y % 5 === 2) put(x0 + dx, y, z0 + dz, "glass", "panel", wallRot(dx, dz));
        else put(x0 + dx, y, z0 + dz, "hull", "cube", 0);
      }
    clear(x0, y, z0);
  }
  // glazed observation deck + mast
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
      for (let h = 1; h <= 2; h++)
        put(x0 + dx, topY + h, z0 + dz, "glass", "panel", wallRot(dx, dz));
    }
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) put(x0 + dx, topY + 3, z0 + dz, "metal", "panel", 0);
  for (let h = 1; h <= 4; h++) put(x0, topY + 3 + h, z0, "metal", "beam", 0);
  put(x0, topY + 8, z0, "accent", "cube", 0);
}

/** Rows of tilted photovoltaic panels on beam trestles. */
function solarFarm(c: Ctx, ox: number, oz: number, rows: number, len: number) {
  const { g, put } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;
  for (let r = 0; r < rows; r++) {
    const z = z0 + r * 3;
    for (let i = 0; i < len; i++) {
      const x = x0 + i;
      put(x, g + 1, z, "metal", "beam", 0);
      put(x, g + 2, z, "solar", "wedge", 0);
      put(x, g + 2, z + 1, "solar", "panel", 0);
    }
  }
}

/** Cylindrical pressure vessels on support cradles. */
function tankFarm(c: Ctx, ox: number, oz: number, count: number) {
  const { g, put } = c;
  for (let t = 0; t < count; t++) {
    const x0 = c.cx + ox + t * 8;
    const z0 = c.cz + oz;
    const r = 3, h = 9;
    for (let y = 1; y <= h; y++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dz);
          const cap = y === h || y === 1;
          if (cap ? d > r - 0.4 : Math.abs(d - r) > 0.5) continue;
          const band = y % 4 === 0;
          put(x0 + dx, g + y, z0 + dz, band ? "foil" : "hull", "cube", 0);
        }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      put(x0 + sx * 2, g + 1, z0 + sz * 2, "metal", "beam", 0);
  }
}

/** Dish antennas on masts. */
function commsArray(c: Ctx, ox: number, oz: number) {
  const { g, put } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;
  for (const [mx, mz, mh] of [[0, 0, 14], [7, 4, 10], [-6, 5, 11]]) {
    for (let h = 1; h <= mh; h++) put(x0 + mx, g + h, z0 + mz, "metal", "beam", 0);
    // upward-facing dish
    const r = 4;
    for (let dy = 0; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.sqrt(dx * dx + (dy - r) * (dy - r) + dz * dz);
          if (Math.abs(d - r) > 0.5 || dy > r - 1) continue;
          put(x0 + mx + dx, g + mh + dy, z0 + mz + dz, "hull", "panel", 0);
        }
    put(x0 + mx, g + mh + r, z0 + mz, "accent", "cube", 0);
  }
}

/** Stacked cargo containers in an open yard. */
function cargoYard(c: Ctx, ox: number, oz: number) {
  const { g, put } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;
  const stacks: [number, number, number, BlockId][] = [
    [0, 0, 2, "accent"], [5, 0, 1, "hull"], [10, 1, 2, "hull"],
    [0, 6, 1, "hull"], [5, 6, 3, "accent"], [10, 7, 1, "accent"],
  ];
  for (const [sx, sz, high, colour] of stacks)
    for (let l = 0; l < high; l++)
      for (let y = 1; y <= 2; y++)
        for (let dz = 0; dz < 3; dz++)
          for (let dx = 0; dx < 4; dx++) {
            const shell = dx === 0 || dx === 3 || dz === 0 || dz === 2 || y === 2;
            if (!shell) continue;
            put(x0 + sx + dx, g + l * 2 + y, z0 + sz + dz, colour, "cube", 0);
          }
}

/** Open-fronted vehicle shelter. */
function garage(c: Ctx, ox: number, oz: number) {
  const { g, put } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;
  const rx = 5, rz = 4, h = 4;
  for (let dz = -rz; dz <= rz; dz++)
    for (let dx = -rx; dx <= rx; dx++) put(x0 + dx, g, z0 + dz, "metal", "cube", 0);
  for (let y = 1; y <= h; y++) {
    for (let dx = -rx; dx <= rx; dx++) put(x0 + dx, g + y, z0 - rz, "hull", "cube", 0);
    for (let dz = -rz; dz <= rz - 1; dz++) {
      put(x0 - rx, g + y, z0 + dz, "hull", "cube", 0);
      put(x0 + rx, g + y, z0 + dz, "hull", "cube", 0);
    }
  }
  for (let dz = -rz; dz <= rz; dz++)
    for (let dx = -rx; dx <= rx; dx++) put(x0 + dx, g + h + 1, z0 + dz, "metal", "panel", 0);
  for (let dx = -rx; dx <= rx; dx++) put(x0 + dx, g + h + 1, z0 + rz + 1, "metal", "wedge", 2);
}

/** Shielded reactor block with radiator fins. */
function reactor(c: Ctx, ox: number, oz: number) {
  const { g, put } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;
  const r = 4, h = 8;
  for (let y = 1; y <= h; y++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dz);
        if (y === h ? d > r - 0.4 : Math.abs(d - r) > 0.5) continue;
        put(x0 + dx, g + y, z0 + dz, y % 3 === 0 ? "foil" : "engine", "cube", 0);
      }
  for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    for (let i = 1; i <= 5; i++)
      for (let y = 2; y <= h - 2; y++)
        put(x0 + ux * (r + i), g + y, z0 + uz * (r + i), "metal", "panel", ux !== 0 ? 1 : 2);
}

/** Regolith shielding berm banked against a module wall. */
function berm(c: Ctx, ox: number, oz: number, rx: number, rz: number) {
  const { g, put } = c;
  const x0 = c.cx + ox, z0 = c.cz + oz;
  for (let dx = -rx - 2; dx <= rx + 2; dx++) {
    put(x0 + dx, g + 1, z0 - rz - 2, "regolith", "cube", 0);
    put(x0 + dx, g + 1, z0 + rz + 2, "regolith", "cube", 0);
    put(x0 + dx, g + 2, z0 - rz - 2, "regolith", "wedge", 0);
    put(x0 + dx, g + 2, z0 + rz + 2, "regolith", "wedge", 2);
  }
}

export function buildColony(w: World) {
  const site = w.landingSite;
  const c: Ctx = {
    w,
    g: site.y,
    cx: site.x,
    cz: site.z,
    put: (x, y, z, b, s, rot = 0) => setBlock(w, x, y, z, { block: b, shape: s, rot }),
    clear: (x, y, z) => setBlock(w, x, y, z, "air"),
    walkway: new Set<string>(),
  };

  buildDemoBase(w); // Hab Alpha + its dome, in front of the spawn
  buildDemoRocket(w);

  // Four arms off the central plaza, so every corridor is a straight run that
  // ends exactly on the wall it needs to open.
  tower(c, 0, 10, 4);
  dome(c, 0, 32, 9); // main greenhouse, due south of the tower
  garage(c, -14, 12);

  habitat(c, -26, 0, 5, 5, 4); // Hab Beta
  berm(c, -26, 0, 5, 5);
  cargoYard(c, -40, -20);
  solarFarm(c, -40, 14, 5, 14);

  tankFarm(c, 16, 0, 2);
  habitat(c, 34, 0, 4, 4, 4); // Hab Gamma
  dome(c, 34, 30, 6); // seedling dome
  reactor(c, 34, -24);
  commsArray(c, 0, -34);

  // pressurised links — each clears head height, which cuts the doorways
  corridor(c, 0, 2, 0, 7);        // plaza -> tower south wall
  corridor(c, 0, 13, 0, 23);      // tower north wall -> greenhouse
  corridor(c, 0, -2, 0, -9);      // plaza -> Hab Alpha
  corridor(c, 0, -17, 0, -30);    // Hab Alpha -> comms mast field
  corridor(c, -2, 0, -21, 0);     // plaza -> Hab Beta east wall
  corridor(c, -26, -5, -26, -16); // Hab Beta -> cargo yard
  corridor(c, -26, 5, -26, 16);   // Hab Beta -> solar farm
  corridor(c, -3, 10, -9, 10);    // tower west wall -> garage
  corridor(c, 2, 0, 13, 0);       // plaza -> tank farm
  corridor(c, 19, 0, 30, 0);      // tanks -> Hab Gamma west wall
  corridor(c, 34, 4, 34, 24);     // Hab Gamma -> seedling dome
  corridor(c, 34, -4, 34, -20);   // Hab Gamma south wall -> reactor
  corridor(c, -14, -16, -4, -13); // rocket gantry -> Hab Alpha

  // perimeter beacons
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const px = site.x + Math.round(Math.cos(a) * (site.radius - 3));
    const pz = site.z + Math.round(Math.sin(a) * (site.radius - 3));
    for (let h = 1; h <= 3; h++) c.put(px, c.g + h, pz, "metal", "beam", 0);
    c.put(px, c.g + 4, pz, i % 4 === 0 ? "accent" : "glass", "panel", 0);
  }
}
