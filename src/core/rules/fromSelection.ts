// Regel aus einer markierten Textstelle (Entscheidung 0081): Mengen werden zum Baustein
// „Menge“, die tragenden Wörter zu Begriffen. Nur ein Vorschlag für den Editor — die
// Regel speichert danach nur diese Wörter, nie die markierte Stelle selbst.

import { findBlock } from './evaluate';
import type { RuleBlock } from './rule';

/** Bis zu so vielen Wörtern bleibt die Markierung ein einziger Begriff. */
const PHRASE_WORDS = 3;
/** So viele Begriffe macht eine lange Markierung höchstens. */
const MAX_WORDS = 3;
const MIN_WORD = 4;

/** Füllwörter, die als Begriff nichts tragen. */
const FILLERS = new Set(
  `
  aller alle allem einer eines einem einen dieser diese dieses sind wird werden nach über
  unter sowie oder auch ohne beim gemäß inkl einschl einschließlich ggf bzw mind etwa
  zwischen gesamt insgesamt herstellen liefern einbauen ausführen bauseits nicht keine
  `
    .trim()
    .split(/\s+/),
);

const tidy = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?()„“"'-]+|[\s.,;:!?()„“"'-]+$/g, '')
    .trim();

/** Zahlen in einem Wort werden `#`: „C30/37“ → „C#/#“. */
const asPattern = (word: string): string => word.replace(/\d+(?:[.,]\d+)?/g, '#');

/** Bausteine für die Bedingung aus einer Markierung; leer, wenn nichts Brauchbares darin ist. */
export function blocksFromSelection(selection: string): RuleBlock[] {
  const amounts = findBlock({ menge: {} }, selection);
  const blocks: RuleBlock[] = amounts.length > 0 ? [{ menge: {} }] : [];
  let rest = selection;
  for (const amount of [...amounts].reverse()) {
    rest = `${rest.slice(0, amount.start)} ${rest.slice(amount.end)}`;
  }
  const phrase = tidy(rest);
  if (phrase === '') return blocks;
  const words = phrase.split(' ');
  if (words.length <= PHRASE_WORDS) return [{ begriff: asPattern(phrase) }, ...blocks];

  const picked: string[] = [];
  const carrying = words
    .map(tidy)
    .filter((word) => word.length >= MIN_WORD && !FILLERS.has(word.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  for (const word of carrying) {
    if (picked.length >= MAX_WORDS) break;
    if (!picked.some((other) => other.toLowerCase() === word.toLowerCase())) picked.push(word);
  }
  // In der Reihenfolge der Markierung, damit der Satz im Editor lesbar bleibt.
  picked.sort((a, b) => phrase.indexOf(a) - phrase.indexOf(b));
  return [...picked.map((word) => ({ begriff: asPattern(word) })), ...blocks];
}
