// Regelformat `conocto-rule-v1` (Entscheidung 0081): eine Regel ist ein kleiner JSON-Eintrag,
// den Doc im Browser und bauonto per Befehl gleich auswerten. Eine Regel enthält nur
// Begriffe, Muster und Einstellungen — nie Text aus einem LV oder einer Baubeschreibung.
//
// Bedingung = Bausteine (Begriff, Menge, Norm) + „alle“/„eines“ + Ausschluss „nicht“,
// dazu wie nah die Teile stehen müssen (Satz, Zeichenabstand, ganzer Text) und in
// welchem Text gesucht wird. Wirkung = hervorheben oder Positionen verknüpfen.
//
// Ein Regelformat für alles (Entscheidung 0085): dazu Wortlisten, Einheiten-Gruppen,
// Angaben der Position und eingebaute Bausteine mit fester Logik; Suchort PDF;
// Wirkungen Prüfhinweis und Verknüpfen mit einer Stelle im PDF. Ältere Versionen lesen
// solche Regeln nicht ein (`toRule` → `null`) und laufen ohne sie weiter.

export const RULE_SCHEMA = 'conocto-rule-v1';

/** Angabe einer Position, die der Baustein `feld` prüft. */
export type RuleFact = 'menge' | 'einheit' | 'art';

export const RULE_FACTS: readonly RuleFact[] = ['menge', 'einheit', 'art'];

/** Art der Position, wie `feld: "art"` sie nennt. */
export type RulePositionKind = 'normal' | 'alternativ' | 'bedarf' | 'zulage';

export const RULE_POSITION_KINDS: readonly RulePositionKind[] = [
  'normal',
  'alternativ',
  'bedarf',
  'zulage',
];

/** Wert eines Parameters an einem eingebauten Baustein. */
export type RuleParam = string | number | boolean | readonly string[];

/** Ein Baustein der Bedingung. Schreibweise des Begriffs wie in den Materialtabellen. */
export type RuleBlock =
  | { readonly begriff: string }
  /** Zahl mit Mengeneinheit; mit `einheit` nur diese Einheit. */
  | { readonly menge: { readonly einheit?: string } }
  /** Normbezeichnung; die Fundstellen liefert der Aufrufer (`RuleText.normen`). */
  | { readonly norm: Record<string, never> }
  /** Ein Wort aus einer Wortliste; die Listen liefert der Aufrufer (`RuleContext.listen`). */
  | { readonly liste: string }
  /** Einheit der Position liegt in einer Gruppe (`RuleContext.einheitGruppen`). */
  | { readonly einheit: { readonly gruppe: string } }
  /**
   * Angabe der Position fehlt (`leer`) oder hat einen der Werte. Eine Menge 0 ist nicht
   * leer: dafür `{ feld: "menge", ist: ["0"] }`.
   */
  | { readonly feld: RuleFact; readonly ist: 'leer' | readonly string[] }
  /**
   * Feste Logik im Code, nur Name und Parameter stehen in der Regel. Steht allein in der
   * Bedingung; die Logik liefert der Aufrufer (`RuleContext.eingebaut`).
   */
  | { readonly eingebaut: string; readonly parameter?: Readonly<Record<string, RuleParam>> };

export type RuleBlockKind =
  'begriff' | 'menge' | 'norm' | 'liste' | 'einheit' | 'feld' | 'eingebaut';

/** Welcher Baustein das ist — für Anzeige und Auswerter an einer Stelle entschieden. */
export function blockKindOf(block: RuleBlock): RuleBlockKind {
  if ('begriff' in block) return 'begriff';
  if ('menge' in block) return 'menge';
  if ('norm' in block) return 'norm';
  if ('liste' in block) return 'liste';
  if ('einheit' in block) return 'einheit';
  if ('feld' in block) return 'feld';
  return 'eingebaut';
}

/** Die Texte einer Position; der Editor bietet nur diese an. */
export type RulePositionField = 'kurztext' | 'langtext';

/** Wo gesucht wird: Texte der Position oder der Text eines geöffneten Begleit-PDFs. */
export type RuleField = RulePositionField | 'pdf';

export const RULE_FIELDS: readonly RulePositionField[] = ['kurztext', 'langtext'];

const ALL_FIELDS: readonly RuleField[] = [...RULE_FIELDS, 'pdf'];

/** Wie nah die Teile beieinander stehen müssen. */
export type RuleRange = 'satz' | 'feld' | { readonly zeichen: number };

export interface RuleCondition {
  /** Genau eines von `alle` und `eines` ist gesetzt. */
  readonly alle?: readonly RuleBlock[];
  readonly eines?: readonly RuleBlock[];
  /** Steht einer dieser Bausteine im selben Bereich, zählt der Treffer nicht. */
  readonly nicht?: readonly RuleBlock[];
  readonly bereich: RuleRange;
  readonly wo: readonly RuleField[];
}

