import { describe, expect, it } from 'vitest';
import { lengthUnit, parseMapConversion, toMap } from '../src/model/georef';
import { formatArea, planarFace, segment } from '../src/model/measure';

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

describe('planarFace', () => {
  it('findet die angetippte Seite und ihre Fläche', () => {
    expect(planarFace(box(), [1, 1.5, 1])?.area).toBeCloseTo(6);
    expect(planarFace(box(), [1, 0, 0.5])?.area).toBeCloseTo(2);
    expect(planarFace(box(), [2, 1, 0.5])?.triangles).toHaveLength(2);
  });

  it('trennt gleich ausgerichtete, aber nicht verbundene Flächen', () => {
    const second = box().map((v, i) => (i % 3 === 0 ? v + 10 : v));
    expect(planarFace([...box(), ...second], [1, 1.5, 1])?.area).toBeCloseTo(6);
  });

  it('liefert null neben dem Bauteil', () => {
    expect(planarFace(box(), [5, 5, 5])).toBeNull();
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
