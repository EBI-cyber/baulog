import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { listProjekte, createProjekt, allEintraege } from '../lib/db'
import { loadSettings } from '../lib/settings'
import { projektTotals } from '../lib/calc'
import { euro, hrs } from '../lib/format'
import { useRole } from '../lib/role'

export default function Projekte() {
  const nav = useNavigate()
  const role = useRole()
  const isWorker = role === 'worker'
  const s = loadSettings()
  const [projekte, setProjekte] = useState([])
  const [eintraege, setEintraege] = useState([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', customer: '', address: '', hourlyRate: s.defaultRate })

  const load = async () => { setProjekte(await listProjekte()); setEintraege(await allEintraege()) }
  useEffect(() => { load() }, [])

  async function create() {
    if (!form.name.trim()) return
    const id = await createProjekt({ ...form, hourlyRate: Number(form.hourlyRate) || s.defaultRate })
    setCreating(false)
    setForm({ name: '', customer: '', address: '', hourlyRate: s.defaultRate })
    nav('/projekt/' + id)
  }
  const totalsFor = (pid, rate) => projektTotals(eintraege.filter((e) => e.projektId === pid), rate)
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'

  return (
    <div>
      <header className="px-6 pt-10 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold grad-text">BauLog</h1>
          <p className="text-white/45 text-sm">{isWorker ? 'Meine Projekte · Zeiterfassung' : 'Bautagebuch · Stunden · Kosten'}</p>
        </div>
        {!isWorker && <button onClick={() => setCreating(true)} className="rounded-2xl px-4 py-2 font-bold bg-gradient-to-r from-amber to-ember text-ink active:scale-95 transition">+ Projekt</button>}
      </header>

      <main className="px-6 space-y-3">
        {projekte.length === 0 && <div className="text-white/40 text-sm">{isWorker ? 'Noch keine Projekte freigegeben. Dein Chef muss dich einem Projekt zuweisen.' : 'Noch keine Projekte. Leg dein erstes Sanierungsprojekt an.'}</div>}
        {projekte.map((p) => {
          const t = totalsFor(p.id, p.hourlyRate)
          return (
            <motion.button key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => nav('/projekt/' + p.id)} className="glass w-full rounded-3xl p-5 text-left active:scale-[0.99] transition">
              <div className="font-bold text-lg">{p.name}</div>
              <div className="text-white/45 text-sm">{[p.customer, p.address].filter(Boolean).join(' · ') || '—'}</div>
              <div className="flex gap-4 mt-3 text-sm">
                <div><span className="text-white/40">Stunden </span><b>{hrs(t.minutes)}</b></div>
                {!isWorker && <div><span className="text-white/40">Selbstkosten </span><b className="grad-text">{euro(t.total)}</b></div>}
              </div>
            </motion.button>
          )
        })}
      </main>

      {creating && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-20" onClick={() => setCreating(false)}>
          <div className="glass w-full max-w-md mx-auto rounded-t-4xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold">Neues Projekt</div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Projektname (z.B. Bad Müller, Hauptstr. 5)" className={inp} />
            <input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Kunde" className={inp} />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Adresse" className={inp} />
            <label className="flex items-center justify-between text-sm">
              <span className="text-white/60">Stundensatz Selbstkosten (€/h)</span>
              <input value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} inputMode="decimal" className="w-20 text-right bg-white/5 border border-white/10 rounded-xl px-2 py-1 outline-none focus:border-amber" />
            </label>
            <button onClick={create} className="w-full rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink">Anlegen</button>
          </div>
        </div>
      )}
    </div>
  )
}
