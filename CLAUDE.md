# BauLog — Projektkontext

> Mobile-first PWA: **Bautagebuch + Stunden/Material/Maschine-Erfassung + EP-Kalkulation** für
> Sanierungs-/Renovierungsprojekte. Ziel: aus echten Ist-Kosten & -Zeiten genaue Einheitspreise
> (EP) fürs Angebot ableiten.
>
> Siehe auch `HANDOFF.md` für den aktuellen Session-Stand, offene Punkte und
> Übergabe-Hinweise an neue/lokale Claude-Sessions.

## Stack
- Vite + React 18 + TailwindCSS 3 + Framer-Motion
- Dexie (IndexedDB, offline-first) + Token-basierter Cloud-Sync zu Supabase
- vite-plugin-pwa (generateSW), HashRouter, `base: '/baulog/'`
- Icons: **lucide-react** (siehe Design-Skill `baulog-design`)

## Hosting & Deploy
- Repo: https://github.com/EBI-cyber/baulog
- Live: **https://ebi-cyber.github.io/baulog/** (GitHub Pages via `.github/workflows/deploy.yml`)
- Deploy = einfach `git push` auf `main`. Build-Env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) als Repo-Variablen.
- Build lokal (Windows, cwd kann auf `C:\` zurückspringen): `npm --prefix C:/Users/eugen/Projekte/baulog run build`

## Supabase (geteiltes Projekt `nhlhrqxmxtacaygnydxf`)
- Auth: E-Mail/Passwort, **„Confirm email" AUS** (sofortige Anmeldung ohne Bestätigungsmail).
- Tabellen: `bau_projekte`, `bau_eintraege`, `bau_rechnungen`, `bau_members` (Team). **Quelle: `supabase/migrations/`** — wird bei jedem Push auf `main` automatisch per GitHub Actions eingespielt (Job `datenbank`, läuft VOR dem App-Build). Neue DB-Änderungen immer als neue, idempotente Migrationsdatei anlegen. `schema.sql`/`schema_team.sql` sind nur noch die alte Handversion.
- GitHub braucht dafür: Secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, Variable `SUPABASE_PROJECT_REF` (= `nhlhrqxmxtacaygnydxf`). Fehlen sie, bricht der Deploy bewusst ab.
- Edge Function `baulog-ai` (Deno, Secret `OPENAI_KEY`): Tasks `din` / `korrektur` / `nachtrag` / `setup` / `abschluss` (+ `einsatzvertrag` für die Rapport-App) (gpt-4o-mini, `korrektur` auf gpt-4o). Wird beim Push auf `main` automatisch mit ausgeliefert (Job `datenbank`).
- Edge Function `invite-worker` (vorhanden, aktuell **inaktiv** — Auto-Einladung deaktiviert, s.u.).

## Cloud-Sync
- `src/lib/cloud.js`: automatischer Sync (1,5 s nach jeder lokalen Änderung, beim Zurückkehren in die App, bei wieder vorhandenem Netz, jede Minute). Upload erst als Paket, bei Fehler einzeln; Fehler landen in der Sync-Anzeige (`SyncBadge`).
- Lokale, noch nicht hochgeladene Änderungen werden nie vom Cloud-Stand überschrieben. Löschungen laufen über die Dexie-Tabelle `geloescht` (Tombstones). In der Cloud gelöschte Datensätze verschwinden auch lokal.
- Screens laden über `useCloudRefresh(load)` neu, wenn der Sync Cloud-Daten übernommen hat.

## Kernfunktionen
- **Projekte** mit Einträgen: Zeit (Timer), Menge/Leistung, Material (EK), Maschine (Stundensatz), Foto, Tagebuch.
- **Timer**: Start/Pause/Stopp, **sekundengenau** (minutes als Bruchteil gespeichert, DB-Spalte `numeric`).
- **EP-Vorschau** pro Projekt: Selbstkosten je Einheit = (Lohn+Material+Maschine)/Menge.
- **Leistungsnachweis-PDF** (jsPDF): gruppierte Leistungen mit EP-Spalte, Bautagebuch, Fotos; mit/ohne Kosten.
- **DIN-Leistungskatalog** (~80 Positionen, 10 Gewerke) mit Einheiten; „DIN-Standardkatalog ergänzen".
- **KI**: Sprachnotiz→DIN-Text, KI-Setup (Timer), KI-Abschluss (Material/Maschine erkennen) — serverseitig via `baulog-ai`.
- **Live-Kamera** + Web Speech API (de-DE).
- **Video-Scan für lange Belege** (`VideoScan.jsx`, `lib/videoscan.js`): Schritt 1 Übersichtsfoto zuschneiden, Schritt 2 Handy über den Beleg führen. Jedes Kamerabild wird im Übersichtsfoto wiedergefunden (`verfolger`), scharfe Abschnitte werden dort platziert und zusammengesetzt; Mini-Karte zeigt die Abdeckung, Lücken füllt man durch Zurückfahren. Begleiter (lokal, ohne Cloud-KI) gibt Hinweise zu Waagerecht/Abstand/Tempo/Licht/Schärfe, auch per Sprache. Lange Belege gehen in überlappenden Stücken an die KI (`bilder` im Task `beleg`).

## Team (pro Projekt)
- `bau_members(owner, projekt_token, member_email, gewerke text[])` + SECURITY-DEFINER-Helfer `is_project_member`, `project_owner` (RLS ohne Rekursion).
- **Rolle** wird in `App.jsx` erkannt: *owner* (besitzt Projekte) vs *worker* (nur fremde Projekte).
- **Mitarbeiter sehen KEINE Kosten** und nur ihre **zugewiesenen Gewerke** (Chips im Team-Sheet `👷`).
- **Einladung**: ✈-Knopf öffnet vorausgefüllte E-Mail (mailto, Empfänger+Text). Mitarbeiter registriert sich selbst mit der zugewiesenen E-Mail → Einstellungen → Sync.
- Automatische Supabase-Einladung wurde **bewusst deaktiviert** (kollidierte mit Selbst-Registrierung). `SetPassword.jsx` + `invite-worker` liegen fertig in der Schublade, falls wir später auf SMTP umstellen.

## Wichtige Dateien
- `src/App.jsx` (Rolle, Layout/Sidebar), `src/components/Nav.jsx`
- `src/screens/`: `Projekte`, `ProjektDetail` (Timer/AddSheet/AbschlussSheet/TeamSheet/EP), `Dashboard` (Auswertung), `Einstellungen`, `Login`, `SetPassword`
- `src/lib/`: `db.js` (Dexie), `cloud.js` (Sync), `team.js`, `calc.js`, `settings.js`, `ai.js`, `pdf.js`, `share.js`, `format.js` (`hms`)
- `src/ui/IconChip.jsx`

## Design
Folgt dem Skill **`baulog-design`** (dunkles Glas, lucide-Icons, IconChips, responsive Sidebar+Bottom-Nav, Gradient-Buttons). Farbwelt: **amber `#f59e0b` → ember `#ef4444`**.

## Offene Punkte / Ideen
- Optional: vollautomatische Einladungs-Mail via funktionierendes SMTP (dann `invite-worker` + `SetPassword` reaktivieren).
- Bundle ist groß (~1 MB) — bei Bedarf Code-Splitting.
- Nacherfassung ausstehender Arbeitszeiten (24./26.08.2026) über "Zeiten nachtragen (KI)" — Details in `HANDOFF.md`.

## Zweite App: Rapport (`rapport/`)
- Eigenständige PWA (eigenes `package.json`) für einfache Arbeitszeiterfassung beim Temporäreinsatz: Start/Pause/Feierabend, Einsatzbetrieb, Temporärbüro, KW, Wochenrapport-PDF.
- Live unter **https://ebi-cyber.github.io/baulog/rapport/** (wird im Deploy-Job `build` mitgebaut und nach `dist/rapport` kopiert). BauLogs Service Worker schließt `/baulog/rapport/` aus.
- Daten nur lokal (Dexie, DB `rapport`), Einstellungen im localStorage. Senden/Sichern über das iOS-Teilen-Menü (WhatsApp / „In Dateien sichern" → OneDrive). PDF wird vorab erzeugt, weil iOS `navigator.share` nur direkt im Klick erlaubt.
- Abwesenheiten (`absenzen`: Ferien, krank, Unfall, Feiertag, Arzt, Militär, bezahlte/unbezahlte Absenz, Kompensation, Schlechtwetter, kein Einsatz …), Spesen (`spesen`), Wochensoll → Über-/Minusstunden. Arten in `rapport/src/lib/arten.js`, Wochenzahlen in `lib/woche.js`.
- **Einsätze** (`einsaetze`, je Firma): Kanton, Lohn, Zuschläge, Abzüge, Vertragsfotos. KI liest den Einsatzvertrag per Foto (Task `einsatzvertrag` in `baulog-ai`, gpt-4o, mit Prüfdurchgang). Rapport ruft die Function mit dem Anon-Key auf, optional Login mit dem BauLog-Konto (`rapport/src/lib/ki.js`).
- **Pro Einsatz eigenes Temporärbüro** (Name, WhatsApp, Kontakt, E-Mail) und **Branche** (`lib/branchen.js`: Bau/LMV, Industrie/Fertigteilwerk, Andere → Vorschläge für Ferien %, Nachtzeit, Samstag/Sonntag/Feiertagsarbeit, Schlechtwetter; überschreibt keine Vertragswerte). Rapport = einer pro Firma/Büro und Woche (`lib/rapporte.js`, Status-Key `KW|Firma`).
- **Feiertage** je Kanton (`lib/feiertage.js`, Hauptliste ohne Gewähr), Kanton kommt aus dem Einsatz der Firma.
- **Lohn** (`lib/lohn.js`, Screen `Lohn`): Schema GAV Personalverleih — Grundlohn, Überstunden-/Nacht-/Sonntagszuschlag, bezahlte Absenzen, Feiertags-/Ferienentschädigung, 13. ML → Brutto − AHV/ALV/NBU/KTG/BVG/GAV/Quellensteuer = Netto + Spesen. Live auf „Heute“, Lohnabrechnung als PDF.
- Rapport-Layout (`rapport/src/lib/pdf.js`) ist vorläufig — wird an die Vorlage des Nutzers angepasst.
