// Schnelltest gegen die LOKALE Supabase (nie gegen Live): Login, RLS, Team-Rechte, KI-Funktion.
// Aufruf: `npm run test:lokal` (lokale Supabase muss laufen, Testdaten aus supabase/seed.sql).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.lokal', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const url = env.VITE_SUPABASE_URL
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error('Abbruch: .env.lokal zeigt nicht auf die lokale Supabase (' + url + ').')
  process.exit(1)
}

let fehler = 0
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${info ? ' — ' + info : ''}`)
  if (!ok) fehler++
}

async function login(email) {
  const sb = createClient(url, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await sb.auth.signInWithPassword({ email, password: 'test1234' })
  check(`Login ${email}`, !error, error && error.message)
  return sb
}

const chef = await login('chef@baulog.test')
const p = await chef.from('bau_projekte').select('token,name')
check('Chef sieht Testprojekt', !p.error && p.data.some((r) => r.token === 'test-projekt-1'), p.error && p.error.message)
const r = await chef.from('bau_rechnungen').select('token')
check('Tabelle bau_rechnungen vorhanden', !r.error, r.error && r.error.message)

const ma = await login('mitarbeiter@baulog.test')
const mp = await ma.from('bau_projekte').select('token')
check('Mitarbeiter sieht zugewiesenes Projekt', !mp.error && mp.data.length === 1, mp.error && mp.error.message)
const mu = await ma.from('bau_projekte').update({ name: 'gehackt' }).eq('token', 'test-projekt-1').select()
check('Mitarbeiter darf Projekt nicht ändern', !mu.error && mu.data.length === 0, mu.error && mu.error.message)

const ai = await chef.functions.invoke('baulog-ai', { body: { task: 'korrektur', transcript: 'leitung verlegt' } })
let aiInfo = ai.error ? ai.error.message : JSON.stringify(ai.data)
if (ai.error) { try { aiInfo = (await ai.error.context.clone().json()).error } catch { /* kein JSON */ } }
check('Edge Function baulog-ai antwortet', !ai.error && ai.data && typeof ai.data.text === 'string', aiInfo)

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlles grün.')
process.exit(fehler ? 1 : 0)
