# Entscheidungen

Eine Datei je Weichenstellung. Im Gesamtprodukt Conocto heißen diese Entscheidungen `BIM-NNNN`
(Conocto Doc `DOC-`, core `CORE-`, Designsystem `DS-`).

## Übersicht

| Nr.  | Entscheidung                                                                  | Status     | Datum      |
| ---- | ----------------------------------------------------------------------------- | ---------- | ---------- |
| 0001 | [Look aus @conocto/design, Bereiche als Fenster](0001-designpaket.md)         | akzeptiert | 2026-11-02 |
| 0002 | [Fingerabdruck heißt conocto-pos-v1](0002-kennungen-conocto.md)               | akzeptiert | 2026-11-02 |
| 0003 | [Fugenband als Länge auf der Mittellinie der Fuge](0003-fugenband.md)         | akzeptiert | 2026-11-03 |
| 0004 | [Mengen aus gewählten Seiten und eingezeichneten Fugen](0004-seiten-und-fugen.md) | akzeptiert | 2026-11-02 |
| 0005 | [Nummer, Version und Changelog erst nach dem Merge](0005-nummern-beim-merge.md) | akzeptiert | 2026-11-16 |

## Regeln

- Neue Entscheidung im PR **ohne Nummer**: `neu-kurzer-titel.md` (nur a–z, 0–9, `-`), erste Zeile
  `# NEU – Titel`. Verweise im selben PR: `neu-kurzer-titel`.
- Nach dem Merge vergibt der Bot die Nummer, setzt `# BIM-NNNN – Titel`, ersetzt die Verweise
  und ergänzt die Zeile oben. **Nicht von Hand:** Nummer, neue Tabellenzeile.
- Getroffene Entscheidungen nicht umschreiben: Status auf `ersetzt durch NNNN` setzen, neue
  Datei anlegen. Den Status in der Tabelle darf man dabei von Hand anpassen.
- Status beginnt mit: vorgeschlagen · akzeptiert · ersetzt durch · teilweise ersetzt durch ·
  ergänzt durch · verworfen.
- Verweise in andere Repos immer mit Präfix, z. B. `DOC-0091`.

## Vorlage

```markdown
# NEU – Titel

- Status: akzeptiert
- Datum: JJJJ-MM-TT

## Ergebnis
- …
```
