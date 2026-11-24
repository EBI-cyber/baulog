import { db } from './db'
import { statusKey } from './rapporte'
import { fotosZuPdf } from './papierrapport'

/**
 * Original-Belege (unterschriebener Papier-Rapport, Lohnabrechnung) — Fotos/Scans als Data-URLs (Bilder) bzw. PDFs.
 * Rapporte liegen im Wochenstatus (`papierBilder`, `papierPdf`), Lohnabrechnungen in `lohnabrechnungen.fotos`.
 */
export const teilen = (dateien = []) => ({ bilder: dateien.filter((d) => d.startsWith('data:image')), pdfs: dateien.filter((d) => d.startsWith('data:application/pdf')) })

export function dataUrlZuBlob(url) {
  const [kopf, daten] = url.split(',')
  const typ = kopf.match(/data:([^;]+)/)?.[1] || 'application/octet-stream'
  const bin = atob(daten), arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: typ })
}

/** Ein PDF zum Ansehen/Teilen: Original-PDF unverändert, sonst die Fotos als PDF */
export function originalPdf({ bilder = [], pdfs = [] }) {
  if (pdfs.length && !bilder.length) return dataUrlZuBlob(pdfs[0])
  return fotosZuPdf(bilder)
}

export const rapportOriginal = (st) => ({ bilder: st?.papierBilder || [], pdfs: st?.papierPdf || [] })
export const hatOriginal = (st) => !!(st?.papierBilder?.length || st?.papierPdf?.length)

/** Unterschriebenen Papier-Rapport ins Archiv legen (ohne KI-Abgleich, ohne „gesendet“ zu vermerken) */
export async function rapportOriginalSpeichern({ wKey, firma, dateien }) {
  const k = statusKey(wKey, firma)
  const alt = (await db.wochen.get(k)) || { key: k }
  const { bilder, pdfs } = teilen(dateien)
  await db.wochen.put({ ...alt, papierBilder: [...(alt.papierBilder || []), ...bilder], papierPdf: [...(alt.papierPdf || []), ...pdfs], papierAm: alt.papierAm || Date.now() })
}

/** Lohnabrechnung nur ablegen (ohne Prüfung) — kann später geprüft werden */
export async function abrechnungOriginalSpeichern({ monat, buero, firma, dateien }) {
  const [j, m] = monat.split('-').map(Number)
  const bis = `${monat}-${String(new Date(j, m, 0).getDate()).padStart(2, '0')}`
  return db.lohnabrechnungen.add({ von: `${monat}-01`, bis, buero: buero || '', firma: firma || '', fotos: dateien, daten: {}, pruefung: [], nurArchiv: true, erstellt: Date.now() })
}
