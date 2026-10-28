// Einzige Stelle im Projekt mit GAEB-XML-Kenntnis (docs/architecture/pipeline.md).
// Nach außen sichtbar ist nur das GaebParser-Interface und ParsedLV; GAEB-Elemente
// (<GAEB>, <Award>, <BoQ>, <BoQCtgy>, …) verlassen dieses Modul nie.

import { GAEBParseError, GAEBValidationError, GAEBVersionError } from './errors';
import { extractInlineText, extractMarkedText, splitInputFields, type TextRange } from './text';
import type { GaebItemType, ParsedLV, ParsedLot, ParsedPosition, ParsedSection } from './types';
import { childrenByLocal, decimalByLocal, firstByLocal, pathByLocal, textByLocal } from './xml';

export type GaebInput = string | ArrayBuffer | Uint8Array;

export interface GaebParser {
  /**
   * Parst eine GAEB-DA-XML-Datei.
   *
   * @throws {GAEBParseError} Datei ist nicht dekodierbar/kein wohlgeformtes XML.
   * @throws {GAEBValidationError} XML ist wohlgeformt, aber keine LV-Struktur.
   * @throws {GAEBVersionError} GAEB-Version wird nicht unterstützt.
   */
  parse(input: GaebInput, filename?: string): ParsedLV;
}

// 2.0/2.1 bewusst nicht unterstützt (Issue #27): kommen in der Praxis kaum noch vor,
// der Parser kennt ohnehin nur 3.x-Strukturen (<Award><BoQ>...).
const SUPPORTED_VERSIONS = new Set(['3.0', '3.1', '3.2', '3.3']);

/** OZ-Segmente zur vollständigen Ordnungszahl verbinden ("001" + "0010" → "001.0010"). */
function joinOz(segments: string[]): string {
  return segments.filter((segment) => segment !== '').join('.');
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Encoding aus der XML-Deklaration lesen. GAEB-Dateien kommen aus der Praxis
 * häufig in ISO-8859-1/Windows-1252 statt UTF-8; ein blindes UTF-8-Dekodieren
 * würde Umlaute in Positionstexten zerstören.
 */
function detectEncoding(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  let head = '';
  const limit = Math.min(bytes.length, 256);
  for (let i = 0; i < limit; i++) head += String.fromCharCode(bytes[i]);
  const match = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head);
  return match === null ? 'utf-8' : match[1];
}

function decodeXml(input: GaebInput): string {
  if (typeof input === 'string') return stripBom(input);

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const label = detectEncoding(bytes);
  try {
    return stripBom(new TextDecoder(label).decode(bytes));
  } catch {
    // Unbekanntes Encoding-Label — UTF-8 ist der Standard laut XML-Spezifikation.
    return stripBom(new TextDecoder('utf-8').decode(bytes));
  }
}

function parseXmlDocument(xml: string, filename: string): Document {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch (cause) {
    throw new GAEBParseError(`${filename || 'Datei'} konnte nicht gelesen werden`, { cause });
  }

  // Browser und jsdom melden XML-Fehler nicht als Exception, sondern über ein
  // <parsererror>-Ersatzdokument. Dessen Text ist Englisch und je Browser anders;
  // er bleibt als `cause` für die Fehlersuche erhalten, steht aber nicht in der
  // Meldung. Sie ist ein fertiger Satz (`complete`, siehe gaeb/errors.ts).
  const failure = doc.getElementsByTagName('parsererror')[0];
  if (failure !== undefined) {
    const detail = (failure.textContent ?? '').replace(/\s+/g, ' ').trim();
    throw new GAEBParseError(
      `${filename || 'Datei'} ist kein wohlgeformtes XML. ` +
        'Die Datei ist beschädigt oder kein GAEB-DA-XML.',
      { cause: new Error(detail), complete: true },
    );
  }
  return doc;
}

