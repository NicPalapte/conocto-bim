# 0002 – Fingerabdruck heißt conocto-pos-v1

- Status: angenommen
- Datum: 2026-11-02

## Ergebnis
- Der LV-Kern in `src/core/` ist neu aus Conocto Doc kopiert. Dort heißen alle Kennungen
  jetzt `conocto-…` statt `bubble-…` (bubbleLV Entscheidung 0091).
- Der Fingerabdruck der Positionen heißt `conocto-pos-v1`. Alle Fingerabdrücke haben sich
  einmal geändert; `tests/core.test.ts` hält die neuen Werte fest.
- Kein Lesen alter Stände: es gibt keine Daten, die erhalten bleiben müssen (Owner).

## Folgen
- Alte Verknüpfungsdateien `conocto-bim-links-v1` passen nicht mehr zu neu geladenen LVs.
  Mengenregeln einmal neu anlegen.
- Erst mergen, wenn der PR in bubbleLV gemergt ist. Danach `node scripts/sync-core.mjs`
  laufen lassen, damit `src/core/QUELLE.md` auf den Stand von `main` zeigt.
- Der Repo-Name `bubbleLV` in `scripts/sync-core.mjs` und README bleibt, bis der Owner das
  Repo umbenennt.
