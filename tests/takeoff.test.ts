import { describe, expect, it } from 'vitest';
import {
  applyRule,
  criterionFrom,
  defaultTakeoff,
  emptyGroup,
  extentCriterion,
  members,
  parseLinksFile,
  toLinksFile,
  transferFaces,
  type ElementFacts,
  type SidesTakeoff,
} from '../src/model/takeoff';

function pile(guid: string, length: number, diameter: number, volume: number | null) {
  const e: ElementFacts = {
    modelId: 'm',
    localId: Number(guid.slice(1)),
    guid,
    category: 'IFCPILE',
    name: `Bohrpfahl ${guid}`,
    values: { 'Pset_PileCommon · Durchmesser': diameter, Material: 'C30/37' },
    extents: { x: diameter, y: diameter, z: length },
    volume,
  };
  return e;
}

const elements: ElementFacts[] = [
  pile('p1', 15, 1, 11.78),
  pile('p2', 14.998, 1, 11.78),
  pile('p3', 12, 1, 9.42),
  pile('p4', 15, 1.2, 16.96),
  { ...pile('w1', 15, 1, 30), category: 'IFCWALL', name: 'Wand' },
];

describe('Auswahlgruppe', () => {
  it('filtert nach Klasse, Merkmal und Maß mit Toleranz', () => {
    const group = {
      ...emptyGroup('IFCPILE'),
      where: [criterionFrom('Pset_PileCommon · Durchmesser', 1), extentCriterion('z', 15)],
    };
    expect(members(elements, group).map((e) => e.guid)).toEqual(['p1', 'p2']);
  });

  it('nimmt von Hand dazu und heraus', () => {
    const group = { ...emptyGroup('IFCPILE'), add: ['w1'], remove: ['p4'] };
    expect(members(elements, group).map((e) => e.guid)).toEqual(['p1', 'p2', 'p3', 'w1']);
  });

  it('vergleicht Text ohne Groß/klein', () => {
    const group = { ...emptyGroup(null), where: [criterionFrom('Material', 'c30/37')] };
    expect(members(elements, group)).toHaveLength(5);
  });
});

describe('Messansatz', () => {
  const group = { ...emptyGroup('IFCPILE'), where: [extentCriterion('z', 15)] };

  it('summiert Volumen, Länge und Anzahl', () => {
    expect(applyRule(elements, { group, takeoff: { kind: 'volume' } }).sum).toBeCloseTo(40.52);
    expect(applyRule(elements, { group, takeoff: { kind: 'length', axis: 'z' } }).sum).toBeCloseTo(
      44.998,
    );
    expect(applyRule(elements, { group, takeoff: { kind: 'count' } }).sum).toBe(3);
  });

  it('zählt Bauteile ohne Wert, statt 0 zu verstecken', () => {
    const withGap = [...elements, pile('p5', 15, 1, null)];
    const result = applyRule(withGap, { group, takeoff: { kind: 'volume' } });
    expect(result.missing).toBe(1);
    expect(result.rows.at(-1)?.element.guid).toBe('p5');
  });

  it('liest Mengen aus dem Modell', () => {
    const result = applyRule(elements, {
      group,
      takeoff: { kind: 'value', key: 'Pset_PileCommon · Durchmesser' },
    });
    expect(result.sum).toBeCloseTo(3.2);
  });

  it('wählt den Ansatz nach Einheit', () => {
    expect(defaultTakeoff('volume', 'm3')).toEqual({ kind: 'volume' });
    expect(defaultTakeoff('length', 'm')).toEqual({ kind: 'length', axis: 'z' });
    expect(defaultTakeoff(null, 'St')).toEqual({ kind: 'count' });
    expect(defaultTakeoff('area', 'm2')).toEqual({ kind: 'sides', faces: {}, joints: [] });
  });
});

describe('Seiten + Fugen', () => {
  const takeoff: SidesTakeoff = {
    kind: 'sides',
    faces: {
      p1: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    },
    joints: [{ guid: 'p1', how: 'quer', normal: [1, 0, 0], from: 10 }],
  };

  it('nimmt die vom Viewer gerechnete Menge je Bauteil, sonst kein Wert', () => {
    const rule = { group: emptyGroup('IFCPILE'), takeoff };
    const result = applyRule(elements, rule, new Map([['p1', 43.2]]));
    expect(result.sum).toBeCloseTo(43.2);
    expect(result.missing).toBe(3);
  });

  it('überträgt die Seiten eines Musters, Fugen bleiben am Bauteil', () => {
    const next = transferFaces(takeoff, 'p1', ['p2', 'p3']);
    expect(next.faces.p2).toEqual(takeoff.faces.p1);
    expect(next.faces.p3).toEqual(takeoff.faces.p1);
    expect(next.joints).toHaveLength(1);
    expect(transferFaces(takeoff, 'p9', ['p1']).faces.p1).toBeUndefined();
  });
  it('Fugenband nimmt die gerechnete Länge genauso', () => {
    const band: SidesTakeoff = { ...takeoff, kind: 'band', trim: 0.1 };
    const result = applyRule(
      elements,
      { group: emptyGroup('IFCPILE'), takeoff: band },
      new Map([['p1', 11.8]]),
    );
    expect(result.sum).toBeCloseTo(11.8);
  });
});

describe('Regeldatei', () => {
  it('schreibt und liest dieselben Regeln', () => {
    const rules = [
      { position: '22036e66f6', group: emptyGroup('IFCPILE'), takeoff: { kind: 'count' as const } },
    ];
    const text = JSON.stringify(toLinksFile({ fileId: 'd5e59abe0647', name: 'a.x83' }, rules));
    expect(parseLinksFile(text).rules).toEqual(rules);
    expect(() => parseLinksFile('{"schema":"x"}')).toThrow();
  });
});

describe('Bereich von Hand', () => {
  it('grenzt Länge entlang der Achse von–bis ein, Grenzen eingeschlossen', () => {
    const group = {
      ...emptyGroup('IFCPILE'),
      where: [{ kind: 'extent' as const, axis: 'z' as const, from: 12, to: 14.998 }],
    };
    expect(members(elements, group).map((e) => e.guid)).toEqual(['p2', 'p3']);
  });
});
