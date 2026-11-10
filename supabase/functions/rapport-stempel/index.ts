// Supabase Edge Function: Stempeln per iPhone-Kurzbefehl (Rapport-App).
// Kurzbefehl:  GET …/rapport-stempel?k=<schlüssel>&a=pause   → Antworttext für die Mitteilung („Pause seit 12:14“)
// Aktionen:    pause (umschalten Pause/Weiter) · arbeit (umschalten Start/Feierabend) · start · stopp · pause_an · weiter
// App:         POST { task: 'abholen', k }  → offene Ereignisse (werden dabei gelöscht)
//              POST { task: 'zustand', k, zustand } → App meldet ihren Zustand (nach Tippen in der App)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const json = (o: unknown, code = 200) => new Response(JSON.stringify(o), { status: code, headers: { ...cors, 'Content-Type': 'application/json' } })
const text = (t: string, code = 200) => new Response(t, { status: code, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } })

async function hash(k: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
const uhr = (d: Date) => d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = new URL(req.url)
    const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const k = String(b.k || url.searchParams.get('k') || '')
    if (!/^[0-9a-f]{32}$/.test(k)) return text('Ungültiger Schlüssel — Link in der Rapport-App neu kopieren.', 400)
    const h = await hash(k)
    const { data: z } = await db.from('rapport_stempel_zustand').select('zustand').eq('schluessel', h).maybeSingle()
    const zustand = z?.zustand || 'aus'
    const setze = (neu: string) => db.from('rapport_stempel_zustand').upsert({ schluessel: h, zustand: neu, geaendert: new Date().toISOString() })

    if (b.task === 'abholen') {
      const { data } = await db.from('rapport_stempel_ereignisse').select('id, aktion, zeit').eq('schluessel', h).order('zeit')
      if (data?.length) await db.from('rapport_stempel_ereignisse').delete().in('id', data.map((x) => x.id))
      return json({ ereignisse: data || [], zustand })
    }
    if (b.task === 'zustand') {
      if (['aus', 'arbeit', 'pause'].includes(b.zustand)) await setze(b.zustand)
      return json({ ok: true })
    }

    // Kurzbefehl
    const a = String(url.searchParams.get('a') || b.a || '')
    const jetzt = new Date()
    let aktion = '', neu = zustand, antwort = ''
    if (a === 'pause') {
      if (zustand === 'arbeit') { aktion = 'pause'; neu = 'pause'; antwort = `Pause seit ${uhr(jetzt)}` }
      else if (zustand === 'pause') { aktion = 'weiter'; neu = 'arbeit'; antwort = `Weiter um ${uhr(jetzt)}` }
      else return text('Nicht eingestempelt — zuerst Start.')
    } else if (a === 'arbeit') {
      if (zustand === 'aus') { aktion = 'start'; neu = 'arbeit'; antwort = `Start ${uhr(jetzt)}` }
      else { aktion = 'stopp'; neu = 'aus'; antwort = `Feierabend ${uhr(jetzt)}` }
    } else if (a === 'start') { if (zustand !== 'aus') return text('Läuft schon.'); aktion = 'start'; neu = 'arbeit'; antwort = `Start ${uhr(jetzt)}` }
    else if (a === 'stopp') { if (zustand === 'aus') return text('Nicht eingestempelt.'); aktion = 'stopp'; neu = 'aus'; antwort = `Feierabend ${uhr(jetzt)}` }
    else if (a === 'pause_an') { if (zustand !== 'arbeit') return text(zustand === 'pause' ? 'Pause läuft schon.' : 'Nicht eingestempelt.'); aktion = 'pause'; neu = 'pause'; antwort = `Pause seit ${uhr(jetzt)}` }
    else if (a === 'weiter') { if (zustand !== 'pause') return text('Keine Pause aktiv.'); aktion = 'weiter'; neu = 'arbeit'; antwort = `Weiter um ${uhr(jetzt)}` }
    else if (a === 'status') return text(zustand === 'arbeit' ? 'Am Arbeiten' : zustand === 'pause' ? 'In der Pause' : 'Nicht eingestempelt')
    else return text('Unbekannte Aktion.', 400)

    // Schutz: höchstens 100 nicht abgeholte Tipps pro Schlüssel (die App holt sie beim Öffnen ab)
    const { count } = await db.from('rapport_stempel_ereignisse').select('id', { count: 'exact', head: true }).eq('schluessel', h)
    if ((count || 0) >= 100) return text('Zu viele offene Tipps — bitte die Rapport-App einmal öffnen.', 429)
    const { error } = await db.from('rapport_stempel_ereignisse').insert({ schluessel: h, aktion, zeit: jetzt.toISOString() })
    if (error) return text('Fehler: ' + error.message, 500)
    await setze(neu)
    return text(antwort)
  } catch (e) {
    return text('Fehler: ' + String(e), 500)
  }
})
