# Conocto BIM – Regeln für Agenten

- Reiner Browser-Viewer für IFC. Kein Server, kein Upload, keine Analyse-Requests mit Modelldaten.
- Zweck: Domänen verknüpfen (LV, Dokumente, Termine …) und Informationen am Modell visualisieren.
  Verboten: Kollisionsprüfung, Merkmal-/Modellprüfung (Regelchecks, Prüfberichte). Stattdessen:
  Informationen anzeigen, filtern, einfärben, verknüpfen.
- Nie Modelldateien (`*.ifc`, `*.frag`) committen; Tests nur mit synthetischen Daten
  oder öffentlichen buildingSMART-Beispielen außerhalb des Repos.
- 3D-Bibliothek nur über `src/viewer/engine.ts` (`BimEngine`) ansprechen; UI kennt That Open nicht.
- LV-Kern (GAEB-Parser, Fingerabdruck `conocto-pos-v1`) liegt als Kopie in `src/core/`
  (Stand in `src/core/QUELLE.md`). Nie dort ändern: Änderung in bubbleLV
  `packages/core`, dann `node scripts/sync-core.mjs <bubbleLV-Pfad>`. `tests/core.test.ts`
  hält die Fingerabdrücke gleich mit Conocto Doc. Kein eigener GAEB-Parser.
- LV wird nicht gespeichert; immer nur ein LV geladen.
- Mengenregeln (`src/model/takeoff.ts`): Auswahlgruppe als Kriterien + GlobalIds dazu/heraus,
  Messansatz relativ zum Bauteil; Datei `conocto-bim-links-v1` nur mit Schlüsseln (Fingerabdruck,
  GlobalId), nie LV-Text oder Modelldaten. Rein geometrisch, keine Abrechnungsregeln ohne Owner.
  Logik bleibt rein (ohne 3D/React), damit sie später in den Kern umziehen kann.
- Fachlogik ohne 3D in `src/model/` als reine Funktionen mit Vitest-Tests (`tests/`).
- `web-ifc` exakt auf die Version pinnen, die `@thatopen/fragments` erwartet
  (sonst „StreamMeshes called with 4 arguments“).
- WASM und Fragments-Worker werden aus `public/` ausgeliefert (Vite-Plugin in
  `vite.config.ts`), kein CDN.
- Look nur über Paket `@conocto/design` (feste Version in `package.json`, geladen in
  `src/main.tsx`: `fonts`, `tokens.css`, `styles.css`; Entscheidung 0001). Keine eigene
  Token-Kopie, keine Hex-Werte in `src/` (Ausnahme `#fff` auf `--accent-fill`); Farben für
  Three.js über `tokenColor()` (`src/viewer/tokens.ts`). Fehlt ein Token/Baustein ⇒ in
  `conocto-design` ergänzen, nicht lokal. Akzent `--accent*` nur für Auswahl/Interaktion,
  Hinweise amber.
- Seitenbereiche schweben als Fenster (`cn-window`) mit Kopfzeile `.pane-head` (32 px grau,
  wie Doc). Nicht flach an den Rand legen: nimmt dem Modell Platz (Entscheidung 0001).
  Bedienelemente über dem Modell: `cn-pill`, `cn-glass`.
- Texte für den Owner (README, PR, Commits): Deutsch, einfache Sprache, Ergebnis zuerst.
- Commits: Conventional Commits, `feat|fix|refactor|test|chore|docs(<scope>): …`,
  Scopes `viewer · tree · props · ui · lv · ci`.
