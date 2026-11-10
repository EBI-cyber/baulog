import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { lohnBerechnen, erweitert } from './lohn'
import { isoDatum } from './zeit'
import { zahl } from './settings'
import { quellensteuerPflichtig, tarif } from './profil'
import { tarifLaden, satzFuer } from './quellensteuer'

/** Monatsgrenzen (YYYY-MM-DD) des Monats, in dem `tag` liegt */
function monatVon(tag) {
  const d = new Date(tag + 'T12:00')
  return [isoDatum(new Date(d.getFullYear(), d.getMonth(), 1)), isoDatum(new Date(d.getFullYear(), d.getMonth() + 1, 0))]
}

/** Werktage (Mo–Fr) zwischen a und b inkl. */
function werktage(a, b) {
  let n = 0
  for (const d = new Date(a + 'T12:00'), e = new Date(b + 'T12:00'); d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++
  return n
}

/**
 * Live-Lohn für [von, bis] (YYYY-MM-DD). jetzt = für laufende Schichten.
 * Quellensteuer: ohne Satz von Hand wird er aus der offiziellen Tabelle (Wohnkanton, Tarif) und dem
 * Monatslohn bestimmt — läuft der Monat noch, wird der Monatslohn auf den ganzen Monat hochgerechnet.
 */
export function useLohn(von, bis, einst, jetzt) {
  const [mVon, mBis] = monatVon(bis)
  const daten = useLiveQuery(async () => {
    const a = erweitert(von < mVon ? von : mVon, bis > mBis ? bis : mBis)
    return {
      schichten: await db.schichten.where('datum').between(a[0], a[1], true, true).toArray(),
      absenzen: await db.absenzen.where('datum').between(a[0], a[1], true, true).toArray(),
      spesen: await db.spesen.where('datum').between(von, bis, true, true).toArray(),
      einsaetze: await db.einsaetze.toArray(),
    }
  }, [von, bis, mVon, mBis], null)

  const p = einst?.profil
  const auto = quellensteuerPflichtig(p) && !zahl(p?.qstSatz) && p?.wohnkanton
  const jahr = +bis.slice(0, 4), code = auto ? tarif(p) : null
  const [qstTarif, setQstTarif] = useState(null)
  useEffect(() => {
    let aktiv = true
    if (!auto) { setQstTarif(null); return }
    tarifLaden(jahr, p.wohnkanton, code).then((t) => aktiv && setQstTarif(t))
    return () => { aktiv = false }
  }, [auto, jahr, p?.wohnkanton, code])

  if (!daten) return null
  let e = einst
  if (auto && qstTarif) {
    const heute = isoDatum(new Date())
    const monat = lohnBerechnen({ ...daten, spesen: [], einst, von: mVon, bis: mBis, jetzt })
    let monatsBrutto = monat.brutto
    if (heute >= mVon && heute < mBis) { // laufender Monat → hochrechnen
      const bisher = werktage(mVon, heute), gesamt = werktage(mVon, mBis)
      if (bisher > 0) monatsBrutto = monat.brutto * gesamt / bisher
    }
    e = { ...einst, qstAuto: { satz: satzFuer(qstTarif, monatsBrutto), jahr: qstTarif.jahr, monatsBrutto, code, kanton: p.wohnkanton } }
  }
  return lohnBerechnen({ ...daten, einst: e, von, bis, jetzt })
}
