# Conocto BIM – Regeln für Agenten

- Reiner Browser-Viewer für IFC. Kein Server, kein Upload, keine Analyse-Requests mit Modelldaten.
- Zweck: Domänen verknüpfen (LV, Dokumente, Termine …) und Informationen am Modell visualisieren.
  Verboten: Kollisionsprüfung, Merkmal-/Modellprüfung (Regelchecks, Prüfberichte). Stattdessen:
  Informationen anzeigen, filtern, einfärben, verknüpfen.
- Nie Modelldateien (`*.ifc`, `*.frag`) committen; Tests nur mit synthetischen Daten
  oder öffentlichen buildingSMART-Beispielen außerhalb des Repos.
- 3D-Bibliothek nur über `src/viewer/engine.ts` (`BimEngine`) ansprechen; UI kennt That Open nicht.
- Fachlogik ohne 3D in `src/model/` als reine Funktionen mit Vitest-Tests (`tests/`).
- `web-ifc` exakt auf die Version pinnen, die `@thatopen/fragments` erwartet
  (sonst „StreamMeshes called with 4 arguments“).
- WASM und Fragments-Worker werden aus `public/` ausgeliefert (Vite-Plugin in
  `vite.config.ts`), kein CDN.
- Look: Conocto-Tokens (`src/styles/conocto-tokens.css`, Kopie aus bubbleLV
  `.claude/skills/conocto-design/tokens/`); Akzent Ziegelrot nur für Auswahl/Interaktion,
  Hinweise amber. Wird durch Paket `@conocto/design` ersetzt.
- Texte für den Owner (README, PR, Commits): Deutsch, einfache Sprache, Ergebnis zuerst.
- Commits: Conventional Commits, `feat|fix|refactor|test|chore|docs(<scope>): …`,
  Scopes `viewer · tree · props · ui · ci`.
