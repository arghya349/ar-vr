import * as THREE from "three";

export type ShapeId = "cube" | "beam" | "panel" | "wedge";

/** Texture atlas is 3 tiles wide: side | top | bottom. */
const TILE_SIDE = 0;
const TILE_TOP = 1;
const TILE_BOTTOM = 2;

/** Remap a geometry's UVs into the atlas, picking the tile from each face's normal. */
function atlasify(geo: THREE.BufferGeometry) {
  const normal = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const ny = normal.getY(i);
    const tile = ny > 0.5 ? TILE_TOP : ny < -0.5 ? TILE_BOTTOM : TILE_SIDE;
    uv.setX(i, (tile + uv.getX(i)) / 3);
  }
  uv.needsUpdate = true;
  geo.clearGroups();
  return geo;
}

/** Triangular prism: slopes from the -Z bottom edge up to the +Z top edge. */
function wedgeGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];

  const quad = (
    a: number[], b: number[], c: number[], d: number[],
    n: [number, number, number]
  ) => {
    for (const [p, uv] of [
      [a, [0, 0]], [b, [1, 0]], [c, [1, 1]],
      [a, [0, 0]], [c, [1, 1]], [d, [0, 1]],
    ] as [number[], number[]][]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      uvs.push(uv[0], uv[1]);
    }
  };
  const tri = (a: number[], b: number[], c: number[], n: [number, number, number]) => {
    for (const [p, uv] of [[a, [0, 0]], [b, [1, 0]], [c, [1, 1]]] as [number[], number[]][]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      uvs.push(uv[0], uv[1]);
    }
  };

  const A = [-0.5, -0.5, -0.5], B = [0.5, -0.5, -0.5];
  const C = [0.5, -0.5, 0.5], D = [-0.5, -0.5, 0.5];
  const E = [-0.5, 0.5, 0.5], F = [0.5, 0.5, 0.5];
  const s = Math.SQRT1_2;

  quad(A, B, C, D, [0, -1, 0]);       // floor
  quad(D, C, F, E, [0, 0, 1]);        // tall back wall
  quad(A, E, F, B, [0, s, -s]);       // the slope itself
  tri(A, D, E, [-1, 0, 0]);           // left gable
  tri(B, F, C, [1, 0, 0]);            // right gable

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

export const SHAPE_GEOMETRY: Record<ShapeId, THREE.BufferGeometry> = {
  cube: atlasify(new THREE.BoxGeometry(1, 1, 1)),
  beam: atlasify(new THREE.BoxGeometry(0.26, 1, 0.26)),
  panel: atlasify(new THREE.BoxGeometry(1, 0.16, 1)),
  wedge: atlasify(wedgeGeometry()),
};

/** How many distinct orientations each shape has (R cycles through them). */
export const SHAPE_ROTATIONS: Record<ShapeId, number> = {
  cube: 1,
  beam: 3,
  panel: 3,
  wedge: 4,
};

const _euler = new THREE.Euler();

export function shapeQuaternion(
  shape: ShapeId,
  rot: number,
  out = new THREE.Quaternion()
): THREE.Quaternion {
  if (shape === "beam" || shape === "panel") {
    // 0 = upright/flat, 1 = laid along X, 2 = laid along Z
    if (rot === 1) return out.setFromEuler(_euler.set(0, 0, Math.PI / 2));
    if (rot === 2) return out.setFromEuler(_euler.set(Math.PI / 2, 0, 0));
    return out.identity();
  }
  if (shape === "wedge") {
    return out.setFromEuler(_euler.set(0, (rot % 4) * (Math.PI / 2), 0));
  }
  return out.identity();
}
