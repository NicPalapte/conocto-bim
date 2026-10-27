import type { Vec3 } from './bounds';

// Dreiecke gelten als eine ebene Fläche, wenn ihre Normalen höchstens ~1,8° abweichen und
// sie höchstens 2 mm neben der Ebene liegen. Ecken werden auf 0,1 mm gerundet verbunden.
const COS_TOLERANCE = 0.9995;
const PLANE_TOLERANCE = 0.002;
const VERTEX_GRID = 1e4;

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
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

function corner(t: Triangles, i: number, c: number): Vec3 {
  const o = i * 9 + c * 3;
  return [t[o], t[o + 1], t[o + 2]];
}

function triangleNormal(t: Triangles, i: number): { n: Vec3; area: number } {
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

function vertexKey(v: Vec3): string {
  return v.map((x) => Math.round(x * VERTEX_GRID)).join(',');
}

/**
 * Ebene Teilfläche eines Bauteils um den getroffenen Punkt: alle zusammenhängenden Dreiecke
 * in derselben Ebene. Liefert die Dreieck-Nummern und die Fläche in m².
 */
export function planarFace(t: Triangles, p: Vec3): { triangles: number[]; area: number } | null {
  const seed = triangleAt(t, p);
  if (seed < 0) return null;
  const { n } = triangleNormal(t, seed);
  const origin = corner(t, seed, 0);
  const count = Math.floor(t.length / 9);
  const candidates: number[] = [];
  const byVertex = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const tn = triangleNormal(t, i);
    if (!tn.area || dot(tn.n, n) < COS_TOLERANCE) continue;
    if (Math.abs(dot(sub(corner(t, i, 0), origin), n)) > PLANE_TOLERANCE) continue;
    candidates.push(i);
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
        if (!seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
  }
  const triangles = [...seen].sort((a, b) => a - b);
  const area = triangles.reduce((sum, i) => sum + triangleNormal(t, i).area, 0);
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
