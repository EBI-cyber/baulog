import { Coffee, UtensilsCrossed } from 'lucide-react'
import { MITTAG_DAUERN, pausenAusWahl, plan } from '../lib/pausen'
import { uhr, hm } from '../lib/zeit'
import { mindestPause } from '../lib/profil'

const chip = (aktiv) => 'px-3 py-2 rounded-xl text-sm border min-w-[3.25rem] ' + (aktiv ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/75')

/**
 * Pausen mit wenigen Tipps: Znüni (09:00–09:15) ja/nein, Mittag ab 12:00 mit Dauer (keine/15/30/45/60/90).
 * Zeigt das Protokoll: Arbeitsblöcke, Pausen, Total — so sieht der Kalkulator, wie die Stunden zustande kommen.
 */
export default function PausenWahl({ datum, start, ende, wert, onChange }) {
  const p = plan()
  const pausen = start && ende ? pausenAusWahl(datum, start, ende, wert, p) : []
  const pauseMin = pausen.reduce((a, x) => a + (x.ende - x.start), 0) / 6e4
  const arbeitMin = start && ende ? (ende - start) / 6e4 - pauseMin : 0
  const bloecke = []
  if (start && ende) { let a = start; for (const x of [...pausen].sort((q, r) => q.start - r.start)) { bloecke.push([a, x.start]); a = x.ende } bloecke.push([a, ende]) }
  const zuWenig = arbeitMin > 0 && pauseMin < mindestPause(arbeitMin)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Coffee className="w-4 h-4 text-white/60" />
        <span className="text-sm w-28">Znüni {p.znueniVon}</span>
        <button type="button" className={chip(wert.znueni)} onClick={() => onChange({ ...wert, znueni: true })}>{p.znueniMin} Min.</button>
        <button type="button" className={chip(!wert.znueni)} onClick={() => onChange({ ...wert, znueni: false })}>keine</button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-white/60" />
          <span className="text-sm">Mittag ab</span>
          <input type="time" value={wert.mittagVon || p.mittagVon} onChange={(e) => onChange({ ...wert, mittagVon: e.target.value })} className="eingabe !w-32 !py-1.5" />
        </div>
        <div className="flex flex-wrap gap-2 pl-6">
          {MITTAG_DAUERN.map((m) => <button key={m} type="button" className={chip(wert.mittag === m)} onClick={() => onChange({ ...wert, mittag: m })}>{m ? `${m} Min.` : 'keine'}</button>)}
        </div>
      </div>
      {start && ende && <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm tabular-nums space-y-0.5">
        {bloecke.map(([a, b], i) => <div key={i} className="flex justify-between"><span>{uhr(a)} – {uhr(b)}</span><span className="text-white/60">{hm(b - a)} h</span></div>)}
        <div className="flex justify-between text-white/65 border-t border-white/10 pt-1 mt-1"><span>Pausen {pausen.map((x) => `${uhr(x.start)}–${uhr(x.ende)}`).join(', ') || 'keine'}</span><span>{Math.round(pauseMin)} Min.</span></div>
        <div className="flex justify-between font-bold"><span>Arbeitszeit</span><span>{hm(arbeitMin * 6e4)} h <span className="font-normal text-white/60">({(arbeitMin / 60).toFixed(2)})</span></span></div>
      </div>}
      {zuWenig && <div className="text-xs text-amber-300">Arbeitsgesetz: bei {hm(arbeitMin * 6e4)} h Arbeit mindestens {mindestPause(arbeitMin)} Min. Pause.</div>}
    </div>
  )
}
