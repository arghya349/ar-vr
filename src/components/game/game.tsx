"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";
import * as THREE from "three";
import type { Tile, PathPoint, Site } from "@/lib/types";
import {
  generateWorld,
  surfaceHeightAt,
  tileAt,
} from "@/lib/game/worldgen";
import { buildColony } from "@/lib/game/demo-colony";
import WorldMesh from "./world-mesh";
import Player, { type PlayerState } from "./player";
import { SiteBeacon } from "./props";
import Sky from "./sky";
import Hud, { type HudData } from "./hud";
import Hotbar, { HOTBAR_PARTS, EXPLORE_PART, rotationsFor } from "./hotbar";
import BuildTool from "./build-tool";
import Minimap from "./minimap";
import LunarEnvironment from "./environment";
import Sun from "./sun";
import { VrRig, type MoveInput } from "./vr";

const xrStore = createXRStore({
  // Quest profile: fixed foveation and a slightly reduced framebuffer buy back
  // the fill rate that stereo rendering costs.
  foveation: 0.6,
  frameRate: "high",
  frameBufferScaling: 0.9,
});

/**
 * Tracks whether a headset session is live and drops the expensive desktop-only
 * effects while it is. Shadow maps in particular are far too costly on Quest,
 * where every frame is rendered twice at 72-90Hz.
 */
function XRSessionBridge({ flag }: { flag: React.RefObject<boolean> }) {
  const session = useXR((s) => s.session);
  const { gl } = useThree();
  useEffect(() => {
    const active = !!session;
    flag.current = active;
    gl.shadowMap.enabled = !active;
    gl.shadowMap.needsUpdate = true;
  }, [session, flag, gl]);
  return null;
}

function FpsMeter({ onFps }: { onFps: (n: number) => void }) {
  const frames = useRef(0);
  const acc = useRef(0);
  useFrame((_, dt) => {
    frames.current++;
    acc.current += dt;
    if (acc.current >= 0.5) {
      onFps(Math.round(frames.current / acc.current));
      frames.current = 0;
      acc.current = 0;
    }
  });
  return null;
}

export default function Game({
  tiles,
  path,
  sites,
}: {
  tiles: Tile[];
  path: PathPoint[];
  sites: Site[];
}) {
  const world = useMemo(() => {
    const w = generateWorld(tiles);
    buildColony(w);
    return w;
  }, [tiles]);

  const spawn = useMemo(() => {
    const { x, z } = world.landingSite;
    return new THREE.Vector3(x + 0.5, surfaceHeightAt(world, x, z), z + 0.5);
  }, [world]);

  const [fps, setFps] = useState(0);
  const [hotbarIndex, setHotbarIndex] = useState(-1); // start in explore mode
  const [rotation, setRotation] = useState(0);
  const [worldVersion, setWorldVersion] = useState(0);

  // WebXR needs a secure origin (https, or localhost). On Vercel that is given;
  // over plain http on a LAN address navigator.xr is simply absent.
  const [vrSupport, setVrSupport] = useState<"checking" | "ready" | "unsupported">("checking");
  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
    if (!xr) {
      setVrSupport("unsupported");
      return;
    }
    let alive = true;
    xr.isSessionSupported("immersive-vr")
      .then((ok) => alive && setVrSupport(ok ? "ready" : "unsupported"))
      .catch(() => alive && setVrSupport("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  const inXR = useRef(false);
  const moveInput = useRef<MoveInput>({ x: 0, z: 0, sprint: false, yaw: 0 });
  // Start feet at the spawn (base) so VR users begin on the ground at the landing site.
  const feet = useRef(spawn.clone());

  const selectPart = useCallback((i: number) => {
    setHotbarIndex(i);
    setRotation(0);
  }, []);
  const activePart = hotbarIndex < 0 ? EXPLORE_PART : HOTBAR_PARTS[hotbarIndex];
  const rotatePart = useCallback(() => {
    if (hotbarIndex < 0) return;
    setRotation((r) => (r + 1) % rotationsFor(HOTBAR_PARTS[hotbarIndex]));
  }, [hotbarIndex]);
  const [player, setPlayer] = useState<PlayerState>({
    pos: spawn.clone(),
    yaw: 0,
    grounded: true,
    sprinting: false,
  });

  const handleState = useCallback((s: PlayerState) => setPlayer(s), []);

  const hud: HudData = useMemo(() => {
    const t = tileAt(world, player.pos.x, player.pos.z);
    const { bounds } = world;
    const mapped =
      player.pos.x >= bounds.x0 &&
      player.pos.x <= bounds.x1 &&
      player.pos.z >= bounds.z0 &&
      player.pos.z <= bounds.z1;
    return {
      x: player.pos.x,
      y: player.pos.y,
      z: player.pos.z,
      tile: t,
      mapped,
      fps,
      thirdPerson: true,
    };
  }, [world, player, fps]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <button
        onClick={() => vrSupport === "ready" && xrStore.enterVR()}
        disabled={vrSupport !== "ready"}
        title={
          vrSupport === "ready"
            ? "Start the headset session"
            : "No WebXR headset detected on this device"
        }
        className={`absolute bottom-4 right-4 z-10 rounded-lg px-5 py-3 font-mono text-sm ${
          vrSupport === "ready"
            ? "bg-emerald-400/90 text-black hover:bg-emerald-300"
            : "cursor-not-allowed bg-white/10 text-white/35"
        }`}
      >
        {vrSupport === "ready" ? "Enter VR" : vrSupport === "checking" ? "…" : "VR unavailable"}
      </button>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 60, near: 0.1, far: 900 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
        shadows={{ type: THREE.PCFShadowMap }}
      >
        <XR store={xrStore}>
        <XRSessionBridge flag={inXR} />
        <VrRig feet={feet} input={moveInput} />
        <Sky />
        <Stars radius={420} depth={60} count={1200} factor={2.2} fade speed={0} />

        <LunarEnvironment />
        {/* Airless: one hard sun, and regolith bounce filling the shadow side. */}
        <ambientLight intensity={0.02} />
        <hemisphereLight args={["#05060a", "#8d887f", 0.32]} />
        <Sun follow={player.pos} />

        <WorldMesh world={world} version={worldVersion} inXR={inXR} />

        <BuildTool
          world={world}
          part={activePart}
          rotation={rotation}
          onEdit={() => setWorldVersion((v) => v + 1)}
          moveInput={moveInput}
        />

        {sites.map((s) => (
          <SiteBeacon key={s.id} world={world} site={s} />
        ))}

        <Player
          world={world}
          spawn={spawn}
          onState={handleState}
          inXR={inXR}
          moveInput={moveInput}
          feetOut={feet}
        />
        <FpsMeter onFps={setFps} />
        </XR>
      </Canvas>

      <Hud data={hud} />
      <Minimap
        world={world}
        x={player.pos.x}
        z={player.pos.z}
        yaw={player.yaw}
        version={worldVersion}
      />
      <Hotbar
        selected={hotbarIndex}
        rotation={rotation}
        onSelect={selectPart}
        onRotate={rotatePart}
      />

      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2">
        <a
          href="/"
          className="pointer-events-auto font-mono text-[10px] text-white/30 hover:text-white/60"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
