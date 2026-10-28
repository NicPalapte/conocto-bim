import {
  fileIdOf,
  getGaebParser,
  hashPositions,
  mapToLvDraft,
  type PositionType,
  type SectionDraft,
} from '../core';

/** Eine LV-Position, flach für Liste und Prüfung. */
export interface LvPosition {
  /** Fingerabdruck `bubble-pos-v1` (`hashes.id`), gleich wie in Conocto Doc. */
  id: string;
  oz: string;
  shortText: string;
  longText: string;
  quantity: number | null;
  unit: string | null;
  type: PositionType;
  /** Abschnitt, in dem die Position steht, z. B. „01.02 Beton“. */
  section: string | null;
}

export interface LoadedLv {
  name: string;
  /** Datei-ID wie in Conocto Doc (SHA-256 der Bytes, gekürzt). */
  fileId: string;
  projectName: string | null;
  positions: LvPosition[];
}

/** GAEB-Datei lesen; Fehler des Parsers (GAEBParseError …) gehen an den Aufrufer. */
export function listPositions(bytes: Uint8Array, name: string): LoadedLv {
  const draft = mapToLvDraft(getGaebParser().parse(bytes, name));
  const hashes = hashPositions(draft);
  const positions: LvPosition[] = [];
  const visit = (sections: readonly SectionDraft[]) => {
    for (const s of sections) {
      const section = [s.number, s.label].filter(Boolean).join(' ') || null;
      for (const p of s.positions) {
        positions.push({
          id: hashes.get(p)?.id ?? p.oz,
          oz: p.oz,
          shortText: p.shortText,
          longText: p.longText,
          quantity: p.quantity,
          unit: p.unit,
          type: p.positionType,
          section,
        });
      }
      visit(s.sections);
    }
  };
  for (const lot of draft.lots) visit(lot.sections);
  return { name, fileId: fileIdOf(bytes), projectName: draft.projectName, positions };
}

/** Positionen, deren OZ oder Kurztext alle Suchwörter enthält. */
export function matchPositions(positions: LvPosition[], query: string): LvPosition[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return positions;
  return positions.filter((p) => {
    const text = `${p.oz} ${p.shortText}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

export type Dimension = 'length' | 'area' | 'volume';

/** Was sich am Modell für diese Einheit messen lässt; `null` z. B. bei Stück oder psch. */
export function dimensionOf(unit: string | null): Dimension | null {
  const u = (unit ?? '')
    .toLowerCase()
    .replace(/\.+$/, '')
    .replace(/\s+/g, '')
    .replace('²', '2')
    .replace('³', '3');
  if (['m', 'lfm', 'lfdm', 'lm'].includes(u)) return 'length';
  if (['m2', 'qm'].includes(u)) return 'area';
  if (['m3', 'cbm'].includes(u)) return 'volume';
  return null;
}

/** Abweichung der Messung von der LV-Menge: absolut und als Anteil der LV-Menge. */
export function deviation(target: number, measured: number): { diff: number; share: number } {
  const diff = measured - target;
  return { diff, share: target ? diff / target : 0 };
}
