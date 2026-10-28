// Öffentliche Oberfläche des GAEB-Adapters. Aufrufer importieren ausschließlich
// von hier — nie aus parser.ts oder einem der internen Module.

export { GAEBParseError, GAEBValidationError, GAEBVersionError } from './errors';
export { getGaebParser } from './parser';
export type { GaebInput, GaebParser } from './parser';
export { fileExtension, GAEB_ENDUNGEN, isGaebExtension } from './extensions';
export { mapToLvDraft } from './mapToLvDraft';
export type { GaebItemType, ParsedLot, ParsedLV, ParsedPosition, ParsedSection } from './types';
