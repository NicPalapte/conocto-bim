import type { Vec3 } from './bounds';
import { cross, dot, floodSide, sub, triangleAt, triangleNormal, type Triangles } from './measure';

// Seiten antippen und Fugen einzeichnen: Menge je Bauteil aus gewählten Bauteilseiten plus
// eingezeichneten Fugen (ebene Schnitte). Reine Geometrie ohne 3D-Bibliothek.

/** Achsen eines Bauteils (x, y, z) als Einheitsvektoren in Szenen-Koordinaten. */
export type Axes = [Vec3, Vec3, Vec3];

/**
 * Winkel in Grad, bis zu dem eine Seite als „gleich ausgerichtet“ gilt. Damit greift eine
 * an einem Bauteil gewählte Seite auch an gleichen Bauteilen mit kleinen Abweichungen.
 */
export const MATCH_ANGLE = 15;

/** Wie eine Fuge liegt: quer oder längs zur Längsachse, oder durch zwei Punkte. */
export type JointHow = 'quer' | 'laengs' | 'punkte';

/**
 * Eingezeichnete Fuge in einem Bauteil: ebener Schnitt. `normal` in Bauteilachsen,
 * `from` = Abstand der Ebene vom Anfang des Bauteils entlang `normal` in m. So bleibt die
 * Lage gleich, auch wenn das Modell anders im Raum liegt.
 */
export interface Joint {
  guid: string;
  how: JointHow;
  normal: Vec3;
  from: number;
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}

export function toLocal(v: Vec3, axes: Axes): Vec3 {
  return [dot(v, axes[0]), dot(v, axes[1]), dot(v, axes[2])];
}

export function toWorld(v: Vec3, axes: Axes): Vec3 {
  return [0, 1, 2].map((k) => axes[0][k] * v[0] + axes[1][k] * v[1] + axes[2][k] * v[2]) as Vec3;
}

/** Auf 0,001 gerundet: kurze, stabile Werte in der Regeldatei. */
function rounded(v: Vec3): Vec3 {
  return unit(v.map((x) => Math.round(x * 1000) / 1000) as Vec3);
}

function vertexCount(t: Triangles): number {
  return Math.floor(t.length / 3);
}

function vertex(t: Triangles, k: number): Vec3 {
  return [t[k * 3], t[k * 3 + 1], t[k * 3 + 2]];
}

/** Kleinster Wert von `dot(v, n)` über alle Ecken: der Anfang des Bauteils entlang `n`. */
function minAlong(t: Triangles, n: Vec3): number {
  let min = Infinity;
  for (let k = 0; k < vertexCount(t); k++) min = Math.min(min, dot(vertex(t, k), n));
  return min;
}

