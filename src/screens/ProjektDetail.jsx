import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProjekt, listEintraege, addEintrag, deleteEintrag } from '../lib/db'
import { loadSettings, leistungenFor, einheitOf } from '../lib/settings'
import { projektTotals } from '../lib/calc'
import { euro, hrs, dmyhm, clock } from '../lib/format'
import CameraCapture from '../components/CameraCapture'
import VoiceInput from '../components/VoiceInput'
import { dinText, parseSetup, parseAbschluss } from '../lib/ai'
import { buildLeistungsnachweis, nachweisFilename } from '../lib/pdf'
import { sharePdf } from '../lib/share'
import { useRole } from '../lib/role'
import { useAuth } from '../lib/auth'
import { listMembers, addMember, setMemberGewerke, removeMember, myGewerke } from '../lib/team'

const TIMERKEY = (id) => 'baulog.timer.' + id

function EntryRow({ e, rate, onDelete, hideCost }) {
  const icon = { zeit: '⏱️', material: '💶', foto: '📸', tagebuch: '📓', menge: '📐', maschine: '🔧' }[e.type] || '•'
  let main = '', sub = ''
  if (e.type === 'zeit') { main = hrs(e.minutes) + (e.leistung ? ' · ' + e.leistung : ' · ' + (e.gewerk || '')); sub = hideCost ? '' : euro((e.minutes / 60) * (rate || 0)) + ' Lohn' }
  else if (e.type === 'menge') { main = (e.leistung || 'Menge') + ': ' + e.menge + ' ' + (e.einheit || ''); sub = e.gewerk || '' }
  else if (e.type === 'material') { main = e.label + ' (' + e.qty + '×)' + (e.leistung ? ' · ' + e.leistung : ''); sub = hideCost ? '' : euro((e.qty || 0) * (e.unitCost || 0)) }
  else if (e.type === 'maschine') { main = (e.maschine || 'Maschine') + ' · ' + hrs(e.minutes) + (e.leistung ? ' · ' + e.leistung : ''); sub = hideCost ? '' : euro((e.minutes / 60) * (e.satz || 0)) }
  else if (e.type === 'foto') { main = e.note || 'Foto'; sub = e.leistung || e.gewerk || '' }
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

function AddSheet({ s, type, defaultGewerk, gewerkeList, onClose, onSave }) {
  const gewerkeOpts = gewerkeList && gewerkeList.length ? gewerkeList : s.gewerke
  const [gewerk, setGewerk] = useState(defaultGewerk)
  const leistungen = leistungenFor(s, gewerk)
  const [leistung, setLeistung] = useState(leistungen[0] ? leistungen[0].name : '')
  const [minutes, setMinutes] = useState('')
  const [menge, setMenge] = useState('')
  const [label, setLabel] = useState(''); const [qty, setQty] = useState('1'); const [unitCost, setUnitCost] = useState('')
  const [note, setNote] = useState(''); const [dataUrl, setDataUrl] = useState('')
  const [text, setText] = useState('')
  const [dinBusy, setDinBusy] = useState(false)
  const [maschine, setMaschine] = useState(s.maschinen && s.maschinen[0] ? s.maschinen[0].name : '')

  function changeGewerk(g) {
    setGewerk(g)
    const l = leistungenFor(s, g)
    setLeistung(l[0] ? l[0].name : '')
  }
  const einheit = einheitOf(s, gewerk, leistung)

  function save() {
    if (type === 'zeit') { if (!minutes) return; onSave({ type: 'zeit', gewerk, leistung, minutes: Number(minutes) || 0 }) }
    else if (type === 'menge') { if (!leistung || !menge) return; onSave({ type: 'menge', gewerk, leistung, einheit, menge: Number(menge) || 0 }) }
    else if (type === 'material') { if (!label.trim()) return; onSave({ type: 'material', gewerk, leistung, label: label.trim(), qty: Number(qty) || 1, unitCost: Number(unitCost) || 0 }) }
    else if (type === 'maschine') { if (!maschine || !minutes) return; const m = (s.maschinen || []).find((x) => x.name === maschine); onSave({ type: 'maschine', gewerk, leistung, maschine, minutes: Number(minutes) || 0, satz: m ? Number(m.satz) || 0 : 0 }) }
    else if (type === 'foto') { if (!dataUrl) return; onSave({ type: 'foto', gewerk, leistung, dataUrl, note: note.trim() }) }
    else if (type === 'tagebuch') { if (!text.trim()) return; onSave({ type: 'tagebuch', gewerk, text: text.trim() }) }
  }
  const title = { zeit: 'Zeit erfassen', menge: 'Menge / Leistung', material: 'Material / Kosten', maschine: 'Maschine / Werkzeug', foto: 'Foto aufnehmen', tagebuch: 'Tagebuch-Eintrag' }[type]
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end z-20" onClick={onClose}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl p-6 space-y-3 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold">{title}</div>
        <select value={gewerk} onChange={(e) => changeGewerk(e.target.value)} className={inp}>
          {gewerkeOpts.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {type !== 'tagebuch' && (
          <select value={leistung} onChange={(e) => setLeistung(e.target.value)} className={inp}>
            <option value="">— allgemein —</option>
            {leistungen.map((l) => <option key={l.name} value={l.name}>{l.name} ({l.einheit})</option>)}
          </select>
        )}

        {type === 'zeit' && <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" placeholder="Minuten (z.B. 90)" className={inp} />}
        {type === 'menge' && (
          <div className="flex gap-2 items-center">
            <input value={menge} onChange={(e) => setMenge(e.target.value)} inputMode="decimal" placeholder="Menge" className={inp} />
            <span className="text-white/60 w-12 text-center">{einheit || '—'}</span>
          </div>
        )}
        {type === 'material' && (
          <>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Material / Bezeichnung" className={inp} />
            <div className="grid grid-cols-2 gap-2">
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="Menge" className={inp} />
              <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="EK €/Stk" className={inp} />
            </div>
          </>
        )}
        {type === 'maschine' && (
          <>
            <select value={maschine} onChange={(e) => setMaschine(e.target.value)} className={inp}>
              {(s.maschinen || []).map((m) => <option key={m.name} value={m.name}>{m.name} ({m.satz} €/h)</option>)}
            </select>
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" placeholder="Minuten (Werkzeug-Einsatz)" className={inp} />
          </>
        )}
        {type === 'foto' && (
          <>
            {dataUrl ? <img src={dataUrl} alt="" className="w-full rounded-xl" /> : <CameraCapture onCapture={setDataUrl} />}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Beschreibung (optional)" className={inp} />
          </>
        )}
        {type === 'tagebuch' && (
          <>
            <div className="flex gap-2">
              <VoiceInput onText={setText} />
              <button type="button" disabled={dinBusy || !text.trim()}
                onClick={async () => { try { setDinBusy(true); const out = await dinText(text); if (out) setText(out) } catch (err) { alert(err.message) } finally { setDinBusy(false) } }}
                className="rounded-xl px-3 py-2 text-sm font-semibold bg-white/10 disabled:opacity-40">
                {dinBusy ? '…' : '✨ Nach DIN'}
              </button>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Diktieren per Mikro oder tippen, dann optional nach DIN formulieren…" rows={5} className={inp} />
          </>
        )}

        <button onClick={save} className="w-full rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink">Speichern</button>
      </div>
    </div>
  )
}

function matchMaschine(s, name) {
  if (!name) return ''
  const list = s.maschinen || []
  const exact = list.find((m) => m.name.toLowerCase() === String(name).toLowerCase())
  if (exact) return exact.name
  const partial = list.find((m) => m.name.toLowerCase().includes(String(name).toLowerCase()) || String(name).toLowerCase().includes(m.name.toLowerCase()))
  return partial ? partial.name : name
}

function AbschlussSheet({ s, ctx, onClose, onSaved }) {
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [p, setP] = useState(null)
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'

  async function auswerten() {
    try {
      setBusy(true)
      const r = await parseAbschluss(transcript, ctx)
      setP({
        menge: r.menge != null ? String(r.menge) : '',
        einheit: r.einheit || ctx.einheit || '',
        materials: (r.materials || []).map((m) => ({ label: m.label || '', qty: String(m.qty ?? 1), unitCost: String(m.unitCost ?? 0) })),
        maschinen: (r.maschinen || []).map((m) => ({ name: matchMaschine(s, m.name), minutes: String(m.minutes ?? ctx.workMinutes ?? 0) })),
        beschreibung: r.beschreibung || '',
      })
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  const setMat = (i, k, v) => setP((x) => ({ ...x, materials: x.materials.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)) }))
  const setMas = (i, k, v) => setP((x) => ({ ...x, maschinen: x.maschinen.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)) }))

  async function save() {
    const entries = []
    if (p.menge) entries.push({ type: 'menge', gewerk: ctx.gewerk, leistung: ctx.leistung, einheit: p.einheit, menge: Number(p.menge) || 0 })
    for (const m of p.materials) if (m.label.trim()) entries.push({ type: 'material', gewerk: ctx.gewerk, leistung: ctx.leistung, label: m.label.trim(), qty: Number(m.qty) || 1, unitCost: Number(m.unitCost) || 0 })
    for (const mm of p.maschinen) if (mm.name) { const mr = (s.maschinen || []).find((x) => x.name === mm.name); entries.push({ type: 'maschine', gewerk: ctx.gewerk, leistung: ctx.leistung, maschine: mm.name, minutes: Number(mm.minutes) || 0, satz: mr ? Number(mr.satz) || 0 : 0 }) }
    if (p.beschreibung && p.beschreibung.trim()) entries.push({ type: 'tagebuch', gewerk: ctx.gewerk, text: p.beschreibung.trim() })
    await onSaved(entries)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end z-30" onClick={onClose}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl p-6 space-y-3 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold">Abschluss: {ctx.leistung || ctx.gewerk}</div>
        <div className="text-white/50 text-sm">Sprich frei: <b>Wie viel {ctx.einheit ? '(' + ctx.einheit + ')' : ''}? Was verbraucht? Welches Werkzeug?</b></div>
        <div className="flex gap-2">
          <VoiceInput onText={setTranscript} />
          <button type="button" disabled={busy || !transcript.trim()} onClick={auswerten} className="rounded-xl px-3 py-2 text-sm font-semibold bg-gradient-to-r from-amber to-ember text-ink disabled:opacity-40">{busy ? '…' : '✨ Auswerten'}</button>
        </div>
        <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3} placeholder="z.B. 12 Quadratmeter verlegt, 5 Sack Kleber, Fliesenschneider benutzt" className={inp} />

        {p && (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex gap-2 items-center">
              <span className="text-white/50 text-sm w-16">Menge</span>
              <input value={p.menge} onChange={(e) => setP({ ...p, menge: e.target.value })} inputMode="decimal" className={inp} />
              <span className="text-white/60 w-10 text-center">{p.einheit}</span>
            </div>
            <div>
              <div className="text-white/50 text-sm mb-1">Material (EK €)</div>
              {p.materials.map((m, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input value={m.label} onChange={(e) => setMat(i, 'label', e.target.value)} placeholder="Material" className="flex-1 bg-white/5 rounded-lg px-2 py-1 text-sm" />
                  <input value={m.qty} onChange={(e) => setMat(i, 'qty', e.target.value)} inputMode="decimal" className="w-12 text-center bg-white/5 rounded-lg px-1 py-1 text-sm" />
                  <input value={m.unitCost} onChange={(e) => setMat(i, 'unitCost', e.target.value)} inputMode="decimal" placeholder="€" className="w-16 text-right bg-white/5 rounded-lg px-1 py-1 text-sm" />
                </div>
              ))}
              {p.materials.length === 0 && <div className="text-white/30 text-xs">– kein Material erkannt –</div>}
            </div>
            <div>
              <div className="text-white/50 text-sm mb-1">Maschinen (Min)</div>
              {p.maschinen.map((m, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <select value={m.name} onChange={(e) => setMas(i, 'name', e.target.value)} className="flex-1 bg-white/5 rounded-lg px-2 py-1 text-sm">
                    <option value="">—</option>
                    {(s.maschinen || []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                  </select>
                  <input value={m.minutes} onChange={(e) => setMas(i, 'minutes', e.target.value)} inputMode="numeric" className="w-16 text-center bg-white/5 rounded-lg px-1 py-1 text-sm" />
                </div>
              ))}
              {p.maschinen.length === 0 && <div className="text-white/30 text-xs">– kein Werkzeug erkannt –</div>}
            </div>
            <button onClick={save} className="w-full rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink">Übernehmen & Kalkulation fertig</button>
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-2xl py-2 text-white/50 text-sm">Überspringen</button>
      </div>
    </div>
  )
}

function TeamSheet({ projektToken, gewerke, onClose }) {
  const [members, setMembers] = useState(null)
  const [email, setEmail] = useState('')
  const [pickGewerke, setPickGewerke] = useState([])
  const [busy, setBusy] = useState(false)
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'
  const reload = async () => { try { setMembers(await listMembers(projektToken)) } catch { setMembers([]) } }
  useEffect(() => { reload() }, [projektToken])
  const toggle = (list, g) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g])

  async function add() {
    const e = email.trim().toLowerCase()
    if (!e || !e.includes('@')) { alert('Bitte gültige E-Mail eingeben.'); return }
    try { setBusy(true); await addMember(projektToken, e, pickGewerke); setEmail(''); setPickGewerke([]); await reload() }
    catch (err) { alert(err.message) } finally { setBusy(false) }
  }
  async function saveGewerke(m, g) {
    try { await setMemberGewerke(projektToken, m.email, g); setMembers((ms) => ms.map((x) => (x.email === m.email ? { ...x, gewerke: g } : x))) }
    catch (err) { alert(err.message) }
  }
  async function del(e) { try { await removeMember(projektToken, e); await reload() } catch (err) { alert(err.message) } }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end z-30" onClick={onClose}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl p-6 space-y-3 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold">👷 Team für dieses Projekt</div>
        <div className="text-white/45 text-sm">Mitarbeiter sehen <b>keine Kosten</b> und nur ihre zugewiesenen Gewerke. Sie müssen sich mit derselben E-Mail in BauLog registrieren.</div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="mitarbeiter@mail.de" className={inp} />
          <div className="text-white/50 text-xs">Gewerke (leer = alle erlaubt):</div>
          <div className="flex flex-wrap gap-1.5">
            {gewerke.map((g) => (
              <button key={g} type="button" onClick={() => setPickGewerke((l) => toggle(l, g))}
                className={'px-2.5 py-1 rounded-full text-xs border ' + (pickGewerke.includes(g) ? 'bg-amber text-ink border-amber font-semibold' : 'border-white/15 text-white/60')}>{g}</button>
            ))}
          </div>
          <button onClick={add} disabled={busy} className="w-full rounded-xl py-2 font-semibold bg-gradient-to-r from-amber to-ember text-ink disabled:opacity-40">{busy ? '…' : '+ Mitarbeiter zuweisen'}</button>
        </div>

        <div className="space-y-2 pt-1">
          {members === null && <div className="text-white/35 text-sm">Lade…</div>}
          {members && members.length === 0 && <div className="text-white/35 text-sm">Noch keine Mitarbeiter zugewiesen.</div>}
          {members && members.map((m) => (
            <div key={m.email} className="glass rounded-2xl p-3">
              <div className="flex items-center gap-3">
                <div className="text-xl">🧑‍🔧</div>
                <div className="flex-1 min-w-0 truncate text-sm">{m.email}</div>
                <button onClick={() => del(m.email)} className="text-white/30 px-1">✕</button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {gewerke.map((g) => (
                  <button key={g} type="button" onClick={() => saveGewerke(m, toggle(m.gewerke, g))}
                    className={'px-2.5 py-1 rounded-full text-xs border ' + (m.gewerke.includes(g) ? 'bg-amber/80 text-ink border-amber font-semibold' : 'border-white/15 text-white/45')}>{g}</button>
                ))}
              </div>
              {m.gewerke.length === 0 && <div className="text-white/30 text-[11px] mt-1">Alle Gewerke erlaubt</div>}
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full rounded-2xl py-2 text-white/50 text-sm">Schließen</button>
      </div>
    </div>
  )
}

export default function ProjektDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const s = loadSettings()
  const isWorker = useRole() === 'worker'
  const { user } = useAuth()
  const [team, setTeam] = useState(false)
  const [allowedGewerke, setAllowedGewerke] = useState([])
  const [projekt, setProjekt] = useState(null)
  const [eintraege, setEintraege] = useState([])
  const [timer, setTimer] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [sheet, setSheet] = useState(null)
  const [gewerk, setGewerk] = useState(s.gewerke[0])
  const [leistung, setLeistung] = useState('')
  const [setupText, setSetupText] = useState('')
  const [setupBusy, setSetupBusy] = useState(false)
  const [abschluss, setAbschluss] = useState(null)
  const [nachweis, setNachweis] = useState(false)
  const [mitKosten, setMitKosten] = useState(true)

  const load = async () => { setProjekt(await getProjekt(id)); setEintraege(await listEintraege(id)) }
  useEffect(() => { load(); const t = localStorage.getItem(TIMERKEY(id)); if (t) setTimer(JSON.parse(t)) }, [id])
  useEffect(() => { if (!timer || timer.pauseStartTs) return; const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv) }, [timer])
  // Mitarbeiter: nur zugewiesene Gewerke laden
  useEffect(() => {
    if (!isWorker || !projekt || !user) return
    let active = true
    ;(async () => {
      try {
        const g = await myGewerke(projekt.token, user.email)
        if (active && g.length) { setAllowedGewerke(g); setGewerk((cur) => (g.includes(cur) ? cur : g[0])) }
      } catch {}
    })()
    return () => { active = false }
  }, [isWorker, projekt, user])

  if (!projekt) return <div className="p-10 text-white/40">Lade…</div>
  const t = projektTotals(eintraege, projekt.hourlyRate)
  const gewerkeList = isWorker && allowedGewerke.length ? allowedGewerke : s.gewerke
  const paused = Boolean(timer && timer.pauseStartTs)
  const workedMs = timer ? Math.max(0, now - timer.startTs - (timer.pausedMs || 0) - (timer.pauseStartTs ? now - timer.pauseStartTs : 0)) : 0

  function startTimer() {
    const tm = { gewerk, leistung, startTs: Date.now(), pausedMs: 0, pauseStartTs: null }
    localStorage.setItem(TIMERKEY(id), JSON.stringify(tm)); setTimer(tm); setNow(Date.now())
  }
  function pauseResume() {
    setTimer((tm) => {
      if (!tm) return tm
      const next = tm.pauseStartTs
        ? { ...tm, pausedMs: (tm.pausedMs || 0) + (Date.now() - tm.pauseStartTs), pauseStartTs: null }
        : { ...tm, pauseStartTs: Date.now() }
      localStorage.setItem(TIMERKEY(id), JSON.stringify(next))
      return next
    })
    setNow(Date.now())
  }
  async function stopTimer() {
    const ms = Math.max(0, Date.now() - timer.startTs - (timer.pausedMs || 0) - (timer.pauseStartTs ? Date.now() - timer.pauseStartTs : 0))
    const mins = Math.max(1, Math.round(ms / 60000))
    await addEintrag({ projektId: Number(id), type: 'zeit', gewerk: timer.gewerk, leistung: timer.leistung || '', minutes: mins })
    const ctx = { gewerk: timer.gewerk, leistung: timer.leistung || '', einheit: einheitOf(s, timer.gewerk, timer.leistung || ''), maschinen: s.maschinen, workMinutes: mins }
    localStorage.removeItem(TIMERKEY(id)); setTimer(null); await load()
    if (!isWorker) setAbschluss(ctx)
  }
  async function kiSetup() {
    if (!setupText.trim()) return
    try {
      setSetupBusy(true)
      const r = await parseSetup(setupText, gewerkeList, s.leistungskatalog)
      if (r.gewerk && gewerkeList.includes(r.gewerk)) setGewerk(r.gewerk)
      if (r.leistung) setLeistung(r.leistung)
    } catch (e) { alert(e.message) } finally { setSetupBusy(false) }
  }
  async function remove(eid) { await deleteEintrag(eid); await load() }
  const leistungenG = leistungenFor(s, gewerk)

  return (
    <div className="min-h-[100dvh] flex flex-col max-w-md mx-auto pb-28">
      <header className="px-5 pt-8 pb-3 flex items-center gap-3">
        <button onClick={() => nav('/')} className="glass w-9 h-9 rounded-full text-lg leading-none">‹</button>
        <div className="min-w-0">
          <div className="font-bold text-lg truncate">{projekt.name}</div>
          <div className="text-white/40 text-xs truncate">{[projekt.customer, projekt.address].filter(Boolean).join(' · ')}</div>
        </div>
        {!isWorker && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setTeam(true)} className="glass w-9 h-9 rounded-full text-base leading-none" title="Team">👷</button>
            <button onClick={() => setNachweis(true)} className="glass w-9 h-9 rounded-full text-base leading-none" title="Leistungsnachweis">🧾</button>
          </div>
        )}
      </header>

      {isWorker ? (
        <div className="px-5">
          <div className="glass rounded-3xl p-4"><div className="text-white/40 text-xs">Erfasste Stunden</div><div className="text-2xl font-bold">{hrs(t.minutes)}</div></div>
        </div>
      ) : (
        <>
          <div className="px-5 grid grid-cols-2 gap-2">
            <div className="glass rounded-3xl p-4"><div className="text-white/40 text-xs">Stunden</div><div className="text-2xl font-bold">{hrs(t.minutes)}</div></div>
            <div className="glass rounded-3xl p-4"><div className="text-white/40 text-xs">Selbstkosten</div><div className="text-2xl font-bold grad-text">{euro(t.total)}</div></div>
          </div>
          <div className="px-5 mt-2 grid grid-cols-3 gap-2">
            <div className="glass rounded-2xl p-3"><div className="text-white/40 text-xs">Lohn</div><div className="font-bold text-sm">{euro(t.laborCost)}</div></div>
            <div className="glass rounded-2xl p-3"><div className="text-white/40 text-xs">Material</div><div className="font-bold text-sm">{euro(t.materialCost)}</div></div>
            <div className="glass rounded-2xl p-3"><div className="text-white/40 text-xs">Maschine</div><div className="font-bold text-sm">{euro(t.maschineCost)}</div></div>
          </div>
        </>
      )}

      <div className="px-5 mt-3">
        <div className="glass rounded-3xl p-5">
          <div className="text-white/50 text-xs mb-2">Zeit-Timer</div>
          {timer ? (
            <>
              <div className={'text-4xl font-extrabold text-center tabular-nums ' + (paused ? 'text-white/40' : '')}>{clock(workedMs)}</div>
              <div className="text-center text-white/40 text-xs mb-3">{timer.gewerk}{timer.leistung ? ' · ' + timer.leistung : ''}{paused ? ' · ⏸ Pause läuft' : ''}</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={pauseResume} className={'rounded-2xl py-4 font-bold active:scale-[0.98] transition ' + (paused ? 'bg-gradient-to-r from-amber to-ember text-ink' : 'bg-white/10 text-white')}>{paused ? '▶ Weiter' : '⏸ Pause'}</button>
                <button onClick={stopTimer} className="rounded-2xl py-4 font-bold bg-ember text-white active:scale-[0.98] transition">⏹ Stopp</button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 p-2 rounded-xl bg-white/5 border border-white/10">
                <div className="flex gap-2 items-center">
                  <VoiceInput onText={setSetupText} />
                  <button type="button" disabled={setupBusy || !setupText.trim()} onClick={kiSetup} className="rounded-xl px-3 py-2 text-sm font-semibold bg-white/10 disabled:opacity-40">{setupBusy ? '…' : '✨ KI-Setup'}</button>
                  <span className="text-white/40 text-xs flex-1 leading-tight">kurz sagen, was du machst</span>
                </div>
                {setupText && <div className="text-white/50 text-xs mt-1 truncate">„{setupText}"</div>}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select value={gewerk} onChange={(e) => { setGewerk(e.target.value); setLeistung('') }} className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
                  {gewerkeList.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={leistung} onChange={(e) => setLeistung(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm">
                  <option value="">— allgemein —</option>
                  {leistungenG.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                </select>
              </div>
              <button onClick={startTimer} className="w-full rounded-2xl py-5 font-bold text-xl bg-gradient-to-r from-amber to-ember text-ink shadow-glow active:scale-[0.98] transition">▶ Start</button>
            </>
          )}
        </div>
      </div>

      <div className="px-5 mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => setSheet('menge')} className="glass rounded-2xl py-3 text-sm">📐<div>Menge/Leistung</div></button>
        {!isWorker && <button onClick={() => setSheet('maschine')} className="glass rounded-2xl py-3 text-sm">🔧<div>Maschine</div></button>}
        {!isWorker && <button onClick={() => setSheet('material')} className="glass rounded-2xl py-3 text-sm">💶<div>Material</div></button>}
        <button onClick={() => setSheet('foto')} className="glass rounded-2xl py-3 text-sm">📸<div>Foto</div></button>
        <button onClick={() => setSheet('tagebuch')} className="glass rounded-2xl py-3 text-sm col-span-2">📓<div>Tagebuch</div></button>
      </div>
      <div className="px-5 mt-2">
        <button onClick={() => setSheet('zeit')} className="text-white/50 text-sm">+ Zeit manuell erfassen</button>
      </div>

      <div className="px-5 mt-4 space-y-2">
        <div className="text-white/50 text-sm">Einträge ({eintraege.length})</div>
        {eintraege.map((e) => <EntryRow key={e.id} e={e} rate={projekt.hourlyRate} hideCost={isWorker} onDelete={() => remove(e.id)} />)}
      </div>

      {sheet && (
        <AddSheet s={s} type={sheet} defaultGewerk={gewerk} gewerkeList={gewerkeList} onClose={() => setSheet(null)}
          onSave={async (data) => { await addEintrag({ projektId: Number(id), ...data }); setSheet(null); await load() }} />
      )}

      {abschluss && (
        <AbschlussSheet s={s} ctx={abschluss} onClose={() => setAbschluss(null)}
          onSaved={async (entries) => { for (const e of entries) await addEintrag({ projektId: Number(id), ...e }); setAbschluss(null); await load() }} />
      )}

      {team && <TeamSheet projektToken={projekt.token} gewerke={s.gewerke} onClose={() => setTeam(false)} />}

      {nachweis && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-30" onClick={() => setNachweis(false)}>
          <div className="glass w-full max-w-md mx-auto rounded-t-4xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold">Leistungsnachweis erstellen</div>
            <label className="flex items-center justify-between py-2">
              <span className="text-white/70">Mit Selbstkosten (intern)</span>
              <input type="checkbox" checked={mitKosten} onChange={(e) => setMitKosten(e.target.checked)} className="w-5 h-5 accent-[#f59e0b]" />
            </label>
            <div className="text-white/40 text-xs">Aus = ohne Kosten (für den Kunden). Enthält Leistungen, Mengen, Stunden, Bautagebuch & Fotos.</div>
            <button onClick={async () => { const doc = buildLeistungsnachweis(projekt, eintraege, s, { mitKosten }); await sharePdf(doc, nachweisFilename(projekt)); setNachweis(false) }}
              className="w-full rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink">PDF erzeugen & teilen</button>
          </div>
        </div>
      )}
    </div>
  )
}
