import { jsPDF } from 'jspdf'
import { supabase } from './ki'
import { db } from './db'
import { statusKey } from './rapporte'
import { isoDatum, wochenTage, wochenKey, arbeitMs } from './zeit'
import { zahl } from './settings'

/**
 * Unterschriebener Papier-Rapport: Foto/Scan → KI liest Tage/Stunden → Abgleich mit den erfassten Zeiten
 * → als PDF an den Berater weiterleiten → Woche als gesendet vermerken (Foto bleibt im Wochenstatus).
 */
export async function papierRapportLesen(bilder) {
  if (!supabase) throw new Error('KI ist in dieser Version nicht eingerichtet.')
  const { data, error } = await supabase.functions.invoke('baulog-ai', { body: { task: 'rapport', bilder, heute: isoDatum(new Date()) } })
  if (error) {
    let d = ''; try { d = (await error.context.clone().json()).error } catch {}
    throw new Error('KI-Fehler: ' + (d || error.message))
  }
  if (data?.error) throw new Error(data.error)
  return data || {}
}

/** Fotos/Scans (Data-URLs; Bilder oder PDF-Seiten als Bild) zu einem PDF, je Seite eingepasst */
export function fotosZuPdf(bilder) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  bilder.filter((b) => b.startsWith('data:image')).forEach((b, i) => {
    if (i) doc.addPage('a4', 'landscape')
    const ip = doc.getImageProperties(b)
    const W = 287, H = 200, f = Math.min(W / ip.width, H / ip.height)
    const w = ip.width * f, h = ip.height * f
    doc.addImage(b, b.startsWith('data:image/png') ? 'PNG' : 'JPEG', (297 - w) / 2, (210 - h) / 2, w, h)
  })
  return doc.output('blob')
}

/** Vergleich Papier vs. App pro Tag der Woche */
export async function abgleichen(woche, ki) {
  const wKey = wochenKey(woche)
  const schichten = (await db.schichten.where('wocheKey').equals(wKey).toArray()).filter((s) => s.ende != null)
  const absenzen = await db.absenzen.where('wocheKey').equals(wKey).toArray()
  const papier = Object.fromEntries((Array.isArray(ki.tage) ? ki.tage : []).map((t) => [String(t.datum || '').slice(0, 10), t]))
  return wochenTage(woche).map((d) => {
    const datum = isoDatum(d)
    const p = papier[datum] || null
    const app = schichten.filter((s) => s.datum === datum).reduce((a, s) => a + arbeitMs(s) / 36e5, 0)
    const appAbw = absenzen.filter((a) => a.datum === datum)
    const pStd = p ? zahl(p.normal) + zahl(p.h125) + zahl(p.h150) + zahl(p.h200) : 0
    const stimmt = Math.abs(pStd - app) < 0.01
    // Abwesenheit in der App (z.B. Ferien), aber Stunden auf dem Rapport → nie automatisch übernehmen, sondern prüfen lassen
    const abwKonflikt = appAbw.length > 0 && pStd > 0
    return { datum, tag: d, papier: p, pStd, app, appAbw, stimmt, abwKonflikt, fehltInApp: pStd > 0 && app === 0 && !appAbw.length,
      zuViel: app > 0 && pStd === 0 }
  })
}

/** Foto speichern und Woche als (per Papier-Rapport) gesendet vermerken */
export async function papierVermerken({ wKey, firma, bilder, ki, gesendetAn }) {
  const k = statusKey(wKey, firma)
  const alt = (await db.wochen.get(k)) || { key: k }
  await db.wochen.put({
    ...alt, papierBilder: bilder.filter((b) => b.startsWith('data:image')), papierAm: Date.now(),
    papierKi: { total: ki?.total ?? null, unterzeichner: ki?.unterzeichner || '', unterschriftBetrieb: !!ki?.unterschriftBetrieb, unterschriftDatum: ki?.unterschriftDatum || '' },
    ...(gesendetAn ? { gesendetAm: Date.now(), gesendetAn } : {}),
    ...(ki?.unterzeichner && !alt.firmaName ? { firmaName: ki.unterzeichner } : {}),
  })
}
