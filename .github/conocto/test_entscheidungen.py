"""Tests für entscheidungen.py mit erfundenen Beispielen in einem Wegwerf-Repo."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import entscheidungen as ent

README = """# Entscheidungen

| Nr.  | Entscheidung                 | Status     | Datum      |
| ---- | ---------------------------- | ---------- | ---------- |
| 0001 | [Erste](0001-erste.md)       | akzeptiert | 2026-01-01 |

## Regeln
"""

NEU = """# NEU – Zweite Sache

- **Status:** akzeptiert
- **Datum:** 2026-02-02

Ergänzt 0001.
"""


def sh(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


class Repo(unittest.TestCase):
    def setUp(self) -> None:
        self.alt = os.getcwd()
        self.tmp = tempfile.TemporaryDirectory()
        os.chdir(self.tmp.name)
        sh("git", "init", "-q", "-b", "main")
        sh("git", "config", "user.email", "t@example.com")
        sh("git", "config", "user.name", "t")
        d = Path("docs/decisions")
        d.mkdir(parents=True)
        (d / "README.md").write_text(README, encoding="utf-8")
        (d / "0001-erste.md").write_text("# 0001 – Erste\n\n- **Status:** akzeptiert\n")
        Path("package.json").write_text(json.dumps({"name": "x", "version": "0.4.1"}, indent=2))
        Path("CHANGELOG.md").write_text("# Änderungen\n\n---\n\n## 0.4.1 — 01.01.2026 · Alt\n")
        Path("changes").mkdir()
        Path("changes/README.md").write_text("Bausteine\n")
        self.commit("start")
        self.basis = sh("git", "rev-parse", "HEAD").strip()
        self.e = ent.Einstellung(
            praefix="DOC",
            ordner=d,
            versionsdatei=Path("package.json"),
            lockdatei=None,
            changelog=Path("CHANGELOG.md"),
            bausteine=Path("changes"),
        )

    def tearDown(self) -> None:
        os.chdir(self.alt)
        self.tmp.cleanup()

    def commit(self, msg: str) -> None:
        sh("git", "add", "-A")
        sh("git", "commit", "-q", "-m", msg)

    def test_vergeben_nummer_tabelle_verweise(self) -> None:
        Path("docs/decisions/neu-zweite-sache.md").write_text(NEU, encoding="utf-8")
        Path("docs/notiz.md").write_text(
            "Siehe neu-zweite-sache und [x](decisions/neu-zweite-sache.md)\n"
        )
        self.commit("pr")
        erg = ent.vergeben(self.e)
        self.assertEqual(erg["entscheidungen"], "DOC-0002")
        datei = Path("docs/decisions/0002-zweite-sache.md")
        self.assertTrue(datei.exists())
        self.assertTrue(datei.read_text().startswith("# DOC-0002 – Zweite Sache\n"))
        self.assertEqual(
            Path("docs/notiz.md").read_text(),
            "Siehe 0002 und [x](decisions/0002-zweite-sache.md)\n",
        )
        readme = Path("docs/decisions/README.md").read_text()
        self.assertIn(
            "| 0002 | [Zweite Sache](0002-zweite-sache.md) | akzeptiert | 2026-02-02 |", readme
        )
        self.assertLess(readme.index("0002"), readme.index("## Regeln"))

    def test_zwei_neue_bekommen_zwei_nummern(self) -> None:
        Path("docs/decisions/neu-a.md").write_text(NEU)
        self.commit("a")
        Path("docs/decisions/neu-b.md").write_text(NEU)
        self.commit("b")
        self.assertEqual(ent.vergeben(self.e)["entscheidungen"], "DOC-0002, DOC-0003")
        self.assertTrue(Path("docs/decisions/0003-b.md").exists())

    def test_version_und_changelog(self) -> None:
        Path("changes/taste.md").write_text("---\nart: korrektur\n---\nTaste T\n\n- **T** geht.\n")
        Path("changes/neu.md").write_text("---\nart: funktion\n---\nNeue Liste\n")
        self.commit("pr")
        self.assertEqual(ent.vergeben(self.e)["version"], "0.5.0")
        self.assertEqual(json.loads(Path("package.json").read_text())["version"], "0.5.0")
        log = Path("CHANGELOG.md").read_text()
        self.assertRegex(
            log, r"## 0\.5\.0 — \d\d\.\d\d\.\d{4} · Neue Liste · Taste T\n\n- \*\*T\*\* geht\."
        )
        self.assertLess(log.index("0.5.0"), log.index("0.4.1"))
        self.assertFalse(Path("changes/taste.md").exists())
        self.assertTrue(Path("changes/README.md").exists())

    def test_nur_korrektur(self) -> None:
        self.assertEqual(ent.naechste_version("0.4.1", ["korrektur"]), "0.4.2")

    def test_nichts_zu_tun(self) -> None:
        self.assertEqual(ent.vergeben(self.e), {})

    def test_pruefen_ok(self) -> None:
        Path("docs/decisions/neu-zweite-sache.md").write_text(NEU)
        Path("changes/x.md").write_text("---\nart: funktion\n---\nX\n")
        Path("app.ts").write_text("x")
        self.commit("pr")
        self.assertEqual(ent.pruefen(self.e, self.basis), ([], []))

    def test_pruefen_meldet_konfliktquellen(self) -> None:
        Path("docs/decisions/0002-von-hand.md").write_text(NEU)
        readme = Path("docs/decisions/README.md")
        readme.write_text(
            readme.read_text().replace(
                "| 0001 |", "| 0002 | [x](0002-von-hand.md) | akzeptiert | 2026-02-02 |\n| 0001 |"
            )
        )
        Path("package.json").write_text(json.dumps({"name": "x", "version": "0.4.2"}, indent=2))
        Path("CHANGELOG.md").write_text("# Änderungen\n\n## 0.4.2 — von Hand\n")
        Path("changes/kaputt.md").write_text("ohne Kopf\n")
        self.commit("pr")
        fehler, _ = ent.pruefen(self.e, self.basis)
        text = "\n".join(fehler)
        for erwartet in (
            "0002-von-hand.md",
            "README.md",
            "package.json",
            "CHANGELOG.md",
            "kaputt.md",
        ):
            self.assertIn(erwartet, text)

    def test_pruefen_kopf_der_neuen_datei(self) -> None:
        Path("docs/decisions/neu-x.md").write_text("# NEU – X\n\n- Status: vielleicht\n")
        self.commit("pr")
        fehler, _ = ent.pruefen(self.e, self.basis)
        self.assertTrue(any("Status" in f for f in fehler))
        self.assertTrue(any("Datum" in f for f in fehler))

    def test_changelog_kopf_darf_sich_aendern(self) -> None:
        Path("CHANGELOG.md").write_text(
            "# Änderungen\n\nNeuer Hinweis.\n\n---\n\n## 0.4.1 — 01.01.2026 · Alt\n"
        )
        self.commit("pr")
        self.assertEqual(ent.pruefen(self.e, self.basis), ([], []))

    def test_hinweis_ohne_baustein(self) -> None:
        Path("app.ts").write_text("x")
        self.commit("pr")
        fehler, hinweise = ent.pruefen(self.e, self.basis)
        self.assertEqual(fehler, [])
        self.assertEqual(len(hinweise), 1)

    def test_uv_lock_nur_eigenes_paket(self) -> None:
        Path("pyproject.toml").write_text('[project]\nname = "x"\nversion = "0.1.0"\n')
        lock = Path("uv.lock")
        lock.write_text(
            '[[package]]\nname = "fremd"\nversion = "0.1.0"\n\n'
            '[[package]]\nname = "x"\nversion = "0.1.0"\n'
        )
        ent.schreibe_version(lock, "0.2.0", ent.paket_name(Path("pyproject.toml")))
        self.assertEqual(
            lock.read_text(),
            '[[package]]\nname = "fremd"\nversion = "0.1.0"\n\n'
            '[[package]]\nname = "x"\nversion = "0.2.0"\n',
        )

    def test_pyproject_version(self) -> None:
        p = Path("pyproject.toml")
        p.write_text('[project]\nname = "x"\nversion = "0.1.0"\n')
        ent.schreibe_version(p, "0.2.0")
        self.assertEqual(ent.lies_version(p), "0.2.0")


if __name__ == "__main__":
    unittest.main()
