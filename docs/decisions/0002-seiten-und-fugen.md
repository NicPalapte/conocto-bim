# 0002 – Mengen aus gewählten Seiten und eingezeichneten Fugen

- Status: angenommen
- Datum: 2026-11-02
- Mockup: https://claude.ai/artifact/MXbDU8kfQvDAxzS15n6TUj (von Nico freigegeben)

## Ergebnis
- Neuer Messansatz in der Mengenregel: **Seiten + Fugen**. Standard für Positionen in m².
- Menge je Bauteil = Fläche der angetippten Seiten + Fläche der eingezeichneten Fugen.
- Seiten: am Bauteil antippen (dazu oder heraus). Gemerkt wird die Ausrichtung der Seite in
  den Bauteilachsen. Gekrümmte Seiten (z. B. Pfahlmantel) zählen ganz.
- „Auf gleiche Bauteile übertragen“: Seitenwahl des zuletzt angetippten Bauteils auf alle
  Bauteile der Gruppe. Gedrehte Bauteile passen, weil die Richtung in Bauteilachsen gilt.
- Fugen: ebener Schnitt durch ein Bauteil. Quer oder längs zur Längsachse, oder senkrecht
  durch zwei Punkte. Abstand vom Anfang des Bauteils lässt sich eintippen. Jede Fuge zählt
  einmal.
- Das Modell bleibt unverändert. In der Regeldatei (`conocto-bim-links-v1`) stehen nur
  GlobalId, Richtung und Abstand, keine Modelldaten.

## Warum
- Kalkulator will selbst bestimmen, welche Flächen zählen. Formeln wie in iTWO (QTO)
  sind schwer prüfbar; hier sieht man jede gezählte Fläche eingefärbt.
- Betonierabschnitte und Fugen stehen fast nie im Modell. Einzeichnen braucht nur einen
  ebenen Schnitt, und der ist exakt.
- Rechnung als reine Funktionen in `src/model/faces.ts`, getestet, später in den Kern.

## Verworfen (vorerst)
- Betonierabschnitte mit Zuordnung der Fuge zum Abschnitt: für den Anfang zu kompliziert
  (Nico, 2026-11-02). Menge gilt je Bauteil.
- Raster nach Achse (IfcAlignment) für Fugen: vorerst nicht.
- Automatische Kontakterkennung zwischen Bauteilen: später. Bis dahin wählt der Mensch.
  Keine Liste von Durchdringungen (keine Kollisionsprüfung, siehe CLAUDE.md).
