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
- Edge Function `rapport-versand` (Rapport-App, `verify_jwt = false`, wird beim Push auf `main` mit ausgeliefert).
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
- **Lohnsätze wie im Einsatzvertrag** (`stundenSaetze`): Ferien- und Feiertagsentschädigung auf den Grundlohn, 13. ML auf Grundlohn+Ferien+Feiertag, ungerundet gerechnet, Total auf 0.01 (Beispiel Bellini: 29.80 → 37.00).
- **Unterschriften** (Mitarbeiter einmal in den Einstellungen, Einsatzbetrieb im Wochenabschluss) landen im Rapport-PDF; gespeichert im Wochenstatus (`wochen`, Key `KW|Firma`).
- **Unterschrift per QR-Code**: Polier scannt, sieht den Rapport (ohne Lohn) auf `#/unterschreiben/:token` und unterschreibt auf seinem Handy; Edge Function `rapport-signatur` + Tabelle `rapport_signaturen` (RLS ohne Policies, nur Service-Role; 14 Tage, nach Abholung gelöscht). Unterschriftsberechtigte pro Einsatz (`lib/unterschreiber.js`, Feld `unterschreiber`, ein Standard = meist Polier): Unterzeichner wählt sich auf der QR-Seite aus (ohne Kontaktdaten anderer) oder trägt sich neu ein; neue Personen muss der Mitarbeiter bestätigen, bevor gesendet werden kann; Vertretung → „i.V.“ im PDF und Kopie an den Standard. Durchschlag: Unterzeichner gibt E-Mail/WhatsApp an (in der Liste gemerkt), bekommt sofort das PDF mit beiden Unterschriften auf seinem Handy, beim Versand eine E-Mail-Kopie bzw. einen OneDrive-Link für WhatsApp.
- **Automatischer Versand** über Edge Function `rapport-versand` (Microsoft Graph, Gerätecode-Anmeldung, eigene App-Registrierung des Nutzers = Client-ID in den Einstellungen; Refresh-Token nur auf dem Gerät): PDF in OneDrive-Ordner (Vorlage `Rapporte/{jahr}/{buero}`) + E-Mail ans Büro (`bueroEmail` des Einsatzes). „Feierabend“ ab dem Abschluss-Tag (Standard Freitag) öffnet den Wochenabschluss. Ohne Netz wird der Versand vorgemerkt und nachgeholt. WhatsApp bleibt manuell (Teilen-Menü) — dafür gibt es keine Schnittstelle.
- **Fragebogen „Meine Situation“** (`#/fragebogen`, `lib/profil.js`, gespeichert in `einstellungen.profil`): Ausweis (CH/C/B/L/G/F) + Ablaufdatum, Wohnkanton, Zivilstand/Kinder/Kirche → Quellensteuer-Tarif (A/B/C/H + Kinder + Y/N) und Satz laut Lohnabrechnung (Quellensteuer ist persönlich, nicht pro Einsatz), Geburtsdatum → Ferien-Mindestanspruch (GAV PV: <20/≥50 → 10.64 %), RAV-Zwischenverdienst-Übersicht, Mindestpausen nach ArG beim Feierabend (`pauseAuto`), Krankmelde-Frist, Arbeitsweg. „Krank melden“ (`KrankSheet`) trägt die Abwesenheit ein und meldet per E-Mail (Graph, auch ohne Anhang) bzw. WhatsApp-Link.
- **Stempeln per iPhone-Kurzbefehl** (Rückseite doppelt = Pause ein/aus, dreifach = Start/Feierabend, Siri, Ort-Automation): Edge Function `rapport-stempel` (GET `?k=<schlüssel>&a=pause|arbeit|start|stopp|status`, `verify_jwt = false`) + Tabellen `rapport_stempel_zustand`/`rapport_stempel_ereignisse` (nur SHA-256 des Schlüssels). Die App holt Ereignisse ab (`lib/stempel.js`, beim Start/Sichtbarwerden/alle 20 s) und übernimmt sie mit der Uhrzeit des Tippens; lokale Aktionen melden den Zustand zurück. Ortstracking taugt nur für Start/Feierabend, nicht für Pausen (zu ungenau, PWA ohne Hintergrund-Ortung).
- **Pause vergessen** (`PauseSheet`): Feierabend ohne Pause → Beginn/Dauer per Chips; per Kurzbefehl beendete Schichten bekommen `pausePruefen` (vorläufig ArG-Mindestpause) und einen Hinweis auf „Heute“. `schichtBeenden` in `lib/stempel.js` ist die gemeinsame Stopp-Logik.
- **Datensicherung** (`lib/sicherung.js`): JSON inkl. Einstellungen/Fragebogen (ohne Microsoft-Token) automatisch in OneDrive `Rapporte/Sicherung` — wöchentlich beim Öffnen und nach jedem Wochenabschluss; `rapport-versand` lädt Dateien > 4 MB per Upload-Session in Stücken hoch. Einspielen über Einstellungen → Datensicherung.
- **Einsatzende** (`lib/einsatzende.js`): Ende = `ende` oder `beginn + maxDauerTage − 1` (KI liest „maximal X Kalendertage“ als `einsatzdauerTage`); Hinweis auf „Heute“ ab 2 Tagen vorher mit +1/+2 Wochen, unbefristet, „ist beendet“.
- **Kalender** (`screens/Kalender.jsx`, `#/kalender[/JJJJ-MM]`, Nav-Punkt „Kalender“ statt „Woche“): Monatsraster mit KW-Spalte (Wochentotal, ✓ = Rapport gesendet → tippen öffnet `#/woche/:key`), Tage mit Dezimalstunden, Abwesenheits-Farbe/-Icon, Feiertag, Spesen-/Läuft-Punkt; Tag antippen → `TagSheet` mit Einträgen (bearbeiten über `Erfassen`), + Zeit/Abwesend/Spesen, „Woche & Rapport“. Die Wochenansicht hat oben „Kalender“ zurück.
- **Woche nachtragen** (`WocheNachtragen`, Knopf in „Woche“, auch per Link `#/woche/2026-W44?h=9.5,8.5,8,10.75,8&f=Stüssi&b=07:00&papier=1`; genaue Zeiten `z=06:45-09:00_09:15-12:00;…` → Lücken = Pausen, Notizen `n=…;…`; Firma/Büro/Adresse/Ort/Kanton/Überstunden per `f`/`bu`/`a`/`o`/`kt`/`ueb` → Einsatz wird angelegt bzw. ergänzt, Firma per erstem Wort erkannt): Stunden pro Tag (dezimal wie auf dem Papier-Rapport) → Schichten mit Beginn aus dem Einsatz + ArG-Mindestpause; schon erfasste Tage bleiben; „auf Papier abgegeben“ markiert die Woche als gesendet.
- **Wochen einfügen** (`EinfuegenSheet`, Knopf im Kalender, Logik in `lib/nachtragen.js`): kopierte Nachtrag-Links (auch mehrere) aus der Zwischenablage → Vorschau → alle übernehmen. Grund: Links aus Chat/Mail öffnen auf dem iPhone einen eigenen Browser mit eigenem Speicher — dort Gespeichertes landet nicht in der Home-Bildschirm-App. `WocheNachtragen` warnt deshalb, wenn es per Link im Browser (nicht standalone) läuft, mit „Link kopieren“.
- **Feierabend vergessen**: läuft die Uhr > 12 h, fragt „Heute“ nach der Endzeit (danach Pausenfrage).
- Tests: Dexie 4 cached Live-Queries — wer in Tests direkt in IndexedDB schreibt, muss die Seite neu laden.
- **Quellensteuer automatisch**: offizielle ESTV-Tabellen (Löhne) werden beim Deploy von `rapport/scripts/qst-tarife.py` nach `rapport/public/qst/<jahr>/<kt>/<CODE>.json` erzeugt (nicht eingecheckt, nur Tarife A/B/C/H; Quelle www.estv2.admin.ch, Format „Recordformate ab 2025 (Löhne)“, Recordart 06). `lib/quellensteuer.js` lädt den Tarif des Wohnkantons, `useLohn` bestimmt den Satz aus dem (hochgerechneten) Monatslohn. Ein Satz im Fragebogen gilt nur als Korrektur.
- **Ortssuche** (`lib/plz.js`, `components/OrtSuche.jsx`): amtliches Ortschaftenverzeichnis (swisstopo) als lazy Modul `lib/plzdaten.js` (erzeugt mit `rapport/scripts/plz.py`, eingecheckt, ~80 KB) — Ort oder PLZ tippen → PLZ, Ort, Kanton. Im Fragebogen (Wohnort → Wohnkanton) und im Einsatz (Einsatzort → Kanton).
- **Guthaben-Konten** (`lib/konten.js`, `KontenKarte`): pro Einsatz `ferienModus`/`feiertagModus`/`dreizehnterModus` = `laufend` | `konto`. Bei `konto` stehen die Entschädigungen nicht im Bruttolohn, sondern werden angespart; Ferien/Feiertage werden dann aus dem Konto bezahlt (Grundlohn). Saldo = Gutschriften − Bezüge ± `kontobewegungen` (Auszahlungen/Korrekturen); Anzeige in CHF, ≈ Stunden, ≈ Tage.
- **Lohnabrechnung prüfen** (`lib/abgleich.js`, `LohnPruefung`): Foto → KI-Task `lohnabrechnung` (gpt-4o, mit Summenprüfung) → Vergleich Zeile für Zeile mit der App-Rechnung für die Periode (Stunden, Ansatz, Zuschläge, Entschädigungen laufend/angespart, Absenzen, jeder Abzug inkl. Quellensteuer gegen die offizielle Tabelle beim Brutto der Abrechnung, Netto, Spesen, Auszahlung, Guthaben). Ursache rot, Folgen grau („Folge der fehlenden x h — der Satz stimmt“), Hinweise gelb mit Ein-Klick-Korrektur der Einsatz-Einstellung. Fertige Nachricht ans Büro (E-Mail via Graph mit Foto, WhatsApp, Kopieren). Archiv in Dexie `lohnabrechnungen`.
- **Vertrags-Check** (`lib/vertragscheck.js`, `VertragsCheck` im Einsatz, Kennzeichen in der Einsatz-Liste): Pflichtangaben nach AVG Art. 19 Abs. 2 (KI liefert `angaben`), Mindestwerte (Ferien OR 329a/GAV PV nach Alter, Kündigungsfrist AVG Art. 19 Abs. 4, Überstunden OR 321c, Nacht/Sonntag ArG, AHV 5.3 %/ALV 1.1 %, Krankentaggeld 80 %, Wartetage), Nachrechnung Total-Stundenlohn, nichtige Klauseln nach AVG Art. 19 Abs. 5 (KI liefert `klauseln` mit Zitat). Mindestlöhne werden nicht geschätzt (Hinweis auf tempdata.ch). Urteil gut/prüfenswert/problematisch + fertige Korrektur-Anfrage ans Büro. Keine Rechtsberatung.
- **Rapport-Formular** (`rapportFormularPdf` in `lib/pdf.js`, Standard; `rapportVorlage: 'liste'` = alte Liste mit Uhrzeiten): A4 quer nach dem Arbeitsrapport der Temporärbüros (Vorlage Bellini) — Strichcode-Feld, KW, TMA/Einsatzbetrieb mit Adressen, Wochenraster Normal/125 %/150 %/(200 % nur wenn nötig)/Spesen Essen/Abwesenheit (immer: Kurzname der Art aus `arten.js` `kurz` + angerechnete Std., „–“ bei unbezahlt)/Einsatzort (pro Tag Einsatzbetrieb + `baustelle` (Strasse, Feld im Einsatz) + Ort + Notiz, ohne Vermerk „nachgetragen“), Zwischenverdienst, Unterschrift TMA; Einsatzbetrieb: geht weiter/beendet am, Leistungsbeurteilung 1–5 (auch auf der QR-Seite), Ort/Datum, Unterschrift, Name in Blockschrift. Kein Büro-Logo, eigene neutrale Texte. Name (`einst.name`) und Adresse (`profil.strasse/plz/ort`) direkt in Einstellungen → „Ich“ (auch im Fragebogen); `RapportKarte` warnt, wenn sie fehlen. Tageswerte aus `lib/rapporttage.js` (Zuschlags-Stunden nach den Sätzen des Einsatzes). `ueberstundenModus: 'keine'` = durchschnittliche Arbeitszeit, keine automatischen Überstunden (auch im Lohn).
