import { useState } from 'react'
import { Coffee } from 'lucide-react'
import Sheet from './Sheet'
import PausenWahl from './PausenWahl'
import { speichern } from '../lib/db'
import { uhr, isoDatum } from '../lib/zeit'
import { ladeEinstellungen, speichereEinstellungen } from '../lib/settings'
import { pausenAusWahl, standardWahl, wahlAusPausen, nurPlan, plan } from '../lib/pausen'

/** Feierabend: Pausen (Znüni, Mittag) und Ende mit wenigen Tipps bestätigen → echte Pausenzeiten im Protokoll */
export default function PauseSheet({ schicht, onClose }) {
  const tag = isoDatum(new Date(schicht.start))
  const [endeZeit, setEndeZeit] = useState(uhr(schicht.ende))
  let ende = new Date(`${tag}T${endeZeit}`).getTime()
  if (ende <= schicht.start) ende += 864e5
  const vorhanden = (schicht.pausen || []).filter((x) => x.ende && x.ende - x.start > 60000)
  const [wahl, setWahl] = useState(() => (vorhanden.length && nurPlan(vorhanden) ? wahlAusPausen(tag, vorhanden) : standardWahl(tag, schicht.start, schicht.ende)))

  async function sichern() {
    const neu = { ...schicht, ende }
    delete neu.pausePruefen; delete neu.pauseAuto; delete neu.pauseMin
    neu.pausen = pausenAusWahl(tag, schicht.start, ende, wahl)
    await speichern(neu)
    // gewählte Mittagsdauer als neuen Standard merken
    const e = ladeEinstellungen()
    speichereEinstellungen({ ...e, pausenPlan: { ...plan(), mittagMin: wahl.mittag || plan().mittagMin, mittagVon: wahl.mittag ? wahl.mittagVon : plan().mittagVon } })
    onClose()
  }

  return (
    <Sheet titel="Pausen & Feierabend" icon={Coffee} onClose={onClose}>
      <div className="text-sm text-white/70">{schicht.firma} · Beginn {uhr(schicht.start)}{vorhanden.length && !nurPlan(vorhanden) ? '' : ' — Pausen bitte bestätigen'}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm w-28">Feierabend</span>
        <input type="time" value={endeZeit} onChange={(e) => setEndeZeit(e.target.value)} className="eingabe !w-32 !py-1.5" />
      </div>
      <PausenWahl datum={tag} start={schicht.start} ende={ende} wert={wahl} onChange={setWahl} />
      <button onClick={sichern} className="w-full rounded-2xl py-3.5 font-bold btn-grad">Speichern</button>
    </Sheet>
  )
}
