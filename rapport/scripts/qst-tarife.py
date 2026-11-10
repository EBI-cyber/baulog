#!/usr/bin/env python3
"""
Quellensteuer-Tarife der ESTV (Löhne) in kompakte JSON-Dateien für die Rapport-App umwandeln.

Quelle: https://www.estv.admin.ch/de/quellensteuertarife-import-in-lohnbuchhaltungssysteme
        Dateien https://www.estv2.admin.ch/qst/<jahr>/loehne/tar<jj><kt>.zip
Format: „Aufbau und Recordformate der Quellensteuer-Tarife ab 2025 (Löhne)“, Recordart 06:
        Pos 7–16 Code Tarif, 17–24 gültig ab, 25–33 steuerbares Monatseinkommen ab (Rappen),
        34–42 Tarifschritt (Rappen), 44–45 Kinder, 46–54 Mindeststeuer (Rappen), 55–59 Satz in 1/100 %.

Ausgabe: rapport/public/qst/<jahr>/<kt>/<CODE>.json  (eine kleine Datei pro Tarif, ca. 15 KB)
          = { "jahr", "kanton", "code", "quelle", "stand", "stufen": [[ab_fr, satz_hundertstel, (mindest_rp)], …] }
Wird beim Deploy erzeugt (nicht eingecheckt).
Aufeinanderfolgende Stufen mit gleichem Satz (und gleicher Mindeststeuer) werden zusammengefasst.
Aufnahme nur der Tarife A, B, C, H (Wohnsitz in der Schweiz, mit/ohne Kirchensteuer).

Aufruf:  python3 rapport/scripts/qst-tarife.py 2026            (alle Kantone)
         python3 rapport/scripts/qst-tarife.py 2026 zg zh      (einzelne)
"""
import io, json, os, sys, urllib.request, zipfile

KANTONE = 'ag ai ar be bl bs fr ge gl gr ju lu ne nw ow sg sh so sz tg ti ur vd vs zg zh'.split()
CODES = ('A', 'B', 'C', 'H')

def laden(jahr, kt):
    url = f'https://www.estv2.admin.ch/qst/{jahr}/loehne/tar{str(jahr)[2:]}{kt}.zip'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    return url, z.read(z.namelist()[0]).decode('latin-1').splitlines()

def umwandeln(jahr, kt):
    url, zeilen = laden(jahr, kt)
    stand = next((l[19:27] for l in zeilen if l.startswith('00')), '')
    tarife = {}
    for l in zeilen:
        if not l.startswith('06'):
            continue
        code = l[6:16].strip()
        if not code or code[0] not in CODES:
            continue
        ab = int(l[24:33]) // 100            # Franken (immer ganze Franken, z.B. 6501.00)
        mindest = int(l[45:54])              # Rappen
        satz = int(l[54:59])                 # 1/100 %
        liste = tarife.setdefault(code, [])
        eintrag = [ab, satz] + ([mindest] if mindest else [])
        if liste and liste[-1][1:] == eintrag[1:]:
            continue                         # gleicher Satz wie vorher → Stufe zusammenfassen
        liste.append(eintrag)
    for liste in tarife.values():
        liste.sort(key=lambda e: e[0])
    ziel = os.path.join(os.path.dirname(__file__), '..', 'public', 'qst', str(jahr), kt)
    os.makedirs(ziel, exist_ok=True)
    groesse = 0
    for code, stufen in tarife.items():
        pfad = os.path.join(ziel, f'{code}.json')
        with open(pfad, 'w') as f:
            json.dump({'jahr': jahr, 'kanton': kt.upper(), 'code': code, 'quelle': url, 'stand': stand, 'stufen': stufen}, f, separators=(',', ':'))
        groesse += os.path.getsize(pfad)
    return ziel, len(tarife), groesse

if __name__ == '__main__':
    jahr = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    for kt in (sys.argv[2:] or KANTONE):
        try:
            pfad, n, groesse = umwandeln(jahr, kt.lower())
            print(f'{kt.upper()}: {n} Tarife, {groesse // 1024} KB → {os.path.relpath(pfad)}')
        except Exception as e:
            print(f'{kt.upper()}: FEHLER {e}')
            sys.exit(1)
