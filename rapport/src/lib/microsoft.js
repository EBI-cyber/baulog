import { useEffect, useState } from 'react'
import { supabase } from './ki'

// Verbindung zum eigenen Microsoft-Konto (OneDrive + E-Mail) über die Edge Function „rapport-versand".
// Gespeichert wird nur auf diesem Gerät: Client-ID, Konto, Refresh-Token.
const KEY = 'rapport.microsoft'

export function msLaden() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
export function msSpeichern(teil) {
  const neu = { ...msLaden(), ...teil }
  try { localStorage.setItem(KEY, JSON.stringify(neu)) } catch {}
  window.dispatchEvent(new Event('rapport-ms'))
  return neu
}
export const msVerbunden = () => !!(msLaden().refreshToken && msLaden().clientId)

export function useMs() {
  const [m, setM] = useState(msLaden)
  useEffect(() => {
    const neu = () => setM(msLaden())
    window.addEventListener('rapport-ms', neu)
    return () => window.removeEventListener('rapport-ms', neu)
  }, [])
  return m
}

async function aufruf(body) {
  if (!supabase) throw new Error('Keine Cloud-Verbindung in dieser Version.')
  const m = msLaden()
  const { data, error } = await supabase.functions.invoke('rapport-versand', { body: { clientId: m.clientId, tenant: m.tenant || 'common', ...body } })
  if (error) {
    let text = error.message
    try {
      const j = await error.context.clone().json()
      text = j.error || text
      if (j.neuVerbinden) msSpeichern({ refreshToken: '', abgelaufen: true })
    } catch {}
    const e = new Error(text); e.netz = !error.context; throw e
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const msStart = () => aufruf({ task: 'start' })

/** Gibt true zurück, sobald die Anmeldung fertig ist */
export async function msPoll(deviceCode) {
  const r = await aufruf({ task: 'poll', deviceCode })
  if (r.wartet) return false
  msSpeichern({ refreshToken: r.refreshToken, konto: r.konto, name: r.name, abgelaufen: false, verbundenAm: Date.now() })
  return true
}

export const msTrennen = () => msSpeichern({ refreshToken: '', konto: '', name: '' })

export function blobZuBase64(blob) {
  return new Promise((ok, fehler) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1])
    r.onerror = fehler
    r.readAsDataURL(blob)
  })
}

/** datei: { name, blob }, onedrive: { ordner } | null, mail: { an, cc, betreff, text } | null */
export async function msVersand({ datei, onedrive, mail, kopie }) {
  const r = await aufruf({
    task: 'versand', refreshToken: msLaden().refreshToken,
    datei: { name: datei.name, typ: datei.blob.type || 'application/pdf', base64: await blobZuBase64(datei.blob) },
    onedrive, mail, kopie,
  })
  if (r.refreshToken) msSpeichern({ refreshToken: r.refreshToken })
  return r
}
