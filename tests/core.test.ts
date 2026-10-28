// @vitest-environment jsdom
// Der GAEB-Parser braucht DOMParser; jsdom stellt ihn im Test bereit.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileIdOf, getGaebParser, hashPositions, mapToLvDraft } from '../src/core';
import { dimensionOf, listPositions, matchPositions } from '../src/model/lv';

const bytes = new Uint8Array(readFileSync(resolve(__dirname, 'fixtures/sample.X83')));

describe('LV-Kern aus Conocto Doc', () => {
  // Werte aus Conocto Doc (bubbleLV acf2245) für dasselbe Fixture. Weichen sie ab, passen
  // Verknüpfungen zwischen Doc und BIM nicht mehr zusammen.
  it('liefert dieselben Fingerabdrücke wie Doc', () => {
    const draft = mapToLvDraft(getGaebParser().parse(bytes, 'sample.X83'));
    expect(fileIdOf(bytes)).toBe('d5e59abe0647');
    expect([...hashPositions(draft)].map(([p, h]) => [p.oz, h.id])).toEqual([
      ['01.01.0010', '5f56eac219'],
      ['01.01.0020', 'b777a421c6'],
      ['01.02.0010', 'f1d7e97972'],
    ]);
  });
});

describe('listPositions', () => {
  it('liest Positionen flach mit Fingerabdruck und Abschnitt', () => {
    const lv = listPositions(bytes, 'sample.X83');
    expect(lv.fileId).toBe('d5e59abe0647');
    expect(lv.positions).toHaveLength(3);
    expect(lv.positions[0]).toMatchObject({
      id: '5f56eac219',
      oz: '01.01.0010',
      shortText: 'Oberboden abtragen',
      quantity: 100,
      unit: 'm3',
    });
  });
});

describe('dimensionOf', () => {
  it('erkennt messbare Einheiten', () => {
    expect(dimensionOf('m3')).toBe('volume');
    expect(dimensionOf('M²')).toBe('area');
    expect(dimensionOf('qm')).toBe('area');
    expect(dimensionOf('lfm.')).toBe('length');
    expect(dimensionOf('St')).toBeNull();
    expect(dimensionOf(null)).toBeNull();
  });
});

describe('matchPositions', () => {
  it('sucht in OZ und Kurztext, alle Wörter müssen passen', () => {
    const { positions } = listPositions(bytes, 'sample.X83');
    expect(matchPositions(positions, 'beton').map((p) => p.oz)).toEqual(['01.02.0010']);
    expect(matchPositions(positions, '01.01 aushub')).toHaveLength(1);
    expect(matchPositions(positions, '')).toHaveLength(3);
  });
});
