#!/usr/bin/env python3
"""
Amtliches Ortschaftenverzeichnis (swisstopo) → rapport/src/lib/plzdaten.js
Quelle: https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ (CSV, LV95)
Pro Ortschaft + PLZ der Kanton mit dem grössten Adressenanteil. Zeilen: "PLZ|Ort|KT".
Aufruf: python3 rapport/scripts/plz.py   (selten nötig — Verzeichnis ändert sich kaum)
"""
import csv, io, json, os, urllib.request, zipfile

URL = 'https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_2056.csv.zip'
z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(URL, timeout=60).read()))
name = [n for n in z.namelist() if n.endswith('.csv')][0]
text = z.read(name).decode('utf-8-sig')
best = {}
for r in csv.DictReader(io.StringIO(text), delimiter=';'):
    ort, plz, kt = r['Ortschaftsname'].strip(), r['PLZ4'].strip(), r['Kantonskürzel'].strip()
    if not (ort and plz and kt) or kt == 'FL':
        continue
    anteil = float(r['Adressenanteil'].replace('%', '').strip() or 0)
    key = (plz, ort)
    if key not in best or anteil > best[key][1]:
        best[key] = (kt, anteil)
zeilen = sorted(f'{plz}|{ort}|{kt}' for (plz, ort), (kt, _) in best.items())
ziel = os.path.join(os.path.dirname(__file__), '..', 'src', 'lib', 'plzdaten.js')
with open(ziel, 'w') as f:
    f.write('// Automatisch erzeugt aus dem amtlichen Ortschaftenverzeichnis (swisstopo) — rapport/scripts/plz.py\n')
    f.write('export default ' + json.dumps('\n'.join(zeilen), ensure_ascii=False) + '\n')
print(len(zeilen), 'Einträge →', os.path.relpath(ziel), os.path.getsize(ziel) // 1024, 'KB')
