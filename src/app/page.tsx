"use client";

import { useEffect, useState } from "react";
import Game from "@/components/game/game";
import type { Tile, PathPoint, Site } from "@/lib/types";

export default function Home() {
  const [data, setData] = useState<{
    tiles: Tile[];
    path: PathPoint[];
    sites: Site[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/mock/tiles.json").then((r) => r.json()),
      fetch("/mock/path.json").then((r) => r.json()),
      fetch("/mock/sites.json").then((r) => r.json()),
    ]).then(([tiles, path, sites]) => setData({ tiles, path, sites }));
  }, []);

  if (!data) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black font-mono text-sm text-white/50">
        Loading terrain…
      </div>
    );
  }

  return <Game tiles={data.tiles} path={data.path} sites={data.sites} />;
}
