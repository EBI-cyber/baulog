import { useState } from 'react'
import { loadSettings, saveSettings } from '../lib/settings'

export default function Einstellungen() {
  const [s, setS] = useState(loadSettings())
  const [msg, setMsg] = useState(false)
  const upd = (k, v) => setS((p) => ({ ...p, [k]: v }))
  const setGewerk = (i, v) => setS((p) => ({ ...p, gewerke: p.gewerke.map((g, idx) => (idx === i ? v : g)) }))
  const addGewerk = () => setS((p) => ({ ...p, gewerke: [...p.gewerke, ''] }))
  const delGewerk = (i) => setS((p) => ({ ...p, gewerke: p.gewerke.filter((_, idx) => idx !== i) }))
  const save = () => {
    const clean = { ...s, gewerke: s.gewerke.filter((g) => g.trim()) }
    saveSettings(clean); setS(clean); setMsg(true); setTimeout(() => setMsg(false), 1500)
  }
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'

  return (
    <div className="px-6 pt-10 pb-6">
      <h2 className="text-2xl font-bold mb-4">Einstellungen</h2>

      <div className="glass rounded-3xl p-4 mb-3">
        <label className="block mb-2">
          <span className="text-white/50 text-xs">Standard-Stundensatz Selbstkosten (€/h)</span>
          <input value={s.defaultRate} onChange={(e) => upd('defaultRate', e.target.value)} inputMode="decimal" className={inp + ' mt-1'} />
        </label>
        <div className="text-white/35 text-xs">Pro Projekt überschreibbar. Basis für die Lohnkosten-Berechnung.</div>
      </div>

      <div className="glass rounded-3xl p-4">
        <div className="text-white/60 font-semibold mb-2">Gewerke</div>
        {s.gewerke.map((g, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={g} onChange={(e) => setGewerk(i, e.target.value)} className={inp} />
            <button onClick={() => delGewerk(i)} className="text-white/40 px-1 text-lg leading-none">✕</button>
          </div>
        ))}
        <button onClick={addGewerk} className="text-sm text-amber">+ Gewerk hinzufügen</button>
      </div>

      <button onClick={save} className="w-full mt-4 rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink">
        {msg ? 'Gespeichert ✓' : 'Speichern'}
      </button>
    </div>
  )
}