function detectVersion(root: Element): string | null {
  const info = firstByLocal(root, 'GAEBInfo');
  const declared = info === null ? null : textByLocal(info, 'Version');
  if (declared !== null) return declared;

  // Fallback: die Version steckt auch im Namespace, z. B.
  // http://www.gaeb.de/GAEB_DA_XML/DA83/3.3
  const namespaceMatch = /\/DA\d+\/([\d.]+)$/.exec(root.namespaceURI ?? '');
  return namespaceMatch === null ? null : namespaceMatch[1];
}

/** Kurztext aus <Description>: CompleteText/OutlineText oder OutlineText allein. */
function readShortText(description: Element | null): string {
  if (description === null) return '';
  const outline =
    pathByLocal(description, 'CompleteText', 'OutlineText', 'OutlTxt') ??
    pathByLocal(description, 'OutlineText', 'OutlTxt');
  return extractInlineText(outline);
}

/** Langtext aus <Description>: CompleteText/DetailTxt, mit Feld-Markern (text.ts). */
function readLongText(description: Element | null): string {
  if (description === null) return '';
  return extractMarkedText(pathByLocal(description, 'CompleteText', 'DetailTxt'));
}

/**
 * Unterbeschreibungen (<SubDescr>) an den Langtext anhängen. Sie gehören laut
 * GAEB zur selben Position — eine eigene OZ haben sie nicht, deshalb werden sie
 * nicht zu eigenen Positionen, ihr Text bleibt aber für Suche und
 * Klassifizierung erhalten.
 */
function collectLongText(
  item: Element,
  description: Element | null,
): { text: string; fields: TextRange[] } {
  const blocks: string[] = [];
  const main = readLongText(description);
  if (main !== '') blocks.push(main);

  for (const sub of childrenByLocal(item, 'SubDescr')) {
    const subDescription = firstByLocal(sub, 'Description');
    const number = textByLocal(sub, 'SubDNo');
    const heading = [number, readShortText(subDescription)].filter((p) => p).join(' ');
    const block = [heading, readLongText(subDescription)].filter((p) => p !== '').join('\n');
    if (block !== '') blocks.push(block);
  }
  // Marker erst nach dem Zusammensetzen auflösen, damit die Bereiche auf den
  // ganzen Langtext zeigen und nicht nur auf einen Block.
  return splitInputFields(blocks.join('\n\n'));
}

/**
 * Positionsart aus den Kennzeichen der Position ableiten. GAEB DA XML 3.x hat
 * kein einzelnes Typ-Feld; die Art ergibt sich aus ALN-Zuordnungszahl,
 * <Provis>, <LumpSumItem> und dem Elementnamen (siehe tgItem/tgMarkupItem).
 */
function detectItemType(item: Element, isMarkupItem: boolean): GaebItemType {
  if (isMarkupItem) return 'Markup';

  // ALNSerNo 0 kennzeichnet die Grundposition, jede höhere Nummer eine
  // alternative Ausführung derselben ALN-Gruppe.
  const serialNumber = textByLocal(item, 'ALNSerNo');
  if (serialNumber !== null && Number(serialNumber) > 0) return 'Alternative';

  if (textByLocal(item, 'Provis') !== null) return 'Eventual';
  if (textByLocal(item, 'LumpSumItem') === 'Yes') return 'LumpSum';
  if ((item.getAttribute('RNoIndex') ?? '') !== '') return 'Index';
  return 'Normal';
}

function parseItem(item: Element, path: string[], isMarkupItem: boolean): ParsedPosition {
  const segments = [...path, item.getAttribute('RNoPart') ?? ''];
  // Indexpositionen teilen sich die Teil-OZ mit ihrer Grundposition; erst der
  // Index macht die OZ wieder eindeutig.
  const index = item.getAttribute('RNoIndex') ?? '';
  if (index !== '') segments.push(index);

  const description = firstByLocal(item, 'Description');
  const { text: longText, fields: inputFields } = collectLongText(item, description);
  let shortText = readShortText(description);
  if (shortText === '' && longText !== '') {
    shortText = longText.split('\n')[0];
  }

  return {
    oz: joinOz(segments),
    shortText,
    longText,
    unit: textByLocal(item, 'QU'),
    quantity: decimalByLocal(item, 'Qty'),
    unitPrice: decimalByLocal(item, 'UP'),
    itemType: detectItemType(item, isMarkupItem),
    inputFields,
  };
}

