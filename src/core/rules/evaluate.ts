// Der eine Auswerter für `conocto-rule-v1` (Entscheidung 0081). Reine Funktionen, kein
// Zustand: Doc ruft sie im Browser, bauonto über `npm run`-Befehle — so kann die
// Auswertung nie auseinanderlaufen.

import type { TextRange } from '../model/lvDraft';
import { compileStichworte } from '../text/stichwort';
import { sentenceAround } from '../text/sentence';
import {
  blocksOf,
  type RuleBlock,
  type RuleCondition,
  type RuleField,
  type RuleLinkSame,
  type RuleParam,
  type RulePositionKind,
  ruleAmountOf,
} from './rule';

/** Angaben einer Position für die Bausteine `einheit` und `feld`. */
export interface RuleFacts {
  readonly menge: number | null;
  readonly einheit: string | null;
  readonly art: RulePositionKind;
}

/** Die Texte einer Position, gegen die eine Regel läuft. */
export interface RuleText {
  readonly kurztext: string;
  readonly langtext: string;
  /** Text eines Begleit-PDFs (z. B. eine Seite), wenn die Regel dort sucht. */
  readonly pdf?: string;
  /** Fehlt, wenn nur Text vorliegt (PDF): dann trifft kein Baustein auf Angaben. */
  readonly angaben?: RuleFacts;
  /**
   * Normfundstellen je Text. Der Kern erkennt keine Normen selbst: die App hat dafür
   * ihren Extraktor, und zwei Erkenner würden auseinanderlaufen. Fehlt der Eintrag,
   * trifft der Baustein „Norm“ in diesem Text nichts.
   */
  readonly normen?: Partial<Record<RuleField, readonly TextRange[]>>;
}

/**
 * Ein Treffer: Bereich, in dem die Bedingung erfüllt ist, und die Fundstellen darin.
 * `position` = die Bedingung gilt für die Position als Ganzes (nur Angaben, kein Text).
 */
export interface RuleHit {
  readonly feld: RuleField | 'position';
  readonly start: number;
  readonly end: number;
  readonly marks: readonly TextRange[];
}

/** Feste Logik eines eingebauten Bausteins; liefert ihre Treffer selbst. */
export type BuiltinRule = (
  input: RuleText,
  parameter: Readonly<Record<string, RuleParam>>,
  wo: readonly RuleField[],
) => readonly RuleHit[];

/**
 * Was eine Regel außer den Texten braucht. Inhalte liefert der Aufrufer: Wortlisten und
 * Einheiten-Gruppen sind Wissen (CSV), eingebaute Logik steht in der App. Fehlt etwas,
 * trifft der Baustein nichts — kein Fehler.
 */
export interface RuleContext {
  /** Wortliste je Name; Einträge in der Schreibweise der Suchwörter (`#`, `*`). */
  readonly listen?: ReadonlyMap<string, readonly string[]>;
  /** Einheiten je Gruppe, z. B. „Stunde“ → h, Std, Stunde. */
  readonly einheitGruppen?: ReadonlyMap<string, readonly string[]>;
  readonly eingebaut?: ReadonlyMap<string, BuiltinRule>;
}

// Einheiten nur in ihrer Schreibweise — welche fachlich gleich sind, entscheidet die App.
const UNIT =
  'm³|m²|m3|m2|cbm|qm|lfdm|lfm|km|cm|mm|m|to|t|kg|Stück|Stck|Stk|St|psch|Std|h|l|ha|Wo|Mt';
// „1.050,5 m²“, „120 m“, „0,5 m3“; die Zahl beginnt nicht mitten in einem Wort.
const AMOUNT = new RegExp(
  `(?<![\\p{L}\\p{N}.,])(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,\\d+)?\\s?(${UNIT})\\.?(?![\\p{L}\\p{N}])`,
  'gu',
);

/** Schreibweise einer Einheit für den Vergleich: „m³“ = „m3“, „St.“ = „st“. */
export function unitSpellingOf(raw: string): string {
  const plain = raw.trim().replace(/²/g, '2').replace(/³/g, '3').replace(/\.+$/, '').toLowerCase();
  return { cbm: 'm3', qm: 'm2', stück: 'st', stck: 'st', stk: 'st', lfdm: 'lfm' }[plain] ?? plain;
}

const patterns = new Map<string, RegExp | null>();

function patternOf(begriff: string): RegExp | null {
  let pattern = patterns.get(begriff);
  if (pattern === undefined) {
    pattern = begriff.trim() === '' ? null : compileStichworte([begriff]);
    patterns.set(begriff, pattern);
  }
  return pattern;
}

// Je Liste einmal übersetzt; eine neue Liste (anderes Array) wird neu übersetzt.
const listPatterns = new WeakMap<readonly string[], RegExp | null>();

function listPatternOf(words: readonly string[]): RegExp | null {
  let pattern = listPatterns.get(words);
  if (pattern === undefined) {
    const used = words.filter((word) => word.trim() !== '');
    pattern = used.length === 0 ? null : compileStichworte(used);
    listPatterns.set(words, pattern);
  }
  return pattern;
}

