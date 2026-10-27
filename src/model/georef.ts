import type { Vec3 } from './bounds';

/** Lage des Modells in Landeskoordinaten (`IfcMapConversion`), Werte in Karteneinheiten. */
export interface MapConversion {
  eastings: number;
  northings: number;
  height: number;
  /** Richtung der Modell-X-Achse im Kartennetz, normiert. */
  cos: number;
  sin: number;
  /** Faktor Modellmeter → Karteneinheit (Scale geteilt durch die Längeneinheit der Datei). */
  scale: number;
  /** Name des Koordinatensystems, z. B. „EPSG:25832“. */
  crs: string | null;
}

const PREFIX: Record<string, number> = {
  KILO: 1000,
  HECTO: 100,
  DECA: 10,
  DECI: 0.1,
  CENTI: 0.01,
  MILLI: 0.001,
  MICRO: 1e-6,
};

function num(token: string | undefined, fallback: number): number {
  if (!token || token === '$' || token === '*') return fallback;
  // STEP schreibt Zahlen auch als „0.“ oder „1.E-3“; beides versteht Number().
  const n = Number(token);
  return Number.isFinite(n) ? n : fallback;
}

/** Zerlegt die Argumente einer STEP-Zeile auf oberster Ebene. */
function args(line: string): string[] {
  const body = line.slice(line.indexOf('(') + 1, line.lastIndexOf(')'));
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const ch of body) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (!quoted && depth === 0 && ch === ',') {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}

function entities(text: string, type: string): Map<string, string> {
  const found = new Map<string, string>();
  const re = new RegExp(`^(#\\d+)\\s*=\\s*${type}\\s*\\(.*\\);`, 'gim');
  for (const m of text.matchAll(re)) found.set(m[1], m[0]);
  return found;
}

/** Längeneinheit der Datei in Metern, aus `IfcUnitAssignment` (z. B. 0,001 für mm). */
export function lengthUnit(text: string): number {
  const assignment = /IFCUNITASSIGNMENT\s*\(\s*\(([^)]*)\)/i.exec(text)?.[1] ?? '';
  const refs = new Set(assignment.split(',').map((s) => s.trim()));
  for (const [id, line] of entities(text, 'IFCSIUNIT')) {
    if (!refs.has(id)) continue;
    const [, unitType, prefix] = args(line);
    if (unitType?.toUpperCase() === '.LENGTHUNIT.') {
      return PREFIX[prefix?.replace(/\./g, '').toUpperCase() ?? ''] ?? 1;
    }
  }
  return 1;
}

/**
 * Liest die Georeferenz aus dem IFC-Text. That Open übernimmt `IfcMapConversion` nicht in
 * die Fragments, deshalb direkt aus der Datei.
 */
export function parseMapConversion(text: string): MapConversion | null {
  const [line] = entities(text, 'IFCMAPCONVERSION').values();
  if (!line) return null;
  const [, target, e, n, h, xa, xo, s] = args(line);
  const abscissa = num(xa, 1);
  const ordinate = num(xo, 0);
  const length = Math.hypot(abscissa, ordinate) || 1;
  const crsLine = target ? entities(text, 'IFCPROJECTEDCRS').get(target) : undefined;
  const crsName = crsLine ? /^'([^']*)'/.exec(args(crsLine)[0] ?? '')?.[1] : undefined;
  return {
    eastings: num(e, 0),
    northings: num(n, 0),
    height: num(h, 0),
    cos: abscissa / length,
    sin: ordinate / length,
    scale: num(s, 1) / lengthUnit(text),
    crs: crsName || null,
  };
}

/** IFC-Koordinate (x Ost, y Nord, z Höhe; Meter) → Landeskoordinate. */
export function toMap(p: Vec3, mc: MapConversion): Vec3 {
  const [x, y, z] = p;
  return [
    mc.eastings + mc.scale * (mc.cos * x - mc.sin * y),
    mc.northings + mc.scale * (mc.sin * x + mc.cos * y),
    mc.height + mc.scale * z,
  ];
}
