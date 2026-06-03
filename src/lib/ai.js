import { supabase } from './supabase'

// Ruft die Edge Function 'baulog-ai' (Key liegt serverseitig, nicht im Client).
async function callAI(body) {
  if (!supabase) throw new Error('Keine Cloud-Verbindung — bitte einloggen.')
  const { data, error } = await supabase.functions.invoke('baulog-ai', { body })
  if (error) throw new Error('KI-Fehler: ' + (error.message || String(error)))
  if (data && data.error) throw new Error(data.error)
  return data || {}
}

export async function dinText(transcript) {
  if (!transcript || !transcript.trim()) throw new Error('Erst etwas diktieren oder tippen.')
  const d = await callAI({ task: 'din', transcript })
  return (d.text || '').trim()
}

export async function parseSetup(transcript, gewerke, katalog) {
  return callAI({ task: 'setup', transcript, gewerke, katalog })
}

export async function parseAbschluss(transcript, ctx) {
  return callAI({ task: 'abschluss', transcript, ctx })
}