/** `aus` = nie hervorheben: nimmt jede Fundstelle weg, die der Treffer berührt. */
export type RuleHighlight = 'wichtig' | 'material' | 'masse' | 'aus';

export const RULE_HIGHLIGHTS: readonly RuleHighlight[] = ['wichtig', 'material', 'masse', 'aus'];

/** Was zwei verknüpfte Positionen gemeinsam haben müssen. Vorgruppierung, kein All-Paare. */
export type RuleLinkSame = 'abschnitt' | 'einheit';

/**
 * Positionen, die `bedingung` treffen, mit Positionen verknüpfen, die `ziel` treffen.
 * `gleich` hat mindestens einen Eintrag.
 */
export interface RulePositionLink {
  readonly ziel: RuleCondition;
  readonly gleich: readonly RuleLinkSame[];
}

/** Stellen im PDF, die `bedingung` trifft, zum Verknüpfen mit einer Position vorschlagen. */
export interface RulePdfLink {
  readonly ziel: 'pdf';
}

export type RuleHintCategory = 'geld' | 'menge' | 'risiko' | 'norm' | 'frist' | 'vob';

export const RULE_HINT_CATEGORIES: readonly RuleHintCategory[] = [
  'geld',
  'menge',
  'risiko',
  'norm',
  'frist',
  'vob',
];

export type RuleHintSeverity = 'hinweis' | 'beachten';

/** Ob der Norm-Verweis fachlich geprüft ist (wie Spalte `norm_stand` der Prüfregeln). */
export type RuleNormState = 'bestaetigt' | 'zu_bestaetigen';

/**
 * Hinweis in „Prüfung“ — nie ein Urteil. Den Norm-Verweis nennt eine Regel, wo es einen gibt;
 * ohne Verweis steht sie ohne (z. B. eine Kennzahl aus der Datei). Erfunden wird keiner.
 */
export interface RuleCheckHint {
  readonly kategorie: RuleHintCategory;
  readonly schwere: RuleHintSeverity;
  readonly text: string;
  readonly norm?: { readonly verweis: string; readonly stand: RuleNormState };
}

export type RuleEffect =
  | { readonly hervorheben: RuleHighlight }
  | { readonly verknuepfen: RulePositionLink | RulePdfLink }
  | { readonly pruefhinweis: RuleCheckHint };

/** Verknüpft die Regel Positionen untereinander (nicht mit dem PDF)? */
export function positionLinkOf(effect: RuleEffect): RulePositionLink | null {
  if (!('verknuepfen' in effect)) return null;
  const link = effect.verknuepfen;
  return link.ziel === 'pdf' ? null : (link as RulePositionLink);
}

/** `allgemein` = Grundstock für alle Firmen, `unternehmen` = eigene Regel. */
export type RuleScope = 'allgemein' | 'unternehmen';

export type RuleStatus = 'entwurf' | 'freigegeben' | 'aus';

export type RuleOrigin = 'nutzer' | 'mining' | 'ki';

export interface Rule {
  readonly schema: typeof RULE_SCHEMA;
  /** Kleinbuchstaben, Ziffern und `-`; mit `version` die Kennung `id@version`. */
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly bedingung: RuleCondition;
  readonly wirkung: RuleEffect;
  readonly geltung: RuleScope;
  readonly status: RuleStatus;
  readonly herkunft: RuleOrigin;
  readonly bemerkung?: string;
}

/** Datei `regeln.json`: Grundstock im Repo und Austausch zwischen Browsern. */
export interface RuleFile {
  readonly schema: typeof RULE_SCHEMA;
  readonly regeln: readonly Rule[];
}

/** Kennung für `producer` an Verknüpfungen, z. B. „bauteil-menge@1“. */
export function ruleKey(rule: Pick<Rule, 'id' | 'version'>): string {
  return `${rule.id}@${rule.version}`;
}

export function blocksOf(condition: RuleCondition): readonly RuleBlock[] {
  return condition.alle ?? condition.eines ?? [];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const RULE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_BLOCKS = 12;
const MAX_TEXT = 200;
const MAX_REACH = 2000;
const MAX_HINT = 1000;
const MAX_PARAMS = 20;
const MAX_VALUES = 50;

/** Menge aus einer Regel, z. B. „0“ oder „2,5“; sonst `null` (kein „0x10“, kein „1e3“). */
export function ruleAmountOf(text: string): number | null {
  return /^-?\d+(?:[.,]\d+)?$/.test(text.trim()) ? Number(text.trim().replace(',', '.')) : null;
}

const nameOf = (value: unknown): string | null =>
  typeof value === 'string' && RULE_ID.test(value) ? value : null;

function toStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_VALUES) return null;
  const out = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '' && entry.length <= MAX_TEXT);
  return out.length === value.length ? out : null;
}

