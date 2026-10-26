export type Vec3 = [number, number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

// Ab diesem Sprung im Abstand zur Mitte (Faktor und Mindestlücke in m) gilt der Rest als
// abseits liegend. Die Mindestlücke hält auch dünn besetzte, lange Strecken zusammen.
const GAP_FACTOR = 3;
const GAP_MIN = 1000;

function isUsable(b: Bounds): boolean {
  return [...b.min, ...b.max].every(Number.isFinite) && b.min.every((v, i) => v <= b.max[i]);
}

function center(b: Bounds): Vec3 {
  return [0, 1, 2].map((a) => (b.min[a] + b.max[a]) / 2) as Vec3;
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function union(boxes: Bounds[]): Bounds | null {
  if (!boxes.length) return null;
  const min = [...boxes[0].min] as Vec3;
  const max = [...boxes[0].max] as Vec3;
  for (const b of boxes) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], b.min[a]);
      max[a] = Math.max(max[a], b.max[a]);
    }
  }
  return { min, max };
}

/**
 * Hülle der Bauteile ohne einzelne, weit abseits liegende Objekte.
 * Georeferenzierte Modelle enthalten oft Marker (Referenzpunkt, Nordpfeil) in Landes-
 * koordinaten, Kilometer vom Bauwerk entfernt; die volle Hülle würde das Bauwerk zum Punkt
 * machen. Abgeschnitten wird nur hinter einer deutlichen Lücke, mindestens die Hälfte bleibt.
 */
export function coreBounds(boxes: Bounds[]): Bounds | null {
  const usable = boxes.filter(isUsable);
  if (usable.length < 3) return union(usable);
  const centers = usable.map(center);
  const mid = [0, 1, 2].map((a) => median(centers.map((c) => c[a])));
  const ranked = usable
    .map((box, i) => ({ box, dist: Math.hypot(...centers[i].map((v, a) => v - mid[a])) }))
    .sort((x, y) => x.dist - y.dist);
  let keep = ranked.length;
  for (let k = Math.ceil(ranked.length / 2); k < ranked.length; k++) {
    const prev = ranked[k - 1].dist;
    const next = ranked[k].dist;
    if (next > GAP_FACTOR * prev && next - prev > GAP_MIN) {
      keep = k;
      break;
    }
  }
  return union(ranked.slice(0, keep).map((r) => r.box));
}
