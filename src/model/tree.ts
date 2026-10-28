/** Rohform der räumlichen Gliederung, wie Fragments sie liefert: abwechselnd
 *  Klassen-Gruppen (category gesetzt, localId null) und Objekte (localId gesetzt). */
export interface RawSpatialItem {
  category: string | null;
  localId: number | null;
  children?: RawSpatialItem[];
}

export interface ItemLabel {
  name: string | null;
  guid: string | null;
}

export type TreeKind = 'spatial' | 'class' | 'element';

export interface TreeNode {
  key: string;
  kind: TreeKind;
  /** IFC-Klasse in Großbuchstaben, wie im Modell (z. B. IFCBRIDGEPART). */
  category: string;
  label: string;
  localId: number | null;
  /** Alle Bauteile (nicht räumliche Objekte) in diesem Knoten und darunter. */
  elementIds: number[];
  children: TreeNode[];
}

// Räumliche Gliederung aus IFC 4.3 (Infrastruktur) und IFC 2x3/4 (Hochbau).
const SPATIAL = new Set([
  'IFCPROJECT',
  'IFCSITE',
  'IFCBUILDING',
  'IFCBUILDINGSTOREY',
  'IFCSPACE',
  'IFCFACILITY',
  'IFCFACILITYPART',
  'IFCFACILITYPARTCOMMON',
  'IFCBRIDGE',
  'IFCBRIDGEPART',
  'IFCROAD',
  'IFCROADPART',
  'IFCRAILWAY',
  'IFCRAILWAYPART',
  'IFCMARINEFACILITY',
  'IFCMARINEPART',
  'IFCTUNNEL',
  'IFCTUNNELPART',
  'IFCEXTERNALSPATIALELEMENT',
  'IFCSPATIALZONE',
]);

const FACILITY = new Set([
  'IFCBUILDING',
  'IFCFACILITY',
  'IFCBRIDGE',
  'IFCROAD',
  'IFCRAILWAY',
  'IFCMARINEFACILITY',
  'IFCTUNNEL',
]);

const FACILITY_PART = new Set([
  'IFCBUILDINGSTOREY',
  'IFCFACILITYPART',
  'IFCFACILITYPARTCOMMON',
  'IFCBRIDGEPART',
  'IFCROADPART',
  'IFCRAILWAYPART',
  'IFCMARINEPART',
  'IFCTUNNELPART',
]);

export function isSpatial(category: string): boolean {
  return SPATIAL.has(category);
}

/** IFCBRIDGEPART → IfcBridgePart (Schreibweise aus dem IFC-Schema). */
const CLASS_NAMES = new Map<string, string>();
export function className(category: string): string {
  const known = CLASS_NAMES.get(category);
  if (known) return known;
  return category.startsWith('IFC') ? `Ifc${titleCase(category.slice(3))}` : category;
}

// Häufige Klassen mit Binnen-Großschreibung; Rest wird nur am Anfang groß.
for (const name of [
  'IfcBridgePart',
  'IfcRoadPart',
  'IfcRailwayPart',
  'IfcFacilityPart',
  'IfcBuildingStorey',
  'IfcBuildingElementProxy',
  'IfcEarthworksFill',
  'IfcEarthworksCut',
  'IfcElementAssembly',
  'IfcSurfaceFeature',
  'IfcCourse',
  'IfcPavement',
  'IfcKerb',
  'IfcBearing',
  'IfcFooting',
  'IfcPile',
  'IfcColumn',
  'IfcBeam',
  'IfcMember',
  'IfcSlab',
  'IfcWall',
  'IfcRailing',
  'IfcSign',
  'IfcPlate',
  'IfcTendon',
  'IfcReinforcingBar',
  'IfcReinforcingMesh',
  'IfcCivilElement',
  'IfcGeographicElement',
  'IfcAlignment',
  'IfcTrackElement',
  'IfcRail',
  'IfcSite',
  'IfcBridge',
  'IfcRoad',
  'IfcRailway',
  'IfcBuilding',
  'IfcProject',
  'IfcFacility',
  'IfcMarineFacility',
  'IfcDeepFoundation',
  'IfcCaissonFoundation',
  'IfcFlowSegment',
  'IfcPipeSegment',
  'IfcCableSegment',
  'IfcDistributionElement',
  'IfcCovering',
  'IfcStair',
  'IfcRamp',
  'IfcRoof',
  'IfcDoor',
  'IfcWindow',
  'IfcSpace',
  'IfcGrid',
  'IfcAnnotation',
  'IfcVirtualElement',
]) {
  CLASS_NAMES.set(name.toUpperCase(), name);
}

function titleCase(rest: string): string {
  return rest.charAt(0) + rest.slice(1).toLowerCase();
}

