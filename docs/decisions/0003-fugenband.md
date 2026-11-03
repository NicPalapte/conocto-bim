# 0003 – Fugenband als Länge auf der Mittellinie der Fuge

- Status: angenommen
- Datum: 2026-11-03
- Mockup: https://claude.ai/artifact/MXbDU8kfQvDAxzS15n6TUj (Artboards Fugenband und Tunnel,
  von Nico freigegeben)
- Baut auf 0002 (Seiten + Fugen) auf.

## Ergebnis
- Neuer Messansatz **Fugenband (Länge)**, bedient wie „Seiten + Fugen“.
- Ein Band liegt in einer eingezeichneten Fuge (quer, längs, 2 Punkte) oder auf einer
  angetippten Stirnseite (z. B. Stoß zwischen zwei getrennt modellierten Tunnelblöcken).
- Länge = Mittellinie der Fugenfläche. Platte 12 × 0,4 m ⇒ 12 m. Tunnelring ⇒ mittlerer
  Umfang.
- Fläche mit Loch (Ring) ⇒ geschlossene Schleife, keine Kürzung. Sonst offen: die Kürzung
  (m je Ende, eine Zahl je Regel) geht an beiden Enden ab.
- Mehrere getrennte Teile in einem Schnitt ⇒ mehrere Bänder.
- Wechsel zwischen „Seiten + Fugen“ und „Fugenband“ behält Seiten und Fugen.

## Warum
- Mittellinie aus Fläche und Umfang ist exakt für Streifen und Ringe gleicher Dicke und
  braucht kein Skelett-Verfahren. Rechnung rein in `src/model/faces.ts` (`measureBand`).
- Schleife automatisch am Loch erkennen spart einen Schalter.

## Grenzen
- Bei stark ungleich dicken Querschnitten (Voute, Konsole) ist die Mittellinie eine
  Näherung. Dann besser eine Fuge mit gleichmäßiger Dicke wählen.
- Berühren sich zwei Blöcke und an beiden ist die Stirnseite gewählt, zählt das Band
  doppelt. Wie bei 0002 an einem Bauteil herausnehmen.
- „Quer“ ist rechtwinklig zur längsten Ausdehnung. Ist ein Ring kürzer als sein
  Durchmesser, Stirnseite antippen oder 2 Punkte nehmen.

## Verworfen (vorerst)
- Kürzung je Ende einzeln einstellbar: eine Zahl je Regel reicht für den Anfang.
