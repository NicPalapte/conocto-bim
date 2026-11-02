// Satzgrenzen in LV- und Dokumenttext. Eine Logik für Vorschläge im PDF (Entscheidung
// 0080) und Regeln (conocto-rule-v1, Entscheidung 0081): Langtexte haben oft keine
// sauberen Sätze, Punkte stehen in Zahlen („1.050“) und Abkürzungen („rd.“, „ca.“).

/** So weit reicht ein Satz höchstens in jede Richtung um die Fundstelle. */
export const SENTENCE_REACH = 200;

/**
 * Satz um eine Fundstelle `from`…`to`: bis zu Satzzeichen mit Leerraum und folgendem
 * Großbuchstaben (Punkte in Zahlen und „ca. 200“ trennen nicht), höchstens
 * `SENTENCE_REACH` Zeichen.
 */
export function sentenceAround(
  text: string,
  from: number,
  to: number,
): { start: number; end: number } {
  let start = Math.max(0, from - SENTENCE_REACH);
  const before = text.slice(start, from);
  const breaks = [...before.matchAll(/[.!?;:]\s+(?=\p{Lu})/gu)];
  const last = breaks.at(-1);
  if (last !== undefined) start += last.index + last[0].length;
  else if (start > 0) start += before.search(/\s\S/) + 1;
  // Der Punkt nach der Einheit („m³.“) gehört schon zur Menge und kann den Satz beenden.
  const scan = text[to - 1] === '.' ? to - 1 : to;
  const limit = Math.min(text.length, to + SENTENCE_REACH);
  const after = text.slice(scan, limit);
  // „rd. 1.050“ oder „ca. 20“: ein Punkt beendet den Satz nur vor einem Großbuchstaben.
  const stop = /[.!?;](?=\s+\p{Lu}|\s*$)/u.exec(after);
  let end = stop === null ? limit : scan + stop.index + 1;
  if (stop === null && limit < text.length) {
    const space = after.lastIndexOf(' ');
    if (space > 0) end = scan + space;
  }
  while (start < from && /\s/.test(text[start])) start++;
  while (end > to && /\s/.test(text[end - 1])) end--;
  return { start: Math.min(start, from), end: Math.max(end, to) };
}
