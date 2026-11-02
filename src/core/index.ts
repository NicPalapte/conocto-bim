// Öffentliche Oberfläche des Kerns (@core). Die App importiert ausschließlich
// von hier — nie aus einem der internen Module.

export * from './model/lvDraft';
export * from './model/graph';
export * from './gaeb';
export {
  fileIdOf,
  hashPosition,
  hashPositions,
  POSITION_HASH_SCHEMA,
  type PositionHashes,
} from './hash/positionHash';
export {
  LV_EXPORT_SCHEMA,
  toLvExport,
  type LvExport,
  type LvExportLot,
  type LvExportPosition,
  type LvExportSection,
} from './export/lvExport';
export { compileStichworte, stichwortQuelle, stichwortSource, WORD_CHAR } from './text/stichwort';
export { SENTENCE_REACH, sentenceAround } from './text/sentence';
export * from './rules/rule';
export * from './rules/evaluate';
export { blocksFromSelection } from './rules/fromSelection';
