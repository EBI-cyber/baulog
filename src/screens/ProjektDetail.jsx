import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getProjekt, listEintraege, addEintrag, deleteEintrag,
  listRechnungen, createRechnung, updateRechnung, deleteRechnung,
} from '../lib/db'
import { loadSettings, leistungenFor, einheitOf } from '../lib/settings'
import { projektTotals, leistungAnalytics, filterByRange } from '../lib/calc'
import { euro, hrs, hms, dmy, dmyhm, hm, clock, dinMaschinenText } from '../lib/format'
import CameraCapture from '../components/CameraCapture'
import VoiceInput from '../components/VoiceInput'
import { dinText, parseSetup, parseAbschluss } from '../lib/ai'
import { buildLeistungsnachweis, nachweisFilename, buildAbrechnungsUebersicht, uebersichtFilename } from '../lib/pdf'
import { sharePdf } from '../lib/share'
import { useRole } from '../lib/role'
import { useAuth } from '../lib/auth'
import { listMembers, addMember, setMemberGewerke, removeMember, myGewerke } from '../lib/team'
import IconChip from '../ui/IconChip'
import {
  ChevronLeft, Users, FileText, Clock, Wallet, BadgeEuro, Package, Wrench, Ruler, Camera, NotebookPen,
  Play, Pause, Square, Sparkles, Plus, UserPlus, HardHat, X, Calculator, Send, Receipt, Check,
} from 'lucide-react'

async function sendInvite(projektName, email) {
  const url = location.origin + import.meta.env.BASE_URL
  const subject = 'Einladung zu BauLog'
  const text =
    'Hi! Ich habe dich in BauLog dem Projekt „' + (projektName || 'Projekt') + '" zugewiesen.\n\n' +
    '1) Öffne ' + url + '\n' +
    '2) Registriere dich mit genau dieser E-Mail: ' + email + '\n' +
    '3) Geh auf Einstellungen → „Sync"\n\n' +
    'Danach siehst du das Projekt und kannst deine Zeiten erfassen.'
  // Sicherheitsnetz: Text in die Zwischenablage (falls kein Mailprogramm reagiert)
  try { await navigator.clipboard.writeText(text) } catch {}
  // E-Mail direkt öffnen — Empfänger, Betreff & Text sind schon ausgefüllt
  window.location.href = 'mailto:' + encodeURIComponent(email) +
    '?subject=' + encodeURIComponent(subject) +
    '&body=' + encodeURIComponent(text)
}

const TIMERKEY = (id) => 'baulog.timer.' + id
const ENTRY_ICON = { zeit: Clock, material: Package, foto: Camera, tagebuch: NotebookPen, menge: Ruler, maschine: Wrench }

// timer.pauses: [{ startTs, endTs }] — endTs null solange pausiert. `pausedMs`/`pauseStartTs` sind Legacy-Fallback
// für einen beim Update noch laufenden Timer aus localStorage.
function pausedMsOf(tm, now) {
  if (tm.pauses) return tm.pauses.reduce((sum, p) => sum + ((p.endTs || now) - p.startTs), 0)
  return (tm.pausedMs || 0) + (tm.pauseStartTs ? now - tm.pauseStartTs : 0)
}
function isPaused(tm) {
  if (tm.pauses) { const last = tm.pauses[tm.pauses.length - 1]; return Boolean(last && !last.endTs) }
  return Boolean(tm.pauseStartTs)
}

// datetime-local-Wert auf "heute"/"gestern" setzen, Uhrzeit-Anteil bleibt erhalten
function quickDay(daysAgo, current) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo)
  const pad = (n) => String(n).padStart(2, '0')
  const timePart = current && current.includes('T') ? current.slice(11) : new Date().toTimeString().slice(0, 5)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + timePart
}

function StatTile({ icon, label, value, grad, big }) {
  return (
    <div className="glass rounded-3xl p-4 flex items-center gap-3 min-w-0">
      <IconChip icon={icon} size={big ? 'w-11 h-11' : 'w-9 h-9'} iconClass={big ? 'w-5 h-5' : 'w-[18px] h-[18px]'} />
      <div className="min-w-0">
        <div className="text-white/40 text-xs truncate">{label}</div>
        <div className={(big ? 'text-2xl' : 'text-base') + ' font-bold truncate ' + (grad ? 'grad-text' : '')}>{value}</div>
      </div>
    </div>
  )
}

function ActionTile({ icon, label, span, onClick }) {
  return (
    <button onClick={onClick} className={'glass card-hover rounded-2xl p-3 flex flex-col items-center gap-2 text-xs font-medium active:scale-[0.98] ' + (span || '')}>
      <IconChip icon={icon} />{label}
    </button>
  )
}

