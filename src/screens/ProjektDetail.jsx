import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProjekt, listEintraege, addEintrag, deleteEintrag } from '../lib/db'
import { loadSettings } from '../lib/settings'
import { projektTotals } from '../lib/calc'
import { euro, hrs, dmyhm, clock } from '../lib/format'

const TIMERKEY = (id) => 'baulog.timer.' + id

function EntryRow({ e, rate, onDelete }) {
  const icon = { zeit: '⏱️', material: '💶', foto: '📸', tagebuch: '📓' }[e.type]
  let main = '', sub = ''
  if (e.type === 'zeit') { main = hrs(e.minutes) + ' · ' + (e.gewerk || '') ; sub = euro((e.minutes / 60) * (rate || 0)) + ' Lohn' }
  else if (e.type === 'material') { main = e.label + ' (' + e.qty + '×)'; sub = euro((e.qty || 0) * (e.unitCost || 0)) }
  else if (e.type === 'foto') { main = e.note || 'Foto'; sub = e.gewerk || '' }
  else if (e.type === 'tagebuch') { main = (e.text || '').slice(0, 70); sub = e.gewerk || '' }
  return (
    <div className="glass rounded-2xl p-3 flex items-center gap-3">
      {e.type === 'foto' && e.dataUrl ? <img src={e.dataUrl} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="text-xl w-8 text-center">{icon}</div>}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{main}</div>
        <div className="text-white/40 text-xs truncate">{dmyhm(e.createdAt)}{sub ? ' · ' + sub : ''}</div>
      </div>
      <button onClick={onDelete} className="text-white/30 px-1">✕</button>
    </div>
  )
}

