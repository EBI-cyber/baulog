import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarRange, ChevronDown } from 'lucide-react'
import { db } from '../lib/db'
import { zahl } from '../lib/settings'
import { chf, erweitert } from '../lib/lohn'
import { lohnMitQst } from '../lib/useLohn'
import { sollIst } from '../lib/soll'
import { quellensteuerPflichtig, tarif } from '../lib/profil'
import { tarifLaden } from '../lib/quellensteuer'
import { isoDatum, arbeitMs } from '../lib/zeit'

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const dez = (h) => (Math.round(h * 100) / 100).toFixed(2)

/**
 * Jahres-Stand (für Steuererklärung, RAV, Überblick): Stunden, Über-/Minusstunden, Brutto, Quellensteuer,
 * Netto, Spesen und Abwesenheiten seit 1. Januar, mit Monatstabelle. Quellensteuer je Monat aus der Tabelle.
 */
export default function JahrStand({ jahr, kanton, einst }) {
  const [offen, setOffen] = useState(false)
  const heuteIso = isoDatum(new Date())
  const von = `${jahr}-01-01`, ende = `${jahr}-12-31`
  const bis = heuteIso < ende ? heuteIso : ende
  const daten = useLiveQuery(async () => {
    const [a, b] = erweitert(von, ende)
    return {
      schichten: await db.schichten.where('datum').between(a, b, true, true).toArray(),
      absenzen: await db.absenzen.where('datum').between(a, b, true, true).toArray(),
      spesen: await db.spesen.where('datum').between(von, ende, true, true).toArray(),
      einsaetze: await db.einsaetze.toArray(),
      erster: await db.schichten.orderBy('start').first(),
      zahlungen: (await db.zahlungen.toArray()).filter((z) => z.fuerMonat?.startsWith(String(jahr))),
    }
  }, [jahr], null)

  const p = einst?.profil
  const auto = quellensteuerPflichtig(p) && !zahl(p?.qstSatz) && p?.wohnkanton
  const [qstTarif, setQstTarif] = useState(null)
  useEffect(() => {
    let aktiv = true
    if (!auto) { setQstTarif(null); return }
    tarifLaden(jahr, p.wohnkanton, tarif(p)).then((t) => aktiv && setQstTarif(t))
    return () => { aktiv = false }
  }, [auto, jahr, p?.wohnkanton]) // eslint-disable-line react-hooks/exhaustive-deps

  const r = useMemo(() => {
    if (!daten || bis < von) return null
    const monate = []
    for (let m = 0; m < 12; m++) {
      const mVon = isoDatum(new Date(jahr, m, 1)), mEnde = isoDatum(new Date(jahr, m + 1, 0))
      if (mVon > bis) break
      const mBis = mEnde < bis ? mEnde : bis
      const l = lohnMitQst({ daten, einst, qstTarif: auto ? qstTarif : null, von: mVon, bis: mBis })
      const std = daten.schichten.filter((s) => s.datum >= mVon && s.datum <= mBis).reduce((s, x) => s + arbeitMs(x), 0) / 36e5
      const qst = l.posten.reduce((s, x) => s + x.abzuege.filter((a) => a.k === 'quellensteuer').reduce((t, a) => t + a.betrag, 0), 0)
      if (std > 0 || l.brutto > 0) monate.push({ m, std, brutto: l.brutto, netto: l.netto, auszahlung: l.auszahlung, qst, spesen: l.spesen + l.mittag, fehlt: l.fehlendeLoehne.length > 0 })
    }
    const s = sollIst({ von, bis, schichten: daten.schichten, absenzen: daten.absenzen, einsaetze: daten.einsaetze, einst, kanton, ersterTag: daten.erster?.datum })
    const sum = (k) => monate.reduce((a, x) => a + x[k], 0)
    const firmen = [...new Set(daten.schichten.filter((x) => x.datum >= von && x.datum <= bis).map((x) => x.firma).filter(Boolean))]
    const erhalten = daten.zahlungen.reduce((a, z) => a + z.betrag, 0)
    return { erhalten, anspruch: sum('auszahlung'), monate, s, brutto: sum('brutto'), netto: sum('netto'), qst: sum('qst'), spesen: sum('spesen'), fehlt: monate.some((x) => x.fehlt), firmen }
  }, [daten, qstTarif, einst, kanton, jahr, bis]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!r || !r.monate.length) return null
  const w = einst.waehrung
  return (
    <section className="glass rounded-3xl p-4 space-y-3">
      <button onClick={() => setOffen(!offen)} className="w-full flex items-center gap-2 text-left">
        <CalendarRange className="w-4 h-4 text-white/50" />
        <div className="flex-1">
          <div className="font-bold">Jahr {jahr} <span className="text-xs font-normal text-white/40">bis {bis.split('-').reverse().join('.')}</span></div>
          <div className="text-xs text-white/50 tabular-nums">{dez(r.s.arbeit)} h · {r.s.saldo >= 0 ? '+' : '−'}{dez(Math.abs(r.s.saldo))} h · netto {chf(r.netto, w)}</div>
        </div>
        <ChevronDown className={'w-5 h-5 text-white/40 transition-transform ' + (offen ? 'rotate-180' : '')} />
      </button>
      {offen && <>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <span className="text-white/55">Gearbeitet</span><span className="text-right font-semibold tabular-nums">{dez(r.s.arbeit)} h ({r.s.tage} Tage)</span>
          <span className="text-white/55">{r.s.saldo >= 0 ? 'Überstunden' : 'Minusstunden'}</span><span className={'text-right font-semibold tabular-nums ' + (r.s.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{r.s.saldo >= 0 ? '+' : '−'}{dez(Math.abs(r.s.saldo))} h</span>
          <span className="text-white/55">Bruttolohn</span><span className="text-right font-semibold tabular-nums">{chf(r.brutto, w)}</span>
          {r.qst > 0 && <><span className="text-white/55">Quellensteuer</span><span className="text-right font-semibold tabular-nums">{chf(r.qst, w)}</span></>}
          <span className="text-white/55">Nettolohn</span><span className="text-right font-semibold tabular-nums">{chf(r.netto, w)}</span>
          {r.erhalten > 0 && !r.fehlt && <><span className="text-white/55">Vom Büro erhalten</span><span className="text-right font-semibold tabular-nums">{chf(r.erhalten, w)}</span>
            <span className="text-white/55">{r.anspruch - r.erhalten >= 0 ? 'Noch ausstehend' : 'Zu viel erhalten'}</span><span className={'text-right font-semibold tabular-nums ' + (r.anspruch - r.erhalten > 0.5 ? 'text-amber-300' : r.anspruch - r.erhalten < -0.5 ? 'text-rose-300' : 'text-emerald-400')}>{chf(Math.abs(r.anspruch - r.erhalten), w)}</span></>}
          {r.spesen > 0 && <><span className="text-white/55">Spesen/Zulagen</span><span className="text-right font-semibold tabular-nums">{chf(r.spesen, w)}</span></>}
          {Object.keys(r.s.nachArt).length > 0 && <><span className="text-white/55">Abwesend</span><span className="text-right font-semibold">{Object.entries(r.s.nachArt).map(([k, n]) => `${n} T. ${k}`).join(', ')}</span></>}
          {r.firmen.length > 0 && <><span className="text-white/55">Einsätze</span><span className="text-right">{r.firmen.join(', ')}</span></>}
        </div>
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="text-white/40"><th className="text-left font-normal py-1">Monat</th><th className="text-right font-normal">Std.</th><th className="text-right font-normal">Brutto</th><th className="text-right font-normal">Netto</th></tr></thead>
          <tbody>{r.monate.map((x) => (
            <tr key={x.m} className="border-t border-white/5"><td className="py-1.5">{MONATE[x.m]}</td><td className="text-right">{dez(x.std)}</td>
              <td className="text-right">{x.fehlt ? '–' : chf(x.brutto, w)}</td><td className="text-right">{x.fehlt ? '–' : chf(x.netto, w)}</td></tr>
          ))}</tbody>
        </table>
        <div className="text-xs text-white/40">{r.fehlt ? 'Ohne Stundenlohn im Einsatz bleibt der Lohn leer. ' : ''}Geschätzt aus deinen Zeiten und dem Einsatzvertrag — für die Steuererklärung gilt der Lohnausweis des Büros. Hilft beim Vergleich und für RAV/Zwischenverdienst.</div>
      </>}
    </section>
  )
}
