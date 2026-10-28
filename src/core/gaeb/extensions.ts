// Dateiendungen von GAEB DA XML. Das ist GAEB-Wissen und steht deshalb hier und nicht
// in der Pipeline oder der Oberfläche (.claude/CLAUDE.md, Architektur): Aufrufer
// fragen, ob eine Datei nach GAEB aussieht, und kennen die Liste selbst nicht.

/** Endungen von GAEB DA XML (X81–X86) und das allgemeine `.xml`, klein, ohne Punkt. */
export const GAEB_ENDUNGEN = ['x81', 'x82', 'x83', 'x84', 'x85', 'x86', 'xml'] as const;

/** Endung eines Dateinamens, klein geschrieben und ohne Punkt; `null` ohne Endung. */
export function fileExtension(fileName: string): string | null {
  return /\.([^./\\]+)$/.exec(fileName)?.[1].toLowerCase() ?? null;
}

export function isGaebExtension(extension: string | null): boolean {
  return extension !== null && (GAEB_ENDUNGEN as readonly string[]).includes(extension);
}