function AddSheet({ type, gewerke, defaultGewerk, onClose, onSave }) {
  const [gewerk, setGewerk] = useState(defaultGewerk)
  const [minutes, setMinutes] = useState('')
  const [label, setLabel] = useState(''); const [qty, setQty] = useState('1'); const [unitCost, setUnitCost] = useState('')
  const [note, setNote] = useState(''); const [dataUrl, setDataUrl] = useState('')
  const [text, setText] = useState('')

  function onPhoto(e) { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setDataUrl(r.result); r.readAsDataURL(f) }
  function save() {
    if (type === 'zeit') { if (!minutes) return; onSave({ type: 'zeit', gewerk, minutes: Number(minutes) || 0, note: 'manuell' }) }
    else if (type === 'material') { if (!label.trim()) return; onSave({ type: 'material', gewerk, label: label.trim(), qty: Number(qty) || 1, unitCost: Number(unitCost) || 0 }) }
    else if (type === 'foto') { if (!dataUrl) return; onSave({ type: 'foto', gewerk, dataUrl, note: note.trim() }) }
    else if (type === 'tagebuch') { if (!text.trim()) return; onSave({ type: 'tagebuch', gewerk, text: text.trim() }) }
  }
  const title = { zeit: 'Zeit erfassen', material: 'Material / Kosten', foto: 'Foto', tagebuch: 'Tagebuch-Eintrag' }[type]
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end z-20" onClick={onClose}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold">{title}</div>
        <select value={gewerk} onChange={(e) => setGewerk(e.target.value)} className={inp}>
          {gewerke.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {type === 'zeit' && <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" placeholder="Minuten (z.B. 90)" className={inp} />}
        {type === 'material' && (
          <>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Material / Bezeichnung" className={inp} />
            <div className="grid grid-cols-2 gap-2">
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="Menge" className={inp} />
              <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="EK €/Stk" className={inp} />
            </div>
          </>
        )}
        {type === 'foto' && (
          <>
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="text-sm" />
            {dataUrl && <img src={dataUrl} alt="" className="w-full h-40 object-cover rounded-xl" />}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Beschreibung (optional)" className={inp} />
          </>
        )}
        {type === 'tagebuch' && <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Was wurde heute gemacht? Wetter, Crew, Besonderheiten…" rows={4} className={inp} />}
        <button onClick={save} className="w-full rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink">Speichern</button>
      </div>
    </div>
  )
}

export default function ProjektDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const s = loadSettings()
  const [projekt, setProjekt] = useState(null)
  const [eintraege, setEintraege] = useState([])
  const [timer, setTimer] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [sheet, setSheet] = useState(null)
  const [gewerk, setGewerk] = useState(s.gewerke[0])

  const load = async () => { setProjekt(await getProjekt(id)); setEintraege(await listEintraege(id)) }
  useEffect(() => { load(); const t = localStorage.getItem(TIMERKEY(id)); if (t) setTimer(JSON.parse(t)) }, [id])
  useEffect(() => { if (!timer) return; const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv) }, [timer])

  if (!projekt) return <div className="p-10 text-white/40">Lade…</div>
  const t = projektTotals(eintraege, projekt.hourlyRate)

  function startTimer() { const tm = { gewerk, startTs: Date.now() }; localStorage.setItem(TIMERKEY(id), JSON.stringify(tm)); setTimer(tm); setNow(Date.now()) }
  async function stopTimer() {
    const mins = Math.max(1, Math.round((Date.now() - timer.startTs) / 60000))
    await addEintrag({ projektId: Number(id), type: 'zeit', gewerk: timer.gewerk, minutes: mins, note: 'Timer' })
    localStorage.removeItem(TIMERKEY(id)); setTimer(null); await load()
  }
  async function remove(eid) { await deleteEintrag(eid); await load() }

  return (
    <div className="min-h-[100dvh] flex flex-col max-w-md mx-auto pb-28">
      <header className="px-5 pt-8 pb-3 flex items-center gap-3">
        <button onClick={() => nav('/')} className="glass w-9 h-9 rounded-full text-lg leading-none">‹</button>
        <div className="min-w-0">
          <div className="font-bold text-lg truncate">{projekt.name}</div>
          <div className="text-white/40 text-xs truncate">{[projekt.customer, projekt.address].filter(Boolean).join(' · ')}</div>
        </div>
      </header>

      <div className="px-5 grid grid-cols-2 gap-2">
        <div className="glass rounded-3xl p-4"><div className="text-white/40 text-xs">Stunden</div><div className="text-2xl font-bold">{hrs(t.minutes)}</div></div>
        <div className="glass rounded-3xl p-4"><div className="text-white/40 text-xs">Selbstkosten</div><div className="text-2xl font-bold grad-text">{euro(t.total)}</div></div>
        <div className="glass rounded-2xl p-3 text-sm"><span className="text-white/40">Lohn </span><b>{euro(t.laborCost)}</b></div>
        <div className="glass rounded-2xl p-3 text-sm"><span className="text-white/40">Material </span><b>{euro(t.materialCost)}</b></div>
      </div>

      <div className="px-5 mt-3">
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-white/50 text-xs">Zeit-Timer</div>
            <select value={timer ? timer.gewerk : gewerk} onChange={(e) => setGewerk(e.target.value)} disabled={!!timer}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm disabled:opacity-60">
              {s.gewerke.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          {timer ? (
            <>
              <div className="text-4xl font-extrabold text-center tabular-nums">{clock(now - timer.startTs)}</div>
              <div className="text-center text-white/40 text-xs mb-3">{timer.gewerk}</div>
              <button onClick={stopTimer} className="w-full rounded-2xl py-4 font-bold bg-ember text-white active:scale-[0.98] transition">⏹ Stopp & speichern</button>
            </>
          ) : (
            <button onClick={startTimer} className="w-full rounded-2xl py-5 font-bold text-xl bg-gradient-to-r from-amber to-ember text-ink shadow-glow active:scale-[0.98] transition">▶ Start</button>
          )}
        </div>
      </div>

      <div className="px-5 mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => setSheet('material')} className="glass rounded-2xl py-3 text-sm">💶<div>Material</div></button>
        <button onClick={() => setSheet('foto')} className="glass rounded-2xl py-3 text-sm">📸<div>Foto</div></button>
        <button onClick={() => setSheet('tagebuch')} className="glass rounded-2xl py-3 text-sm">📓<div>Tagebuch</div></button>
      </div>
      <div className="px-5 mt-2">
        <button onClick={() => setSheet('zeit')} className="text-white/50 text-sm">+ Zeit manuell erfassen</button>
      </div>

      <div className="px-5 mt-4 space-y-2">
        <div className="text-white/50 text-sm">Einträge ({eintraege.length})</div>
        {eintraege.map((e) => <EntryRow key={e.id} e={e} rate={projekt.hourlyRate} onDelete={() => remove(e.id)} />)}
      </div>

      {sheet && (
        <AddSheet type={sheet} gewerke={s.gewerke} defaultGewerk={gewerk} onClose={() => setSheet(null)}
          onSave={async (data) => { await addEintrag({ projektId: Number(id), ...data }); setSheet(null); await load() }} />
      )}
    </div>
  )
}
