"use client";

import { useEffect, useMemo, useRef } from "react";
import { BLOCKS, type BlockId } from "@/lib/game/blocks";
import { BUILD_HEIGHT, getBlock, type World } from "@/lib/game/worldgen";

const SIZE = 176; // on-screen pixels
const MARGIN = 10; // cells of pad margin to include

/** Colour of the topmost thing in a column, so modules read as their material. */
function columnColour(w: World, x: number, z: number): [number, number, number] {
  const i = z * w.W + x;
  const top = w.height[i];
  if (w.editedColumns.has(i)) {
    for (let y = top + BUILD_HEIGHT; y > top; y--) {
      const b = getBlock(w, x, y, z);
      if (b !== "air") return BLOCKS[b as BlockId].top ?? BLOCKS[b as BlockId].base;
    }
    const b = getBlock(w, x, top, z);
    if (b !== "air") return BLOCKS[b as BlockId].top ?? BLOCKS[b as BlockId].base;
  }
  const s = w.surface[i];
  return BLOCKS[s].top ?? BLOCKS[s].base;
}

export default function Minimap({
  world,
  x,
  z,
  yaw,
  version,
}: {
  world: World;
  x: number;
  z: number;
  yaw: number;
  version: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const site = world.landingSite;
  const span = (site.radius + MARGIN) * 2;
  const x0 = site.x - site.radius - MARGIN;
  const z0 = site.z - site.radius - MARGIN;

  // Rebuilt only when the world actually changes, not every frame.
  const base = useMemo(() => {
    if (typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = span;
    cv.height = span;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(span, span);
    for (let iz = 0; iz < span; iz++) {
      for (let ix = 0; ix < span; ix++) {
        const wx = x0 + ix, wz = z0 + iz;
        const p = (iz * span + ix) * 4;
        if (wx < 0 || wz < 0 || wx >= world.W || wz >= world.D) {
          img.data[p] = img.data[p + 1] = img.data[p + 2] = 0;
          img.data[p + 3] = 255;
          continue;
        }
        const [r, g, b] = columnColour(world, wx, wz);
        // shade by height so terrain relief is readable
        const rel = world.height[wz * world.W + wx] - site.y;
        const k = Math.max(0.45, Math.min(1.25, 1 + rel * 0.03));
        img.data[p] = Math.min(255, r * k);
        img.data[p + 1] = Math.min(255, g * k);
        img.data[p + 2] = Math.min(255, b * k);
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }, [world, version, span, x0, z0, site.y]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !base) return;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(base, 0, 0, SIZE, SIZE);

    const px = ((x - x0) / span) * SIZE;
    const pz = ((z - z0) / span) * SIZE;

    // heading cone
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-yaw);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-7, -16);
    ctx.lineTo(7, -16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, pz, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [base, x, z, yaw, span, x0, z0]);

  return (
    <div className="pointer-events-none absolute top-4 right-4 select-none">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="rounded border border-white/20 bg-black/60"
        style={{ width: SIZE, height: SIZE }}
      />
      <div className="mt-1 text-center font-mono text-[9px] text-white/40">
        landing site · {site.radius * 2} m across
      </div>
    </div>
  );
}
