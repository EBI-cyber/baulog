import { createClient } from '@supabase/supabase-js'

// Gleiches Supabase-Projekt wie BauLog; der OpenAI-Key liegt nur in der Edge Function „baulog-ai".
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key, { auth: { storageKey: 'rapport-auth' } }) : null
export const kiVerfuegbar = !!supabase

async function callAI(body) {
  if (!supabase) throw new Error('KI ist in dieser Version nicht eingerichtet (keine Cloud-Verbindung).')
  const { data, error } = await supabase.functions.invoke('baulog-ai', { body })
  if (error) {
    let detail = '', status = error.context?.status
    try { const j = await error.context.clone().json(); detail = j?.error || j?.message || '' } catch {}
    if (status === 401) throw new Error('Für die KI bitte in den Einstellungen unter „KI-Zugang" mit dem BauLog-Konto anmelden.')
    throw new Error('KI-Fehler: ' + (detail || error.message || String(error)))
  }
  if (data?.error) throw new Error(data.error)
  return data || {}
}

/** Einsatzvertrag (1–n Fotos als DataURL) lesen → Felder für den Einsatz */
export async function einsatzvertragLesen(bilder) {
  return callAI({ task: 'einsatzvertrag', bilder })
}

export async function anmelden(email, passwort) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : error.message)
}
export const abmelden = () => supabase?.auth.signOut()
export async function angemeldetAls() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.email || null
}
