import type { Dimension } from './lv';
import type { FactValue } from './properties';

// Mengenregeln: welche Bauteile zu einer LV-Position gehören (Auswahlgruppe) und was an
// jedem gemessen wird (Messansatz). Reine Logik ohne 3D; wandert später in den Kern.

export type Axis = 'x' | 'y' | 'z';
export const AXES: Axis[] = ['x', 'y', 'z'];

/** Was der Viewer über ein Bauteil weiß, um es zu filtern und zu messen. */
export interface ElementFacts {
  modelId: string;
  localId: number;
  guid: string;
  category: string;
  name: string;
  /** Merkmale und Mengen aus dem Modell, Schlüssel `Set · Name`, dazu Material, Typ … */
  values: Record<string, FactValue>;
  /** Ausdehnung entlang der Bauteilachsen in m (wie beim Einrasten). */
  extents: Record<Axis, number>;
  /** Volumen aus der Geometrie in m³. */
  volume: number | null;
}

/** Ein Kriterium der Auswahlgruppe. Alle Kriterien einer Gruppe gelten zugleich. */
export type Criterion =
  | { kind: 'value'; key: string; equals: string }
  | { kind: 'range'; key: string; from: number; to: number }
  | { kind: 'extent'; axis: Axis; from: number; to: number }
  | { kind: 'name'; contains: string };

export interface Group {
  /** IFC-Klasse, z. B. IFCPILE; `null` = alle Klassen. */
  category: string | null;
  where: Criterion[];
  /** Von Hand dazu bzw. heraus, per GlobalId. */
  add: string[];
  remove: string[];
}

export type Takeoff =
  | { kind: 'volume' }
  | { kind: 'length'; axis: Axis }
  | { kind: 'count' }
  | { kind: 'value'; key: string };

export interface Rule {
  /** Fingerabdruck der Position (`bubble-pos-v1`). */
  position: string;
  group: Group;
  takeoff: Takeoff;
}

export function emptyGroup(category: string | null = null): Group {
  return { category, where: [], add: [], remove: [] };
}

/** Messansatz, der zur Einheit der Position passt. */
export function defaultTakeoff(dimension: Dimension | null, unit: string | null): Takeoff {
  if (dimension === 'volume') return { kind: 'volume' };
  if (dimension === 'length') return { kind: 'length', axis: 'z' };
  if (/^(st|stk|stck|stück)\.?$/i.test((unit ?? '').trim())) return { kind: 'count' };
  return { kind: 'volume' };
}

function numberOf(v: FactValue | undefined): number | null {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function matches(e: ElementFacts, c: Criterion): boolean {
  switch (c.kind) {
    case 'value':
      return String(e.values[c.key] ?? '').toLowerCase() === c.equals.toLowerCase();
    case 'range': {
      const n = numberOf(e.values[c.key]);
      return n !== null && n >= c.from && n <= c.to;
    }
    case 'extent':
      return e.extents[c.axis] >= c.from && e.extents[c.axis] <= c.to;
    case 'name':
      return e.name.toLowerCase().includes(c.contains.toLowerCase());
  }
}

/** Bauteile der Gruppe: Klasse und alle Kriterien, plus von Hand dazu, minus heraus. */
export function members(elements: ElementFacts[], group: Group): ElementFacts[] {
  const add = new Set(group.add);
  const remove = new Set(group.remove);
  return elements.filter((e) => {
    if (remove.has(e.guid)) return false;
    if (add.has(e.guid)) return true;
    if (group.category && e.category !== group.category) return false;
    return group.where.every((c) => matches(e, c));
  });
}

/** Menge eines Bauteils nach dem Messansatz; `null` = an diesem Bauteil nicht messbar. */
export function quantityOf(e: ElementFacts, takeoff: Takeoff): number | null {
  switch (takeoff.kind) {
    case 'volume':
      return e.volume;
    case 'length':
      return e.extents[takeoff.axis] || null;
    case 'count':
      return 1;
    case 'value':
      return numberOf(e.values[takeoff.key]);
  }
}

export interface TakeoffResult {
  rows: { element: ElementFacts; quantity: number | null }[];
  sum: number;
  /** Bauteile, an denen der Ansatz keinen Wert findet. */
  missing: number;
}

export function applyRule(elements: ElementFacts[], rule: Pick<Rule, 'group' | 'takeoff'>) {
  const rows = members(elements, rule.group).map((element) => ({
    element,
    quantity: quantityOf(element, rule.takeoff),
  }));
  rows.sort((a, b) => (b.quantity ?? -1) - (a.quantity ?? -1));
  const result: TakeoffResult = {
    rows,
    sum: rows.reduce((n, r) => n + (r.quantity ?? 0), 0),
    missing: rows.filter((r) => r.quantity === null).length,
  };
  return result;
}

/**
 * Kriterium aus einem Merkmal eines Bauteils: Zahlen als Bereich mit Toleranz (1 %,
 * mindestens 1 mm), Texte als Gleichheit. So greift „15 m“ auch bei 14,998 m.
 */
export function criterionFrom(key: string, value: FactValue): Criterion {
  const n = numberOf(value);
  if (n === null) return { kind: 'value', key, equals: String(value) };
  const tol = Math.max(Math.abs(n) * 0.01, 0.001);
  return { kind: 'range', key, from: n - tol, to: n + tol };
}

export function extentCriterion(axis: Axis, value: number): Criterion {
  const tol = Math.max(value * 0.01, 0.001);
  return { kind: 'extent', axis, from: value - tol, to: value + tol };
}

export const LINKS_SCHEMA = 'conocto-bim-links-v1';

/** Datei mit allen Mengenregeln eines LV; nur Schlüssel, Kriterien und Ansätze. */
export interface LinksFile {
  schema: typeof LINKS_SCHEMA;
  lv: { fileId: string; name: string };
  rules: Rule[];
}

export function toLinksFile(lv: { fileId: string; name: string }, rules: Rule[]): LinksFile {
  return { schema: LINKS_SCHEMA, lv, rules };
}

/** Liest eine Regeldatei; wirft bei fremdem Format. */
export function parseLinksFile(text: string): LinksFile {
  const data = JSON.parse(text) as Partial<LinksFile>;
  if (data.schema !== LINKS_SCHEMA || !Array.isArray(data.rules) || !data.lv) {
    throw new Error('Keine Conocto-BIM-Regeldatei');
  }
  return data as LinksFile;
}
