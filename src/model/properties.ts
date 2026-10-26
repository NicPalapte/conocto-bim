/** Ein Attribut, wie Fragments es liefert. */
export interface RawAttribute {
  value: unknown;
  type?: string;
}

/** Ein Objekt aus `getItemsData`: Attribute plus Beziehungen (Listen weiterer Objekte). */
export interface RawItem {
  [name: string]: RawAttribute | RawItem[] | undefined;
}

export interface PropRow {
  label: string;
  value: string;
}

export interface PropGroup {
  /** Name des Property-Sets oder der Mengengruppe, z. B. Qto_ColumnBaseQuantities. */
  title: string;
  kind: 'quantities' | 'properties';
  rows: PropRow[];
}

export interface ElementProps {
  category: string;
  name: string;
  guid: string;
  type: string | null;
  material: string | null;
  container: string | null;
  basics: PropRow[];
  groups: PropGroup[];
}

export function attr(item: RawItem | undefined, name: string): unknown {
  const a = item?.[name];
  return a && !Array.isArray(a) ? a.value : undefined;
}

export function rel(item: RawItem | undefined, name: string): RawItem[] {
  const r = item?.[name];
  return Array.isArray(r) ? r : [];
}

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function categoryOf(item: RawItem | undefined): string {
  return String(attr(item, '_category') ?? '');
}

const QUANTITY_VALUE: Record<string, [string, string]> = {
  IFCQUANTITYLENGTH: ['LengthValue', 'm'],
  IFCQUANTITYAREA: ['AreaValue', 'm²'],
  IFCQUANTITYVOLUME: ['VolumeValue', 'm³'],
  IFCQUANTITYWEIGHT: ['WeightValue', 'kg'],
  IFCQUANTITYCOUNT: ['CountValue', 'Stk'],
  IFCQUANTITYTIME: ['TimeValue', 's'],
  IFCQUANTITYNUMBER: ['NumberValue', ''],
};

const BOOLEAN: Record<string, string> = { T: 'Ja', F: 'Nein', true: 'Ja', false: 'Nein', U: '–' };

/** Zahl auf deutsch, ohne Tausenderpunkte zu erzwingen bei kleinen Werten. */
export function formatNumber(value: number): string {
  const digits = Math.abs(value) >= 100 ? 2 : 3;
  return value.toLocaleString('de-DE', { maximumFractionDigits: digits });
}

export function formatValue(value: unknown, unit = ''): string {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  if (typeof value === 'number')
    return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
  const s = String(value);
  return BOOLEAN[s] ?? (unit ? `${s} ${unit}` : s);
}

function quantityRows(qset: RawItem): PropRow[] {
  return rel(qset, 'Quantities').flatMap((q) => {
    const spec = QUANTITY_VALUE[categoryOf(q)];
    if (!spec) return [];
    const [field, unit] = spec;
    return [{ label: String(attr(q, 'Name') ?? field), value: formatValue(attr(q, field), unit) }];
  });
}

function propertyRows(pset: RawItem): PropRow[] {
  return rel(pset, 'HasProperties').flatMap((p) => {
    const name = text(attr(p, 'Name'));
    if (!name) return [];
    // IfcPropertySingleValue trägt NominalValue; Listen und Bereiche als Text.
    const value =
      attr(p, 'NominalValue') ??
      attr(p, 'ListValues') ??
      [attr(p, 'LowerBoundValue'), attr(p, 'UpperBoundValue')].filter((v) => v != null).join(' – ');
    return [{ label: name, value: formatValue(value) }];
  });
}

function materialName(assoc: RawItem): string | null {
  const own = text(attr(assoc, 'Name')) ?? text(attr(assoc, 'LayerSetName'));
  if (own) return own;
  // Schichten-, Profil- und Bestandteil-Sets: Namen der enthaltenen Materialien.
  const nested = ['ForLayerSet', 'MaterialLayers', 'MaterialConstituents', 'Materials', 'Material']
    .flatMap((r) => rel(assoc, r))
    .map((m) => text(attr(m, 'Name')))
    .filter((n): n is string => Boolean(n));
  return nested.length ? [...new Set(nested)].join(', ') : null;
}

/**
 * Bereitet ein Bauteil für die Eigenschaften-Leiste auf.
 * `item` = das Bauteil mit IsDefinedBy, HasAssociations und ContainedInStructure,
 * `definitions` = die Property-Sets/Mengen (mit HasProperties bzw. Quantities) und
 * Typen (mit HasPropertySets), nachgeladen über ihre localIds.
 */
export function buildElementProps(item: RawItem, definitions: RawItem[]): ElementProps {
  const byId = new Map<number, RawItem>();
  for (const d of definitions) byId.set(Number(attr(d, '_localId')), d);
  const full = (d: RawItem) => byId.get(Number(attr(d, '_localId'))) ?? d;

  const defined = rel(item, 'IsDefinedBy').map(full);
  const typeObj = defined.find((d) => categoryOf(d).endsWith('TYPE')) ?? null;
  const occurrenceSets = defined.filter((d) => !categoryOf(d).endsWith('TYPE'));
  const typeSets = typeObj ? rel(typeObj, 'HasPropertySets').map(full) : [];

  const groups: PropGroup[] = [];
  const seen = new Set<string>();
  // Exemplar vor Typ: gleichnamige Sets am Typ werden vom Exemplar überschrieben.
  for (const set of [...occurrenceSets, ...typeSets]) {
    const title = text(attr(set, 'Name')) ?? categoryOf(set);
    if (seen.has(title)) continue;
    const cat = categoryOf(set);
    if (cat === 'IFCELEMENTQUANTITY') {
      seen.add(title);
      groups.push({ title, kind: 'quantities', rows: quantityRows(set) });
    } else if (cat === 'IFCPROPERTYSET') {
      seen.add(title);
      groups.push({ title, kind: 'properties', rows: propertyRows(set) });
    }
  }
  groups.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'quantities' ? -1 : 1));

  const materials = rel(item, 'HasAssociations')
    .map(full)
    .map(materialName)
    .filter((m): m is string => Boolean(m));
  const container = rel(item, 'ContainedInStructure')[0];

  const basics: PropRow[] = [];
  for (const [label, key] of [
    ['Beschreibung', 'Description'],
    ['Objekttyp', 'ObjectType'],
    ['Vordefinierter Typ', 'PredefinedType'],
    ['Kennung', 'Tag'],
  ] as const) {
    const v = text(attr(item, key));
    if (v && v !== 'NOTDEFINED') basics.push({ label, value: v });
  }

  return {
    category: categoryOf(item),
    name: text(attr(item, 'Name')) ?? '(ohne Namen)',
    guid: text(attr(item, '_guid')) ?? '–',
    type: typeObj ? text(attr(typeObj, 'Name')) : null,
    material: materials.length ? [...new Set(materials)].join(', ') : null,
    container: container ? text(attr(container, 'Name')) : null,
    basics,
    groups,
  };
}

/** localIds aller Definitionen, die für `buildElementProps` nachgeladen werden müssen. */
export function definitionIds(item: RawItem): number[] {
  return [...rel(item, 'IsDefinedBy'), ...rel(item, 'HasAssociations')]
    .map((d) => Number(attr(d, '_localId')))
    .filter((n) => Number.isFinite(n));
}
