import { useEffect, useState } from 'react'

const KEY = 'rapport.einstellungen'
const STANDARD = {
  name: '',          // Mitarbeiter-Name (steht im Rapport)
  buero: '',         // Temporärbüro
  bueroTel: '',      // WhatsApp-Nummer des Büros, international z.B. 41791234567
  firmen: [],        // Einsatzbetriebe
  firma: '',         // aktuell gewählter Einsatzbetrieb
  wochenSoll: '',    // Soll-Stunden pro Woche (leer = keine Über-/Minusstunden)
  arbeitstage: 5,    // Arbeitstage pro Woche → Tagessoll = wochenSoll / arbeitstage
  waehrung: 'CHF',
  kmSatz: '0.70',    // Entschädigung pro km (für Spesen „Fahrt")
}

/** Tagessoll in Stunden (Vorschlag für bezahlte Abwesenheiten), Standard 8 */
export function tagesSoll(e) {
  const w = parseFloat(String(e.wochenSoll).replace(',', '.'))
  return w > 0 ? Math.round((w / (e.arbeitstage || 5)) * 100) / 100 : 8
}
export const zahl = (v) => parseFloat(String(v ?? '').replace(',', '.')) || 0

export function ladeEinstellungen() {
  try { return { ...STANDARD, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...STANDARD } }
}

export function speichereEinstellungen(e) {
  try { localStorage.setItem(KEY, JSON.stringify(e)) } catch {}
  window.dispatchEvent(new Event('rapport-einstellungen'))
}

export function useEinstellungen() {
  const [e, setE] = useState(ladeEinstellungen)
  useEffect(() => {
    const neu = () => setE(ladeEinstellungen())
    window.addEventListener('rapport-einstellungen', neu)
    return () => window.removeEventListener('rapport-einstellungen', neu)
  }, [])
  const aendern = (teil) => speichereEinstellungen({ ...ladeEinstellungen(), ...teil })
  return [e, aendern]
}

export const fertigEingerichtet = (e) => !!(e.name && e.buero && e.firmen.length)
