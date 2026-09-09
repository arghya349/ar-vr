"use client";

import { useEffect } from "react";
import type { BlockId } from "@/lib/game/blocks";
import { SHAPE_ROTATIONS, type ShapeId } from "@/lib/game/shapes";

export interface Part {
  label: string;
  block: BlockId;
  shape: ShapeId;
  /** Stamps a whole prefab instead of a single voxel. */
  prefab?: "dome";
  /** Look-only mode: no ghost, and clicks neither place nor break. */
  explore?: boolean;
}

export const EXPLORE_PART: Part = {
  label: "Explore",
  block: "metal",
  shape: "cube",
  explore: true,
};

export const HOTBAR_PARTS: Part[] = [
  { label: "Regolith", block: "regolith_compact", shape: "cube" },
  { label: "Stone", block: "stone", shape: "cube" },
  { label: "Beam", block: "metal", shape: "beam" },
  { label: "Panel", block: "metal", shape: "panel" },
  { label: "Plate", block: "metal", shape: "cube" },
  { label: "Roof", block: "metal", shape: "wedge" },
  { label: "Glass", block: "glass", shape: "panel" },
  { label: "Dome", block: "glass", shape: "panel", prefab: "dome" },
];

export function rotationsFor(part: Part) {
  return SHAPE_ROTATIONS[part.shape];
}

export default function Hotbar({
  selected,
  rotation,
  onSelect,
  onRotate,
}: {
  selected: number;
  rotation: number;
  onSelect: (i: number) => void;
  onRotate: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= HOTBAR_PARTS.length) onSelect(n - 1);
      if (e.code === "Digit0" || e.code === "KeyQ") onSelect(-1);
      if (e.code === "KeyR") onRotate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect, onRotate]);

  const exploring = selected < 0;
  const part = exploring ? EXPLORE_PART : HOTBAR_PARTS[selected];

  return (
    <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2">
      <div className="flex items-stretch gap-1.5">
        <button
          onClick={() => onSelect(-1)}
          className={`pointer-events-auto flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded border font-mono text-[8px] leading-none ${
            exploring
              ? "border-emerald-300 bg-emerald-300/25 text-emerald-100"
              : "border-white/20 bg-black/50 text-white/50 hover:bg-white/10"
          }`}
        >
          <span className="text-[9px]">Q</span>
          <span className="uppercase tracking-wide">Explore</span>
        </button>

        <div className="mx-1 w-px self-stretch bg-white/15" />

        {HOTBAR_PARTS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => onSelect(i)}
            className={`pointer-events-auto flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded border font-mono text-[8px] leading-none ${
              i === selected
                ? "border-white bg-white/25 text-white"
                : "border-white/20 bg-black/50 text-white/50 hover:bg-white/10"
            }`}
          >
            <span className="text-[9px]">{i + 1}</span>
            <span className="uppercase tracking-wide">{p.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 text-center font-mono text-[9px] text-white/40">
        {exploring
          ? "explore mode · clicks will not change the world"
          : part.prefab
            ? "click to stamp a dome"
            : rotationsFor(part) > 1
              ? `R to rotate · ${rotation + 1}/${rotationsFor(part)}`
              : " "}
      </div>
    </div>
  );
}
