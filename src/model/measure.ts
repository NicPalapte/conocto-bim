import type { Vec3 } from './bounds';

// Treffer-Toleranz zur Dreiecksebene: 2 mm. Ecken werden auf 0,1 mm gerundet verbunden.
const PLANE_TOLERANCE = 0.002;
const VERTEX_GRID = 1e4;
/**
 * Knick in Grad, ab dem eine neue Bauteilseite beginnt. web-ifc teilt Kreise in 12 bis
 * 16 Facetten (22,5–30°); rechte Winkel und Fasen von 45° trennen noch.
 */
export const SIDE_ANGLE = 40;

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** Strecke zwischen zwei IFC-Punkten (z = Höhe): räumlich, waagerecht, Höhenunterschied. */
export function segment(a: Vec3, b: Vec3): { length: number; horizontal: number; rise: number } {
  const d = sub(b, a);
  return { length: length(d), horizontal: Math.hypot(d[0], d[1]), rise: d[2] };
}

/** Dreiecke als flache Liste, je Dreieck 9 Zahlen (drei Ecken x, y, z). */
export type Triangles = ArrayLike<number>;

export function corner(t: Triangles, i: number, c: number): Vec3 {
  const o = i * 9 + c * 3;
  return [t[o], t[o + 1], t[o + 2]];
}

export function triangleNormal(t: Triangles, i: number): { n: Vec3; area: number } {
  const a = corner(t, i, 0);
  const c = cross(sub(corner(t, i, 1), a), sub(corner(t, i, 2), a));
  const len = length(c);
  return { n: len ? [c[0] / len, c[1] / len, c[2] / len] : [0, 0, 0], area: len / 2 };
}

function contains(t: Triangles, i: number, p: Vec3, n: Vec3): boolean {
  const [a, b, c] = [corner(t, i, 0), corner(t, i, 1), corner(t, i, 2)];
  const side = (u: Vec3, v: Vec3) => dot(cross(sub(v, u), sub(p, u)), n);
  const eps = -1e-6;
  return side(a, b) >= eps && side(b, c) >= eps && side(c, a) >= eps;
}

/** Dreieck, das den Punkt enthält, sonst das mit der nächstliegenden Ebene. */
export function triangleAt(t: Triangles, p: Vec3): number {
  const count = Math.floor(t.length / 9);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const { n, area } = triangleNormal(t, i);
    if (!area) continue;
    const dist = Math.abs(dot(sub(p, corner(t, i, 0)), n));
    if (dist > PLANE_TOLERANCE * 5 || !contains(t, i, p, n)) continue;
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

export function vertexKey(v: Vec3): string {
  return v.map((x) => Math.round(x * VERTEX_GRID)).join(',');
}

/**
 * Bauteilseite um den getroffenen Punkt: alle zusammenhängenden Dreiecke, zwischen denen
 * kein Knick über `maxAngle` Grad liegt. So zählt auch ein facettierter Mantel (Bohrpfahl)
 * als eine Seite, die Kante zum Deckel aber trennt. Liefert Dreieck-Nummern und m².
 */
export function surfaceAt(
  t: Triangles,
  p: Vec3,
  maxAngle = SIDE_ANGLE,
): { triangles: number[]; area: number } | null {
  const seed = triangleAt(t, p);
  if (seed < 0) return null;
  const minCos = Math.cos((maxAngle * Math.PI) / 180);
  const count = Math.floor(t.length / 9);
  const normals: Vec3[] = [];
  const areas: number[] = [];
  const byVertex = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const tn = triangleNormal(t, i);
    normals.push(tn.n);
    areas.push(tn.area);
    if (!tn.area) continue;
    for (let c = 0; c < 3; c++) {
      const key = vertexKey(corner(t, i, c));
      const list = byVertex.get(key) ?? [];
      list.push(i);
      byVertex.set(key, list);
    }
  }
  const seen = new Set([seed]);
  const queue = [seed];
  while (queue.length) {
    const i = queue.pop()!;
    for (let c = 0; c < 3; c++) {
      for (const j of byVertex.get(vertexKey(corner(t, i, c))) ?? []) {
        if (seen.has(j) || dot(normals[i], normals[j]) < minCos) continue;
        seen.add(j);
        queue.push(j);
      }
    }
  }
  const triangles = [...seen].sort((a, b) => a - b);
  const area = triangles.reduce((sum, i) => sum + areas[i], 0);
  return { triangles, area };
}

const fmt = (digits: number) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const m3 = fmt(3);
const m2 = fmt(2);

export function formatLength(v: number): string {
  return `${m3.format(v)} m`;
}

export function formatArea(v: number): string {
  return `${m2.format(v)} m²`;
}

export function formatVolume(v: number): string {
  return `${m3.format(v)} m³`;
}

export function formatCoordinate(v: number): string {
  return m3.format(v);
}
