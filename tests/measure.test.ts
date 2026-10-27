import { describe, expect, it } from 'vitest';
import { lengthUnit, parseMapConversion, toMap } from '../src/model/georef';
import { formatArea, segment, surfaceAt } from '../src/model/measure';
import { closestOnLineToRay, snapGeometry } from '../src/model/snap';

/** Quader 2 × 3 × 1 m (x, y, z) als Dreiecksliste, je Seite zwei Dreiecke. */
function box(): number[] {
  const v = (x: number, y: number, z: number) => [x * 2, y * 3, z];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [
    ...a,
    ...b,
    ...c,
    ...a,
    ...c,
    ...d,
  ];
  return [
    ...quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)), // oben
    ...quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)), // unten
    ...quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)), // vorne (y = 0)
    ...quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)), // rechts (x = 2)
  ];
}

describe('surfaceAt', () => {
  it('findet die angetippte Seite und ihre Fläche', () => {
    expect(surfaceAt(box(), [1, 1.5, 1])?.area).toBeCloseTo(6);
    expect(surfaceAt(box(), [1, 0, 0.5])?.area).toBeCloseTo(2);
    expect(surfaceAt(box(), [2, 1, 0.5])?.triangles).toHaveLength(2);
  });

  it('trennt gleich ausgerichtete, aber nicht verbundene Flächen', () => {
    const second = box().map((v, i) => (i % 3 === 0 ? v + 10 : v));
    expect(surfaceAt([...box(), ...second], [1, 1.5, 1])?.area).toBeCloseTo(6);
  });

  it('liefert null neben dem Bauteil', () => {
    expect(surfaceAt(box(), [5, 5, 5])).toBeNull();
  });
});

/** Pfahl: Zylinder r = 0,5 m, h = 10 m, Mantel aus `n` Facetten, Deckel und Boden als Fächer. */
function pile(n = 16): number[] {
  const r = 0.5;
  const h = 10;
  const p = (i: number, z: number) => [
    r * Math.cos((2 * Math.PI * i) / n),
    r * Math.sin((2 * Math.PI * i) / n),
    z,
  ];
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    t.push(...p(i, 0), ...p(i + 1, 0), ...p(i + 1, h));
    t.push(...p(i, 0), ...p(i + 1, h), ...p(i, h));
    t.push(0, 0, h, ...p(i, h), ...p(i + 1, h));
    t.push(0, 0, 0, ...p(i + 1, 0), ...p(i, 0));
  }
  return t;
}

describe('surfaceAt am Pfahl', () => {
  it('nimmt den ganzen facettierten Mantel', () => {
    const n = 16;
    const face = surfaceAt(pile(n), [0.5 * Math.cos(Math.PI / n) - 1e-4, 0, 5]);
    expect(face?.triangles).toHaveLength(2 * n);
    // Facetten-Umfang: n · 2r · sin(π/n), mal Höhe.
    expect(face?.area).toBeCloseTo(n * 2 * 0.5 * Math.sin(Math.PI / n) * 10, 6);
  });

  it('trennt den Deckel vom Mantel', () => {
    expect(surfaceAt(pile(), [0, 0, 10])?.triangles).toHaveLength(16);
  });
});

describe('snapGeometry', () => {
  it('liefert Ecken und nur echte Kanten', () => {
    const { vertices, edges } = snapGeometry(pile(16));
    expect(vertices).toHaveLength(34);
    // Kreis oben und unten je 16 Kanten; Mantel- und Fächerkanten zählen nicht.
    expect(edges).toHaveLength(32);
  });
});

describe('closestOnLineToRay', () => {
  it('findet den Punkt auf der Achse unter dem Sichtstrahl', () => {
    // Achse z durch den Ursprung, Sichtstrahl waagerecht in Höhe 3.
    expect(closestOnLineToRay([0, 0, 0], [0, 0, 1], [5, 0, 3], [-1, 0, 0])).toBeCloseTo(3);
  });
});

describe('segment', () => {
  it('teilt in waagerecht und Höhe', () => {
    expect(segment([0, 0, 0], [3, 4, 12])).toEqual({ length: 13, horizontal: 5, rise: 12 });
  });
});

describe('Georeferenz', () => {
  const ifc = [
    '#15=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
    '#16=IFCUNITASSIGNMENT((#15,#17));',
    "#18=IFCPROJECTEDCRS('EPSG:25832','ETRS89 / UTM 32N','ETRS89',$,$,$,#19);",
    '#19=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);',
    '#20=IFCMAPCONVERSION(#11,#18,500000.,5600000.,100.,0.,1.,0.001);',
  ].join('\n');

  it('liest Längeneinheit und Lage', () => {
    expect(lengthUnit(ifc)).toBe(0.001);
    const mc = parseMapConversion(ifc);
    expect(mc).toMatchObject({
      eastings: 500000,
      northings: 5600000,
      height: 100,
      crs: 'EPSG:25832',
    });
    expect(mc?.scale).toBeCloseTo(1);
  });

  it('dreht und verschiebt in Landeskoordinaten', () => {
    // Modell-X zeigt nach Norden (Abszisse 0, Ordinate 1).
    const [e, n, h] = toMap([10, 0, 2], parseMapConversion(ifc)!);
    expect(e).toBeCloseTo(500000);
    expect(n).toBeCloseTo(5600010);
    expect(h).toBeCloseTo(102);
  });

  it('ohne Georeferenz: null', () => {
    expect(parseMapConversion('#1=IFCWALL();')).toBeNull();
  });
});

describe('Format', () => {
  it('schreibt deutsch', () => {
    expect(formatArea(1234.5)).toBe('1.234,50 m²');
  });
});
