// DOM-Helfer für GAEB DA XML. Alle Zugriffe laufen über `localName`, weil der
// Namespace die Version und Datenaustauschphase kodiert
// (z. B. http://www.gaeb.de/GAEB_DA_XML/DA83/3.3) und sich damit von Datei zu
// Datei unterscheidet.

/** Direkte Kindelemente mit dem gegebenen lokalen Namen. */
export function childrenByLocal(parent: Element, local: string): Element[] {
  const result: Element[] = [];
  const children = parent.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.localName === local) result.push(child);
  }
  return result;
}

/** Erstes direktes Kindelement mit dem gegebenen lokalen Namen. */
export function firstByLocal(parent: Element, local: string): Element | null {
  const children = parent.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.localName === local) return child;
  }
  return null;
}

/** Folgt einem Pfad direkter Kindelemente, z. B. ("Description", "CompleteText"). */
export function pathByLocal(parent: Element, ...path: string[]): Element | null {
  let current: Element | null = parent;
  for (const local of path) {
    if (current === null) return null;
    current = firstByLocal(current, local);
  }
  return current;
}

/** Getrimmter Textinhalt eines direkten Kindelements, leer ⇒ null. */
export function textByLocal(parent: Element, local: string): string | null {
  const el = firstByLocal(parent, local);
  if (el === null) return null;
  const text = (el.textContent ?? '').trim();
  return text === '' ? null : text;
}

/**
 * Dezimalzahl aus einem GAEB-Element. GAEB DA XML schreibt `xs:decimal` mit
 * Punkt vor; einzelne Exporter liefern trotzdem ein Komma, das hier toleriert
 * wird. Nicht interpretierbare Werte ⇒ null (die Position bleibt erhalten).
 */
export function decimalByLocal(parent: Element, local: string): number | null {
  const raw = textByLocal(parent, local);
  if (raw === null) return null;
  const normalized = raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