/** Ausdehnung entlang der Bauteilachsen in m. */
export function extentsAlong(t: Triangles, axes: Axes): Vec3 {
  return axes.map((a) => {
    let min = Infinity;
    let max = -Infinity;
    for (let k = 0; k < vertexCount(t); k++) {
      const d = dot(vertex(t, k), a);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    return max > min ? max - min : 0;
  }) as Vec3;
}

/** Ausrichtung der Seite am Punkt, in Bauteilachsen; `null` neben dem Bauteil. */
export function sideDirection(t: Triangles, axes: Axes, point: Vec3): Vec3 | null {
  const i = triangleAt(t, point);
  if (i < 0) return null;
  return rounded(toLocal(triangleNormal(t, i).n, axes));
}

function sameDirection(a: Vec3, b: Vec3, angle = MATCH_ANGLE): boolean {
  return dot(a, b) >= Math.cos((angle * Math.PI) / 180);
}

/** Seite dazu, oder heraus, wenn sie schon gewählt ist. */
export function toggleDirection(dirs: Vec3[], dir: Vec3): Vec3[] {
  const kept = dirs.filter((d) => !sameDirection(d, dir));
  return kept.length < dirs.length ? kept : [...dirs, dir];
}

/**
 * Dreiecke der gewählten Seiten: Start sind alle Dreiecke mit passender Ausrichtung, dazu
 * alles, was ohne Knick daran hängt (gekrümmter Mantel zählt ganz).
 */
export function sideTriangles(t: Triangles, axes: Axes, dirs: Vec3[]): number[] {
  if (!dirs.length) return [];
  const seeds: number[] = [];
  const count = Math.floor(t.length / 9);
  for (let i = 0; i < count; i++) {
    const { n, area } = triangleNormal(t, i);
    if (!area) continue;
    const local = toLocal(n, axes);
    if (dirs.some((d) => sameDirection(local, d))) seeds.push(i);
  }
  return seeds.length ? floodSide(t, seeds) : [];
}

/**
 * Schnitt einer Ebene durch ein geschlossenes Bauteil: Fläche (Löcher abgezogen) und
 * Randlinien. Jede Schnittkante wird nach der Außenseite ihres Dreiecks ausgerichtet;
 * dann ergibt die Summe der Teilflächen die Schnittfläche, ohne Kanten zu Ringen zu
 * verketten.
 */
export function section(
  t: Triangles,
  origin: Vec3,
  normal: Vec3,
): { area: number; length: number; segments: [Vec3, Vec3][] } {
  const n = unit(normal);
  const segments: [Vec3, Vec3][] = [];
  let twice = 0;
  let length = 0;
  const count = Math.floor(t.length / 9);
  for (let i = 0; i < count; i++) {
    const { n: tn, area } = triangleNormal(t, i);
    if (!area) continue;
    const v = [0, 1, 2].map((c) => vertex(t, i * 3 + c));
    const d = v.map((p) => dot(sub(p, origin), n));
    const points: Vec3[] = [];
    for (let c = 0; c < 3; c++) {
      const a = c;
      const b = (c + 1) % 3;
      if (d[a] >= 0 === d[b] >= 0) continue;
      const s = d[a] / (d[a] - d[b]);
      points.push([
        v[a][0] + (v[b][0] - v[a][0]) * s,
        v[a][1] + (v[b][1] - v[a][1]) * s,
        v[a][2] + (v[b][2] - v[a][2]) * s,
      ]);
    }
    if (points.length !== 2) continue;
    let [p, q] = points;
    if (dot(sub(q, p), cross(n, tn)) < 0) [p, q] = [q, p];
    segments.push([p, q]);
    twice += dot(cross(sub(p, origin), sub(q, origin)), n);
    length += Math.hypot(...sub(q, p));
  }
  return { area: Math.abs(twice) / 2, length, segments };
}

/**
 * Neue Fuge aus angetippten Punkten. Quer: Ebene rechtwinklig zur Längsachse (längste
 * Ausdehnung). Längs: rechtwinklig zur zweitlängsten Achse, also entlang der Längsachse.
 * Zwei Punkte: senkrechte Ebene durch beide Punkte (`up` = Richtung nach oben).
 */
export function makeJoint(
  t: Triangles,
  axes: Axes,
  how: JointHow,
  points: Vec3[],
  up: Vec3,
): Omit<Joint, 'guid'> | null {
  let world: Vec3;
  if (how === 'punkte') {
    if (points.length < 2) return null;
    world = unit(cross(sub(points[1], points[0]), up));
    if (!world.some((x) => x)) return null;
  } else {
    if (!points.length) return null;
    const ext = extentsAlong(t, axes);
    const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
    world = axes[how === 'quer' ? order[0] : order[1]];
  }
  const normal = rounded(toLocal(world, axes));
  const n = toWorld(normal, axes);
  return { how, normal, from: dot(points[0], n) - minAlong(t, n) };
}

/** Ebene einer Fuge in Szenen-Koordinaten. */
export function jointPlane(t: Triangles, axes: Axes, joint: Pick<Joint, 'normal' | 'from'>) {
  const normal = unit(toWorld(joint.normal, axes));
  const at = minAlong(t, normal) + joint.from;
  const origin: Vec3 = [normal[0] * at, normal[1] * at, normal[2] * at];
  return { origin, normal };
}

export interface SidesMeasure {
  /** Fläche der gewählten Seiten in m². */
  sides: number;
  /** Summe der Fugenflächen in m², jede Fuge einmal. */
  joints: number;
  triangles: number[];
  sections: { area: number; segments: [Vec3, Vec3][] }[];
}

/** Menge eines Bauteils: gewählte Seiten plus eingezeichnete Fugen. */
export function measureSides(
  t: Triangles,
  axes: Axes,
  dirs: Vec3[],
  joints: Pick<Joint, 'normal' | 'from'>[],
): SidesMeasure {
  const triangles = sideTriangles(t, axes, dirs);
  const sides = triangles.reduce((sum, i) => sum + triangleNormal(t, i).area, 0);
  const sections = joints.map((j) => {
    const plane = jointPlane(t, axes, j);
    const s = section(t, plane.origin, plane.normal);
    return { area: s.area, segments: s.segments };
  });
  return { sides, joints: sections.reduce((n, s) => n + s.area, 0), triangles, sections };
}

// Fugenband: Länge der Mittellinie einer Fugenfläche (Schnitt oder Stirnseite).

type Segment = [Vec3, Vec3];

/** Ein Band: Länge in m; `closed` = geschlossene Schleife (Fläche mit Loch). */
export interface Band {
  length: number;
  closed: boolean;
}

// Ecken der Randstrecken werden auf 1 mm verbunden; Schnittpunkte benachbarter Dreiecke
// weichen nur im Rundungsrauschen voneinander ab.
const LOOP_GRID = 1e3;

function loopKey(v: Vec3): string {
  return v.map((x) => Math.round(x * LOOP_GRID)).join(',');
}

/** Randstrecken zu Ringen gruppiert (über gemeinsame Ecken). */
function loopsOf(segments: Segment[]): Segment[][] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  for (const [p, q] of segments) {
    const a = loopKey(p);
    const b = loopKey(q);
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const loops = new Map<string, Segment[]>();
  for (const s of segments) {
    const root = find(loopKey(s[0]));
    loops.set(root, [...(loops.get(root) ?? []), s]);
  }
  return [...loops.values()];
}

/** Punkt in einem Ring? Strahl in der Ebene (u, v) zählt Schnitte mit den Randstrecken. */
function inside(p: Vec3, loop: Segment[], u: Vec3, v: Vec3): boolean {
  const x = dot(p, u);
  const y = dot(p, v);
  let hits = 0;
  for (const [a, b] of loop) {
    const [ax, ay, bx, by] = [dot(a, u), dot(a, v), dot(b, u), dot(b, v)];
    if (ay > y === by > y) continue;
    if (x < ax + ((y - ay) * (bx - ax)) / (by - ay)) hits += 1;
  }
  return hits % 2 === 1;
}

/**
 * Länge der Mittellinie eines Streifens aus Fläche A und halbem Umfang h: für ein Rechteck
 * L × d gilt h = L + d und A = L · d, also L = (h + √(h² − 4A)) / 2. Beim Ring ist die
 * Mittellinie der halbe Umfang aus Außen- und Innenrand.
 */
export function stripLength(area: number, perimeter: number, closed: boolean): number {
  const half = perimeter / 2;
  if (closed) return half;
  return (half + Math.sqrt(Math.max(0, half * half - 4 * area))) / 2;
}

/**
 * Bänder aus gerichteten Randstrecken einer ebenen Fläche (Außenrand und Löcher gegenläufig).
 * Jeder Außenrand ist ein Band; liegt ein Loch darin, ist es eine geschlossene Schleife.
 * `trim` wird bei offenen Bändern an beiden Enden abgezogen.
 */
export function bandsOf(segments: Segment[], normal: Vec3, trim = 0): Band[] {
  const n = unit(normal);
  const rings = loopsOf(segments).map((loop) => ({
    loop,
    area: loop.reduce((s, [p, q]) => s + dot(cross(p, q), n), 0) / 2,
    length: loop.reduce((s, [p, q]) => s + Math.hypot(...sub(q, p)), 0),
  }));
  if (rings.reduce((s, r) => s + r.area, 0) < 0) for (const r of rings) r.area = -r.area;
  const outer = rings.filter((r) => r.area > 1e-9).sort((a, b) => a.area - b.area);
  const parts = outer.map((r) => ({ area: r.area, length: r.length, closed: false }));
  const u = unit(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const v = cross(n, u);
  for (const hole of rings.filter((r) => r.area < -1e-9)) {
    const k = outer.findIndex((r) => inside(hole.loop[0][0], r.loop, u, v));
    if (k < 0) continue;
    parts[k].area += hole.area;
    parts[k].length += hole.length;
    parts[k].closed = true;
  }
  return parts.map((p) => {
    const length = stripLength(p.area, p.length, p.closed);
    return { closed: p.closed, length: p.closed ? length : Math.max(0, length - 2 * trim) };
  });
}

/** Gerichtete Randkanten einer Dreiecksmenge (Kanten, die nur ein Dreieck der Menge hat). */
function boundaryOf(t: Triangles, triangles: number[]): Segment[] {
  const edges = new Map<string, Segment>();
  for (const i of triangles) {
    for (let c = 0; c < 3; c++) {
      const p = vertex(t, i * 3 + c);
      const q = vertex(t, i * 3 + ((c + 1) % 3));
      const back = `${loopKey(q)}|${loopKey(p)}`;
      if (edges.has(back)) edges.delete(back);
      else edges.set(`${loopKey(p)}|${loopKey(q)}`, [p, q]);
    }
  }
  return [...edges.values()];
}

export interface BandMeasure {
  /** Summe aller Bänder in m. */
  length: number;
  bands: Band[];
  triangles: number[];
  sections: { segments: Segment[] }[];
}

/**
 * Fugenband eines Bauteils: je gewählter Stirnseite und je eingezeichneter Fuge ein Band
 * entlang der Mittellinie der Fugenfläche.
 */
export function measureBand(
  t: Triangles,
  axes: Axes,
  dirs: Vec3[],
  joints: Pick<Joint, 'normal' | 'from'>[],
  trim = 0,
): BandMeasure {
  const bands: Band[] = [];
  const triangles: number[] = [];
  for (const dir of dirs) {
    const face = sideTriangles(t, axes, [dir]);
    triangles.push(...face);
    bands.push(...bandsOf(boundaryOf(t, face), toWorld(dir, axes), trim));
  }
  const sections = joints.map((j) => {
    const plane = jointPlane(t, axes, j);
    const s = section(t, plane.origin, plane.normal);
    bands.push(...bandsOf(s.segments, plane.normal, trim));
    return { segments: s.segments };
  });
  return {
    length: bands.reduce((s, b) => s + b.length, 0),
    bands,
    triangles: [...new Set(triangles)].sort((a, b) => a - b),
    sections,
  };
}
