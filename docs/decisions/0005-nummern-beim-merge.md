# BIM-0005 – Nummer, Version und Changelog erst nach dem Merge

- Status: akzeptiert
- Datum: 2026-11-16
- Anlass: Nico, 16.11.2026: gleiche Nummern in parallelen PRs blockieren den Merge; eine Logik
  für alle vier Repos (Plan: https://claude.ai/artifact/X8w2PM99vybAQHQoxF8KcJ)

## Ergebnis
- Neue Entscheidung im PR als `docs/decisions/neu-<titel>.md` mit `# NEU – Titel`, ohne Nummer.
- Statt Version von Hand: Baustein `changes/<titel>.md` (`art: funktion|korrektur`).
- Nach dem Merge vergibt `.github/workflows/entscheidungen.yml` auf `main` Nummer, Tabellenzeile,
  Version (`package.json` + Lockdatei) und `CHANGELOG.md` in einem Commit.
- Die CI prüft im PR, was später Konflikte macht.
- Nach außen heißen Entscheidungen hier `BIM-NNNN`; Verweise in andere Repos mit Präfix.
- Gleiches Werkzeug `.github/conocto/entscheidungen.py` in allen vier Repos; ausführliche
  Begründung in Conocto Doc (gleichnamige Entscheidung).
- Die doppelte 0002 „Seiten und Fugen“ bekommt dabei eine neue Nummer
  (0004).
- Neue Übersichtstabelle in `docs/decisions/README.md`. Status heißt jetzt wie in den anderen
  Repos „akzeptiert“ statt „angenommen“.

## Folgen
- Gibt es ein Ruleset auf `main`: Bot-Schlüssel einrichten, `docs/setup/bot-schluessel.md`.
  Sonst wird der Lauf nach dem Merge rot und `neu-…` bleibt liegen, bis er da ist.
