// GAEB-nahes Zwischenergebnis des Parsers. Diese Typen verlassen die
// Adaptergrenze nie — nach mapToLvDraft() gibt es nur noch LVDraft
// (docs/architecture/pipeline.md#gaeb-parser-grenze).

import type { TextRange } from './text';

/**
 * Positionsart im GAEB-Vokabular. Namen und Wertebereich entsprechen der
 * Mapping-Tabelle des archivierten `PyGAEBAdapter` (`archive/backend-mvp`),
 * damit die Feldabdeckung nachvollziehbar bleibt. `XmlGaebParser` erkennt aus
 * GAEB DA XML 3.x die Typen `Normal`, `LumpSum`, `Alternative`, `Eventual`,
 * `Index` und `Markup`; die übrigen stammen aus älteren Austauschphasen.
 */
export type GaebItemType =
  | 'Normal'
  | 'LumpSum'
  | 'Alternative'
  | 'Eventual'
  | 'Index'
  | 'TextOnly'
  | 'BaseSurcharge'
  | 'Supplement'
  | 'Markup';

export interface ParsedPosition {
  /** Vollständige OZ inkl. Bereichs-/Los-Segmenten, z. B. "001.002.0050". */
  oz: string;
  shortText: string;
  longText: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  itemType: GaebItemType;
  /** Bieter-Eingabefelder (<TextComplement Kind="Bidder">) als Bereiche im Langtext. */
  inputFields: TextRange[];
}

export interface ParsedSection {
  /** Vollständige Bereichsnummer (Pfad), z. B. "001.002". */
  number: string;
  label: string | null;
  positions: ParsedPosition[];
  sections: ParsedSection[];
}

export interface ParsedLot {
  /** Losnummer; leer, wenn die Datei keine Los-Ebene hat. */
  number: string;
  label: string | null;
  sections: ParsedSection[];
}

export interface ParsedLV {
  projectId: string | null;
  projectName: string | null;
  client: string | null;
  /** Eröffnungstermin als Rohwert aus der Datei (ISO-Datum). */
  deadline: string | null;
  gaebVersion: string;
  /** Datenaustauschphase, z. B. "83". */
  dataPhase: string | null;
  lots: ParsedLot[];
}
