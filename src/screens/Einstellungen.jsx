import { useState } from 'react'
import { Building2, BadgeEuro, Layers, ListChecks, Wrench, Sparkles, Cloud, RefreshCw, LogOut, Plus, Download, X, Save } from 'lucide-react'
import { loadSettings, saveSettings, EINHEITEN, mergeDinKatalog } from '../lib/settings'
import { useAuth } from '../lib/auth'
import { syncAll } from '../lib/cloud'
import { useRole } from '../lib/role'
import IconChip from '../ui/IconChip'

function Section({ icon, title, hint, children }) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <IconChip icon={icon} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
        <div>
          <div className="font-semibold">{title}</div>
          {hint && <div className="text-white/35 text-xs">{hint}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

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
  const xBtn = 'text-white/35 hover:text-ember transition p-1'

  const AccountCard = (
    isCloudReady && (
      <div className="glass rounded-3xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <IconChip icon={Cloud} size="w-9 h-9" iconClass="w-[18px] h-[18px]" variant={isWorker ? 'plain' : 'tint'} />
          <div className="min-w-0">
            <div className="font-semibold">{isWorker ? 'Angemeldet' : 'Cloud-Sync aktiv'}</div>
            <div className="text-white/40 text-xs truncate">{user?.email}</div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={async () => { try { await syncAll(); location.reload() } catch { alert('Sync-Fehler') } }} className="text-amber text-sm px-2.5 py-1.5 rounded-xl border border-white/10 inline-flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /><span className="hidden sm:inline">Sync</span></button>
          <button onClick={signOut} className="text-white/60 text-sm px-2.5 py-1.5 rounded-xl border border-white/10 inline-flex items-center gap-1.5"><LogOut className="w-4 h-4" /><span className="hidden sm:inline">Abmelden</span></button>
        </div>
      </div>
    )
  )

  if (isWorker) {
    return (
      <div className="px-6 md:px-8 pt-10 md:pt-12 pb-6 max-w-2xl">
        <h2 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight mb-5">Einstellungen</h2>
        <div className="space-y-3">
          {AccountCard}
          <div className="glass rounded-3xl p-5 text-white/45 text-sm">
            Mitarbeiter-Ansicht: Du erfasst nur deine Zeiten in den freigegebenen Projekten. Kalkulation &amp; Firmendaten verwaltet dein Chef.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 md:px-8 pt-10 md:pt-12 pb-6 max-w-2xl">
      <h2 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight mb-5">Einstellungen</h2>

      <div className="space-y-3">
        {AccountCard}

        <Section icon={Building2} title="Firmendaten" hint="für den Leistungsnachweis">
          <input value={s.company} onChange={(e) => upd('company', e.target.value)} placeholder="Firmenname" className={inp + ' mb-2'} />
          <input value={s.owner} onChange={(e) => upd('owner', e.target.value)} placeholder="Inhaber" className={inp + ' mb-2'} />
          <input value={s.street} onChange={(e) => upd('street', e.target.value)} placeholder="Straße & Nr." className={inp + ' mb-2'} />
          <div className="grid grid-cols-3 gap-2 mb-2">
            <input value={s.zip} onChange={(e) => upd('zip', e.target.value)} placeholder="PLZ" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber" />
            <input value={s.city} onChange={(e) => upd('city', e.target.value)} placeholder="Ort" className="col-span-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber" />
          </div>
          <input value={s.taxId} onChange={(e) => upd('taxId', e.target.value)} placeholder="Steuernummer" className={inp} />
        </Section>

        <Section icon={BadgeEuro} title="Standard-Stundensatz" hint="Selbstkosten €/h · Basis für Lohnkosten">
          <input value={s.defaultRate} onChange={(e) => upd('defaultRate', e.target.value)} inputMode="decimal" className={inp} />
        </Section>

        <Section icon={Layers} title="Gewerke">
          {s.gewerke.map((g, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={g} onChange={(e) => setGewerk(i, e.target.value)} className={inp} />
              <button onClick={() => delGewerk(i)} className={xBtn}><X className="w-5 h-5" /></button>
            </div>
          ))}
          <button onClick={addGewerk} className="text-sm text-amber inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Gewerk hinzufügen</button>
        </Section>

        <Section icon={ListChecks} title="Leistungskatalog" hint="mit Einheiten · Basis für die EP-Kalkulation">
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {s.leistungskatalog.map((l, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-2">
                <div className="flex gap-2 items-center">
                  <input value={l.name} onChange={(e) => updKat(i, 'name', e.target.value)} placeholder="Leistung" className="flex-1 bg-transparent outline-none px-1 py-1" />
                  <button onClick={() => delKat(i)} className={xBtn}><X className="w-5 h-5" /></button>
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
          <div className="flex flex-wrap gap-4 mt-3">
            <button onClick={addKat} className="text-sm text-amber inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Leistung hinzufügen</button>
            <button onClick={ladeDin} className="text-sm text-amber inline-flex items-center gap-1"><Download className="w-4 h-4" /> DIN-Standardkatalog ergänzen</button>
          </div>
        </Section>

        <Section icon={Wrench} title="Maschinen-Stundensätze" hint="fließen in Selbstkosten / EP ein">
          {(s.maschinen || []).map((m, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <input value={m.name} onChange={(e) => updMasch(i, 'name', e.target.value)} placeholder="Maschine / Werkzeug" className={inp} />
              <input value={m.satz} onChange={(e) => updMasch(i, 'satz', e.target.value)} inputMode="decimal" placeholder="€/h" className="w-20 text-right bg-white/5 border border-white/10 rounded-xl px-2 py-2 outline-none focus:border-amber" />
              <button onClick={() => delMasch(i)} className={xBtn}><X className="w-5 h-5" /></button>
            </div>
          ))}
          <button onClick={addMasch} className="text-sm text-amber inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Maschine hinzufügen</button>
        </Section>

        <Section icon={Sparkles} title="KI-Texte">
          <div className="text-white/45 text-sm">„Nach DIN", KI-Setup &amp; KI-Abschluss laufen <b>serverseitig sicher</b> — kein Key mehr nötig auf dem Gerät.</div>
        </Section>

        <button onClick={save} className="w-full mt-2 rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2">
          <Save className="w-5 h-5" strokeWidth={2} />{msg ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