function toParams(value: unknown): Record<string, RuleParam> | null {
  if (value === undefined) return {};
  if (!isObject(value) || Object.keys(value).length > MAX_PARAMS) return null;
  const out: Record<string, RuleParam> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (nameOf(key) === null) return null;
    if (typeof entry === 'number' && Number.isFinite(entry)) out[key] = entry;
    else if (typeof entry === 'boolean') out[key] = entry;
    else if (typeof entry === 'string' && entry.length <= MAX_TEXT) out[key] = entry;
    else {
      const list = toStrings(entry);
      if (list === null) return null;
      out[key] = list;
    }
  }
  return out;
}

function toFact(value: Record<string, unknown>): RuleBlock | null {
  const feld = RULE_FACTS.find((fact) => fact === value.feld);
  if (feld === undefined) return null;
  if (value.ist === 'leer') return { feld, ist: 'leer' };
  const ist = toStrings(value.ist);
  if (ist === null) return null;
  // Mengen als Zahlen in Textform, z. B. „0“.
  if (feld === 'menge' && !ist.every((entry) => ruleAmountOf(entry) !== null)) return null;
  if (feld === 'art' && !ist.every((kind) => RULE_POSITION_KINDS.some((own) => own === kind))) {
    return null;
  }
  return { feld, ist };
}

function toBlock(value: unknown): RuleBlock | null {
  if (!isObject(value)) return null;
  if (typeof value.begriff === 'string') {
    const begriff = value.begriff.trim();
    return begriff.length <= MAX_TEXT ? { begriff } : null;
  }
  if (isObject(value.menge)) {
    const { einheit } = value.menge;
    if (typeof einheit === 'string' && einheit.trim() !== '') {
      return { menge: { einheit: einheit.trim().slice(0, 20) } };
    }
    return { menge: {} };
  }
  if (isObject(value.norm)) return { norm: {} };
  if (value.liste !== undefined) {
    const liste = nameOf(value.liste);
    return liste === null ? null : { liste };
  }
  if (isObject(value.einheit)) {
    const gruppe = value.einheit.gruppe;
    return typeof gruppe === 'string' && gruppe.trim() !== '' && gruppe.length <= MAX_TEXT
      ? { einheit: { gruppe: gruppe.trim() } }
      : null;
  }
  if (value.feld !== undefined) return toFact(value);
  if (value.eingebaut !== undefined) {
    const eingebaut = nameOf(value.eingebaut);
    const parameter = toParams(value.parameter);
    if (eingebaut === null || parameter === null) return null;
    return Object.keys(parameter).length > 0 ? { eingebaut, parameter } : { eingebaut };
  }
  return null;
}

function toBlocks(value: unknown): RuleBlock[] | null {
  if (!Array.isArray(value) || value.length > MAX_BLOCKS) return null;
  const blocks = value.map(toBlock);
  return blocks.every((block): block is RuleBlock => block !== null) ? blocks : null;
}

function toRange(value: unknown): RuleRange | null {
  if (value === 'satz' || value === 'feld') return value;
  if (isObject(value) && typeof value.zeichen === 'number' && Number.isInteger(value.zeichen)) {
    return value.zeichen >= 1 && value.zeichen <= MAX_REACH ? { zeichen: value.zeichen } : null;
  }
  return null;
}

/** Eine Bedingung aus JSON; Unbrauchbares wird `null`. */
export function toCondition(value: unknown): RuleCondition | null {
  if (!isObject(value)) return null;
  const alle = value.alle === undefined ? undefined : toBlocks(value.alle);
  const eines = value.eines === undefined ? undefined : toBlocks(value.eines);
  if (alle === null || eines === null) return null;
  if ((alle === undefined) === (eines === undefined)) return null;
  const nicht = value.nicht === undefined ? [] : toBlocks(value.nicht);
  const bereich = toRange(value.bereich);
  const wo = Array.isArray(value.wo)
    ? ALL_FIELDS.filter((field) => (value.wo as unknown[]).includes(field))
    : [];
  if (nicht === null || bereich === null || wo.length === 0) return null;
  // Ein eingebauter Baustein bringt seine ganze Logik mit: allein und ohne „nicht“.
  const blocks = alle ?? eines ?? [];
  const builtins = [...blocks, ...nicht].filter((block) => 'eingebaut' in block).length;
  if (builtins > 0 && (builtins > 1 || blocks.length > 1 || nicht.length > 0)) return null;
  return {
    ...(alle === undefined ? { eines } : { alle }),
    ...(nicht.length > 0 ? { nicht } : {}),
    bereich,
    wo,
  };
}

