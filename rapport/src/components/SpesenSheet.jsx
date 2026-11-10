import { useState } from 'react'
import { Wallet, Trash2 } from 'lucide-react'
import Sheet from './Sheet'
import { db, speichereSpesen } from '../lib/db'
import { SPESEN } from '../lib/arten'
import { useEinstellungen, zahl } from '../lib/settings'
import { isoDatum } from '../lib/zeit'

export default function SpesenSheet({ spesen, datum, onClose }) {
  const [einst] = useEinstellungen()
  const [f, setF] = useState(() => spesen
    ? { ...spesen, betrag: String(spesen.betrag ?? ''), km: String(spesen.km ?? '') }
    : { art: 'verpflegung', datum: datum || isoDatum(new Date()), betrag: '', km: '', notiz: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const km = (e) => {
    const v = e.target.value
    setF({ ...f, km: v, betrag: v ? (zahl(v) * zahl(einst.kmSatz)).toFixed(2) : f.betrag })
  }

  async function sichern() {
    if (!f.datum || !(zahl(f.betrag) > 0)) return
    await speichereSpesen({ ...f, betrag: zahl(f.betrag), km: f.art === 'fahrt' ? zahl(f.km) : undefined, notiz: f.notiz.trim() })
    onClose()
  }
  async function loeschen() {
    if (!confirm('Diese Spesen löschen?')) return
    await db.spesen.delete(spesen.id); onClose()
  }

  return (
    <Sheet titel={spesen ? 'Spesen bearbeiten' : 'Spesen erfassen'} icon={Wallet} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {SPESEN.map((a) => (
          <button key={a.id} type="button" onClick={() => setF({ ...f, art: a.id })}
            className={'rounded-xl border px-2.5 py-2 text-sm flex items-center gap-2 ' + (a.id === f.art ? 'btn-grad border-transparent font-semibold' : 'border-white/10 text-white/65')}>
            <a.icon className="w-4 h-4 shrink-0" strokeWidth={1.9} /> {a.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-white/50 mb-1">Datum</label>
          <input type="date" value={f.datum} onChange={set('datum')} className="eingabe" />
        </div>
        {f.art === 'fahrt' && <div>
          <label className="block text-xs text-white/50 mb-1">Kilometer</label>
          <input inputMode="decimal" value={f.km} onChange={km} className="eingabe" />
        </div>}
        <div className={f.art === 'fahrt' ? '' : 'col-span-2'}>
          <label className="block text-xs text-white/50 mb-1">Betrag ({einst.waehrung})</label>
          <input inputMode="decimal" value={f.betrag} onChange={set('betrag')} placeholder="0.00" className="eingabe" />
        </div>
      </div>
      <input value={f.notiz} onChange={set('notiz')} placeholder="Bemerkung (z.B. Strecke, Beleg-Nr.)" className="eingabe" />
      <button onClick={sichern} disabled={!(zahl(f.betrag) > 0)} className="w-full rounded-2xl py-3 font-bold btn-grad disabled:opacity-40">Speichern</button>
      {spesen && (
        <button onClick={loeschen} className="w-full py-2 text-sm text-white/35 hover:text-ember inline-flex items-center justify-center gap-1.5">
          <Trash2 className="w-4 h-4" /> Löschen
        </button>
      )}
    </Sheet>
  )
}
