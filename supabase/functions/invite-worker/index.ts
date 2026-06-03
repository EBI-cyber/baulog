// BauLog — Mitarbeiter automatisch per Supabase-Einladung einladen
// Deploy in Supabase: Functions -> Create function "invite-worker" -> Code einfügen -> Deploy
// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY werden von Supabase automatisch bereitgestellt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { email, projektName, redirectTo } = await req.json()
    if (!email) return json({ error: 'email fehlt' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)

    // Aufrufer muss angemeldet sein
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: caller } = await admin.auth.getUser(token)
    if (!caller?.user) return json({ error: 'Nicht angemeldet' }, 401)

    const { error } = await admin.auth.admin.inviteUserByEmail(String(email).trim().toLowerCase(), {
      redirectTo: redirectTo || undefined,
      data: { invited_by: caller.user.email, projekt: projektName || '' },
    })
    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exist')) {
        return json({ ok: true, already: true })
      }
      return json({ error: error.message }, 400)
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: String((e && (e as Error).message) || e) }, 500)
  }
})