function rangesOf(pattern: RegExp | null, text: string): TextRange[] {
  const out: TextRange[] = [];
  if (pattern === null) return out;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (match[0].length > 0) out.push({ start, end: start + match[0].length });
  }
  return out;
}

/** Bausteine, die eine Angabe der Position prüfen statt einen Text. */
const isFactBlock = (block: RuleBlock): boolean => 'einheit' in block || 'feld' in block;

/** Fundstellen eines Bausteins in einem Text; Angaben-Bausteine finden im Text nichts. */
export function findBlock(
  block: RuleBlock,
  text: string,
  normen: readonly TextRange[] = [],
  context: RuleContext = {},
): TextRange[] {
  if ('begriff' in block) return rangesOf(patternOf(block.begriff), text);
  if ('liste' in block) {
    const words = context.listen?.get(block.liste);
    return words === undefined ? [] : rangesOf(listPatternOf(words), text);
  }
  if ('menge' in block) {
    const out: TextRange[] = [];
    const wanted = block.menge.einheit === undefined ? null : unitSpellingOf(block.menge.einheit);
    for (const match of text.matchAll(AMOUNT)) {
      if (wanted !== null && unitSpellingOf(match[2]) !== wanted) continue;
      out.push({ start: match.index, end: match.index + match[0].length });
    }
    return out;
  }
  if ('norm' in block) return [...normen];
  return [];
}

/** Gilt ein Angaben-Baustein für die Position? Ohne Angaben nie. */
export function factHolds(
  block: RuleBlock,
  facts: RuleFacts | undefined,
  context: RuleContext = {},
): boolean {
  if (facts === undefined) return false;
  if ('einheit' in block) {
    const group = context.einheitGruppen?.get(block.einheit.gruppe);
    if (group === undefined || facts.einheit === null) return false;
    const unit = unitSpellingOf(facts.einheit);
    return unit !== '' && group.some((entry) => unitSpellingOf(entry) === unit);
  }
  if (!('feld' in block)) return false;
  if (block.feld === 'menge') {
    if (block.ist === 'leer') return facts.menge === null;
    const menge = facts.menge;
    return menge !== null && block.ist.some((entry) => ruleAmountOf(entry) === menge);
  }
  if (block.feld === 'einheit') {
    const unit = facts.einheit === null ? '' : unitSpellingOf(facts.einheit);
    if (block.ist === 'leer') return unit === '';
    return unit !== '' && block.ist.some((entry) => unitSpellingOf(entry) === unit);
  }
  return block.ist !== 'leer' && block.ist.includes(facts.art);
}

const inside = (range: TextRange, area: TextRange): boolean =>
  range.start >= area.start && range.end <= area.end;

const overlaps = (a: TextRange, b: TextRange): boolean => a.start < b.end && b.start < a.end;

function regionAround(condition: RuleCondition, text: string, anchor: TextRange): TextRange {
  const { bereich } = condition;
  if (bereich === 'feld') return { start: 0, end: text.length };
  if (bereich === 'satz') return sentenceAround(text, anchor.start, anchor.end);
  return {
    start: Math.max(0, anchor.start - bereich.zeichen),
    end: Math.min(text.length, anchor.end + bereich.zeichen),
  };
}

function textOf(input: RuleText, field: RuleField): string {
  if (field === 'kurztext') return input.kurztext;
  if (field === 'langtext') return input.langtext;
  return input.pdf ?? '';
}

function hitsInField(
  condition: RuleCondition,
  blocks: readonly RuleBlock[],
  field: RuleField,
  input: RuleText,
  context: RuleContext,
): RuleHit[] {
  const text = textOf(input, field);
  if (text === '' || blocks.length === 0) return [];
  const normen = input.normen?.[field] ?? [];
  const found = blocks.map((block) => findBlock(block, text, normen, context));
  const excluded = (condition.nicht ?? [])
    .filter((block) => !isFactBlock(block))
    .flatMap((block) => findBlock(block, text, normen, context));
  const all = condition.alle !== undefined;
  // Ankerpunkte: bei „alle“ reicht der seltenste Baustein, bei „eines“ jeder.
  const anchors = all
    ? found.reduce((rarest, list) => (list.length < rarest.length ? list : rarest))
    : found.flat().sort((a, b) => a.start - b.start);

  const out: RuleHit[] = [];
  for (const anchor of anchors) {
    if (out.some((hit) => inside(anchor, hit))) continue;
    const region = regionAround(condition, text, anchor);
    const within = found.map((list) => list.filter((range) => inside(range, region)));
    const ok = all ? within.every((list) => list.length > 0) : within.some((l) => l.length > 0);
    if (!ok || excluded.some((range) => overlaps(range, region))) continue;
    const marks = within.flat().sort((a, b) => a.start - b.start);
    out.push({ feld: field, start: region.start, end: region.end, marks });
    if (condition.bereich === 'feld') break;
  }
  return out;
}

