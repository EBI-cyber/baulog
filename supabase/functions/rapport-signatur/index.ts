// Supabase Edge Function: Unterschrift des Einsatzbetriebs per QR-Code (Rapport-App).
// anlegen (Mitarbeiter) → lesen + unterschreiben (Polier, ohne Konto, nur mit Token) → status (Mitarbeiter holt die Unterschrift).
// Daten liegen höchstens 14 Tage und werden gelöscht, sobald der Mitarbeiter die Antwort abgeholt hat.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const out = (o: unknown, code = 200) =>
  new Response(JSON.stringify(o), { status: code, headers: { ...cors, 'Content-Type': 'application/json' } })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const T = 'rapport_signaturen'
const gueltig = (t: unknown) => typeof t === 'string' && /^[0-9a-f]{32}$/.test(t)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json()

    if (b.task === 'anlegen') {
      const daten = JSON.stringify(b.daten || {})
      if (daten.length > 300_000) return out({ error: 'Rapport zu gross' }, 400)
      await db.from(T).delete().lt('ablauf', new Date().toISOString()) // Aufräumen
      const token = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('')
      const { error } = await db.from(T).insert({ token, daten: b.daten })
      if (error) return out({ error: error.message }, 500)
      return out({ token })
    }

    if (!gueltig(b.token)) return out({ error: 'Ungültiger Link' }, 400)
    const { data: z, error } = await db.from(T).select('*').eq('token', b.token).maybeSingle()
    if (error) return out({ error: error.message }, 500)
    if (!z || new Date(z.ablauf) < new Date()) return out({ error: 'Dieser Link ist abgelaufen oder wurde bereits verwendet.' }, 404)

    if (b.task === 'lesen') return out({ daten: z.daten, status: z.status, name: z.name, beantwortet: z.beantwortet })

    if (b.task === 'antworten') {
      if (z.status !== 'offen') return out({ error: 'Dieser Rapport wurde bereits beantwortet.' }, 409)
      const ok = b.einverstanden !== false
      const bild = ok ? String(b.bild || '') : null
      if (ok && (!bild.startsWith('data:image/png;base64,') || bild.length > 200_000)) return out({ error: 'Unterschrift fehlt' }, 400)
      const { error: e2 } = await db.from(T).update({
        status: ok ? 'unterschrieben' : 'abgelehnt', bild, name: String(b.name || '').slice(0, 120),
        bemerkung: String(b.bemerkung || '').slice(0, 2000), beantwortet: new Date().toISOString(),
        // Durchschlag: E-Mail und/oder WhatsApp-Nummer des Unterzeichners
        kopie_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email || '').trim()) ? String(b.email).trim().slice(0, 200) : null,
        kopie_tel: String(b.tel || '').replace(/[^\d+]/g, '').slice(0, 20) || null,
      }).eq('token', b.token).eq('status', 'offen')
      if (e2) return out({ error: e2.message }, 500)
      return out({ ok: true })
    }

    if (b.task === 'status') {
      const antwort = { status: z.status, bild: z.bild, name: z.name, bemerkung: z.bemerkung, beantwortet: z.beantwortet, email: z.kopie_email, tel: z.kopie_tel }
      // abgeholt → löschen (die Unterschrift liegt jetzt beim Mitarbeiter)
      if (z.status !== 'offen' && b.abholen) await db.from(T).delete().eq('token', b.token)
      return out(antwort)
    }

    return out({ error: 'unbekannter task' }, 400)
  } catch (e) {
    return out({ error: String(e) }, 500)
  }
})
