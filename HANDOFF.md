# BauLog — Übergabe-Notizen (Session Oktober 2026)

> Zweck: Wissen aus der Cloud-Session (`session_01MJAWLruKh457Df2gVEsJPs`, Branch
> `claude/baulog-app-improvements-bvddmx`) an eine neue/lokale Claude-Session übergeben,
> damit nichts verloren geht. Ergänzt `CLAUDE.md` (dort steht die stabile
> Architektur/Übersicht) um den aktuellen Stand + offene Punkte.
>
> Für eine neue Claude-Session: Lies zuerst `CLAUDE.md`, dann diese Datei.

## Was in dieser Session gebaut wurde (chronologisch)

1. **Supabase-Projekt war pausiert** (Free-Tier pausiert nach Inaktivität) — Login schlug
   fehl. Behoben durch "Resume project" im Supabase-Dashboard. **Lehre:** Falls Login
   wieder mal grundlos fehlschlägt → zuerst https://supabase.com/dashboard/project/nhlhrqxmxtacaygnydxf
   prüfen, ob dort ein "paused"-Banner steht.
2. **PDF-Vorschau**: Button "Vorschau" bei Leistungsnachweis- und
   Abrechnungsübersicht-Dialog (`src/lib/share.js: previewPdf()`, öffnet Blob-URL in
   neuem Tab, ohne zu teilen oder einen Abrechnungs-Abschnitt anzulegen).
3. **Einträge nachträglich bearbeiten**: Stift-Button bei jedem Eintrag
   (`src/lib/db.js: updateEintrag()`, `AddSheet` in `ProjektDetail.jsx` unterstützt jetzt
   `editEntry`-Prop). Mitarbeiter dürfen nur eigene Eintragstypen bearbeiten (Zeit, Menge,
   Foto, Tagebuch — keine Kosten-Einträge).
4. **KI-Textüberarbeitung** für Tagebuch-Einträge: Button "Text überarbeiten"
   (`src/lib/ai.js: korrekturText()`, Edge-Function-Task `korrektur`, Modell `gpt-4o`).
   Verbessert Satzbau/Formulierung spürbar, behält Fakten/Inhalt bei. Daneben weiterhin
   der bestehende "Nach DIN"-Button (komplette VOB-Stil-Umformulierung).
5. **Zeiten nachtragen (KI)**: Neuer Button neben "Zeit manuell erfassen" — Freitext/Diktat
   mit mehreren Tagen/Uhrzeiten/Beschreibungen wird per KI (`parseNachtrag()`,
   Edge-Function-Task `nachtrag`) strukturiert, in editierbarer Vorschau geprüft und mit
   einem Tap als mehrere Zeit-/Tagebuch-Einträge mit korrektem historischem Datum
   angelegt (nicht "heute").
6. **KI-Fehlermeldungen verbessert**: `callAI()` in `ai.js` liest jetzt den echten
   Fehlertext aus `error.context` (Supabase zeigt sonst nur die nichtssagende
   "non-2xx status code"-Meldung).

## Wichtige betriebliche Erkenntnis: zwei getrennte Deploy-Wege

- **Frontend (GitHub Pages)**: deployed automatisch bei `git push` auf `main`
  (`.github/workflows/deploy.yml`). Kostet nichts, kein Limit.
- **Supabase Edge Function `baulog-ai`**: wird **NICHT** automatisch deployed! Jede
  Änderung an `supabase/functions/baulog-ai/index.ts` muss manuell im
  Supabase-Dashboard nachgezogen werden:
  Dashboard → Projekt `nhlhrqxmxtacaygnydxf` → **Edge Functions → baulog-ai → Code** →
  Inhalt der lokalen Datei einfügen → **Deploy**.
  **Kontingent-Sorge ist unbegründet**: Weder Deploys noch die paar manuellen Tests
  verbrauchen irgendein knappes Supabase-Kontingent (500k Function-Aufrufe/Monat frei).
  Einzige echte Kosten: OpenAI-API-Nutzung (eigener OpenAI-Account), unabhängig davon
  ob lokal oder live getestet wird.
- **Idee für eine CI-Automatisierung der Function-Deploys** (Supabase CLI + GitHub Action
  mit `SUPABASE_ACCESS_TOKEN`-Secret) wurde besprochen, aber noch nicht umgesetzt — wäre
  ein sinnvoller nächster Schritt, falls das manuelle Nachziehen nervt.

## Git-Workflow in diesem Projekt

- Entwicklungs-Branch: `claude/baulog-app-improvements-bvddmx`
- Deploy-Branch: `main` (GitHub Pages liest nur von hier)
- Muster pro Änderung: auf Feature-Branch committen & pushen → `git checkout main
  && git pull && git merge --ff-only claude/baulog-app-improvements-bvddmx && git push`
- Bei Edge-Function-Änderungen zusätzlich den manuellen Supabase-Deploy nicht vergessen
  (siehe oben) — sonst bleibt der alte Server-Code aktiv und neue KI-Buttons liefern
  Fehler wie "unbekannter task".

## Offener Punkt — wartet auf Nacherfassung

Der Nutzer hat folgende Arbeitszeiten auf Papier notiert (App war zum Zeitpunkt der
Erfassung nicht nutzbar) und noch **nicht** über "Zeiten nachtragen (KI)" in die App
übernommen:

```
24.08.2026
9:30 - 12:40 Uhr   (190 Min)
13:30 - 19:00 Uhr  (330 Min)
Wasserleitungen an I-Box angeschlossen, Befestigungskonstruktion montiert.
Stemmarbeiten vorgenommen.
Hauptwasserleitungen umgerüstet auf Wasserverteiler. Provisorische Brücke für
Badewanne an Wasserverteiler erstellt.

26.08.2026
10:00 - 13:00 Uhr  (180 Min)
15:30 - 21:30 Uhr  (360 Min)
I-Box fertig wasserdicht montiert und Leitungen verschäumt und verputzt. Badewanne
ausgebaut, Badewannen-Armatur geschlitzt, positioniert und Wasserleitungen verlegt,
isoliert und angeschlossen. Alte Badewannenarmatur provisorisch montiert. Fliesen
über Badewanne abgeschlagen.
```

Vorgeschlagenes Gewerk: **Sanitär**. Welches Projekt das betrifft, wurde in der Session
nicht geklärt — bitte beim Nacherfassen angeben/auswählen.

## Quellen / Links

- Repo: https://github.com/EBI-cyber/baulog
- Live-App: https://ebi-cyber.github.io/baulog/
- Supabase-Dashboard: https://supabase.com/dashboard/project/nhlhrqxmxtacaygnydxf
- Lokaler Checkout (laut `CLAUDE.md`): `C:\Users\eugen\Projekte\baulog`
- Diese Session (Cloud): `session_01MJAWLruKh457Df2gVEsJPs`,
  https://claude.ai/code/session_01MJAWLruKh457Df2gVEsJPs
