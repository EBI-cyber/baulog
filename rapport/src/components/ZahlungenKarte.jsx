import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Landmark, Plus, Trash2, ChevronDown } from 'lucide-react'
import { db } from '../lib/db'
import { chf } from '../lib/lohn'
import { ARTEN } from '../lib/zahlungen'
import ZahlungenSheet from './ZahlungenSheet'

/**
 * Bezahlt vs. Anspruch für einen Monat: Vorschüsse + Lohnzahlungen vom Büro gegen die (geschätzte) Auszahlung.
 * offen > 0 → das Büro schuldet noch; < 0 → zu viel vorausbezahlt (wird mit dem nächsten Lohn verrechnet).
 */
export default function ZahlungenKarte({ monat, anspruch, w = 'CHF', titel = 'Zahlungen vom Büro', laufend }) {
  const zahlungen = useLiveQuery(() => db.zahlungen.where('fuerMonat').equals(monat).sortBy('datum'), [monat], [])
  const [sheet, setSheet] = useState(false)
  const [liste, setListe] = useState(false)
  const summe = (a) => zahlungen.filter((z) => z.art === a).reduce((s, z) => s + z.betrag, 0)
  const erhalten = zahlungen.reduce((s, z) => s + z.betrag, 0)
  const offen = anspruch != null ? anspruch - erhalten : null

  return (
    <section className="glass rounded-3xl p-4 space-y-2">
      <div className="text-white/45 text-xs inline-flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" /> {titel}</div>
      {zahlungen.length ? <>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
          {summe('vorschuss') > 0 && <><span className="text-white/55">Vorschüsse ({zahlungen.filter((z) => z.art === 'vorschuss').length}×)</span><span className="text-right font-semibold">{chf(summe('vorschuss'), w)}</span></>}
          {summe('lohn') > 0 && <><span className="text-white/55">Lohnzahlung</span><span className="text-right font-semibold">{chf(summe('lohn'), w)}</span></>}
          {summe('sonstig') > 0 && <><span className="text-white/55">Sonstiges</span><span className="text-right font-semibold">{chf(summe('sonstig'), w)}</span></>}
          <span className="text-white/55">Erhalten total</span><span className="text-right font-bold">{chf(erhalten, w)}</span>
          {anspruch != null && <><span className="text-white/55">Anspruch {laufend ? 'bisher' : ''} (Auszahlung)</span><span className="text-right font-semibold">{chf(anspruch, w)}</span></>}
        </div>
        {offen != null && (
          <div className={'rounded-2xl px-3 py-2 text-sm font-semibold flex justify-between ' + (offen > 0.5 ? 'bg-amber-400/10 text-amber-300' : offen < -0.5 ? 'bg-rose-400/10 text-rose-300' : 'bg-emerald-400/10 text-emerald-300')}>
            <span>{offen > 0.5 ? (laufend ? 'Noch offen (Büro zahlt nach)' : 'Büro schuldet dir noch') : offen < -0.5 ? 'Zu viel vorausbezahlt (wird verrechnet)' : 'Ausgeglichen'}</span>
            <span className="tabular-nums">{chf(Math.abs(offen), w)}</span>
          </div>
        )}
        <button onClick={() => setListe(!liste)} className="text-xs text-white/50 inline-flex items-center gap-1">
          <ChevronDown className={'w-3.5 h-3.5 transition-transform ' + (liste ? 'rotate-180' : '')} /> {zahlungen.length} Zahlung{zahlungen.length === 1 ? '' : 'en'}
        </button>
        {liste && <div className="space-y-1">
          {zahlungen.map((z) => (
            <div key={z.id} className="flex items-center gap-2 text-xs rounded-xl bg-white/[0.04] px-3 py-2">
              <span className="tabular-nums w-16">{z.datum.split('-').reverse().join('.').slice(0, 6)}</span>
              <span className="flex-1 truncate text-white/60">{ARTEN.find((a) => a.id === z.art)?.label} · {z.text}</span>
              <span className="tabular-nums font-semibold">{chf(z.betrag, w)}</span>
              <button onClick={() => confirm('Zahlung löschen?') && db.zahlungen.delete(z.id)} className="text-white/35" aria-label="Löschen"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>}
      </> : <div className="text-sm text-white/55">Noch keine Vorschüsse oder Lohnzahlungen erfasst{anspruch != null ? ` — Anspruch ${laufend ? 'bisher ' : ''}${chf(anspruch, w)}` : ''}.</div>}
      <button onClick={() => setSheet(true)} className="w-full rounded-2xl py-2.5 bg-white/[0.06] border border-dashed border-white/15 text-sm text-white/70 inline-flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Bankauszug einfügen
      </button>
      {sheet && <ZahlungenSheet onClose={() => setSheet(false)} />}
    </section>
  )
}
