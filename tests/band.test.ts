import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/model/bounds';
import { makeJoint, measureBand, stripLength, type Axes } from '../src/model/faces';

const AXES: Axes = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const UP: Vec3 = [0, 0, 1];

/** Geschlossener Quader (Außenseiten nach außen), Ecke unten links bei `o`. */
function box(size: Vec3, o: Vec3 = [0, 0, 0]): number[] {
  const [a, b, c] = size;
  const p = (x: number, y: number, z: number) => [o[0] + x * a, o[1] + y * b, o[2] + z * c];
  const quad = (q: number[][]) => [...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]];
  return [
    ...quad([p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)]),
    ...quad([p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)]),
    ...quad([p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)]),
    ...quad([p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)]),
    ...quad([p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)]),
    ...quad([p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)]),
  ];
}

/** Tunnelblock: Kreisring (Radien r, R) mit `k` Facetten, Länge `l` entlang x. */
function ring(r: number, R: number, l: number, k = 32): number[] {
  const at = (rad: number, i: number, x: number): number[] => {
    const a = (2 * Math.PI * i) / k;
    return [x, rad * Math.cos(a), rad * Math.sin(a)];
  };
  const quad = (q: number[][]) => [...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]];
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const j = i + 1;
    out.push(...quad([at(R, i, 0), at(R, j, 0), at(R, j, l), at(R, i, l)])); // außen
    out.push(...quad([at(r, i, 0), at(r, i, l), at(r, j, l), at(r, j, 0)])); // innen
    out.push(...quad([at(r, i, 0), at(r, j, 0), at(R, j, 0), at(R, i, 0)])); // Stirn x = 0
    out.push(...quad([at(r, i, l), at(R, i, l), at(R, j, l), at(r, j, l)])); // Stirn x = l
  }
  return out;
}

/** Mittellinie des Facetten-Rings: halber Umfang aus Außen- und Innenrand. */
const ringMid = (r: number, R: number, k = 32) => k * Math.sin(Math.PI / k) * (r + R);

describe('Fugenband', () => {
  const slab = box([30, 12, 0.4]);

  it('Mittellinie eines Streifens: Rechteck 12 × 0,4 ergibt 12', () => {
    expect(stripLength(12 * 0.4, 2 * 12.4, false)).toBeCloseTo(12);
    expect(stripLength(0, 24, true)).toBeCloseTo(12);
  });

  it('Querfuge in der Bodenplatte: offenes Band über die Breite, Kürzung je Ende', () => {
    const joint = makeJoint(slab, AXES, 'quer', [[10, 0, 0]], UP)!;
    const m = measureBand(slab, AXES, [], [joint]);
    expect(m.bands).toHaveLength(1);
    expect(m.bands[0].closed).toBe(false);
    expect(m.length).toBeCloseTo(12);
    expect(measureBand(slab, AXES, [], [joint], 0.1).length).toBeCloseTo(11.8);
  });

  it('angetippte Stirnseite: Band entlang der Stirn', () => {
    expect(measureBand(slab, AXES, [[1, 0, 0]], []).length).toBeCloseTo(12);
    expect(measureBand(slab, AXES, [[1, 0, 0]], []).triangles.length).toBe(2);
  });

  it('Tunnelblock: Stirnseite ist eine geschlossene Schleife ohne Kürzung', () => {
    const block = ring(5, 5.5, 10);
    const m = measureBand(block, AXES, [[-1, 0, 0]], [], 0.1);
    expect(m.bands).toEqual([{ closed: true, length: expect.closeTo(ringMid(5, 5.5), 6) }]);
  });

  it('Tunnelblock: eingezeichnete Querfuge ist ebenfalls eine Schleife', () => {
    // 12 m lang: länger als der Durchmesser, sonst wäre „quer“ die Querschnittsachse.
    const block = ring(5, 5.5, 12);
    const joint = makeJoint(block, AXES, 'quer', [[4, 0, 5.5]], UP)!;
    const m = measureBand(block, AXES, [], [joint]);
    expect(m.bands[0].closed).toBe(true);
    expect(m.length).toBeCloseTo(ringMid(5, 5.5), 6);
  });

  it('Schnitt durch zwei getrennte Teile: zwei offene Bänder', () => {
    const two = [...box([1, 3, 0.5]), ...box([1, 2, 0.5], [0, 5, 0])];
    const m = measureBand(two, AXES, [], [{ normal: [1, 0, 0], from: 0.5 }]);
    expect(m.bands.map((b) => b.closed)).toEqual([false, false]);
    expect(m.length).toBeCloseTo(3 + 2);
  });
});
