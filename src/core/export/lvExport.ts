// LV als JSON für Werkzeuge außerhalb des Browsers, z. B. das Matching-Labor
// bauonto (Entscheidung 0068). Jede Position trägt ihre Hashes, damit fremde
// Werkzeuge Kanten an dieselbe Position hängen wie Conocto (Entscheidung 0055).

import { hashPositions, POSITION_HASH_SCHEMA, type PositionHashes } from '../hash/positionHash';
import type { LVDraft, PositionDraft, SectionDraft } from '../model/lvDraft';

/** Schema-Kennung; ändert sich nur mit einer neuen Entscheidung. */
export const LV_EXPORT_SCHEMA = 'bubble-lv-export-v1';

export type LvExportPosition = Omit<PositionDraft, 'attributes'> & { hashes: PositionHashes };

export interface LvExportSection {
  number: string;
  label: string | null;
  positions: LvExportPosition[];
  sections: LvExportSection[];
}

export interface LvExportLot {
  number: string;
  label: string | null;
  sections: LvExportSection[];
}

export interface LvExport {
  schema: typeof LV_EXPORT_SCHEMA;
  positionHashSchema: typeof POSITION_HASH_SCHEMA;
  /** Datei-ID aus `fileIdOf` — dieselbe wie in Conoctos Links. */
  fileId: string;
  projectName: string | null;
  client: string | null;
  lots: LvExportLot[];
}

/**
 * LV mit Hashes in ein JSON-taugliches Objekt umwandeln.
 * `attributes` bleibt draußen: die Klassifizierung lebt im Viewer, nicht im Kern.
 */
export function toLvExport(draft: LVDraft, fileId: string): LvExport {
  const hashes = hashPositions(draft);
  const position = (p: PositionDraft): LvExportPosition => {
    const h = hashes.get(p);
    // hashPositions besucht jede Position des Drafts; fehlt eine, ist das ein Programmfehler.
    if (h === undefined) throw new Error(`Position ${p.oz} ohne Hash`);
    return {
      oz: p.oz,
      shortText: p.shortText,
      longText: p.longText,
      unit: p.unit,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      positionType: p.positionType,
      ...(p.inputFields === undefined ? {} : { inputFields: p.inputFields }),
      hashes: h,
    };
  };
  const section = (s: SectionDraft): LvExportSection => ({
    number: s.number,
    label: s.label,
    positions: s.positions.map(position),
    sections: s.sections.map(section),
  });
  return {
    schema: LV_EXPORT_SCHEMA,
    positionHashSchema: POSITION_HASH_SCHEMA,
    fileId,
    projectName: draft.projectName,
    client: draft.client,
    lots: draft.lots.map((lot) => ({
      number: lot.number,
      label: lot.label,
      sections: lot.sections.map(section),
    })),
  };
}
