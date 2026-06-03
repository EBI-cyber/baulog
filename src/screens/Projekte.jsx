import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Building2, Clock, Wallet, ChevronRight } from 'lucide-react'
import { listProjekte, createProjekt, allEintraege } from '../lib/db'
import { loadSettings } from '../lib/settings'
import { projektTotals } from '../lib/calc'
import { euro, hrs } from '../lib/format'
import { useRole } from '../lib/role'
import IconChip from '../ui/IconChip'

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
      <header className="px-6 md:px-8 pt-10 md:pt-12 pb-5 flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">Projekte</h1>
          <p className="text-white/45 text-sm mt-0.5">{isWorker ? 'Meine Projekte · Zeiterfassung' : 'Bautagebuch · Stunden · Kalkulation'}</p>
        </div>
        {!isWorker && (
          <button onClick={() => setCreating(true)} className="rounded-2xl px-4 md:px-5 py-2.5 font-bold btn-grad active:scale-95 transition inline-flex items-center gap-2">
            <Plus className="w-5 h-5" strokeWidth={2.4} /><span className="hidden sm:inline">Projekt</span>
          </button>
        )}
      </header>

      <main className="px-6 md:px-8">
        {projekte.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center text-white/45 text-sm">
            {isWorker ? 'Noch keine Projekte freigegeben. Dein Chef muss dich einem Projekt zuweisen.' : 'Noch keine Projekte. Leg dein erstes Sanierungsprojekt an.'}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projekte.map((p, i) => {
            const t = totalsFor(p.id, p.hourlyRate)
            return (
              <motion.button key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                onClick={() => nav('/projekt/' + p.id)} className="glass card-hover rounded-3xl p-5 text-left active:scale-[0.99]">
                <div className="flex items-start gap-3">
                  <IconChip icon={Building2} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-lg truncate">{p.name}</div>
                    <div className="text-white/45 text-sm truncate">{[p.customer, p.address].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/25 mt-1" />
                </div>
                <div className="flex gap-5 mt-4 text-sm">
                  <div className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-white/40" /><b>{hrs(t.minutes)}</b></div>
                  {!isWorker && <div className="flex items-center gap-1.5"><Wallet className="w-4 h-4 text-white/40" /><b className="grad-text">{euro(t.total)}</b></div>}
                </div>
              </motion.button>
            )
          })}
        </div>
      </main>

      {creating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={() => setCreating(false)}>
          <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold flex items-center gap-2"><IconChip icon={Building2} size="w-9 h-9" iconClass="w-4 h-4" /> Neues Projekt</div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Projektname (z.B. Bad Müller, Hauptstr. 5)" className={inp} />
            <input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Kunde" className={inp} />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Adresse" className={inp} />
            <label className="flex items-center justify-between text-sm">
              <span className="text-white/60">Stundensatz Selbstkosten (€/h)</span>
              <input value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} inputMode="decimal" className="w-20 text-right bg-white/5 border border-white/10 rounded-xl px-2 py-1 outline-none focus:border-amber" />
            </label>
            <button onClick={create} className="w-full rounded-2xl py-3 font-bold btn-grad">Anlegen</button>
          </div>
        </div>
      )}
    </div>
  )
}
