// Fehlertypen der GAEB-Adaptergrenze (docs/architecture/pipeline.md#fehlerbehandlung).
// Sie werden geworfen, nicht verschluckt; die Upload-Komponente zeigt sie an.

/**
 * `complete: true` kennzeichnet eine Meldung, die schon ein fertiger Satz mit
 * eigenem nächsten Schritt ist („Die Datei x.x83 ist leer."). Alle anderen sind
 * Bruchstücke; `describeFailure` (pipeline/messages.ts) hängt ihnen den Hinweis zur
 * Fehlerart an. Das steht bewusst im Fehler und wird nicht aus dem Text erraten.
 */
export interface GaebErrorOptions extends ErrorOptions {
  complete?: boolean;
}

/** Datei ist nicht lesbar/kein wohlgeformtes XML. */
export class GAEBParseError extends Error {
  readonly complete: boolean;

  constructor(message: string, options?: GaebErrorOptions) {
    super(message, options);
    this.name = 'GAEBParseError';
    this.complete = options?.complete ?? false;
  }
}

/** Datei ist wohlgeformt, aber keine verwertbare GAEB-LV-Struktur. */
export class GAEBValidationError extends Error {
  readonly complete: boolean;

  constructor(message: string, options?: GaebErrorOptions) {
    super(message, options);
    this.name = 'GAEBValidationError';
    this.complete = options?.complete ?? false;
  }
}

/** GAEB-Version außerhalb des unterstützten Bereichs. */
export class GAEBVersionError extends Error {
  readonly complete: boolean;

  constructor(message: string, options?: GaebErrorOptions) {
    super(message, options);
    this.name = 'GAEBVersionError';
    this.complete = options?.complete ?? false;
  }
}
