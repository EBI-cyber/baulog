// Schreibt .env.lokal mit URL + Anon-Key der lokalen Supabase (aus `supabase status`).
// Wird von `npm run dev:lokal` aufgerufen; .env.lokal ist per .gitignore ausgeschlossen.
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

let out
try {
  out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  console.error('Lokale Supabase läuft nicht. Erst Docker Desktop starten, dann `npm run sb:start`.')
  process.exit(1)
}
const env = Object.fromEntries(
  out.split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)
if (!env.API_URL || !env.ANON_KEY) {
  console.error('API_URL/ANON_KEY nicht in `supabase status` gefunden.')
  process.exit(1)
}
writeFileSync('.env.lokal', `VITE_SUPABASE_URL=${env.API_URL}\nVITE_SUPABASE_ANON_KEY=${env.ANON_KEY}\n`)
console.log(`.env.lokal geschrieben -> ${env.API_URL}`)
