// Projekt-Graph: Knoten und Kanten zwischen LV, Dokumenten und Fachbegriffen
// (Entscheidung 0060). Nur das Modell — noch kein Code erzeugt Kanten.
// Kein GAEB- und kein UI-Vokabular; Speicherung und Darstellung liegen in der App.

/** Was ein Knoten ist. Neue Arten nur mit Eintrag in Entscheidung 0060. */
export type GraphNodeKind =
  | 'dokument' // eine geladene Datei: LV, Baubeschreibung, Vorbemerkungen, Plan
  | 'kapitel' // Abschnitt eines Dokuments mit Nummer oder Überschrift
  | 'position' // LV-Position, Schlüssel = Positions-Hash (Entscheidung 0055)
  | 'anforderung' // einzelne Vorgabe aus einem Text, z. B. "Sichtbeton SB3"
  | 'norm' // DIN, DIN EN, ZTV …, Schlüssel = normierte Bezeichnung
  | 'material' // Eintrag aus den Materialtabellen (Entscheidung 0045)
  | 'frist'; // Termin- oder Fristangabe
// Bewusst noch kein 'bauteil': erst wenn die Bauteilerkennung verlässlich läuft (0052, 0060).

/** Wie zwei Knoten zusammenhängen. Richtung: von → nach. */
export type GraphEdgeKind =
  | 'gehoert_zu' // Kapitel → Dokument, Position → Dokument
  | 'verweist_auf' // ausdrücklicher Verweis im Text, z. B. "gem. Baubeschreibung 3.2"
  | 'fordert' // Position/Kapitel → Anforderung
  | 'nennt_norm' // Position/Kapitel/Anforderung → Norm
  | 'betrifft' // Position/Kapitel/Anforderung → Material oder Frist
  | 'aehnlichkeit' // inhaltlich ähnlich, ungerichtet gemeint
  | 'abweichung'; // zwei Angaben passen nicht zusammen; Hinweis, kein Urteil (0049)

/** Wer eine Kante gefunden hat. Steuert, wie sicher sie gilt. */
export type EdgeSource =
  | 'struktur' // folgt aus dem Aufbau der Datei (Gliederung, Zugehörigkeit)
  | 'regel' // regelbasierter Extraktor
  | 'aehnlichkeit' // berechneter Vorschlag (Wortmenge, später Embeddings)
  | 'ki' // Sprachmodell; Vorgriff, heute out of scope (0060), nur nach Nutzerfreigabe
  | 'nutzer'; // von Hand gesetzt

/** Ob eine Kante gilt. Vorschläge erscheinen anders als Fakten. */
export type EdgeStatus = 'vorschlag' | 'bestaetigt' | 'verworfen';

/** Textstelle in einem Dokument, die eine Kante belegt. */
export interface Fundstelle {
  /** Knoten-ID des Dokuments oder der Position, in deren Text die Stelle liegt. */
  nodeId: string;
  /** Zeichen-Index, inklusiv. */
  start: number;
  /** Zeichen-Index, exklusiv. */
  end: number;
  /** Gefundener Text, z. B. "gem. Baubeschreibung Ziff. 3.2". */
  label: string;
}

export interface GraphNode {
  /** Stabile ID aus `graphNodeId(kind, key)`. */
  id: string;
  kind: GraphNodeKind;
  /** Anzeigename, z. B. "DIN EN 1536" oder "3.2 Bohrpfähle". */
  label: string;
  /** Zusatzangaben je Art, z. B. `{ klasse: 'C30/37' }` bei Material. */
  attributes?: Record<string, unknown>;
}

export interface GraphEdge {
  /** Stabile ID aus `graphEdgeId(kind, from, to)`. */
  id: string;
  kind: GraphEdgeKind;
  from: string;
  to: string;
  source: EdgeSource;
  status: EdgeStatus;
  /** 0 … 1. Strukturkanten und Nutzerkanten haben 1. */
  confidence: number;
  /** Belegstellen. Leer nur bei Strukturkanten. */
  fundstellen: Fundstelle[];
  /** Version der Regel oder des Modells, das die Kante erzeugt hat, z. B. "verweise@1". */
  producer?: string;
  /**
   * Gegenüberstellung bei `abweichung`: welcher Wert wo steht,
   * z. B. `{ merkmal: 'beton', werte: ['C30/37', 'C25/30'] }`.
   */
  detail?: Record<string, unknown>;
}

export interface ProjectGraph {
  /** Schema-Kennung; ändert sich nur mit einer neuen Entscheidung. */
  schema: 'bubble-graph-v1';
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Ungerichtete Arten: `from`/`to` werden für die ID sortiert. */
const UNDIRECTED: ReadonlySet<GraphEdgeKind> = new Set(['aehnlichkeit', 'abweichung']);

/**
 * Knoten-ID aus Art und fachlichem Schlüssel.
 * Schlüssel: Positions-Hash (`hashes.id`), Datei-ID (`fileIdOf`), Dokument-ID + Kapitelnummer
 * ("a1b2c3:3.2"), Norm ("DIN EN 1536"), Materialschlüssel aus der Tabelle.
 * Normen werden hier großgeschrieben, damit "din en 1536" und "DIN EN 1536" ein Knoten sind.
 * `%` und `|` werden maskiert: `|` trennt in `graphEdgeId`, Kanten-IDs bleiben eindeutig.
 */
export function graphNodeId(kind: GraphNodeKind, key: string): string {
  const flat = key.trim().replace(/\s+/g, ' ');
  const norm = kind === 'norm' ? flat.toUpperCase() : flat;
  return `${kind}:${norm.replace(/%/g, '%25').replace(/\|/g, '%7C')}`;
}

/** Kanten-ID: dieselbe Beziehung zwischen denselben Knoten gibt es nur einmal. */
export function graphEdgeId(kind: GraphEdgeKind, from: string, to: string): string {
  const [a, b] = UNDIRECTED.has(kind) && to < from ? [to, from] : [from, to];
  return `${kind}|${a}|${b}`;
}
