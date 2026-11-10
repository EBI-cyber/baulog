import { useState } from 'react'
import { Coffee } from 'lucide-react'
import Sheet from './Sheet'
import { speichern } from '../lib/db'
import { uhr, isoDatum, hm, arbeitMs } from '../lib/zeit'

/** Pause nachtragen: Beginn und Dauer mit zwei Tipps (für vergessene Pausen) */
export default function PauseSheet({ schicht, onClose }) {
  const vorschlaege = ['11:30', '11:45', '12:00', '12:15', '12:30', '12:45']
  const [beginn, setBeginn] = useState('12:00')
  const [dauer, setDauer] = useState(30)
  const tag = isoDatum(new Date(schicht.start))

  async function sichern(keine) {
    const neu = { ...schicht }
    delete neu.pausePruefen; delete neu.pauseAuto; delete neu.pauseMin
    if (keine) { neu.pausen = []; neu.pauseMin = 0 }
    else {
      const s = new Date(`${tag}T${beginn}`).getTime()
      neu.pausen = [...(schicht.pausen || []).filter((p) => p.ende && p.ende - p.start > 60000), { start: s, ende: s + dauer * 60000 }]
    }
    await speichern(neu)
    onClose()
  }

  const chip = (aktiv) => 'px-3 py-2 rounded-xl text-sm border ' + (aktiv ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/70')
  return (
    <Sheet titel="Pause vergessen?" icon={Coffee} onClose={onClose}>
      <div className="text-sm text-white/55">{schicht.firma} · {uhr(schicht.start)}–{uhr(schicht.ende)} — keine Pause gedrückt. Wann und wie lange?</div>
      <div className="space-y-2">
        <div className="text-xs text-white/50">Beginn</div>
        <div className="flex flex-wrap gap-2">
          {vorschlaege.map((v) => <button key={v} className={chip(beginn === v)} onClick={() => setBeginn(v)}>{v}</button>)}
          <input type="time" value={beginn} onChange={(e) => setBeginn(e.target.value)} className="eingabe w-28 py-1.5" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs text-white/50">Dauer</div>
        <div className="flex flex-wrap gap-2">
          {[15, 30, 45, 60, 90].map((d) => <button key={d} className={chip(dauer === d)} onClick={() => setDauer(d)}>{d} Min.</button>)}
        </div>
      </div>
      <div className="text-sm text-white/60">Arbeitszeit danach: <b className="text-white tabular-nums">{hm(arbeitMs({ ...schicht, pauseMin: dauer }))} h</b></div>
      <button onClick={() => sichern(false)} className="w-full rounded-2xl py-3.5 font-bold btn-grad">Pause {beginn}–{(() => { const d = new Date(`${tag}T${beginn}`); d.setMinutes(d.getMinutes() + dauer); return uhr(d) })()} eintragen</button>
      <button onClick={() => sichern(true)} className="w-full py-2 text-sm text-white/45">Ich habe keine Pause gemacht</button>
    </Sheet>
  )
}