function toHint(value: unknown): RuleCheckHint | null {
  if (!isObject(value)) return null;
  const kategorie = RULE_HINT_CATEGORIES.find((entry) => entry === value.kategorie);
  const schwere = (['hinweis', 'beachten'] as const).find((entry) => entry === value.schwere);
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  if (kategorie === undefined || schwere === undefined || text === '') return null;
  const hint = { kategorie, schwere, text: text.slice(0, MAX_HINT) };
  const norm = isObject(value.norm) ? value.norm : null;
  const verweis = typeof norm?.verweis === 'string' ? norm.verweis.trim() : '';
  const stand = (['bestaetigt', 'zu_bestaetigen'] as const).find((entry) => entry === norm?.stand);
  if (verweis === '') return hint;
  // Ohne Stand gilt ein Verweis als ungeprüft: er bleibt, die App zeigt „zu bestätigen“.
  return {
    ...hint,
    norm: { verweis: verweis.slice(0, MAX_TEXT), stand: stand ?? 'zu_bestaetigen' },
  };
}

function toEffect(value: unknown): RuleEffect | null {
  if (!isObject(value)) return null;
  const { hervorheben, verknuepfen, pruefhinweis } = value;
  if (typeof hervorheben === 'string') {
    const category = RULE_HIGHLIGHTS.find((entry) => entry === hervorheben);
    return category === undefined ? null : { hervorheben: category };
  }
  if (pruefhinweis !== undefined) {
    const hint = toHint(pruefhinweis);
    return hint === null ? null : { pruefhinweis: hint };
  }
  if (isObject(verknuepfen)) {
    if (verknuepfen.ziel === 'pdf') return { verknuepfen: { ziel: 'pdf' } };
    const ziel = toCondition(verknuepfen.ziel);
    if (ziel === null) return null;
    const gleich = Array.isArray(verknuepfen.gleich)
      ? (['abschnitt', 'einheit'] as const).filter((same) =>
          (verknuepfen.gleich as unknown[]).includes(same),
        )
      : [];
    // Mindestens ein „gleich“: Paare nur vorgruppiert, nie alle gegen alle.
    return gleich.length === 0 ? null : { verknuepfen: { ziel, gleich } };
  }
  return null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((entry) => entry === value) ?? null;
}

/** Eine Regel aus JSON (Datei, Speicher); Unbrauchbares wird `null`. */
export function toRule(value: unknown): Rule | null {
  if (!isObject(value) || value.schema !== RULE_SCHEMA) return null;
  const { id, version, name, bemerkung } = value;
  if (typeof id !== 'string' || !RULE_ID.test(id)) return null;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  if (typeof name !== 'string' || name.trim() === '') return null;
  const geltung = oneOf(value.geltung, ['allgemein', 'unternehmen'] as const);
  const bedingung = toCondition(value.bedingung);
  const wirkung = toEffect(value.wirkung);
  const status = oneOf(value.status, ['entwurf', 'freigegeben', 'aus'] as const);
  const herkunft = oneOf(value.herkunft, ['nutzer', 'mining', 'ki'] as const) ?? 'nutzer';
  if (bedingung === null || wirkung === null || geltung === null || status === null) return null;
  // Ins PDF verknüpft nur eine Bedingung, die im PDF sucht — und nur dort.
  const pdfOnly = bedingung.wo.length === 1 && bedingung.wo[0] === 'pdf';
  const toPdf = 'verknuepfen' in wirkung && wirkung.verknuepfen.ziel === 'pdf';
  if (bedingung.wo.includes('pdf') && (!pdfOnly || !toPdf)) return null;
  if (toPdf && !pdfOnly) return null;
  return {
    schema: RULE_SCHEMA,
    id,
    version,
    name: name.trim().slice(0, MAX_TEXT),
    bedingung,
    wirkung,
    geltung,
    status,
    herkunft,
    ...(typeof bemerkung === 'string' && bemerkung.trim() !== ''
      ? { bemerkung: bemerkung.trim().slice(0, 1000) }
      : {}),
  };
}

/** Regeln aus einer `regeln.json`; unbrauchbare Einträge fallen weg, gleiche `id` nur einmal. */
export function parseRuleFile(value: unknown): Rule[] {
  if (!isObject(value) || value.schema !== RULE_SCHEMA || !Array.isArray(value.regeln)) return [];
  const out: Rule[] = [];
  for (const entry of value.regeln) {
    const rule = toRule(entry);
    if (rule !== null && !out.some((other) => other.id === rule.id)) out.push(rule);
  }
  return out;
}

export function toRuleFile(rules: readonly Rule[]): RuleFile {
  return { schema: RULE_SCHEMA, regeln: rules };
}

/** Kennung aus einem Namen: „Nachtrag ausgeschlossen“ → „nachtrag-ausgeschlossen“. */
export function ruleIdOf(name: string, taken: ReadonlySet<string> = new Set()): string {
  const base =
    name
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'regel';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}
