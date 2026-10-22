import { useEffect, useState } from 'react'
import { Building2, Merge, Trash2, Save } from 'lucide-react'
import IconChip from '../ui/IconChip'
import { updateProjekt, deleteProjekt, listProjekte, projekteZusammenfuehren } from '../lib/db'

// Projekt bearbeiten: Stammdaten, mit anderem Projekt zusammenführen, löschen
export default function ProjektSheet({ projekt, onClose, onSaved, onGone }) {
  const [form, setForm] = useState({ name: projekt.name || '', customer: projekt.customer || '', address: projekt.address || '', hourlyRate: String(projekt.hourlyRate ?? '') })
  const [andere, setAndere] = useState([])
  const [ziel, setZiel] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { listProjekte().then((ps) => setAndere(ps.filter((p) => p.id !== projekt.id && (!p.owner || !projekt.owner || p.owner === projekt.owner)))) }, [projekt.id])
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const speichern = async () => {
    if (!form.name.trim()) { alert('Bitte einen Projektnamen eingeben.'); return }
    const rate = Number(String(form.hourlyRate).replace(',', '.'))
    await updateProjekt(projekt.id, { name: form.name.trim(), customer: form.customer.trim(), address: form.address.trim(), hourlyRate: Number.isFinite(rate) ? rate : projekt.hourlyRate })
    onSaved()
  }

  const zusammenfuehren = async () => {
    const z = andere.find((p) => String(p.id) === String(ziel))
    if (!z) return
    if (!confirm('„' + projekt.name.trim() + '“ in „' + z.name.trim() + '“ zusammenführen?\n\nAlle Einträge und Abschläge wandern in „' + z.name.trim() + '“, Abschläge werden nach Zeitraum neu nummeriert. „' + projekt.name.trim() + '“ verschwindet danach.\n\nDer aktuelle Stand wird vorher automatisch gesichert.')) return
    setBusy(true)
    try { await projekteZusammenfuehren(projekt.id, z.id); onGone(z.id) }
    catch (e) { alert(e && e.message ? e.message : String(e)) }
    setBusy(false)
  }

  const loeschen = async () => {
    if (!confirm('Projekt „' + projekt.name.trim() + '“ mit allen Einträgen löschen?\n\nDer aktuelle Stand wird vorher automatisch gesichert.')) return
    await deleteProjekt(projekt.id); onGone(null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={onClose}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 max-h-[90dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold flex items-center gap-2.5"><IconChip icon={Building2} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> Projekt bearbeiten</div>
        <input value={form.name} onChange={(e) => upd('name', e.target.value)} placeholder="Projektname" className={inp} />
        <input value={form.customer} onChange={(e) => upd('customer', e.target.value)} placeholder="Kunde" className={inp} />
        <input value={form.address} onChange={(e) => upd('address', e.target.value)} placeholder="Adresse der Baustelle" className={inp} />
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-sm shrink-0">Stundensatz €/h</span>
          <input value={form.hourlyRate} onChange={(e) => upd('hourlyRate', e.target.value)} inputMode="decimal" className={inp} />
        </div>
        <button onClick={speichern} className="w-full rounded-2xl py-3 font-bold btn-grad inline-flex items-center justify-center gap-2"><Save className="w-5 h-5" /> Speichern</button>

        {andere.length > 0 && (
          <div className="border-t border-white/10 pt-3 space-y-2">
            <div className="text-white/70 font-semibold text-sm flex items-center gap-2"><Merge className="w-4 h-4" /> Mit anderem Projekt zusammenführen</div>
            <div className="text-white/40 text-xs">Für dieselbe Baustelle in zwei Projekten: Alles aus diesem Projekt wandert in das gewählte.</div>
            <select value={ziel} onChange={(e) => setZiel(e.target.value)} className={inp}>
              <option value="">Zielprojekt wählen …</option>
              {andere.map((p) => <option key={p.id} value={p.id}>{p.name.trim()}{p.customer ? ' · ' + p.customer : ''}</option>)}
            </select>
            <button onClick={zusammenfuehren} disabled={!ziel || busy} className="w-full rounded-2xl py-2.5 font-semibold bg-white/10 disabled:opacity-40">{busy ? 'Führe zusammen …' : 'Zusammenführen'}</button>
          </div>
        )}

        <div className="border-t border-white/10 pt-3">
          <button onClick={loeschen} className="w-full rounded-2xl py-2.5 text-ember text-sm inline-flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Projekt löschen</button>
        </div>
        <button onClick={onClose} className="w-full rounded-2xl py-2 text-white/50 text-sm">Schließen</button>
      </div>
    </div>
  )
}
