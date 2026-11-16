# Bausteine für den Changelog

Jeder PR, der im Viewer etwas ändert, legt hier **eine** Datei an, z. B. `changes/fugenband.md`:

```markdown
---
art: funktion
---
Fugenband messen

- Fugen lassen sich als Länge auf der Mittellinie messen.
```

- `art: funktion` → mittlere Zahl der Version steigt, `art: korrektur` → letzte Zahl.
- Nicht von Hand ändern: Version in `package.json`/`package-lock.json` und `CHANGELOG.md`.
- Nach dem Merge macht der Bot daraus Version und Changelog und löscht die Datei
  (Entscheidung neu-nummern-beim-merge).
