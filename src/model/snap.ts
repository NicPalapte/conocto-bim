import type { Vec3 } from './bounds';
import {
  SIDE_ANGLE,
  corner,
  cross,
  dot,
  sub,
  triangleNormal,
  vertexKey,
  type Triangles,
} from './measure';

/** Fangpunkte eines Bauteils: Eckpunkte und Kanten zwischen zwei Bauteilseiten. */
export interface SnapGeometry {
  vertices: Vec3[];
  edges: [Vec3, Vec3][];
}

/**
 * Eckpunkte und Kanten zum Einrasten. Kanten innerhalb einer Bauteilseite (Knick unter
 * `SIDE_ANGLE`, z. B. Facetten eines Pfahlmantels) zählen nicht, sonst rastet jede
 * Dreieckskante ein.
 */
export function snapGeometry(t: Triangles, maxAngle = SIDE_ANGLE): SnapGeometry {
  const minCos = Math.cos((maxAngle * Math.PI) / 180);
  const count = Math.floor(t.length / 9);
  const vertices = new Map<string, Vec3>();
  const edges = new Map<string, { a: Vec3; b: Vec3; normals: Vec3[] }>();
  for (let i = 0; i < count; i++) {
    const { n, area } = triangleNormal(t, i);
    if (!area) continue;
    for (let c = 0; c < 3; c++) {
      const a = corner(t, i, c);
      const b = corner(t, i, (c + 1) % 3);
      const ka = vertexKey(a);
      const kb = vertexKey(b);
      vertices.set(ka, a);
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const edge = edges.get(key) ?? { a, b, normals: [] };
      edge.normals.push(n);
      edges.set(key, edge);
    }
  }
  const feature: [Vec3, Vec3][] = [];
  for (const { a, b, normals } of edges.values()) {
    const sharp =
      normals.length === 1 || normals.some((n) => normals.some((m) => dot(n, m) < minCos));
    if (sharp) feature.push([a, b]);
  }
  return { vertices: [...vertices.values()], edges: feature };
}

/**
 * Parameter t des Punkts auf der Geraden `origin + t·dir`, der dem Sichtstrahl am nächsten
 * liegt. Parallele Geraden: 0.
 */
export function closestOnLineToRay(origin: Vec3, dir: Vec3, rayOrigin: Vec3, rayDir: Vec3): number {
  const w = sub(origin, rayOrigin);
  const a = dot(dir, dir);
  const b = dot(dir, rayDir);
  const c = dot(rayDir, rayDir);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-12 * a * c) return 0;
  return (b * dot(rayDir, w) - c * dot(dir, w)) / denom;
}

export function along(origin: Vec3, dir: Vec3, t: number): Vec3 {
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

/** Rechtwinklige Einheitsachsen aus drei Spalten einer Drehung (z. B. Bauteil-Lage). */
export function orthonormal(x: Vec3, z: Vec3): [Vec3, Vec3, Vec3] {
  const unit = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const zu = unit(z);
  const yu = unit(cross(zu, x));
  return [cross(yu, zu), yu, zu];
}
