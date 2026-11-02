/** Farbe aus einem CSS-Token von @conocto/design, z. B. für Three.js-Materialien. */
export function tokenColor(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Ohne geladene Tokens (z. B. im Test) lieber neutral als ein falscher Markenwert.
  return value || 'gray';
}
