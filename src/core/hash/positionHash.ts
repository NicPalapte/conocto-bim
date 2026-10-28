// Inhalts-Hashes je Position: Adresse für teilbare Links und Grundlage für den
// späteren Fassungsvergleich (docs/decisions/0055-positions-hash.md).
//
// Der Hash hängt nur am Inhalt der Datei, nie an der Klassifizierung, am Preis
// oder an Notizen: neue Regeln oder eine bepreiste Fassung (X84 statt X83)
// ändern ihn nicht.

import type { LVDraft, PositionDraft, SectionDraft } from '../model/lvDraft';
import { sha256Hex, sha256HexOfText } from './sha256';

/** Länge des Positions-Hashes im Link (40 Bit — genug für eine Datei). */
const ID_LENGTH = 10;
/** Länge der Teil-Hashes; nie im Link, nur für den Vergleich. */
const PART_LENGTH = 16;
/** Länge der Datei-ID im Link. */
const FILE_ID_LENGTH = 12;
/** Version der Normierung. Ändert sich die Normierung, ändern sich alle Hashes. */
export const POSITION_HASH_SCHEMA = 'bubble-pos-v1';

export interface PositionHashes {
  /** Gesamt-Hash, eindeutig in der Datei; bei Gleichstand mit `-2`, `-3` … */
  id: string;
  /** OZ allein — gleich ⇒ gleiche Nummer. */
  oz: string;
  /** Kurz- + Langtext — gleich ⇒ gleicher Wortlaut (Leerraum normiert). */
  text: string;
  /** Menge + Einheit. */
  menge: string;
}

/** Leerraum zusammenfassen: Zeilenumbrüche und Einrückung sind Formatierung, kein Inhalt. */
function normText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Einheit wie in Prüfregel V7: ohne Groß/klein und ohne Punkt am Ende. */
function normUnit(unit: string | null): string {
  return (unit ?? '').trim().toLowerCase().replace(/\.+$/, '');
}

function normQuantity(quantity: number | null): string {
  // `String` ist für Zahlen im Sprachstandard festgelegt — überall gleich.
  return quantity === null ? '' : String(quantity);
}

function part(fields: readonly string[], length: number): string {
  return sha256HexOfText(JSON.stringify([POSITION_HASH_SCHEMA, ...fields])).slice(0, length);
}

/** Hashes einer einzelnen Position, noch ohne Eindeutigkeits-Zusatz. */
export function hashPosition(position: PositionDraft): PositionHashes {
  const unit = normUnit(position.unit);
  const quantity = normQuantity(position.quantity);
  const oz = part([position.oz.trim()], PART_LENGTH);
  const text = part(
    [`${normText(position.shortText)}\n${normText(position.longText)}`],
    PART_LENGTH,
  );
  const menge = part([quantity, unit], PART_LENGTH);
  // Der Gesamt-Hash setzt sich aus den Teil-Hashes zusammen: der Langtext — der
  // teure Teil — wird so nur einmal gehasht.
  return { id: part([oz, text, menge, position.positionType], ID_LENGTH), oz, text, menge };
}

/** Alle Positionen in Dateireihenfolge: Lose, je Abschnitt erst Positionen, dann Unterabschnitte. */
function positionsOf(draft: LVDraft): PositionDraft[] {
  const result: PositionDraft[] = [];
  const visit = (sections: readonly SectionDraft[]): void => {
    for (const section of sections) {
      for (const position of section.positions) result.push(position);
      visit(section.sections);
    }
  };
  for (const lot of draft.lots) visit(lot.sections);
  return result;
}

/**
 * Hashes aller Positionen. Zwei Positionen mit gleichem Inhalt (oder ein
 * zufälliger Gleichstand der gekürzten Hashes) unterscheidet die
 * Dateireihenfolge: die zweite bekommt `-2`.
 */
export function hashPositions(draft: LVDraft): Map<PositionDraft, PositionHashes> {
  const result = new Map<PositionDraft, PositionHashes>();
  const seen = new Map<string, number>();
  for (const position of positionsOf(draft)) {
    const hashes = hashPosition(position);
    const count = (seen.get(hashes.id) ?? 0) + 1;
    seen.set(hashes.id, count);
    result.set(position, count === 1 ? hashes : { ...hashes, id: `${hashes.id}-${count}` });
  }
  return result;
}

/** Datei-ID: die ersten Zeichen des SHA-256 der Original-Bytes. */
export function fileIdOf(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return sha256Hex(data).slice(0, FILE_ID_LENGTH);
}
