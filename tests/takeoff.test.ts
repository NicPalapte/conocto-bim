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
  type ElementFacts,
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
  });
});

describe('Regeldatei', () => {
  it('schreibt und liest dieselben Regeln', () => {
    const rules = [
      { position: 'f1d7e97972', group: emptyGroup('IFCPILE'), takeoff: { kind: 'count' as const } },
    ];
    const text = JSON.stringify(toLinksFile({ fileId: 'd5e59abe0647', name: 'a.x83' }, rules));
    expect(parseLinksFile(text).rules).toEqual(rules);
    expect(() => parseLinksFile('{"schema":"x"}')).toThrow();
  });
});
