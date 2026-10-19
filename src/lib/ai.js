import { supabase } from './supabase'

// Ruft die Edge Function 'baulog-ai' (Key liegt serverseitig, nicht im Client).
async function callAI(body) {
  if (!supabase) throw new Error('Keine Cloud-Verbindung — bitte einloggen.')
  const { data, error } = await supabase.functions.invoke('baulog-ai', { body })
  if (error) {
    // error.context ist bei FunctionsHttpError die rohe Response der Edge Function —
    // dort steckt die eigentliche Fehlermeldung (JSON {error: "..."}), nicht im generischen error.message.
    let detail = ''
    try { const j = await error.context.clone().json(); detail = j && j.error ? j.error : '' } catch { /* kein JSON-Body */ }
    throw new Error('KI-Fehler: ' + (detail || error.message || String(error)))
  }
  if (data && data.error) throw new Error(data.error)
  return data || {}
}

export async function dinText(transcript) {
  if (!transcript || !transcript.trim()) throw new Error('Erst etwas diktieren oder tippen.')
  const d = await callAI({ task: 'din', transcript })
  return (d.text || '').trim()
}

export async function korrekturText(text) {
  if (!text || !text.trim()) throw new Error('Kein Text zum Korrigieren vorhanden.')
  const d = await callAI({ task: 'korrektur', transcript: text })
  return (d.text || '').trim()
}

export async function parseNachtrag(transcript) {
  if (!transcript || !transcript.trim()) throw new Error('Erst Notizen eingeben oder diktieren.')
  const d = await callAI({ task: 'nachtrag', transcript })
  return Array.isArray(d.tage) ? d.tage : []
}

export async function parseSetup(transcript, gewerke, katalog) {
  return callAI({ task: 'setup', transcript, gewerke, katalog })
}

export async function parseAbschluss(transcript, ctx) {
  return callAI({ task: 'abschluss', transcript, ctx })
}
