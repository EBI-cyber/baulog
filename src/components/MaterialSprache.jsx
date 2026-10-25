import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import VoiceInput from './VoiceInput'
import { parseAbschluss } from '../lib/ai'
import { parseBetrag } from '../lib/abrechnung'
import { melden } from '../ui/Hinweise'

// Material per Sprache: „3 Sack Fliesenkleber à 12 Euro und 2 Kartuschen Silikon“ sagen,
// die KI macht daraus Positionen, die man prüft und mit einem Tipp speichert.
export default function MaterialSprache({ gewerk, onSpeichern }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [liste, setListe] = useState(null) // [{ label, qty, unitCost }] als Text zum Bearbeiten
  const inp = 'bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm'

  const erkennen = async () => {
    setBusy(true)
    try {
      const r = await parseAbschluss(text, { gewerk, leistung: '', einheit: '', maschinen: [], workMinutes: 0 })
      const m = (Array.isArray(r.materials) ? r.materials : []).filter((x) => x && x.label)
      if (!m.length) melden('Ich habe kein Material erkannt. Sag zum Beispiel: „3 Sack Fliesenkleber à 12 Euro“.')
      else setListe(m.map((x) => ({ label: String(x.label), qty: String(Number(x.qty) || 1).replace('.', ','), unitCost: x.unitCost ? String(x.unitCost).replace('.', ',') : '' })))
    } catch (err) { melden(err && err.message ? err.message : String(err)) }
    setBusy(false)
  }
  const setPos = (i, patch) => setListe((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  return (
    <div className="rounded-2xl p-3 border border-amber/40 bg-amber/5 space-y-2">
      <div className="text-sm font-semibold">Per Sprache eintragen</div>
      {!liste ? (
        <>
          <div className="flex gap-2 items-center">
            <VoiceInput onText={setText} />
            <button type="button" disabled={busy || !text.trim()} onClick={erkennen} className="rounded-xl px-3 py-2 text-sm font-semibold bg-white/10 disabled:opacity-40 inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" />{busy ? 'erkenne …' : 'Erkennen'}</button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="z. B. „3 Sack Fliesenkleber à 12 Euro und 2 Kartuschen Silikon für 6,50“" className={inp + ' w-full'} />
        </>
      ) : (
        <>
          {liste.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={p.qty} onChange={(e) => setPos(i, { qty: e.target.value })} inputMode="decimal" className={inp + ' w-14 text-right'} />
              <input value={p.label} onChange={(e) => setPos(i, { label: e.target.value })} className={inp + ' flex-1 min-w-0'} />
              <input value={p.unitCost} onChange={(e) => setPos(i, { unitCost: e.target.value })} inputMode="decimal" placeholder="€/Stk" className={inp + ' w-20 text-right'} />
              <button onClick={() => setListe((l) => l.filter((_, j) => j !== i))} className="text-white/60 p-1"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setListe(null); setText('') }} className="rounded-xl py-2.5 bg-white/10 text-sm">Neu sprechen</button>
            <button disabled={!liste.length} onClick={() => onSpeichern(liste.map((p) => ({ label: p.label.trim(), qty: parseBetrag(p.qty) || 1, unitCost: parseBetrag(p.unitCost) || 0 })).filter((p) => p.label))}
              className="rounded-xl py-2.5 btn-grad font-bold text-sm disabled:opacity-50">{liste.length === 1 ? 'Speichern' : liste.length + ' speichern'}</button>
          </div>
        </>
      )}
    </div>
  )
}