function EntryRow({ e, rate, onDelete, hideCost }) {
  const I = ENTRY_ICON[e.type] || Clock
  let main = '', sub = ''
  if (e.type === 'zeit') {
    const zeitraum = e.startAt && e.endAt ? hm(e.startAt) + '–' + hm(e.endAt) + ' Uhr · ' : ''
    main = zeitraum + hms((Number(e.minutes) || 0) * 60) + (e.leistung ? ' · ' + e.leistung : ' · ' + (e.gewerk || ''))
    sub = hideCost ? '' : euro((e.minutes / 60) * (rate || 0)) + ' Lohn'
  }
  else if (e.type === 'menge') { main = (e.leistung || 'Menge') + ': ' + e.menge + ' ' + (e.einheit || ''); sub = e.gewerk || '' }
  else if (e.type === 'material') { main = e.label + ' (' + e.qty + '×)' + (e.leistung ? ' · ' + e.leistung : ''); sub = hideCost ? '' : euro((e.qty || 0) * (e.unitCost || 0)) }
  else if (e.type === 'maschine') { main = (e.maschine || 'Maschine') + ' · ' + hrs(e.minutes) + (e.leistung ? ' · ' + e.leistung : ''); sub = hideCost ? '' : euro((e.minutes / 60) * (e.satz || 0)) }
  else if (e.type === 'foto') { main = e.note || 'Foto'; sub = e.leistung || e.gewerk || '' }
  else if (e.type === 'tagebuch') { main = (e.text || '').slice(0, 70); sub = e.gewerk || '' }
  return (
    <div className="glass card-hover rounded-2xl p-3 flex items-center gap-3">
      {e.type === 'foto' && e.dataUrl ? <img src={e.dataUrl} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" /> : <IconChip icon={I} size="w-11 h-11" />}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{main}</div>
        <div className="text-white/40 text-xs truncate">{dmyhm(e.createdAt)}{sub ? ' · ' + sub : ''}</div>
      </div>
      <button onClick={onDelete} className="text-white/30 hover:text-ember transition p-1"><X className="w-[18px] h-[18px]" /></button>
    </div>
  )
}

function MaschineCombo({ s, value, onChange, inp, wrapClass = '' }) {
  const [q, setQ] = useState(value || '')
  const [open, setOpen] = useState(false)
  const list = s.maschinen || []
  const needle = q.trim().toLowerCase()
  const filtered = needle ? list.filter((m) => m.name.toLowerCase().includes(needle)) : list

  return (
    <div className={'relative ' + wrapClass}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Maschine suchen oder wählen…"
        className={inp}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full glass rounded-xl max-h-52 overflow-y-auto">
          {filtered.map((m) => (
            <button type="button" key={m.name} onMouseDown={() => { onChange(m.name); setQ(m.name); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-white/10 text-sm flex justify-between items-center gap-2 transition">
              <span className="truncate">{m.name}</span><span className="text-white/40 text-xs shrink-0">{m.satz} €/h</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AddSheet({ s, type, defaultGewerk, gewerkeList, onClose, onSave }) {
  const gewerkeOpts = gewerkeList && gewerkeList.length ? gewerkeList : s.gewerke
  const [gewerk, setGewerk] = useState(defaultGewerk)
  const leistungen = leistungenFor(s, gewerk)
  const [leistung, setLeistung] = useState(leistungen[0] ? leistungen[0].name : '')
  const [minutes, setMinutes] = useState('')
  const [startzeit, setStartzeit] = useState('')
  const [menge, setMenge] = useState('')
  const [label, setLabel] = useState(''); const [qty, setQty] = useState('1'); const [unitCost, setUnitCost] = useState('')
  const [note, setNote] = useState(''); const [dataUrl, setDataUrl] = useState('')
  const [text, setText] = useState('')
  const [dinBusy, setDinBusy] = useState(false)
  const [maschine, setMaschine] = useState(s.maschinen && s.maschinen[0] ? s.maschinen[0].name : '')
  const [dinNote, setDinNote] = useState('')
  const [addDinNote, setAddDinNote] = useState(true)
  const [dinNoteTouched, setDinNoteTouched] = useState(false)

  function changeGewerk(g) {
    setGewerk(g)
    const l = leistungenFor(s, g)
    setLeistung(l[0] ? l[0].name : '')
  }
  const einheit = einheitOf(s, gewerk, leistung)

  useEffect(() => {
    if (type !== 'maschine' || dinNoteTouched) return
    setDinNote(maschine && minutes ? dinMaschinenText(gewerk, leistung, maschine, minutes) : '')
  }, [type, gewerk, leistung, maschine, minutes, dinNoteTouched])

  function save() {
    if (type === 'zeit') {
      if (!minutes) return
      const data = { type: 'zeit', gewerk, leistung, minutes: Number(minutes) || 0 }
      if (startzeit) {
        const start = new Date(startzeit)
        if (!Number.isNaN(start.getTime())) {
          data.startAt = start.toISOString()
          data.endAt = new Date(start.getTime() + (Number(minutes) || 0) * 60000).toISOString()
        }
      }
      onSave(data)
    }
    else if (type === 'menge') { if (!leistung || !menge) return; onSave({ type: 'menge', gewerk, leistung, einheit, menge: Number(menge) || 0 }) }
    else if (type === 'material') { if (!label.trim()) return; onSave({ type: 'material', gewerk, leistung, label: label.trim(), qty: Number(qty) || 1, unitCost: Number(unitCost) || 0 }) }
    else if (type === 'maschine') {
      if (!maschine || !minutes) return
      const m = (s.maschinen || []).find((x) => x.name === maschine)
      const entries = [{ type: 'maschine', gewerk, leistung, maschine, minutes: Number(minutes) || 0, satz: m ? Number(m.satz) || 0 : 0 }]
      if (addDinNote && dinNote.trim()) entries.push({ type: 'tagebuch', gewerk, text: dinNote.trim() })
      onSave(entries)
    }
    else if (type === 'foto') { if (!dataUrl) return; onSave({ type: 'foto', gewerk, leistung, dataUrl, note: note.trim() }) }
    else if (type === 'tagebuch') { if (!text.trim()) return; onSave({ type: 'tagebuch', gewerk, text: text.trim() }) }
  }
  const title = { zeit: 'Zeit erfassen', menge: 'Menge / Leistung', material: 'Material / Kosten', maschine: 'Maschine / Werkzeug', foto: 'Foto aufnehmen', tagebuch: 'Tagebuch-Eintrag' }[type]
  const TitleIcon = { zeit: Clock, menge: Ruler, material: Package, maschine: Wrench, foto: Camera, tagebuch: NotebookPen }[type] || Clock
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-20" onClick={onClose}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 max-h-[90dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold flex items-center gap-2.5"><IconChip icon={TitleIcon} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> {title}</div>
        <select value={gewerk} onChange={(e) => changeGewerk(e.target.value)} className={inp}>
          {gewerkeOpts.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {type !== 'tagebuch' && (
          <select value={leistung} onChange={(e) => setLeistung(e.target.value)} className={inp}>
            <option value="">— allgemein —</option>
            {leistungen.map((l) => <option key={l.name} value={l.name}>{l.name} ({l.einheit})</option>)}
          </select>
        )}

        {type === 'zeit' && (
          <>
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" placeholder="Minuten (z.B. 90)" className={inp} />
            <div>
              <div className="flex gap-1.5 mb-1.5">
                <button type="button" onClick={() => setStartzeit(quickDay(0, startzeit))} className="px-2.5 py-1 rounded-full text-xs border border-white/15 text-white/60 hover:border-white/30">Heute</button>
                <button type="button" onClick={() => setStartzeit(quickDay(1, startzeit))} className="px-2.5 py-1 rounded-full text-xs border border-white/15 text-white/60 hover:border-white/30">Gestern</button>
              </div>
              <input type="datetime-local" value={startzeit} onChange={(e) => setStartzeit(e.target.value)} className={inp} />
              <div className="text-white/35 text-[11px] mt-1">Startzeit (optional) — für genaue Uhrzeiten im Leistungsnachweis, z.B. zum Nachtragen von gestern</div>
            </div>
          </>
        )}
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
            <MaschineCombo s={s} value={maschine} onChange={setMaschine} inp={inp} />
            <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" placeholder="Minuten (Werkzeug-Einsatz)" className={inp} />
            <label className="flex items-center gap-2 pt-1">
              <input type="checkbox" checked={addDinNote} onChange={(e) => setAddDinNote(e.target.checked)} className="w-4 h-4 accent-[#f59e0b]" />
              <span className="text-white/60 text-xs">DIN-Text als Tagebuch-Notiz übernehmen</span>
            </label>
            {addDinNote && (
              <textarea value={dinNote} onChange={(e) => { setDinNote(e.target.value); setDinNoteTouched(true) }} rows={2} className={inp} />
            )}
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
                className="rounded-xl px-3 py-2 text-sm font-semibold bg-white/10 disabled:opacity-40 inline-flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />{dinBusy ? '…' : 'Nach DIN'}
              </button>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Diktieren per Mikro oder tippen, dann optional nach DIN formulieren…" rows={5} className={inp} />
          </>
        )}

        <button onClick={save} className="w-full rounded-2xl py-3 font-bold btn-grad">Speichern</button>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={onClose}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 max-h-[92dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold flex items-center gap-2.5"><IconChip icon={Sparkles} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> Abschluss: {ctx.leistung || ctx.gewerk}</div>
        <div className="text-white/50 text-sm">Sprich frei: <b>Wie viel {ctx.einheit ? '(' + ctx.einheit + ')' : ''}? Was verbraucht? Welches Werkzeug?</b></div>
        <div className="flex gap-2">
          <VoiceInput onText={setTranscript} />
          <button type="button" disabled={busy || !transcript.trim()} onClick={auswerten} className="rounded-xl px-3 py-2 text-sm font-semibold btn-grad disabled:opacity-40 inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" />{busy ? '…' : 'Auswerten'}</button>
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
                  <MaschineCombo s={s} value={m.name} onChange={(v) => setMas(i, 'name', v)}
                    inp="flex-1 bg-white/5 rounded-lg px-2 py-1 text-sm outline-none" wrapClass="flex-1" />
                  <input value={m.minutes} onChange={(e) => setMas(i, 'minutes', e.target.value)} inputMode="numeric" className="w-16 text-center bg-white/5 rounded-lg px-1 py-1 text-sm" />
                </div>
              ))}
              {p.maschinen.length === 0 && <div className="text-white/30 text-xs">– kein Werkzeug erkannt –</div>}
            </div>
            <button onClick={save} className="w-full rounded-2xl py-3 font-bold btn-grad">Übernehmen & Kalkulation fertig</button>
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-2xl py-2 text-white/50 text-sm">Überspringen</button>
      </div>
    </div>
  )
}

function TeamSheet({ projektToken, projektName, gewerke, onClose }) {
  const [members, setMembers] = useState(null)
  const [email, setEmail] = useState('')
  const [pickGewerke, setPickGewerke] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber'
  const reload = async () => { try { setErr(''); setMembers(await listMembers(projektToken)) } catch (e) { setErr(e.message); setMembers([]) } }
  useEffect(() => { reload() }, [projektToken])
  const toggle = (list, g) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g])

  async function add() {
    const e = email.trim().toLowerCase()
    if (!e || !e.includes('@')) { setErr('Bitte gültige E-Mail eingeben.'); return }
    try {
      setBusy(true); setErr(''); setOk('')
      await addMember(projektToken, e, pickGewerke)
      setOk(e + ' zugewiesen ✓ — klick rechts auf ✈, um ihm die Einladung per E-Mail zu schicken (Empfänger & Text sind schon ausgefüllt).')
      setEmail(''); setPickGewerke([]); await reload()
    } catch (er) { setErr(er.message) } finally { setBusy(false) }
  }
  async function saveGewerke(m, g) {
    try { setErr(''); await setMemberGewerke(projektToken, m.email, g); setMembers((ms) => ms.map((x) => (x.email === m.email ? { ...x, gewerke: g } : x))) }
    catch (e2) { setErr(e2.message) }
  }
  async function del(e) { try { setErr(''); await removeMember(projektToken, e); await reload() } catch (e2) { setErr(e2.message) } }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={onClose}>
      <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 max-h-[90dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold flex items-center gap-2.5"><IconChip icon={Users} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> Team für dieses Projekt</div>
        <div className="text-white/45 text-sm">Mitarbeiter sehen <b>keine Kosten</b> und nur ihre zugewiesenen Gewerke. Sie müssen sich mit derselben E-Mail in BauLog registrieren.</div>

        {err && <div className="rounded-xl bg-ember/15 border border-ember/30 text-ember text-sm p-3">{err}</div>}
        {ok && <div className="rounded-xl bg-lime/15 border border-lime/30 text-lime text-sm p-3">{ok}</div>}

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder="mitarbeiter@mail.de" className={inp} />
          <div className="text-white/50 text-xs">Gewerke (leer = alle erlaubt):</div>
          <div className="flex flex-wrap gap-1.5">
            {gewerke.map((g) => (
              <button key={g} type="button" onClick={() => setPickGewerke((l) => toggle(l, g))}
                className={'px-2.5 py-1 rounded-full text-xs border transition ' + (pickGewerke.includes(g) ? 'bg-amber text-ink border-amber font-semibold' : 'border-white/15 text-white/60 hover:border-white/30')}>{g}</button>
            ))}
          </div>
          <button onClick={add} disabled={busy} className="w-full rounded-xl py-2.5 font-semibold btn-grad disabled:opacity-40 inline-flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" strokeWidth={2} />{busy ? '…' : 'Mitarbeiter zuweisen'}</button>
        </div>

        <div className="space-y-2 pt-1">
          {members === null && <div className="text-white/35 text-sm">Lade…</div>}
          {members && members.length === 0 && <div className="text-white/35 text-sm">Noch keine Mitarbeiter zugewiesen.</div>}
          {members && members.map((m) => (
            <div key={m.email} className="glass rounded-2xl p-3">
              <div className="flex items-center gap-2">
                <IconChip icon={HardHat} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
                <div className="flex-1 min-w-0 truncate text-sm">{m.email}</div>
                <button onClick={() => sendInvite(projektName, m.email)} title="Einladung senden" className="text-amber/80 hover:text-amber transition p-1.5 rounded-lg border border-white/10"><Send className="w-[18px] h-[18px]" /></button>
                <button onClick={() => del(m.email)} className="text-white/30 hover:text-ember transition p-1"><X className="w-[18px] h-[18px]" /></button>
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

function RechnungRow({ r, onSavePayment, onDelete }) {
  const [val, setVal] = useState(String(r.bezahlterBetrag ?? 0))
  const gesamt = Number(r.gesamtbetrag ?? r.betrag) || 0
  const saldo = r.saldo != null ? Number(r.saldo) : gesamt - (Number(r.bezahlterBetrag) || 0)
  return (
    <div className="glass rounded-2xl p-3 space-y-2">
      <div className="flex items-center gap-3">
        <IconChip icon={Receipt} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">Abschnitt {r.nr ?? '–'} · {r.von ? dmy(r.von) : '…'} – {r.bis ? dmy(r.bis) : '…'}</div>
          <div className="text-white/40 text-xs">
            Leistungen {euro(r.betrag)}
            {r.vorherigerSaldo ? (r.vorherigerSaldo > 0 ? ' + Übertrag ' + euro(r.vorherigerSaldo) : ' − Übertrag ' + euro(Math.abs(r.vorherigerSaldo))) : ''}
            {' = '}{euro(gesamt)}
          </div>
        </div>
        <button onClick={() => onDelete(r)} className="text-white/30 hover:text-ember transition p-1 shrink-0"><X className="w-[18px] h-[18px]" /></button>
      </div>
      <div className="flex items-center gap-2 pl-1 flex-wrap">
        <span className="text-white/45 text-xs shrink-0">Bezahlt:</span>
        <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" />
        <button onClick={() => onSavePayment(r, val)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/10">Speichern</button>
        <span className={'ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ' + (saldo > 0 ? 'bg-ember/20 text-ember' : saldo < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/50')}>
          {saldo > 0 ? 'Offen ' + euro(saldo) : saldo < 0 ? 'Überzahlt ' + euro(Math.abs(saldo)) : 'Ausgeglichen'}
        </span>
      </div>
    </div>
  )
}

function RechnungenSheet({ rechnungen, onClose, onSavePayment, onDelete, onExportPdf }) {
  const gesamtRechnung = rechnungen.reduce((sum, r) => sum + (Number(r.gesamtbetrag ?? r.betrag) || 0), 0)
  const gesamtBezahlt = rechnungen.reduce((sum, r) => sum + (Number(r.bezahlterBetrag) || 0), 0)
  const aktuellerSaldo = rechnungen.length ? (Number(rechnungen[0].saldo) || 0) : 0
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={onClose}>
      <div className="glass w-full max-w-lg mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 max-h-[90dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold flex items-center gap-2.5"><IconChip icon={Receipt} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> Abrechnungsübersicht</div>
        {rechnungen.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/5 rounded-xl p-2"><div className="text-white/40 text-[11px]">Gestellt</div><div className="font-bold text-sm">{euro(gesamtRechnung)}</div></div>
            <div className="bg-white/5 rounded-xl p-2"><div className="text-white/40 text-[11px]">Bezahlt</div><div className="font-bold text-sm">{euro(gesamtBezahlt)}</div></div>
            <div className="bg-white/5 rounded-xl p-2"><div className="text-white/40 text-[11px]">Saldo</div><div className={'font-bold text-sm ' + (aktuellerSaldo > 0 ? 'text-ember' : aktuellerSaldo < 0 ? 'text-emerald-400' : '')}>{euro(aktuellerSaldo)}</div></div>
          </div>
        )}
        <div className="space-y-2">
          {rechnungen.length === 0 && (
            <div className="text-white/35 text-sm">Noch keinen Abschnitt erstellt — im Leistungsnachweis-Dialog „Als neuen Abschnitt festhalten" aktivieren.</div>
          )}
          {rechnungen.map((r) => <RechnungRow key={r.id} r={r} onSavePayment={onSavePayment} onDelete={onDelete} />)}
        </div>
        {rechnungen.length > 0 && (
          <button onClick={onExportPdf} className="w-full rounded-2xl py-2.5 font-semibold bg-white/10 inline-flex items-center justify-center gap-2"><FileText className="w-4 h-4" /> Gesamtübersicht als PDF</button>
        )}
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
  const [rechnungen, setRechnungen] = useState([])
  const [rechnungenOpen, setRechnungenOpen] = useState(false)
  const [nvon, setNvon] = useState('')
  const [nbis, setNbis] = useState('')
  const [alsRechnung, setAlsRechnung] = useState(false)

  const load = async () => {
    setProjekt(await getProjekt(id)); setEintraege(await listEintraege(id))
    if (!isWorker) setRechnungen(await listRechnungen(id))
  }
  useEffect(() => { load(); const t = localStorage.getItem(TIMERKEY(id)); if (t) setTimer(JSON.parse(t)) }, [id])
  useEffect(() => { if (!timer || isPaused(timer)) return; const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv) }, [timer])
  // Nachweis-Dialog öffnen: Zeitraum an letzten Abschnitt anschließen, damit sich Abrechnungen nicht überschneiden
  useEffect(() => {
    if (!nachweis) return
    const last = rechnungen.reduce((max, r) => (!max || (Number(r.nr) || 0) > (Number(max.nr) || 0) ? r : max), null)
    if (last && last.bis) {
      const d = new Date(last.bis); d.setDate(d.getDate() + 1)
      const pad = (n) => String(n).padStart(2, '0')
      setNvon(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()))
    } else setNvon('')
    setNbis(new Date().toISOString().slice(0, 10))
    setAlsRechnung(true)
  }, [nachweis])
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
  const epRows = !isWorker ? leistungAnalytics(eintraege, [projekt]) : []
  const offeneRechnungen = rechnungen.filter((r) => (Number(r.saldo) || 0) > 0)
  const offeneSumme = offeneRechnungen.reduce((sum, r) => sum + (Number(r.saldo) || 0), 0)
  const letzterAbschnitt = rechnungen.reduce((max, r) => (!max || (Number(r.nr) || 0) > (Number(max.nr) || 0) ? r : max), null)
  const vorherigerSaldo = letzterAbschnitt ? (Number(letzterAbschnitt.saldo) || 0) : 0
  const naechsteAbschnittNr = (letzterAbschnitt ? Number(letzterAbschnitt.nr) || rechnungen.length : 0) + 1
  const gewerkeList = isWorker && allowedGewerke.length ? allowedGewerke : s.gewerke
  const paused = Boolean(timer && isPaused(timer))
  const workedMs = timer ? Math.max(0, now - timer.startTs - pausedMsOf(timer, now)) : 0

  function startTimer() {
    const tm = { gewerk, leistung, startTs: Date.now(), pauses: [] }
    localStorage.setItem(TIMERKEY(id), JSON.stringify(tm)); setTimer(tm); setNow(Date.now())
  }
  function pauseResume() {
    setTimer((tm) => {
      if (!tm) return tm
      const pauses = tm.pauses || []
      const last = pauses[pauses.length - 1]
      const nowTs = Date.now()
      const nextPauses = last && !last.endTs
        ? pauses.slice(0, -1).concat([{ ...last, endTs: nowTs }])
        : pauses.concat([{ startTs: nowTs, endTs: null }])
      const next = { ...tm, pauses: nextPauses }
      localStorage.setItem(TIMERKEY(id), JSON.stringify(next))
      return next
    })
    setNow(Date.now())
  }
  async function stopTimer() {
    let stopTs = Date.now()
    const rundung = Number(s.rundungMinuten) || 0
    if (rundung > 0) { const stepMs = rundung * 60000; stopTs = Math.ceil(stopTs / stepMs) * stepMs }
    const ms = Math.max(0, stopTs - timer.startTs - pausedMsOf(timer, stopTs))
    const secs = Math.max(1, Math.round(ms / 1000))
    const mins = secs / 60 // sekundengenau als Bruchteil-Minuten (bzw. gerundet auf Rundungsschritt)
    const startAt = new Date(timer.startTs).toISOString()
    const endAt = new Date(stopTs).toISOString()
    const pausen = (timer.pauses || []).map((p) => ({ start: new Date(p.startTs).toISOString(), end: new Date(p.endTs || stopTs).toISOString() }))
    await addEintrag({ projektId: Number(id), type: 'zeit', gewerk: timer.gewerk, leistung: timer.leistung || '', minutes: mins, startAt, endAt, pausen })
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
    <div className="px-5 md:px-8 pt-8 md:pt-10">
      <header className="flex items-center gap-3 mb-5">
        <button onClick={() => nav('/')} className="glass card-hover w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"><ChevronLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-xl md:text-2xl truncate">{projekt.name}</div>
          <div className="text-white/40 text-xs md:text-sm truncate">{[projekt.customer, projekt.address].filter(Boolean).join(' · ')}</div>
        </div>
        {!isWorker && (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setTeam(true)} title="Team" className="glass card-hover w-10 h-10 rounded-2xl flex items-center justify-center"><Users className="w-5 h-5" /></button>
            <button onClick={() => setRechnungenOpen(true)} title="Rechnungen" className="glass card-hover w-10 h-10 rounded-2xl flex items-center justify-center"><Receipt className="w-5 h-5" /></button>
            <button onClick={() => setNachweis(true)} title="Leistungsnachweis" className="glass card-hover w-10 h-10 rounded-2xl flex items-center justify-center"><FileText className="w-5 h-5" /></button>
          </div>
        )}
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
        <div className="lg:col-span-5 space-y-3">
          {isWorker ? (
            <StatTile icon={Clock} label="Erfasste Stunden" value={hrs(t.minutes)} big />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatTile icon={Clock} label="Stunden" value={hrs(t.minutes)} big />
                <StatTile icon={Wallet} label="Selbstkosten" value={euro(t.total)} grad big />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatTile icon={BadgeEuro} label="Lohn" value={euro(t.laborCost)} />
                <StatTile icon={Package} label="Material" value={euro(t.materialCost)} />
                <StatTile icon={Wrench} label="Maschine" value={euro(t.maschineCost)} />
              </div>
              {offeneRechnungen.length > 0 && (
                <button onClick={() => setRechnungenOpen(true)} className="w-full glass card-hover rounded-2xl p-3 flex items-center gap-3 text-left">
                  <IconChip icon={Receipt} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-white/40 text-xs">Offene Forderungen · {offeneRechnungen.length} Rechnung{offeneRechnungen.length === 1 ? '' : 'en'}</div>
                    <div className="font-bold text-amber">{euro(offeneSumme)}</div>
                  </div>
                </button>
              )}
            </>
          )}

          <div className="glass rounded-3xl p-5">
            <div className="text-white/45 text-[11px] mb-3 uppercase tracking-wider font-semibold">Zeit-Timer</div>
            {timer ? (
              <>
                <div className={'text-5xl font-extrabold text-center tabular-nums ' + (paused ? 'text-white/35' : '')}>{clock(workedMs)}</div>
                <div className="text-center text-white/40 text-xs mt-1 mb-4 flex items-center justify-center gap-1.5">
                  <span>{timer.gewerk}{timer.leistung ? ' · ' + timer.leistung : ''}</span>
                  {paused && <span className="inline-flex items-center gap-1 text-amber font-semibold"><Pause className="w-3.5 h-3.5" /> Pause</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={pauseResume} className={'rounded-2xl py-4 font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition ' + (paused ? 'btn-grad' : 'bg-white/10 text-white')}>
                    {paused ? <><Play className="w-5 h-5" /> Weiter</> : <><Pause className="w-5 h-5" /> Pause</>}
                  </button>
                  <button onClick={stopTimer} className="rounded-2xl py-4 font-bold bg-ember text-white inline-flex items-center justify-center gap-2 active:scale-[0.98] transition"><Square className="w-5 h-5" /> Stopp</button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 p-2 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex gap-2 items-center">
                    <VoiceInput onText={setSetupText} />
                    <button type="button" disabled={setupBusy || !setupText.trim()} onClick={kiSetup} className="rounded-xl px-3 py-2 text-sm font-semibold bg-white/10 disabled:opacity-40 inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" />{setupBusy ? '…' : 'KI-Setup'}</button>
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
                <button onClick={startTimer} className="w-full rounded-2xl py-5 font-bold text-xl btn-grad shadow-glow active:scale-[0.98] transition inline-flex items-center justify-center gap-2"><Play className="w-6 h-6" strokeWidth={2.3} /> Start</button>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <ActionTile icon={Ruler} label="Menge" onClick={() => setSheet('menge')} />
            {!isWorker && <ActionTile icon={Wrench} label="Maschine" onClick={() => setSheet('maschine')} />}
            {!isWorker && <ActionTile icon={Package} label="Material" onClick={() => setSheet('material')} />}
            <ActionTile icon={Camera} label="Foto" onClick={() => setSheet('foto')} />
            <ActionTile icon={NotebookPen} label="Tagebuch" onClick={() => setSheet('tagebuch')} />
          </div>
          <button onClick={() => setSheet('zeit')} className="text-white/50 text-sm inline-flex items-center gap-1 hover:text-white/70 transition"><Plus className="w-4 h-4" /> Zeit manuell erfassen</button>

          {!isWorker && epRows.length > 0 && (
            <div className="glass rounded-3xl p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <IconChip icon={Calculator} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
                <div>
                  <div className="font-semibold">EP-Vorschau</div>
                  <div className="text-white/35 text-xs">Selbstkosten je Einheit — Basis fürs Angebot</div>
                </div>
              </div>
              <div className="space-y-2">
                {epRows.map((l, i) => (
                  <div key={i} className="bg-white/5 rounded-xl p-3">
                    <div className="flex justify-between items-baseline gap-2">
                      <div className="font-medium truncate text-sm">{l.leistung}</div>
                      <div className="grad-text font-bold whitespace-nowrap text-sm">{l.ep != null ? euro(l.ep) + ' / ' + l.einheit : '—'}</div>
                    </div>
                    <div className="text-white/40 text-[11px] mt-0.5">
                      {l.menge ? l.menge.toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' ' + l.einheit + ' · ' : ''}{euro(l.total)} Selbstkosten{l.ep == null ? ' · Menge erfassen für EP' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 mt-5 lg:mt-0">
          <div className="text-white/50 text-sm mb-2 font-medium">Einträge ({eintraege.length})</div>
          <div className="space-y-2">
            {eintraege.length === 0 && <div className="glass rounded-2xl p-5 text-white/35 text-sm">Noch keine Einträge — starte den Timer oder erfasse eine Leistung.</div>}
            {eintraege.map((e) => <EntryRow key={e.id} e={e} rate={projekt.hourlyRate} hideCost={isWorker} onDelete={() => remove(e.id)} />)}
          </div>
        </div>
      </div>

      {sheet && (
        <AddSheet s={s} type={sheet} defaultGewerk={gewerk} gewerkeList={gewerkeList} onClose={() => setSheet(null)}
          onSave={async (data) => {
            const arr = Array.isArray(data) ? data : [data]
            for (const d of arr) await addEintrag({ projektId: Number(id), ...d })
            setSheet(null); await load()
          }} />
      )}

      {abschluss && (
        <AbschlussSheet s={s} ctx={abschluss} onClose={() => setAbschluss(null)}
          onSaved={async (entries) => { for (const e of entries) await addEintrag({ projektId: Number(id), ...e }); setAbschluss(null); await load() }} />
      )}

      {team && <TeamSheet projektToken={projekt.token} projektName={projekt.name} gewerke={s.gewerke} onClose={() => setTeam(false)} />}

      {nachweis && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={() => setNachweis(false)}>
          <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold flex items-center gap-2.5"><IconChip icon={FileText} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> Leistungsnachweis erstellen</div>
            <div>
              <div className="text-white/50 text-xs mb-1">Zeitraum (optional — leer = alles)</div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={nvon} onChange={(e) => setNvon(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber" />
                <input type="date" value={nbis} onChange={(e) => setNbis(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-amber" />
              </div>
            </div>
            <label className="flex items-center justify-between py-2">
              <span className="text-white/70">Mit Selbstkosten (intern)</span>
              <input type="checkbox" checked={mitKosten} onChange={(e) => setMitKosten(e.target.checked)} className="w-5 h-5 accent-[#f59e0b]" />
            </label>
            <div className="text-white/40 text-xs">Aus = ohne Kosten (für den Kunden). Enthält Zeiterfassung mit Uhrzeiten, Leistungen, Bautagebuch & Fotos.</div>
            <label className="flex items-center justify-between py-2 border-t border-white/10">
              <span className="text-white/70">Als neuen Abschnitt (Nr. {naechsteAbschnittNr}) festhalten</span>
              <input type="checkbox" checked={alsRechnung} onChange={(e) => setAlsRechnung(e.target.checked)} className="w-5 h-5 accent-[#f59e0b]" />
            </label>
            <div className="text-white/40 text-xs">Trennt diese Abrechnung sauber vom nächsten Abschnitt und merkt Zeitraum & Betrag in „Rechnungen".</div>
            {alsRechnung && mitKosten && vorherigerSaldo !== 0 && (
              <div className={'rounded-xl p-3 text-sm border ' + (vorherigerSaldo > 0 ? 'bg-ember/10 text-ember border-ember/25' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25')}>
                {vorherigerSaldo > 0
                  ? 'Offener Saldo aus Abschnitt ' + letzterAbschnitt.nr + ': ' + euro(vorherigerSaldo) + ' — wird zu diesem Abschnitt addiert und im PDF verrechnet.'
                  : 'Guthaben aus Überzahlung (Abschnitt ' + letzterAbschnitt.nr + '): ' + euro(Math.abs(vorherigerSaldo)) + ' — wird von diesem Abschnitt abgezogen und im PDF verrechnet.'}
              </div>
            )}
            <button onClick={async () => {
              try {
                const gefiltert = filterByRange(eintraege, nvon, nbis)
                const betrag = projektTotals(gefiltert, projekt.hourlyRate).total
                const pdfOpts = { mitKosten, von: nvon, bis: nbis }
                if (alsRechnung) { pdfOpts.abschnittNr = naechsteAbschnittNr; pdfOpts.vorherigerSaldo = vorherigerSaldo }
                const doc = buildLeistungsnachweis(projekt, eintraege, s, pdfOpts)
                await sharePdf(doc, nachweisFilename(projekt))
                if (alsRechnung) {
                  const gesamtbetrag = betrag + vorherigerSaldo
                  await createRechnung({
                    projektId: Number(id), nr: naechsteAbschnittNr, von: nvon || null, bis: nbis || null,
                    betrag, vorherigerSaldo, gesamtbetrag, bezahlterBetrag: 0, saldo: gesamtbetrag, bezahlt: false,
                  })
                  setRechnungen(await listRechnungen(id))
                }
                setNachweis(false)
              } catch (err) { alert('PDF-Fehler: ' + (err && err.message ? err.message : err)) }
            }} className="w-full rounded-2xl py-3 font-bold btn-grad">PDF erzeugen & teilen</button>
          </div>
        </div>
      )}

      {rechnungenOpen && (
        <RechnungenSheet rechnungen={rechnungen} onClose={() => setRechnungenOpen(false)}
          onSavePayment={async (r, valStr) => {
            const bezahlterBetrag = Number(valStr) || 0
            const gesamt = Number(r.gesamtbetrag ?? r.betrag) || 0
            const saldo = gesamt - bezahlterBetrag
            await updateRechnung(r.id, { bezahlterBetrag, saldo, bezahlt: saldo <= 0, bezahltAm: new Date().toISOString().slice(0, 10) })
            setRechnungen(await listRechnungen(id))
          }}
          onDelete={async (r) => { await deleteRechnung(r.id); setRechnungen(await listRechnungen(id)) }}
          onExportPdf={async () => { const doc = buildAbrechnungsUebersicht(projekt, rechnungen, s); await sharePdf(doc, uebersichtFilename(projekt)) }} />
      )}
    </div>
  )
}
