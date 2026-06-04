# BauLog — Projektkontext

> Mobile-first PWA: **Bautagebuch + Stunden/Material/Maschine-Erfassung + EP-Kalkulation** für
> Sanierungs-/Renovierungsprojekte. Ziel: aus echten Ist-Kosten & -Zeiten genaue Einheitspreise
> (EP) fürs Angebot ableiten.

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
- Tabellen: `bau_projekte`, `bau_eintraege`, `bau_members` (Team). SQL in `supabase/schema.sql` + `supabase/schema_team.sql` (idempotent, im SQL-Editor ausführen).
- Edge Function `baulog-ai` (Deno, gpt-4o-mini, Secret `OPENAI_KEY`): Tasks `din` / `setup` / `abschluss`.
- Edge Function `invite-worker` (vorhanden, aktuell **inaktiv** — Auto-Einladung deaktiviert, s.u.).

## Kernfunktionen
- **Projekte** mit Einträgen: Zeit (Timer), Menge/Leistung, Material (EK), Maschine (Stundensatz), Foto, Tagebuch.
- **Timer**: Start/Pause/Stopp, **sekundengenau** (minutes als Bruchteil gespeichert, DB-Spalte `numeric`).
- **EP-Vorschau** pro Projekt: Selbstkosten je Einheit = (Lohn+Material+Maschine)/Menge.
- **Leistungsnachweis-PDF** (jsPDF): gruppierte Leistungen mit EP-Spalte, Bautagebuch, Fotos; mit/ohne Kosten.
- **DIN-Leistungskatalog** (~80 Positionen, 10 Gewerke) mit Einheiten; „DIN-Standardkatalog ergänzen".
- **KI**: Sprachnotiz→DIN-Text, KI-Setup (Timer), KI-Abschluss (Material/Maschine erkennen) — serverseitig via `baulog-ai`.
- **Live-Kamera** + Web Speech API (de-DE).

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
