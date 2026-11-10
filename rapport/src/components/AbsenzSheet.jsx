import { useState } from 'react'
import { CalendarOff, Trash2 } from 'lucide-react'
import Sheet from './Sheet'
import { db, speichereAbsenz } from '../lib/db'
import { ABSENZEN, absenzArt, FARBE } from '../lib/arten'
import { useEinstellungen, tagesSoll, zahl } from '../lib/settings'
import { isoDatum } from '../lib/zeit'

function tageZwischen(von, bis, mitWochenende) {
  const out = []
  const d = new Date(von + 'T12:00'), ende = new Date((bis || von) + 'T12:00')
  while (d <= ende && out.length < 370) {
    const wt = d.getDay()
    if (mitWochenende || (wt !== 0 && wt !== 6)) out.push(isoDatum(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Abwesenheit erfassen (auch über mehrere Tage) oder bearbeiten */
export default function AbsenzSheet({ absenz, datum, onClose }) {
  const [einst] = useEinstellungen()
  const vorschlag = (art, halb) => (absenzArt(art).bezahlt ? tagesSoll(einst) * (halb ? 0.5 : 1) : 0)
  const [f, setF] = useState(() => absenz
    ? { ...absenz, von: absenz.datum, bis: absenz.datum, stunden: String(absenz.stunden ?? '') }
    : { art: 'ferien', von: datum || isoDatum(new Date()), bis: datum || isoDatum(new Date()), halbtag: false,
        stunden: String(vorschlag('ferien', false)), zeugnis: false, notiz: '', mitWochenende: false })
  const [fehler, setFehler] = useState('')
  const art = absenzArt(f.art)
  const tage = absenz ? [f.von] : tageZwischen(f.von, f.bis, f.mitWochenende)

  const waehleArt = (id) => setF({ ...f, art: id, stunden: String(vorschlag(id, f.halbtag)) })
  const halbtag = (h) => setF({ ...f, halbtag: h, stunden: String(vorschlag(f.art, h)) })

  async function sichern() {
    if (!f.von) return setFehler('Bitte ein Datum wählen.')
    if (!absenz && f.bis < f.von) return setFehler('„Bis" liegt vor „Von".')
    if (!tage.length) return setFehler('Im Zeitraum liegen keine Arbeitstage.')
    const basis = { art: f.art, halbtag: f.halbtag, stunden: zahl(f.stunden), zeugnis: !!(art.zeugnis && f.zeugnis), notiz: f.notiz.trim() }
    if (absenz) await speichereAbsenz({ ...absenz, ...basis, datum: f.von })
    else for (const d of tage) await speichereAbsenz({ ...basis, datum: d })
    onClose()
  }

  async function loeschen() {
    if (!confirm('Diese Abwesenheit löschen?')) return
    await db.absenzen.delete(absenz.id); onClose()
  }

  return (
    <Sheet titel={absenz ? 'Abwesenheit bearbeiten' : 'Abwesenheit eintragen'} icon={CalendarOff} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {ABSENZEN.map((a) => {
          const aktiv = a.id === f.art
          return (
            <button key={a.id} type="button" onClick={() => waehleArt(a.id)}
              className={'rounded-xl border px-2.5 py-2 text-left text-sm flex items-center gap-2 min-w-0 ' + (aktiv ? FARBE[a.farbe] + ' font-semibold' : 'border-white/10 text-white/65')}>
              <a.icon className="w-4 h-4 shrink-0" strokeWidth={1.9} /> <span className="truncate">{a.label}</span>
            </button>
          )
        })}
      </div>
      {art.hinweis && <div className="text-xs text-white/40">{art.hinweis}</div>}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className={absenz ? 'col-span-2' : ''}>
          <label className="block text-xs text-white/50 mb-1">{absenz ? 'Datum' : 'Von'}</label>
          <input type="date" value={f.von} onChange={(e) => setF({ ...f, von: e.target.value, bis: f.bis < e.target.value ? e.target.value : f.bis })} className="eingabe" />
        </div>
        {!absenz && <div>
          <label className="block text-xs text-white/50 mb-1">Bis</label>
          <input type="date" value={f.bis} min={f.von} onChange={(e) => setF({ ...f, bis: e.target.value })} className="eingabe" />
        </div>}
      </div>

      <div className="flex gap-2">
        {[[false, 'Ganzer Tag'], [true, 'Halber Tag']].map(([h, l]) => (
          <button key={l} type="button" onClick={() => halbtag(h)}
            className={'flex-1 rounded-xl py-2 text-sm border ' + (f.halbtag === h ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/65')}>{l}</button>
        ))}
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-1">Angerechnete Stunden pro Tag</label>
        <input inputMode="decimal" value={f.stunden} onChange={(e) => setF({ ...f, stunden: e.target.value })} className="eingabe" />
        <div className="text-xs text-white/35 mt-1">{art.bezahlt ? 'Vorschlag = Tagessoll aus den Einstellungen.' : 'Wird normalerweise nicht angerechnet.'}</div>
      </div>

      {art.zeugnis && (
        <label className="flex items-center gap-3 text-sm bg-white/[0.04] rounded-xl px-3 py-2.5">
          <input type="checkbox" checked={!!f.zeugnis} onChange={(e) => setF({ ...f, zeugnis: e.target.checked })} className="w-5 h-5 accent-cyan-400" />
          Arztzeugnis / Bestätigung vorhanden
        </label>
      )}
      {!absenz && (
        <label className="flex items-center gap-3 text-sm text-white/65 px-1">
          <input type="checkbox" checked={f.mitWochenende} onChange={(e) => setF({ ...f, mitWochenende: e.target.checked })} className="w-5 h-5 accent-cyan-400" />
          Samstag/Sonntag mitzählen
        </label>
      )}
      <input value={f.notiz} onChange={(e) => setF({ ...f, notiz: e.target.value })} placeholder="Bemerkung (optional)" className="eingabe" />

      {fehler && <div className="text-sm rounded-xl px-3 py-2 bg-ember/15 border border-ember/30 text-ember">{fehler}</div>}
      <button onClick={sichern} className="w-full rounded-2xl py-3 font-bold btn-grad">
        {absenz || tage.length <= 1 ? 'Speichern' : `${tage.length} Tage speichern`}
      </button>
      {absenz && (
        <button onClick={loeschen} className="w-full py-2 text-sm text-white/35 hover:text-ember inline-flex items-center justify-center gap-1.5">
          <Trash2 className="w-4 h-4" /> Löschen
        </button>
      )}
    </Sheet>
  )
}
