import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import Sheet from './Sheet'
import FirmaWahl from './FirmaWahl'
import { db, speichern } from '../lib/db'
import { useEinstellungen } from '../lib/settings'
import { isoDatum, uhr, pauseMs, arbeitMs, hm } from '../lib/zeit'

/** Schicht bearbeiten oder nachtragen. schicht = bestehende Schicht | null (neu, an `datum`) */
export default function SchichtSheet({ schicht, datum, onClose }) {
  const [einst, setEinst] = useEinstellungen()
  const laeuft = schicht && schicht.ende == null
  const pauseAlt = schicht ? Math.round(pauseMs(schicht) / 60000) : 30
  const [f, setF] = useState(() => ({
    datum: schicht ? isoDatum(new Date(schicht.start)) : datum || isoDatum(new Date()),
    beginn: schicht ? uhr(schicht.start) : '',
    ende: schicht?.ende ? uhr(schicht.ende) : '16:30',
    pause: String(pauseAlt),
    firma: schicht?.firma || einst.firma || einst.firmen[0] || '',
    notiz: schicht?.notiz || '',
  }))
  const [fehler, setFehler] = useState('')
  // Beginn aus dem Einsatzvertrag (z.B. 07:00), sonst 07:00
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], null)
  useEffect(() => {
    if (!einsaetze || f.beginn) return
    setF((x) => ({ ...x, beginn: einsaetze.find((e) => e.firma === x.firma)?.arbeitsbeginn || '07:00' }))
  }, [einsaetze]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target?.value ?? e })

  const zeiten = () => {
    const start = new Date(`${f.datum}T${f.beginn}`).getTime()
    let ende = laeuft ? null : new Date(`${f.datum}T${f.ende}`).getTime()
    if (ende != null && ende <= start) ende += 864e5 // über Mitternacht
    return { start, ende }
  }
  const { start, ende } = zeiten()
  const pauseNeu = Math.max(0, parseInt(f.pause, 10) || 0)
  const vorschau = !isNaN(start) && (laeuft || !isNaN(ende))
    ? hm(arbeitMs({ start, ende: ende ?? Date.now(), pauseMin: pauseNeu })) : '–'

  async function sichern() {
    if (isNaN(start) || (!laeuft && isNaN(ende))) return setFehler('Bitte Datum und Uhrzeiten ausfüllen.')
    if (!f.firma) return setFehler('Bitte eine Firma wählen.')
    if (start > Date.now()) return setFehler('Der Beginn liegt in der Zukunft.')
    const neu = { ...(schicht || { pausen: [] }), start, ende, firma: f.firma, notiz: f.notiz }
    // Pause nur überschreiben, wenn sie geändert wurde (sonst bleiben die gestoppten Pausen erhalten)
    if (!laeuft && (!schicht || pauseNeu !== pauseAlt)) { neu.pauseMin = pauseNeu; delete neu.pauseAuto; delete neu.pausePruefen }
    await speichern(neu)
    onClose()
  }

  async function loeschen() {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return
    await db.schichten.delete(schicht.id)
    onClose()
  }

  return (
    <Sheet titel={schicht ? 'Eintrag bearbeiten' : 'Zeit nachtragen'} icon={schicht ? Pencil : Plus} onClose={onClose}>
      <label className="block text-xs text-white/50">Einsatzbetrieb</label>
      <FirmaWahl firmen={einst.firmen} wert={f.firma} onWahl={set('firma')}
        onNeu={(n) => setEinst({ firmen: [...einst.firmen, n] })} />
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="col-span-2">
          <label className="block text-xs text-white/50 mb-1">Datum</label>
          <input type="date" value={f.datum} onChange={set('datum')} className="eingabe" />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Beginn</label>
          <input type="time" value={f.beginn} onChange={set('beginn')} className="eingabe" />
        </div>
        {!laeuft && <div>
          <label className="block text-xs text-white/50 mb-1">Ende</label>
          <input type="time" value={f.ende} onChange={set('ende')} className="eingabe" />
        </div>}
        {!laeuft && <div className="col-span-2">
          <label className="block text-xs text-white/50 mb-1">Pause (Minuten)</label>
          <input type="number" inputMode="numeric" min="0" value={f.pause} onChange={set('pause')} className="eingabe" />
        </div>}
        <div className="col-span-2">
          <label className="block text-xs text-white/50 mb-1">Bemerkung (optional)</label>
          <input value={f.notiz} onChange={set('notiz')} placeholder="z.B. Baustelle, Tätigkeit" className="eingabe" />
        </div>
      </div>
      <div className="text-sm text-white/60">Arbeitszeit: <span className="font-bold text-white tabular-nums">{vorschau} h</span></div>
      {fehler && <div className="text-sm rounded-xl px-3 py-2 bg-ember/15 border border-ember/30 text-ember">{fehler}</div>}
      <button onClick={sichern} className="w-full rounded-2xl py-3 font-bold btn-grad">Speichern</button>
      {schicht && !laeuft && (
        <button onClick={loeschen} className="w-full py-2 text-sm text-white/35 hover:text-ember inline-flex items-center justify-center gap-1.5">
          <Trash2 className="w-4 h-4" /> Löschen
        </button>
      )}
    </Sheet>
  )
}
