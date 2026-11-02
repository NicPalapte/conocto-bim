// Schreibweise der Stichworte (docs/setup/materialwissen.md), für Excel gedacht:
//   `*`   beliebig viele Buchstaben oder Ziffern  („beton*" trifft „Betonwand")
//   `#`   eine Zahl                               („C#/#" trifft „C30/37")
//   ` `   beliebiger Leerraum, auch Zeilenumbruch
// Alles andere gilt wörtlich, ohne Rücksicht auf Groß-/Kleinschreibung. Ein
// Stichwort trifft nur ganze Wörter: „beton" trifft nicht „Betonstahl".
// Im Kern, weil Materialtabellen, gelernte Begriffe und Regeln (conocto-rule-v1) sie teilen.

/** Buchstabe oder Ziffer, auch Umlaute — die Wortgrenze der Stichworte. */
export const WORD_CHAR = '[\\p{L}\\p{N}]';

// `**` oder `##` hintereinander zählen wie eines: zwei gleiche Wiederholungen in
// Folge lassen den Regex auf langen Texten ohne Treffer stark zurückspringen.
/** Ein Stichwort als Regex-Quelltext, ohne Wortgrenzen. */
export function stichwortSource(stichwort: string): string {
  let source = '';
  const append = (part: string): void => {
    if (!source.endsWith(part)) source += part;
  };
  for (const char of stichwort.trim()) {
    if (char === '*') append(`${WORD_CHAR}*`);
    else if (char === '#') append('\\d+');
    else if (/\s/.test(char)) {
      append('\\s+');
    }
    // Mit dem Flag `u` darf nur ein Syntaxzeichen escapt werden — „\-" wäre ein Fehler.
    else source += char.replace(/[.+?^${}()|[\]\\/]/g, '\\$&');
  }
  return source;
}

/**
 * Ein Suchmuster aus allen Stichworten einer Zelle. Längere Stichworte stehen
 * vorn, damit „stahlbeton*" vor „beton*" greift und die ganze Fundstelle trägt.
 * `null`, wenn die Zelle leer ist.
 */
export function compileStichworte(stichworte: readonly string[]): RegExp | null {
  if (stichworte.length === 0) return null;
  const sources = [...stichworte].sort((a, b) => b.length - a.length).map(stichwortSource);
  return new RegExp(`(?<!${WORD_CHAR})(?:${sources.join('|')})(?!${WORD_CHAR})`, 'giu');
}

/**
 * Die Stichworte als Alternative ohne Wortgrenzen — für Muster, die der Code um
 * die Stichworte herum baut („Fabrikat:" gefolgt von einer Lücke).
 */
export function stichwortQuelle(stichworte: readonly string[]): string | null {
  if (stichworte.length === 0) return null;
  return [...stichworte]
    .sort((a, b) => b.length - a.length)
    .map(stichwortSource)
    .join('|');
}
