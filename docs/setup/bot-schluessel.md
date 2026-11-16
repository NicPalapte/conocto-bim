# Bot-Schlüssel einrichten (einmalig, ca. 10 Minuten)

**Wozu:** Nach jedem Merge schreibt der Workflow „Nummer und Version“ einen Commit direkt auf
`main` (Nummer für neue Entscheidungen, Version, Changelog). Das Ruleset auf `main` lässt
direkte Commits nicht zu. Der Bot-Schlüssel ist die eine Ausnahme.

**Wenn du es auslässt:** Der Lauf nach jedem Merge wird rot. Neue Entscheidungen bleiben als
`neu-….md` liegen, Bausteine in `changes/` auch. Es geht nichts verloren: sobald der Schlüssel
da ist, holt der nächste Lauf alles nach (oder „Run workflow“ von Hand unter Actions).

Gleiche Schritte in **bubbleLV, conocto-bim, conocto-design**, je Repo ein **eigener** Schlüssel
(GitHub nimmt einen Schlüssel nur für ein Repo an). bauonto hat kein Ruleset und braucht ihn nicht.

## Schritte

1. **Schlüssel erzeugen** – im Terminal auf deinem Rechner:

   ```bash
   ssh-keygen -t ed25519 -C conocto-bot -N "" -f bot_schluessel
   ```

   Das legt zwei Dateien an: `bot_schluessel` (geheim) und `bot_schluessel.pub` (öffentlich).

2. **Öffentlichen Teil ins Repo** – Repo → **Settings** → **Deploy keys** → **Add deploy key**
   - Title: `conocto-bot`
   - Key: Inhalt von `bot_schluessel.pub`
   - Haken bei **Allow write access** setzen → **Add key**

3. **Geheimen Teil als Secret** – Repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**
   - Name: `BOT_SCHLUESSEL`
   - Secret: kompletter Inhalt von `bot_schluessel` (mit den Zeilen `-----BEGIN…` und `-----END…`)

4. **Ausnahme im Ruleset** – Repo → **Settings** → **Rules** → **Rulesets** → Ruleset für
   `main` öffnen → **Bypass list** → **Add bypass** → **Deploy keys** → Modus **Always allow** →
   **Save changes**.

5. **Dateien löschen:** `bot_schluessel` und `bot_schluessel.pub` auf deinem Rechner löschen.
   Sie werden nicht mehr gebraucht.

## Prüfen

- Repo → **Actions** → „Nummer und Version“ → **Run workflow** auf `main`.
- Grün und „Nichts zu vergeben.“ im Protokoll: alles eingerichtet.