/**
 * Baut den Bauteilbaum eines Modells: räumliche Objekte (Bauwerk, Teil …) mit Namen,
 * darunter je IFC-Klasse eine Gruppe mit den Bauteilen. Das Projekt selbst entfällt,
 * weil die Modellzeile im Baum es schon vertritt.
 */
export function buildTree(
  modelId: string,
  root: RawSpatialItem,
  labels: Map<number, ItemLabel>,
): TreeNode[] {
  const build = (item: RawSpatialItem, category: string, path: string): TreeNode => {
    const id = item.localId!;
    const kind: TreeKind = isSpatial(category) ? 'spatial' : 'element';
    const children = groupChildren(item.children ?? [], `${path}/${id}`);
    const label = labels.get(id)?.name || className(category);
    const own = kind === 'element' ? [id] : [];
    return {
      key: `${path}/${id}`,
      kind,
      category,
      label,
      localId: id,
      elementIds: own.concat(...children.map((c) => c.elementIds)),
      children,
    };
  };

  const groupChildren = (groups: RawSpatialItem[], path: string): TreeNode[] => {
    const spatial: TreeNode[] = [];
    const classes: TreeNode[] = [];
    for (const group of groups) {
      const category = group.category ?? 'UNBEKANNT';
      const items = (group.children ?? []).filter((c) => c.localId !== null);
      if (isSpatial(category)) {
        spatial.push(...items.map((i) => build(i, category, path)));
        continue;
      }
      const elements = items.map((i) => build(i, category, path));
      elements.sort((a, b) => a.label.localeCompare(b.label, 'de', { numeric: true }));
      classes.push({
        key: `${path}#${category}`,
        kind: 'class',
        category,
        label: className(category),
        localId: null,
        elementIds: elements.flatMap((e) => e.elementIds),
        children: elements,
      });
    }
    classes.sort((a, b) => a.label.localeCompare(b.label));
    return [...spatial, ...classes];
  };

  const top = root.localId === null ? (root.children ?? []) : [root];
  const nodes = top.flatMap((item) =>
    item.localId === null ? [] : [build(item, root.category ?? 'IFCPROJECT', modelId)],
  );
  // Projekt überspringen: seine Kinder stehen direkt unter dem Modell.
  return nodes.flatMap((n) => (n.category === 'IFCPROJECT' ? n.children : [n]));
}

export interface Placement {
  facility: TreeNode | null;
  part: TreeNode | null;
}

/** Bauwerk und nächster Bauwerksteil über einem Bauteil, aus dem Baum gelesen. */
export function placementOf(nodes: TreeNode[], localId: number): Placement {
  const path = findPath(nodes, localId);
  if (!path) return { facility: null, part: null };
  const above = path.slice(0, -1).reverse();
  return {
    facility: above.find((n) => FACILITY.has(n.category)) ?? null,
    part: above.find((n) => FACILITY_PART.has(n.category)) ?? null,
  };
}

export function findPath(nodes: TreeNode[], localId: number): TreeNode[] | null {
  for (const node of nodes) {
    if (node.localId === localId && node.kind !== 'class') return [node];
    const sub = findPath(node.children, localId);
    if (sub) return [node, ...sub];
  }
  return null;
}

/** Alle localIds im Rohbaum, um Namen in einem Rutsch zu laden. */
export function collectIds(item: RawSpatialItem, into: number[] = []): number[] {
  if (item.localId !== null) into.push(item.localId);
  for (const child of item.children ?? []) collectIds(child, into);
  return into;
}

/** Filtert den Baum auf Knoten, deren Name, Klasse oder GUID den Suchtext enthält. */
export function filterTree(
  nodes: TreeNode[],
  query: string,
  labels: Map<number, ItemLabel>,
): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const hit = (n: TreeNode) =>
    n.label.toLowerCase().includes(q) ||
    className(n.category).toLowerCase().includes(q) ||
    (n.localId !== null && (labels.get(n.localId)?.guid ?? '').toLowerCase() === q);
  const walk = (list: TreeNode[]): TreeNode[] =>
    list.flatMap((n) => {
      if (hit(n)) return [n];
      const children = walk(n.children);
      if (children.length === 0) return [];
      return [{ ...n, children, elementIds: children.flatMap((c) => c.elementIds) }];
    });
  return walk(nodes);
}

/** Bauteil-Ids je IFC-Klasse aus den Klassen-Knoten des Baums (für Auswahlgruppen). */
export function idsByCategory(nodes: TreeNode[], into = new Map<string, Set<number>>()) {
  for (const n of nodes) {
    if (n.kind === 'class') {
      const set = into.get(n.category) ?? new Set<number>();
      for (const id of n.elementIds) set.add(id);
      into.set(n.category, set);
    }
    idsByCategory(n.children, into);
  }
  return into;
}