const POSITION_HIT: RuleHit = { feld: 'position', start: 0, end: 0, marks: [] };

/**
 * Alle Treffer einer Bedingung in den Texten einer Position, je Text nach Lage sortiert.
 * Angaben-Bausteine (`einheit`, `feld`) gelten für die ganze Position: Bei „alle“ müssen
 * sie stimmen, damit die Texte zählen; ohne Text-Bausteine trifft dann die Position.
 * Bei „eines“ reicht ein stimmender Angaben-Baustein. Stimmt einer unter „nicht“, trifft
 * die Bedingung gar nicht.
 */
export function matchCondition(
  condition: RuleCondition,
  input: RuleText,
  context: RuleContext = {},
): RuleHit[] {
  const blocks = blocksOf(condition);
  const [first] = blocks;
  if (first !== undefined && 'eingebaut' in first) {
    const logic = context.eingebaut?.get(first.eingebaut);
    return logic === undefined ? [] : [...logic(input, first.parameter ?? {}, condition.wo)];
  }
  const nicht = condition.nicht ?? [];
  if (nicht.some((block) => isFactBlock(block) && factHolds(block, input.angaben, context))) {
    return [];
  }
  const facts = blocks.filter(isFactBlock);
  const texts = blocks.filter((block) => !isFactBlock(block));
  const holding = facts.filter((block) => factHolds(block, input.angaben, context));
  const textHits = (): RuleHit[] =>
    condition.wo.flatMap((field) => hitsInField(condition, texts, field, input, context));
  if (condition.alle !== undefined) {
    if (holding.length < facts.length) return [];
    if (texts.length > 0) return textHits();
    return facts.length > 0 ? [POSITION_HIT] : [];
  }
  // Texttreffer zuerst: Aufrufer nehmen oft den ersten Treffer und wollen die Fundstelle.
  const hits = textHits();
  return holding.length > 0 ? [...hits, POSITION_HIT] : hits;
}

/** Was der Auswerter von einer Position zum Verknüpfen braucht. */
export interface LinkCandidate {
  /** Knoten-ID der Sitzung oder Positions-Hash — der Aufrufer entscheidet. */
  readonly id: string;
  readonly text: RuleText;
  /** Schlüssel des Abschnitts, in dem die Position steht. */
  readonly abschnitt: string | null;
  readonly einheit: string | null;
}

export interface LinkSuggestion {
  readonly from: string;
  readonly to: string;
  readonly fromHit: RuleHit;
  readonly toHit: RuleHit;
}

/** So viele Paare liefert eine Regel höchstens — darüber ist sie zu allgemein. */
export const MAX_LINK_SUGGESTIONS = 500;

function groupKey(candidate: LinkCandidate, same: readonly RuleLinkSame[]): string | null {
  const parts: string[] = [];
  for (const entry of same) {
    const value =
      entry === 'abschnitt'
        ? candidate.abschnitt
        : candidate.einheit === null
          ? null
          : unitSpellingOf(candidate.einheit);
    if (value === null || value === '') return null;
    parts.push(value);
  }
  return parts.join('\u0000');
}

/**
 * Paare aus Positionen, die `from` treffen, und Positionen, die `to` treffen. Erst nach
 * `gleich` vorgruppiert, nie alle gegen alle (.claude/CLAUDE.md, Beziehungen). Jedes Paar
 * nur einmal, egal in welcher Richtung; eine Position nie mit sich selbst.
 */
export function suggestLinks(
  from: RuleCondition,
  to: RuleCondition,
  same: readonly RuleLinkSame[],
  candidates: readonly LinkCandidate[],
  limit = MAX_LINK_SUGGESTIONS,
  context: RuleContext = {},
): { readonly pairs: LinkSuggestion[]; readonly truncated: boolean } {
  // Ohne Vorgruppierung wären es alle gegen alle — dann lieber keine Vorschläge.
  if (same.length === 0) return { pairs: [], truncated: false };
  const targets = new Map<string, Array<{ id: string; hit: RuleHit }>>();
  for (const candidate of candidates) {
    const key = groupKey(candidate, same);
    if (key === null) continue;
    const hit = matchCondition(to, candidate.text, context)[0];
    if (hit === undefined) continue;
    const list = targets.get(key) ?? [];
    list.push({ id: candidate.id, hit });
    targets.set(key, list);
  }
  const pairs: LinkSuggestion[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = groupKey(candidate, same);
    const group = key === null ? undefined : targets.get(key);
    if (group === undefined) continue;
    const fromHit = matchCondition(from, candidate.text, context)[0];
    if (fromHit === undefined) continue;
    for (const target of group) {
      if (target.id === candidate.id) continue;
      const pair =
        candidate.id < target.id ? `${candidate.id}|${target.id}` : `${target.id}|${candidate.id}`;
      if (seen.has(pair)) continue;
      if (pairs.length >= limit) return { pairs, truncated: true };
      seen.add(pair);
      pairs.push({ from: candidate.id, to: target.id, fromHit, toHit: target.hit });
    }
  }
  return { pairs, truncated: false };
}
