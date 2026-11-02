# 0001 – Look aus dem Paket @conocto/design, Bereiche als Fenster wie in Conocto Doc

- Status: angenommen
- Datum: 2026-11-02
- Issue: #18

## Ergebnis
- Conocto BIM holt Farben, Schriften und Grundstil aus dem Paket `@conocto/design`
  (feste Version, wie Conocto Doc).
- Die eigene Kopie `src/styles/conocto-tokens.css` und die Schriftpakete `@fontsource/*`
  sind weg.
- Seitenbereiche (Modelle, LV, Eigenschaften, Position) schweben über dem Modell,
  im Stil der Fenster in Doc (`cn-window`: Rand, runde Ecken, Schatten aus dem Paket).
- Jeder Bereich hat eine Kopfzeile wie im Splitscreen von Doc: 32 px, grau, Linie unten.
- Die Positionskarte ist nur so hoch wie ihr Inhalt.
- Die Kopfleiste oben läuft durch.
- Über dem Modell schweben nur kleine Bedienelemente (Werkzeugleiste, Achsenkreuz,
  Messwerte, Hinweis). Ecken und Schatten kommen aus dem Paket.

## Warum
- Doc und BIM sollen wie eine App wirken.
- Eine Quelle für den Look: Änderungen am Design passieren nur noch in `conocto-design`.
  Vorher liefen die Kopie und das Paket auseinander (z. B. Name `--blue` statt `--accent`).

## Verworfen
- Kopie behalten und von Hand nachziehen: läuft mit der Zeit auseinander.
- Seitenbereiche flach am Rand wie der Splitscreen in Doc (Issue #18): Nico verworfen
  (2026-11-02), weil vom Modell zu wenig zu sehen ist. Fenster lassen das Modell
  rundum durchscheinen.

## Folgen
- Neue Version des Designs: Release in `conocto-design`, dann Version in `package.json`
  hochsetzen.
- Fehlt ein Wert oder Baustein, wird er im Paket ergänzt, nicht hier.
- Seitenbereiche sind noch nicht in der Breite ziehbar (eigene Aufgabe).