function parseItemlist(list: Element, path: string[]): ParsedPosition[] {
  const positions: ParsedPosition[] = [];
  const children = list.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.localName === 'Item') positions.push(parseItem(child, path, false));
    else if (child.localName === 'MarkupItem') positions.push(parseItem(child, path, true));
  }
  return positions;
}

interface BodyContent {
  sections: ParsedSection[];
  positions: ParsedPosition[];
}

function collectBody(body: Element, path: string[]): BodyContent {
  const sections = childrenByLocal(body, 'BoQCtgy').map((ctgy) => parseCategory(ctgy, path));
  const positions: ParsedPosition[] = [];
  for (const list of childrenByLocal(body, 'Itemlist')) {
    positions.push(...parseItemlist(list, path));
  }
  return { sections, positions };
}

/**
 * Obergrenze für verschachtelte Abschnitte. Reale LVs gliedern in wenigen Ebenen
 * (Los, Gewerk, Titel, Untertitel); der Parser ruft sich je Ebene selbst auf, und
 * ein Dokument mit tausenden Ebenen würde sonst den Aufrufstapel sprengen
 * („Maximum call stack size exceeded").
 */
const MAX_SECTION_DEPTH = 100;

function parseCategory(ctgy: Element, parentPath: string[]): ParsedSection {
  if (parentPath.length >= MAX_SECTION_DEPTH) {
    throw new GAEBValidationError(
      `Das Leistungsverzeichnis ist zu tief verschachtelt (mehr als ${MAX_SECTION_DEPTH} ` +
        'Abschnittsebenen). Die Datei ist vermutlich beschädigt.',
      { complete: true },
    );
  }
  const path = [...parentPath, ctgy.getAttribute('RNoPart') ?? ''];
  const body = firstByLocal(ctgy, 'BoQBody');
  const content: BodyContent =
    body === null ? { sections: [], positions: [] } : collectBody(body, path);

  return {
    number: joinOz(path),
    label: extractInlineText(firstByLocal(ctgy, 'LblTx')) || null,
    positions: content.positions,
    sections: content.sections,
  };
}

/**
 * Positionen, die direkt (ohne LV-Bereich) an einem Los oder am LV-Hauptteil
 * hängen, in einen namenlosen Abschnitt einhängen — LotDraft kennt laut
 * Datenmodell nur Abschnitte, keine eigenen Positionen.
 */
function asSections(content: BodyContent, path: string[]): ParsedSection[] {
  if (content.positions.length === 0) return content.sections;
  const wrapper: ParsedSection = {
    number: joinOz(path),
    label: null,
    positions: content.positions,
    sections: [],
  };
  return [wrapper, ...content.sections];
}

/** Erste Gliederungsebene laut <BoQInfo> ist die Los-Ebene. */
function hasLotLevel(info: Element | null): boolean {
  if (info === null) return false;
  const firstLevel = childrenByLocal(info, 'BoQBkdn')[0];
  return firstLevel !== undefined && textByLocal(firstLevel, 'Type') === 'Lot';
}

function parseLots(body: Element, info: Element | null, fallbackLabel: string | null): ParsedLot[] {
  if (hasLotLevel(info)) {
    return childrenByLocal(body, 'BoQCtgy').map((ctgy) => {
      const number = ctgy.getAttribute('RNoPart') ?? '';
      const lotBody = firstByLocal(ctgy, 'BoQBody');
      const content: BodyContent =
        lotBody === null ? { sections: [], positions: [] } : collectBody(lotBody, [number]);
      return {
        number,
        label: extractInlineText(firstByLocal(ctgy, 'LblTx')) || null,
        sections: asSections(content, [number]),
      };
    });
  }

  // Ohne Los-Ebene fasst ein implizites Los ohne Nummer das ganze LV zusammen,
  // damit die Hierarchie Los → Abschnitt → Position erhalten bleibt.
  return [{ number: '', label: fallbackLabel, sections: asSections(collectBody(body, []), []) }];
}

