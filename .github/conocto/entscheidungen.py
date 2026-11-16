#!/usr/bin/env python3
"""Entscheidungen, Version und Changelog ohne Merge-Konflikte (gleich in allen Conocto-Repos).

Im PR: neue Entscheidung als `<ordner>/neu-<titel>.md`, Änderung als `<bausteine>/<titel>.md`.
Nach dem Merge vergibt `vergeben` auf main Nummer, Tabellenzeile, Version und Changelog.
`pruefen` läuft im PR und meldet, was später zu Konflikten führen würde.

Gleiche Datei in bubbleLV, bauonto, conocto-bim, conocto-design. Nur Python-Standardbibliothek.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

WERKZEUG_VERSION = "1"
STATUS_ANFAENGE = (
    "vorgeschlagen",
    "akzeptiert",
    "ersetzt durch",
    "teilweise ersetzt durch",
    "ergänzt durch",
    "verworfen",
)
ARTEN = ("funktion", "korrektur")
NUMMER_DATEI = re.compile(r"^(\d{4})-.+\.md$")
NEU_DATEI = re.compile(r"^neu-([a-z0-9][a-z0-9-]*)\.md$")
TABELLEN_ZEILE = re.compile(r"^\|\s*(\d{4})\s*\|")
KOPF_FELD = re.compile(r"^-\s*(?:\*\*)?(Status|Datum)(?::\*\*|\*\*:|:)\s*(.*)$")
LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


@dataclass
class Einstellung:
    praefix: str
    ordner: Path
    versionsdatei: Path | None
    lockdatei: Path | None
    changelog: Path
    bausteine: Path


class Fehler(Exception):
    pass


# --- Hilfen ---------------------------------------------------------------------------------


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def git_datei(rev: str, pfad: Path) -> str | None:
    r = subprocess.run(["git", "show", f"{rev}:{pfad.as_posix()}"], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def heute() -> datetime:
    return datetime.now(ZoneInfo("Europe/Berlin"))


def kopf_felder(text: str) -> dict[str, str]:
    felder: dict[str, str] = {}
    for zeile in text.splitlines()[:15]:
        m = KOPF_FELD.match(zeile.strip())
        if m and m[1] not in felder:
            felder[m[1]] = LINK.sub(r"\1", m[2]).strip()
    return felder


def titel_ohne_nummer(erste_zeile: str) -> str:
    t = erste_zeile.lstrip("#").strip()
    return re.sub(r"^(?:[A-Z]+-)?(?:\d{4}|NEU|neu)\s*[–-]\s*", "", t)


def versions_abschnitte(text: str) -> list[str]:
    return [z for z in text.splitlines() if z.startswith("## ")]


def tabellen_nummern(text: str) -> set[str]:
    return {m[1] for z in text.splitlines() if (m := TABELLEN_ZEILE.match(z))}


# --- Version --------------------------------------------------------------------------------


def lies_version(pfad: Path, text: str | None = None) -> str:
    text = pfad.read_text(encoding="utf-8") if text is None else text
    if pfad.suffix == ".json":
        return str(json.loads(text)["version"])
    m = re.search(r'(?m)^version\s*=\s*"([^"]+)"', text)
    if not m:
        raise Fehler(f"Keine Version in {pfad}")
    return m[1]


def schreibe_version(pfad: Path, neu: str, name: str | None = None) -> None:
    text = pfad.read_text(encoding="utf-8")
    if pfad.suffix == ".json":
        daten = json.loads(text)
        daten["version"] = neu
        root = daten.get("packages", {}).get("")
        if isinstance(root, dict) and "version" in root:
            root["version"] = neu
        pfad.write_text(json.dumps(daten, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    elif name:
        # uv.lock: nur den Eintrag des eigenen Pakets, andere Pakete können dieselbe Version haben.
        muster = rf'(?m)^(name\s*=\s*"{re.escape(name)}"\s*\nversion\s*=\s*)"[^"]+"'
        pfad.write_text(re.sub(muster, rf'\g<1>"{neu}"', text, count=1), encoding="utf-8")
    else:
        pfad.write_text(
            re.sub(r'(?m)^(version\s*=\s*)"[^"]+"', rf'\g<1>"{neu}"', text, count=1),
            encoding="utf-8",
        )


def paket_name(pfad: Path) -> str | None:
    text = pfad.read_text(encoding="utf-8")
    if pfad.suffix == ".json":
        name = json.loads(text).get("name")
        return str(name) if name else None
    m = re.search(r'(?m)^name\s*=\s*"([^"]+)"', text)
    return m[1] if m else None


def naechste_version(alt: str, arten: list[str]) -> str:
    major, minor, patch = (int(x) for x in alt.split(".")[:3])
    if "funktion" in arten:
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


# --- Bausteine ------------------------------------------------------------------------------


@dataclass
class Baustein:
    pfad: Path
    art: str
    titel: str
    text: str


def lies_baustein(pfad: Path, text: str | None = None) -> Baustein:
    text = pfad.read_text(encoding="utf-8") if text is None else text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not m:
        raise Fehler(f"{pfad}: Kopf fehlt (---, art: funktion|korrektur, ---)")
    art_m = re.search(r"(?m)^art:\s*(\w+)", m[1])
    art = art_m[1] if art_m else ""
    if art not in ARTEN:
        raise Fehler(f"{pfad}: art muss funktion oder korrektur sein, nicht „{art}“")
    zeilen = m[2].strip().splitlines()
    if not zeilen or not zeilen[0].strip():
        raise Fehler(f"{pfad}: erste Zeile nach dem Kopf ist der Titel und fehlt")
    return Baustein(pfad, art, zeilen[0].strip(), "\n".join(zeilen[1:]).strip())


def bausteine_von(e: Einstellung) -> list[Path]:
    if not e.bausteine.is_dir():
        return []
    return sorted(p for p in e.bausteine.glob("*.md") if p.name.lower() != "readme.md")


def changelog_abschnitt(version: str, bs: list[Baustein], datum: datetime) -> str:
    titel = " · ".join(b.titel for b in bs)
    rumpf = "\n\n".join(b.text for b in bs if b.text)
    kopf = f"## {version} — {datum:%d.%m.%Y} · {titel}"
    return f"{kopf}\n\n{rumpf}\n" if rumpf else f"{kopf}\n"


def schreibe_changelog(pfad: Path, abschnitt: str) -> None:
    if not pfad.exists():
        pfad.write_text(
            "# Änderungen\n\nWas sich von Version zu Version geändert hat. Neueste Version oben.\n"
            "\n---\n\n" + abschnitt,
            encoding="utf-8",
        )
        return
    zeilen = pfad.read_text(encoding="utf-8").splitlines(keepends=True)
    pos = next((i for i, z in enumerate(zeilen) if z.startswith("## ")), len(zeilen))
    zeilen[pos:pos] = [abschnitt, "\n"]
    pfad.write_text("".join(zeilen), encoding="utf-8")


# --- Entscheidungen -------------------------------------------------------------------------


def hoechste_nummer(ordner: Path) -> int:
    nummern = [int(m[1]) for p in ordner.glob("*.md") if (m := NUMMER_DATEI.match(p.name))]
    return max(nummern, default=0)


def neu_dateien(ordner: Path) -> list[Path]:
    def zeit(p: Path) -> tuple[int, str]:
        log = git("log", "--format=%ct", "--diff-filter=A", "--", p.as_posix()).split()
        return (int(log[-1]) if log else 0, p.name)

    return sorted((p for p in ordner.glob("neu-*.md") if NEU_DATEI.match(p.name)), key=zeit)


WORKFLOWS = ".github/workflows/"


def text_dateien() -> list[Path]:
    out: list[Path] = []
    for name in git("ls-files", "-z").split("\0"):
        p = Path(name)
        # Workflows darf der Standard-Token von GitHub nicht ändern (Rechte `workflows`).
        if not name or name.startswith(WORKFLOWS) or not p.is_file():
            continue
        if p.stat().st_size > 2_000_000:
            continue
        try:
            p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        out.append(p)
    return out


def tabellenzeile(nr: str, titel: str, datei: str, status: str, datum: str, vorlage: str) -> str:
    werte = [nr, f"[{titel}]({datei})", status, datum]
    breiten = [len(z.strip()) for z in vorlage.strip().strip("|").split("|")]
    if len(breiten) != len(werte):
        breiten = [0] * len(werte)
    return "| " + " | ".join(w.ljust(b) for w, b in zip(werte, breiten, strict=True)) + " |\n"


def ergaenze_tabelle(readme: Path, zeilen_neu: list[str]) -> None:
    zeilen = readme.read_text(encoding="utf-8").splitlines(keepends=True)
    letzte = max((i for i, z in enumerate(zeilen) if TABELLEN_ZEILE.match(z)), default=None)
    if letzte is None:
        trenner = next((i for i, z in enumerate(zeilen) if re.match(r"^\|\s*-{3,}", z)), None)
        if trenner is None:
            raise Fehler(f"{readme}: keine Übersichtstabelle gefunden")
        letzte = trenner
    zeilen[letzte + 1 : letzte + 1] = zeilen_neu
    readme.write_text("".join(zeilen), encoding="utf-8")


def trenner_von(readme: Path) -> str:
    for z in readme.read_text(encoding="utf-8").splitlines():
        if re.match(r"^\|\s*-{3,}", z):
            return z
    return ""


def vergeben(e: Einstellung) -> dict[str, str]:
    ergebnis: dict[str, str] = {}
    neue = neu_dateien(e.ordner)
    nr = hoechste_nummer(e.ordner)
    ersetzungen: list[tuple[str, str, str]] = []
    tabelle: list[str] = []
    readme = e.ordner / "README.md"
    vorlage = trenner_von(readme) if readme.exists() else ""
    for p in neue:
        nr += 1
        slug = NEU_DATEI.match(p.name)[1]  # type: ignore[index]
        nummer = f"{nr:04d}"
        ziel = e.ordner / f"{nummer}-{slug}.md"
        git("mv", p.as_posix(), ziel.as_posix())
        text = ziel.read_text(encoding="utf-8")
        erste, _, rest = text.partition("\n")
        titel = titel_ohne_nummer(erste)
        ziel.write_text(f"# {e.praefix}-{nummer} – {titel}\n{rest}", encoding="utf-8")
        felder = kopf_felder(text)
        tabelle.append(
            tabellenzeile(
                nummer,
                titel,
                ziel.name,
                felder.get("Status", "akzeptiert"),
                felder.get("Datum", f"{heute():%Y-%m-%d}"),
                vorlage,
            )
        )
        ersetzungen.append((slug, nummer, ziel.name))
        print(f"{p.name} → {ziel.name} ({e.praefix}-{nummer})")
    if ersetzungen:
        for datei in text_dateien():
            alt = datei.read_text(encoding="utf-8")
            neu = alt
            for slug, nummer, name in ersetzungen:
                neu = neu.replace(f"neu-{slug}.md", name)
                neu = re.sub(rf"(?<![\w/.-])neu-{re.escape(slug)}(?![\w-])", nummer, neu)
            if neu != alt:
                datei.write_text(neu, encoding="utf-8")
        if readme.exists():
            ergaenze_tabelle(readme, tabelle)
        ergebnis["entscheidungen"] = ", ".join(f"{e.praefix}-{n}" for _, n, _ in ersetzungen)

    pfade = bausteine_von(e)
    if pfade:
        bs = [lies_baustein(p) for p in pfade]
        if e.versionsdatei is None:
            raise Fehler("Bausteine gefunden, aber keine --versionsdatei angegeben")
        alt = lies_version(e.versionsdatei)
        neu = naechste_version(alt, [b.art for b in bs])
        schreibe_version(e.versionsdatei, neu)
        if e.lockdatei and e.lockdatei.exists():
            schreibe_version(e.lockdatei, neu, paket_name(e.versionsdatei))
        schreibe_changelog(e.changelog, changelog_abschnitt(neu, bs, heute()))
        for p in pfade:
            git("rm", "-q", p.as_posix())
        ergebnis["version"] = neu
        print(f"Version {alt} → {neu} aus {len(bs)} Baustein(en)")
    return ergebnis


# --- Prüfung im PR --------------------------------------------------------------------------


def pruefen(e: Einstellung, basis: str) -> tuple[list[str], list[str]]:
    fehler: list[str] = []
    hinweise: list[str] = []
    geaendert: dict[str, str] = {}
    for zeile in git("diff", "--name-status", "--no-renames", f"{basis}...HEAD").splitlines():
        art, _, pfad = zeile.partition("\t")
        geaendert[pfad] = art[0]
    ordner = e.ordner.as_posix().rstrip("/") + "/"

    for pfad, art in geaendert.items():
        p = Path(pfad)
        if not pfad.startswith(ordner) or p.parent != e.ordner:
            continue
        if art == "A" and NUMMER_DATEI.match(p.name):
            fehler.append(
                f"{pfad}: neue Entscheidung bitte als {ordner}neu-<titel>.md anlegen. "
                "Die Nummer vergibt der Bot nach dem Merge."
            )
        if art != "D" and p.name.startswith("neu-"):
            if not NEU_DATEI.match(p.name):
                fehler.append(f"{pfad}: Name nur aus a–z, 0–9 und -, z. B. neu-mein-titel.md")
                continue
            text = p.read_text(encoding="utf-8")
            if not text.startswith("# "):
                fehler.append(f"{pfad}: erste Zeile muss „# NEU – Titel“ sein")
            felder = kopf_felder(text)
            status = felder.get("Status", "")
            if not status.startswith(STATUS_ANFAENGE):
                fehler.append(
                    f"{pfad}: Status fehlt oder unbekannt („{status}“). Erlaubt: "
                    + ", ".join(STATUS_ANFAENGE)
                )
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", felder.get("Datum", "")):
                fehler.append(f"{pfad}: Datum fehlt (Form JJJJ-MM-TT)")

    slugs = [m[1] for p in e.ordner.glob("neu-*.md") if (m := NEU_DATEI.match(p.name))]
    for pfad in geaendert:
        if not pfad.startswith(WORKFLOWS) or not Path(pfad).is_file():
            continue
        text = Path(pfad).read_text(encoding="utf-8")
        for slug in slugs:
            if re.search(rf"(?<![\w/.-])neu-{re.escape(slug)}(?![\w-])", text):
                fehler.append(
                    f"{pfad}: verweist auf neu-{slug}. Workflows ändert der Bot nicht; "
                    "bitte die Entscheidung dort beim Titel nennen oder nach dem Merge verlinken."
                )

    readme = e.ordner / "README.md"
    if readme.as_posix() in geaendert and readme.exists():
        vorher = tabellen_nummern(git_datei(basis, readme) or "")
        neu = tabellen_nummern(readme.read_text(encoding="utf-8")) - vorher
        if vorher and neu:
            fehler.append(
                f"{readme}: Zeile(n) {', '.join(sorted(neu))} bitte nicht von Hand ergänzen. "
                "Die Zeile schreibt der Bot nach dem Merge."
            )

    if e.changelog.as_posix() in geaendert and e.changelog.exists():
        abschnitte = versions_abschnitte(git_datei(basis, e.changelog) or "")
        if versions_abschnitte(e.changelog.read_text(encoding="utf-8")) != abschnitte:
            fehler.append(
                f"{e.changelog}: Versions-Abschnitte bitte nicht von Hand ändern. Stattdessen "
                f"{e.bausteine.as_posix()}/<titel>.md anlegen."
            )
    for datei in (e.versionsdatei, e.lockdatei):
        if datei is None or datei.as_posix() not in geaendert or not datei.exists():
            continue
        alt_text = git_datei(basis, datei)
        if alt_text is not None and lies_version(datei, alt_text) != lies_version(datei):
            fehler.append(
                f"{datei}: Versionsnummer bitte nicht von Hand ändern. Der Bot erhöht sie "
                f"nach dem Merge aus {e.bausteine.as_posix()}/."
            )

    bausteine_neu = []
    for pfad, art in geaendert.items():
        p = Path(pfad)
        ist_baustein = p.parent == e.bausteine and p.suffix == ".md"
        if ist_baustein and p.name.lower() != "readme.md" and art != "D":
            try:
                lies_baustein(p)
                bausteine_neu.append(p)
            except Fehler as f:
                fehler.append(str(f))
    code = [
        p
        for p in geaendert
        if not (
            p.startswith(("docs/", ".github/", ".claude/"))
            or p.endswith(".md")
            or "/tests/" in f"/{p}"
            or "test" in Path(p).name
        )
    ]
    if code and not bausteine_neu and e.versionsdatei is not None:
        hinweise.append(
            f"Code geändert, aber kein Baustein in {e.bausteine.as_posix()}/. "
            "Ohne Baustein gibt es keine neue Version und keinen Changelog-Eintrag."
        )
    return fehler, hinweise


# --- Aufruf ---------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("befehl", choices=["pruefen", "vergeben"])
    ap.add_argument("--praefix", required=True)
    ap.add_argument("--ordner", default="docs/decisions")
    ap.add_argument("--versionsdatei")
    ap.add_argument("--lockdatei")
    ap.add_argument("--changelog", default="CHANGELOG.md")
    ap.add_argument("--bausteine", default="changes")
    ap.add_argument("--basis", help="nur pruefen: Commit, gegen den der PR läuft")
    a = ap.parse_args(argv)
    e = Einstellung(
        praefix=a.praefix,
        ordner=Path(a.ordner),
        versionsdatei=Path(a.versionsdatei) if a.versionsdatei else None,
        lockdatei=Path(a.lockdatei) if a.lockdatei else None,
        changelog=Path(a.changelog),
        bausteine=Path(a.bausteine),
    )
    try:
        if a.befehl == "pruefen":
            if not a.basis:
                raise Fehler("pruefen braucht --basis")
            fehler, hinweise = pruefen(e, a.basis)
            for h in hinweise:
                print(f"::warning::{h}")
            for f in fehler:
                print(f"::error::{f}")
            if not fehler:
                print("Entscheidungen, Version und Changelog: alles in Ordnung.")
            return 1 if fehler else 0
        ergebnis = vergeben(e)
        ausgabe = os.environ.get("GITHUB_OUTPUT")
        if ausgabe:
            with open(ausgabe, "a", encoding="utf-8") as datei:
                for k, v in ergebnis.items():
                    datei.write(f"{k}={v}\n")
        if not ergebnis:
            print("Nichts zu vergeben.")
        return 0
    except Fehler as f:
        print(f"::error::{f}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
