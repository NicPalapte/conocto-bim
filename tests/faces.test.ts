import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/model/bounds';
import {
  extentsAlong,
  makeJoint,
  measureSides,
  section,
  sideDirection,
  toggleDirection,
  type Axes,
} from '../src/model/faces';

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
    ...quad([p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)]), // oben
    ...quad([p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)]), // unten
    ...quad([p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)]), // y = 0
    ...quad([p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)]), // y = b
    ...quad([p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)]), // x = 0
    ...quad([p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)]), // x = a
  ];
}

/** Bodenplatte 30 × 12 × 0,4 m. */
const slab = box([30, 12, 0.4]);

describe('Seiten wählen', () => {
  it('erkennt die Ausrichtung der angetippten Seite in Bauteilachsen', () => {
    expect(sideDirection(slab, AXES, [5, 12, 0.2])).toEqual([0, 1, 0]);
    expect(sideDirection(slab, AXES, [30, 6, 0.2])).toEqual([1, 0, 0]);
    expect(sideDirection(slab, AXES, [50, 50, 50])).toBeNull();
  });

  it('nimmt eine schon gewählte Seite beim zweiten Antippen heraus', () => {
    const once = toggleDirection([], [0, 1, 0]);
    expect(once).toEqual([[0, 1, 0]]);
    expect(toggleDirection(once, [0, 0.999, 0.04])).toEqual([]);
  });

  it('summiert Längs- und Stirnseiten (Randschalung)', () => {
    const dirs: Vec3[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
    ];
    const m = measureSides(slab, AXES, dirs, []);
    expect(m.sides).toBeCloseTo(2 * (30 + 12) * 0.4);
    expect(m.joints).toBe(0);
  });

  it('greift an gedrehten gleichen Bauteilen über die Bauteilachsen', () => {
    // Um 90° gedreht: Bauteil-x zeigt in Welt-y.
    const turned = box([12, 30, 0.4]);
    const axes: Axes = [
      [0, 1, 0],
      [-1, 0, 0],
      [0, 0, 1],
    ];
    const m = measureSides(turned, axes, [[0, 1, 0]], []);
    expect(m.sides).toBeCloseTo(30 * 0.4);
  });
});

describe('Fugen einzeichnen', () => {
  it('quer: Schnitt rechtwinklig zur Längsachse, einmal gezählt', () => {
    const joint = makeJoint(slab, AXES, 'quer', [[10, 4, 0.4]], UP)!;
    expect(joint.normal).toEqual([1, 0, 0]);
    expect(joint.from).toBeCloseTo(10);
    const m = measureSides(slab, AXES, [], [joint]);
    expect(m.joints).toBeCloseTo(12 * 0.4);
    expect(m.sections[0].segments.length).toBeGreaterThan(0);
  });

  it('längs: Schnitt entlang der Längsachse', () => {
    const joint = makeJoint(slab, AXES, 'laengs', [[10, 6, 0.4]], UP)!;
    expect(joint.normal).toEqual([0, 1, 0]);
    expect(measureSides(slab, AXES, [], [joint]).joints).toBeCloseTo(30 * 0.4);
  });

  it('zwei Punkte: senkrechte Ebene durch beide Punkte', () => {
    const joint = makeJoint(
      slab,
      AXES,
      'punkte',
      [
        [20, 0, 0.4],
        [20, 12, 0.4],
      ],
      UP,
    )!;
    expect(Math.abs(joint.normal[0])).toBeCloseTo(1);
    expect(measureSides(slab, AXES, [], [joint]).joints).toBeCloseTo(12 * 0.4);
  });

  it('zwei gleiche Punkte ergeben keine Fuge', () => {
    expect(makeJoint(slab, AXES, 'punkte', [[1, 1, 0.4]], UP)).toBeNull();
  });

  it('Seiten und Fugen zusammen ergeben die Menge des Bauteils', () => {
    const joints = [10, 20].map((x) => makeJoint(slab, AXES, 'quer', [[x, 0, 0]], UP)!);
    const dirs: Vec3[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
    ];
    const m = measureSides(slab, AXES, dirs, joints);
    expect(m.sides + m.joints).toBeCloseTo(33.6 + 9.6);
  });
});

describe('section', () => {
  it('zieht Löcher ab (Rohr mit Wandstärke)', () => {
    // Quadratrohr 4 × 4 außen, 2 × 2 innen, 1 m lang in x, aus vier Wänden.
    const tube = [
      ...box([1, 4, 1], [0, 0, 0]),
      ...box([1, 4, 1], [0, 0, 3]),
      ...box([1, 1, 2], [0, 0, 1]),
      ...box([1, 1, 2], [0, 3, 1]),
    ];
    expect(section(tube, [0.5, 0, 0], [1, 0, 0]).area).toBeCloseTo(16 - 4);
  });

  it('trifft die Ebene das Bauteil nicht, ist die Fläche 0', () => {
    expect(section(slab, [40, 0, 0], [1, 0, 0]).area).toBe(0);
  });
});

describe('extentsAlong', () => {
  it('misst entlang der Bauteilachsen', () => {
    const [x, y, z] = extentsAlong(slab, AXES);
    expect([x, y, z]).toEqual([30, 12, expect.closeTo(0.4)]);
  });
});
