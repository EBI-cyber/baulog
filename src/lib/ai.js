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

// Aus dem Bautagebuch je Zeiteintrag die ausgeführten Leistungen ermitteln.
// tage: [{ datum, text, zeiten: [{ id, stunden, von, bis }] }] → { [id]: [{ gewerk, leistung, stunden }] }
export async function leistungenAusTagebuch(tage, gewerke, katalog) {
  const d = await callAI({ task: 'leistungen', tage, gewerke, katalog })
  const out = {}
  // Einheiten in Klammern, die manchmal aus dem Katalog mitkommen, entfernen
  const sauber = (l) => ({ ...l, leistung: String(l.leistung || '').replace(/\s*\([^)]*\)\s*$/, '').trim() })
  for (const x of Array.isArray(d.eintraege) ? d.eintraege : []) if (x && x.id != null && Array.isArray(x.leistungen)) out[String(x.id)] = x.leistungen.map(sauber)
  return out
}

// Belegfoto lesen: Ecken (0–1, oben-links, oben-rechts, unten-rechts, unten-links), Lieferant, Datum, Betrag
export async function belegLesen(dataUrl, gewerke, projekt) {
  return callAI({ task: 'beleg', bild: dataUrl, gewerke, projekt })
}

// Materialpositionen auf mögliche Privatkäufe prüfen → [{ id, grund }]
export async function privatPruefen(positionen, projekt) {
  const d = await callAI({ task: 'privat', positionen, projekt })
  return Array.isArray(d.verdacht) ? d.verdacht : []
}

export async function parseSetup(transcript, gewerke, katalog) {
  return callAI({ task: 'setup', transcript, gewerke, katalog })
}

export async function parseAbschluss(transcript, ctx) {
  return callAI({ task: 'abschluss', transcript, ctx })
}
