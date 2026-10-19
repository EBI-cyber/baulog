# BauLog lokal testen

Ziel: Änderungen ausprobieren, **ohne** auf `main` zu pushen und ohne das Live-Supabase-Projekt
(`nhlhrqxmxtacaygnydxf`) anzufassen. Alles läuft auf dem eigenen Rechner.

Es gibt zwei Stufen. Für reine Oberflächen-Änderungen reicht Stufe 1.

| | Frontend | Datenbank / Login / KI | Braucht |
|---|---|---|---|
| **Stufe 1:** `npm run dev` | lokal | Live-Supabase | Node |
| **Stufe 2:** `npm run dev:lokal` | lokal | lokale Supabase (Docker) | Node + Docker Desktop |

## Einmalig einrichten

1. **Node.js 20+** (ist schon da, wenn `npm run build` geht).
2. **Docker Desktop** installieren und starten: https://www.docker.com/products/docker-desktop/
   (nur für Stufe 2). Die Supabase CLI selbst kommt per `npm install` mit, nichts extra installieren.
3. Im Projektordner:
   ```
   npm install
   ```
4. KI-Einstellung für die lokale Edge Function anlegen:
   ```
   copy supabase\functions\.env.example supabase\functions\.env
   ```
   Standard ist `BAULOG_AI_MOCK=1`: Die KI-Buttons antworten mit festem Text wie
   `[MOCK korrektur] ...`, ohne OpenAI aufzurufen, also ohne Kosten. Wer lokal echte KI-Antworten
   will, setzt dort `BAULOG_AI_MOCK=0` und trägt `OPENAI_KEY=sk-...` ein.

## Stufe 1: nur Frontend lokal

Für Layout, Buttons, PDF usw. `.env.example` nach `.env.local` kopieren, den Anon-Key aus den
GitHub-Repo-Variablen eintragen, dann:

```
npm run dev
```

App: http://localhost:5173/baulog/ . Daten, Login und KI gehen dabei an das **Live-Projekt**.
Es wird nichts deployed, aber was man in der App speichert, landet in den echten Daten.

## Stufe 2: alles lokal (empfohlen zum Testen)

```
npm run sb:start      # startet die lokale Supabase in Docker (beim 1. Mal: Images laden, dauert)
npm run dev:lokal     # Vite gegen die lokale Supabase
```

App: http://localhost:5173/baulog/ . Test-Logins (Passwort jeweils `test1234`):

- `chef@baulog.test`: Owner mit dem Projekt „Testprojekt Badsanierung"
- `mitarbeiter@baulog.test`: Mitarbeiter im Testprojekt, Gewerk Sanitär (sieht keine Kosten)

Eigene Konten kann man im Login wie gewohnt registrieren, es kommt keine Bestätigungsmail.

Weitere Befehle:

| Befehl | Was er tut |
|---|---|
| `npm run test:lokal` | Schnelltest: Login, Rechte (RLS), Team, KI-Funktion. Endet mit „Alles grün." |
| `npm run sb:reset` | Datenbank leeren und neu aufbauen (Schema + Testdaten) |
| `npm run sb:status` | URLs und Keys anzeigen, u. a. **Studio** (DB-Oberfläche): http://127.0.0.1:54323 |
| `npm run sb:stop` | Lokale Supabase stoppen |

Hinweis zum Browser: Die App speichert offline in IndexedDB. Wer zwischen Stufe 1 und 2 wechselt,
sollte sich abmelden oder die Seitendaten im Browser löschen, sonst mischen sich lokale und
Live-Einträge beim Sync.

## Was wo herkommt

- **Datenbank-Schema:** `supabase/schema.sql` und `supabase/schema_team.sql`, dieselben Dateien wie
  für das Live-Projekt. `supabase/config.toml` lädt sie bei `sb:start`/`sb:reset` automatisch,
  danach `supabase/seed.sql` (nur lokale Testdaten).
- **Edge Functions:** laufen lokal direkt aus `supabase/functions/`. Änderungen an
  `baulog-ai/index.ts` sind sofort aktiv, ohne Dashboard-Deploy.
- **Ablauf für eine Änderung:** lokal mit `npm run dev:lokal` testen, `npm run test:lokal` grün,
  dann erst pushen bzw. die Function im Dashboard deployen.
