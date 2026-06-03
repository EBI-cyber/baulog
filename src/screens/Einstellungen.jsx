import { useState } from 'react'
import { loadSettings, saveSettings, EINHEITEN, mergeDinKatalog } from '../lib/settings'
import { useAuth } from '../lib/auth'
import { syncAll } from '../lib/cloud'
import { useRole } from '../lib/role'

export default function Einstellungen() {
  const { user, isCloudReady, signOut } = useAuth()
  const isWorker = useRole() === 'worker'
  const [s, setS] = useState(loadSettings())
  const [msg, setMsg] = useState(false)
  const upd = (k, v) => setS((p) => ({ ...p, [k]: v }))
  const setGewerk = (i, v) => setS((p) => ({ ...p, gewerke: p.gewerke.map((g, idx) => (idx === i ? v : g)) }))
  const addGewerk = () => setS((p) => ({ ...p, gewerke: [...p.gewerke, ''] }))
  const delGewerk = (i) => setS((p) => ({ ...p, gewerke: p.gewerke.filter((_, idx) => idx !== i) }))
  const updKat = (i, k, v) => setS((p) => ({ ...p, leistungskatalog: p.leistungskatalog.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)) }))
  const addKat = () => setS((p) => ({ ...p, leistungskatalog: [...p.leistungskatalog, { gewerk: p.gewerke[0] || 'Sonstiges', name: '', einheit: 'm²' }] }))
  const delKat = (i) => setS((p) => ({ ...p, leistungskatalog: p.leistungskatalog.filter((_, idx) => idx !== i) }))
  const updMasch = (i, k, v) => setS((p) => ({ ...p, maschinen: p.maschinen.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)) }))
  const addMasch = () => setS((p) => ({ ...p, maschinen: [...(p.maschinen || []), { name: '', satz: 0 }] }))
  const delMasch = (i) => setS((p) => ({ ...p, maschinen: p.maschinen.filter((_, idx) => idx !== i) }))
  const ladeDin = () => { const r = mergeDinKatalog(s); setS((p) => ({ ...p, leistungskatalog: r.leistungskatalog, gewerke: r.gewerke })); alert(r.added + ' DIN-Positionen ergänzt — Speichern nicht vergessen.') }
  const save = () => {
    const clean = { ...s, gewerke: s.gewerke.filter((g) => g.trim()) }
    saveSettings(clean); setS(clean); setMsg(true); setTimeout(() => setMsg(false), 1500)
  }
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'

  if (isWorker) {
    return (
      <div className="px-6 pt-10 pb-6">
        <h2 className="text-2xl font-bold mb-4">Einstellungen</h2>
        {isCloudReady && (
          <div className="glass rounded-3xl p-4 mb-3 flex items-center justify-between">
            <div>
              <div className="text-white/60 font-semibold">Angemeldet</div>
              <div className="text-white/40 text-xs">{user?.email}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={async () => { try { await syncAll(); alert('Synchronisiert ✓') } catch { alert('Sync-Fehler') } }} className="text-amber text-sm px-2 py-1 rounded-lg border border-white/10">Sync</button>
              <button onClick={signOut} className="text-white/60 text-sm px-2 py-1 rounded-lg border border-white/10">Abmelden</button>
            </div>
          </div>
        )}
        <div className="glass rounded-3xl p-4 text-white/45 text-sm">
          Mitarbeiter-Ansicht: Du erfasst nur deine Zeiten in den freigegebenen Projekten. Kalkulation & Firmendaten verwaltet dein Chef.
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 pt-10 pb-6">
      <h2 className="text-2xl font-bold mb-4">Einstellungen</h2>

      {isCloudReady && (
        <div className="glass rounded-3xl p-4 mb-3 flex items-center justify-between">
          <div>
            <div className="text-white/60 font-semibold">Cloud-Sync aktiv</div>
            <div className="text-white/40 text-xs">{user?.email}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={async () => { try { await syncAll(); alert('Synchronisiert ✓') } catch { alert('Sync-Fehler') } }} className="text-amber text-sm px-2 py-1 rounded-lg border border-white/10">Sync</button>
            <button onClick={signOut} className="text-white/60 text-sm px-2 py-1 rounded-lg border border-white/10">Abmelden</button>
          </div>
        </div>
      )}

      <div className="glass rounded-3xl p-4 mb-3">
        <div className="text-white/60 font-semibold mb-2">Firmendaten (für Leistungsnachweis)</div>
        <input value={s.company} onChange={(e) => upd('company', e.target.value)} placeholder="Firmenname" className={inp + ' mb-2'} />
        <input value={s.owner} onChange={(e) => upd('owner', e.target.value)} placeholder="Inhaber" className={inp + ' mb-2'} />
        <input value={s.street} onChange={(e) => upd('street', e.target.value)} placeholder="Straße & Nr." className={inp + ' mb-2'} />
        <div className="grid grid-cols-3 gap-2 mb-2">
          <input value={s.zip} onChange={(e) => upd('zip', e.target.value)} placeholder="PLZ" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber" />
          <input value={s.city} onChange={(e) => upd('city', e.target.value)} placeholder="Ort" className="col-span-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber" />
        </div>
        <input value={s.taxId} onChange={(e) => upd('taxId', e.target.value)} placeholder="Steuernummer" className={inp} />
      </div>

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

      <div className="glass rounded-3xl p-4 mt-3">
        <div className="text-white/60 font-semibold mb-1">Leistungskatalog (mit Einheiten)</div>
        <div className="text-white/35 text-xs mb-3">Vorbelegt pro Gewerk. Erscheinen bei Zeit/Menge/Material zur Auswahl — Basis für die EP-Kalkulation.</div>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {s.leistungskatalog.map((l, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-2">
              <div className="flex gap-2 items-center">
                <input value={l.name} onChange={(e) => updKat(i, 'name', e.target.value)} placeholder="Leistung" className="flex-1 bg-transparent outline-none px-1 py-1" />
                <button onClick={() => delKat(i)} className="text-white/40 px-1 text-lg leading-none">✕</button>
              </div>
              <div className="flex gap-2 mt-1">
                <select value={l.gewerk} onChange={(e) => updKat(i, 'gewerk', e.target.value)} className="flex-1 bg-white/5 rounded-lg px-2 py-1 text-sm">
                  {s.gewerke.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={l.einheit} onChange={(e) => updKat(i, 'einheit', e.target.value)} className="w-24 bg-white/5 rounded-lg px-2 py-1 text-sm">
                  {EINHEITEN.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          <button onClick={addKat} className="text-sm text-amber">+ Leistung hinzufügen</button>
          <button onClick={ladeDin} className="text-sm text-amber">⬇ DIN-Standardkatalog ergänzen</button>
        </div>
      </div>

      <div className="glass rounded-3xl p-4 mt-3">
        <div className="text-white/60 font-semibold mb-1">Maschinen-Stundensätze</div>
        <div className="text-white/35 text-xs mb-3">Für Verschleiß/Instandhaltung. Erscheinen bei 🔧 Maschine zur Auswahl und fließen in die Selbstkosten/EP.</div>
        {(s.maschinen || []).map((m, i) => (
          <div key={i} className="flex gap-2 mb-2 items-center">
            <input value={m.name} onChange={(e) => updMasch(i, 'name', e.target.value)} placeholder="Maschine / Werkzeug" className={inp} />
            <input value={m.satz} onChange={(e) => updMasch(i, 'satz', e.target.value)} inputMode="decimal" placeholder="€/h" className="w-20 text-right bg-white/5 border border-white/10 rounded-xl px-2 py-2 outline-none focus:border-amber" />
            <button onClick={() => delMasch(i)} className="text-white/40 px-1 text-lg leading-none">✕</button>
          </div>
        ))}
        <button onClick={addMasch} className="text-sm text-amber">+ Maschine hinzufügen</button>
      </div>

      <div className="glass rounded-3xl p-4 mt-3">
        <div className="text-white/60 font-semibold mb-1">KI-Texte</div>
        <div className="text-white/35 text-xs">„✨ Nach DIN", KI-Setup & KI-Abschluss laufen jetzt <b>serverseitig sicher</b> — kein Key mehr nötig auf dem Gerät.</div>
      </div>

      <button onClick={save} className="w-full mt-4 rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink">
        {msg ? 'Gespeichert ✓' : 'Speichern'}
      </button>
    </div>
  )
}
