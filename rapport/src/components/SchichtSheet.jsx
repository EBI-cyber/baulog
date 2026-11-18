import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import Sheet from './Sheet'
import FirmaWahl from './FirmaWahl'
import { db, speichern } from '../lib/db'
import { useEinstellungen } from '../lib/settings'
import { isoDatum, uhr, pauseMs, arbeitMs, hm } from '../lib/zeit'
import PausenWahl from './PausenWahl'
import { pausenAusWahl, standardWahl, wahlAusPausen, nurPlan } from '../lib/pausen'

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
  // Pausen: gestempelte Pausen mit eigenen Zeiten bleiben, bis man sie durch den Tagesablauf ersetzt
  const gestempelt = (schicht?.pausen || []).filter((x) => x.ende && x.ende - x.start > 60000)
  const [modus, setModus] = useState(() => (gestempelt.length && !nurPlan(gestempelt) ? 'gestempelt' : schicht && !gestempelt.length && schicht.pauseMin != null ? 'minuten' : 'plan'))
  const [wahl, setWahl] = useState(null)
  const [geaendert, setGeaendert] = useState(!schicht)
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
  const gueltig = !isNaN(start) && !isNaN(ende) && ende != null
  // Anfangswahl: aus Plan-Pausen der Schicht, sonst Vorschlag nach Beginn/Ende
  const w = wahl || (gestempelt.length && nurPlan(gestempelt) ? wahlAusPausen(f.datum, gestempelt) : gueltig ? standardWahl(f.datum, start, ende) : { znueni: true, mittag: 30, mittagVon: '12:00' })
  const vorschau = !isNaN(start) && (laeuft || !isNaN(ende))
    ? hm(modus === 'plan' && gueltig ? arbeitMs({ start, ende, pausen: pausenAusWahl(f.datum, start, ende, w) }) : modus === 'gestempelt' ? arbeitMs({ ...schicht, start, ende: ende ?? Date.now() }) : arbeitMs({ start, ende: ende ?? Date.now(), pauseMin: pauseNeu })) : '–'

  async function sichern() {
    if (isNaN(start) || (!laeuft && isNaN(ende))) return setFehler('Bitte Datum und Uhrzeiten ausfüllen.')
    if (!f.firma) return setFehler('Bitte eine Firma wählen.')
    if (start > Date.now()) return setFehler('Der Beginn liegt in der Zukunft.')
    const neu = { ...(schicht || { pausen: [] }), start, ende, firma: f.firma, notiz: f.notiz }
    // Pausen: Tagesablauf (echte Zeiten) bzw. Minuten — nur überschreiben, wenn geändert (gestempelte Pausen bleiben sonst)
    if (!laeuft && modus === 'plan' && (geaendert || !schicht || start !== schicht.start || ende !== schicht.ende)) {
      neu.pausen = pausenAusWahl(f.datum, start, ende, w); delete neu.pauseMin; delete neu.pauseAuto; delete neu.pausePruefen
    } else if (!laeuft && modus === 'minuten' && (!schicht || pauseNeu !== pauseAlt)) { neu.pausen = []; neu.pauseMin = pauseNeu; delete neu.pauseAuto; delete neu.pausePruefen }
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
      <label className="block text-xs text-white/65">Einsatzbetrieb</label>
      <FirmaWahl firmen={einst.firmen} wert={f.firma} onWahl={set('firma')}
        onNeu={(n) => setEinst({ firmen: [...einst.firmen, n] })} />
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="col-span-2">
          <label className="block text-xs text-white/65 mb-1">Datum</label>
          <input type="date" value={f.datum} onChange={set('datum')} className="eingabe" />
        </div>
        <div>
          <label className="block text-xs text-white/65 mb-1">Beginn</label>
          <input type="time" value={f.beginn} onChange={set('beginn')} className="eingabe" />
        </div>
        {!laeuft && <div>
          <label className="block text-xs text-white/65 mb-1">Ende</label>
          <input type="time" value={f.ende} onChange={set('ende')} className="eingabe" />
        </div>}
        {!laeuft && <div className="col-span-2 space-y-2">
          <div className="flex items-center gap-2 text-xs text-white/65">
            <span className="flex-1">Pausen</span>
            {[['plan', 'Znüni/Mittag'], ...(gestempelt.length && !nurPlan(gestempelt) ? [['gestempelt', 'gestempelt']] : []), ['minuten', 'Minuten']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setModus(k); setGeaendert(true) }} className={'px-2.5 py-1 rounded-full border ' + (modus === k ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/65')}>{l}</button>
            ))}
          </div>
          {modus === 'plan' && <PausenWahl datum={f.datum} start={gueltig ? start : null} ende={gueltig ? ende : null} wert={w} onChange={(x) => { setWahl(x); setGeaendert(true) }} />}
          {modus === 'gestempelt' && <div className="text-sm text-white/75 tabular-nums">{gestempelt.map((x) => `${uhr(x.start)}–${uhr(x.ende)}`).join(', ')} <span className="text-white/60">(per Knopf gestempelt)</span></div>}
          {modus === 'minuten' && <input type="number" inputMode="numeric" min="0" value={f.pause} onChange={set('pause')} className="eingabe" placeholder="Pause in Minuten" />}
        </div>}
        <div className="col-span-2">
          <label className="block text-xs text-white/65 mb-1">Bemerkung (optional)</label>
          <input value={f.notiz} onChange={set('notiz')} placeholder="z.B. Baustelle, Tätigkeit" className="eingabe" />
        </div>
      </div>
      <div className="text-sm text-white/60">Arbeitszeit: <span className="font-bold text-white tabular-nums">{vorschau} h</span></div>
      {fehler && <div className="text-sm rounded-xl px-3 py-2 bg-ember/15 border border-ember/30 text-ember">{fehler}</div>}
      <button onClick={sichern} className="w-full rounded-2xl py-3 font-bold btn-grad">Speichern</button>
      {schicht && !laeuft && (
        <button onClick={loeschen} className="w-full py-2 text-sm text-white/55 hover:text-ember inline-flex items-center justify-center gap-1.5">
          <Trash2 className="w-4 h-4" /> Löschen
        </button>
      )}
    </Sheet>
  )
}