/** Auftraggeber aus <OWN><Address> — GAEB verteilt den Namen auf Name1…Name4. */
function readClient(award: Element): string | null {
  const address = pathByLocal(award, 'OWN', 'Address');
  if (address === null) return null;
  const name = (['Name1', 'Name2', 'Name3', 'Name4'] as const)
    .map((local) => textByLocal(address, local))
    .filter((part): part is string => part !== null)
    .join(' ')
    .trim();
  return name === '' ? null : name;
}

export class XmlGaebParser implements GaebParser {
  parse(input: GaebInput, filename = ''): ParsedLV {
    const xml = decodeXml(input);
    // Eine leere Datei soll als leer gemeldet werden: der XML-Parser nennt sie
    // sonst nur „kaputt", und die Nutzerin sucht den Fehler in der Datei statt
    // im Export.
    if (xml.trim() === '') {
      throw new GAEBParseError(`Die Datei${filename === '' ? '' : ` ${filename}`} ist leer.`, {
        complete: true,
      });
    }
    const doc = parseXmlDocument(xml, filename);
    const root = doc.documentElement;

    if (root === null || root.localName !== 'GAEB') {
      throw new GAEBValidationError(
        `Kein GAEB-Dokument: Wurzelelement <${root === null ? '?' : root.localName}> statt <GAEB>`,
      );
    }

    const version = detectVersion(root);
    if (version === null || !SUPPORTED_VERSIONS.has(version)) {
      throw new GAEBVersionError(
        `GAEB-Version ${version === null ? 'unbekannt' : `'${version}'`} wird nicht unterstützt ` +
          `(unterstützt: ${[...SUPPORTED_VERSIONS].join(', ')})`,
      );
    }

    const award = firstByLocal(root, 'Award');
    if (award === null) {
      throw new GAEBValidationError(
        'Datei enthält kein <Award> und damit kein Leistungsverzeichnis',
      );
    }
    const boq = firstByLocal(award, 'BoQ');
    if (boq === null) {
      throw new GAEBValidationError('Datei enthält kein Leistungsverzeichnis (<BoQ> fehlt)');
    }
    const body = firstByLocal(boq, 'BoQBody');
    if (body === null) {
      throw new GAEBValidationError('Leistungsverzeichnis ohne Inhalt (<BoQBody> fehlt)');
    }

    const boqInfo = firstByLocal(boq, 'BoQInfo');
    const prjInfo = firstByLocal(root, 'PrjInfo');
    const awardInfo = firstByLocal(award, 'AwardInfo');
    const boqLabel =
      boqInfo === null ? null : (textByLocal(boqInfo, 'LblBoQ') ?? textByLocal(boqInfo, 'Name'));

    return {
      projectId: prjInfo === null ? null : textByLocal(prjInfo, 'PrjID'),
      projectName:
        prjInfo === null
          ? null
          : (textByLocal(prjInfo, 'LblPrj') ?? textByLocal(prjInfo, 'NamePrj')),
      client: readClient(award),
      deadline: awardInfo === null ? null : textByLocal(awardInfo, 'OpenDate'),
      gaebVersion: version,
      dataPhase: textByLocal(award, 'DP'),
      lots: parseLots(body, boqInfo, boqLabel),
    };
  }
}

let sharedParser: GaebParser | null = null;

/** Einziger Zugang zum Parser — Aufrufer importieren nie XmlGaebParser direkt. */
export function getGaebParser(): GaebParser {
  sharedParser ??= new XmlGaebParser();
  return sharedParser;
}
