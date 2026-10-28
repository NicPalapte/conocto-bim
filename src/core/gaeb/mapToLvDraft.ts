// Übergang von der GAEB-Welt ins neutrale Zwischenmodell. Einzige Stelle, die
// beide Vokabulare kennt (docs/architecture/pipeline.md#neutrales-zwischenmodell).

import type {
  LotDraft,
  LVDraft,
  PositionDraft,
  PositionType,
  SectionDraft,
} from '../model/lvDraft';
import type { GaebItemType, ParsedLot, ParsedLV, ParsedPosition, ParsedSection } from './types';

/**
 * Mapping GAEB-Positionsart → PositionType, portiert aus der Tabelle des
 * archivierten `PyGAEBAdapter` (`archive/backend-mvp`,
 * `app/adapters/gaeb_adapter.py`).
 */
const POSITION_TYPE_BY_ITEM_TYPE: Record<GaebItemType, PositionType> = {
  Normal: 'NORMAL',
  LumpSum: 'NORMAL',
  Index: 'NORMAL',
  TextOnly: 'NORMAL',
  Alternative: 'ALTERNATIV',
  Eventual: 'BEDARF',
  BaseSurcharge: 'ZULAGENPOSITION',
  Supplement: 'ZULAGENPOSITION',
  Markup: 'ZULAGENPOSITION',
};

function mapPosition(position: ParsedPosition): PositionDraft {
  return {
    oz: position.oz,
    shortText: position.shortText,
    longText: position.longText,
    unit: position.unit,
    quantity: position.quantity,
    unitPrice: position.unitPrice,
    positionType: POSITION_TYPE_BY_ITEM_TYPE[position.itemType],
    ...(position.inputFields.length > 0 ? { inputFields: position.inputFields } : {}),
    // Wird erst von classify() befüllt, siehe docs/architecture/data-model.md.
    attributes: {},
  };
}

function mapSection(section: ParsedSection): SectionDraft {
  return {
    number: section.number,
    label: section.label,
    positions: section.positions.map(mapPosition),
    sections: section.sections.map(mapSection),
  };
}

function mapLot(lot: ParsedLot): LotDraft {
  return {
    number: lot.number,
    label: lot.label,
    sections: lot.sections.map(mapSection),
  };
}

/** ParsedLV → LVDraft; danach gibt es kein GAEB-Vokabular mehr. */
export function mapToLvDraft(parsed: ParsedLV): LVDraft {
  return {
    projectName: parsed.projectName,
    client: parsed.client,
    lots: parsed.lots.map(mapLot),
  };
}
