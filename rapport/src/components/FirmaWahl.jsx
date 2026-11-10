import { useState } from 'react'
import { Plus } from 'lucide-react'

/** Chips zur Auswahl des Einsatzbetriebs, mit "+ neu" */
export default function FirmaWahl({ firmen, wert, onWahl, onNeu }) {
  const [neu, setNeu] = useState(null)
  const fertig = () => {
    const n = (neu || '').trim()
    if (n) { onNeu(n); onWahl(n) }
    setNeu(null)
  }
  return (
    <div className="flex flex-wrap gap-2">
      {firmen.map((f) => (
        <button key={f} type="button" onClick={() => onWahl(f)}
          className={'px-3.5 py-2 rounded-full text-sm border ' + (f === wert ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/70')}>
          {f}
        </button>
      ))}
      {neu == null ? (
        <button type="button" onClick={() => setNeu('')} className="px-3 py-2 rounded-full text-sm border border-dashed border-white/25 text-white/60 inline-flex items-center gap-1">
          <Plus className="w-4 h-4" /> Firma
        </button>
      ) : (
        <form className="flex gap-2 w-full" onSubmit={(e) => { e.preventDefault(); fertig() }}>
          <input autoFocus value={neu} onChange={(e) => setNeu(e.target.value)} placeholder="Name der Firma" className="eingabe" />
          <button className="px-4 rounded-xl btn-grad font-semibold">OK</button>
        </form>
      )}
    </div>
  )
}
