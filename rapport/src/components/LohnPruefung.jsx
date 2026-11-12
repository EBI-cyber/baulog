import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ScanSearch, Camera, Loader2, CheckCircle2, XCircle, Info, X, Send, MessageCircle, Copy, ChevronDown, Wrench, BookOpen, HelpCircle } from 'lucide-react'
import Sheet from './Sheet'
import { db } from '../lib/db'
import { alsDataUrl } from '../lib/bild'
import { lohnabrechnungLesen, appLohn, vergleichen, nachrichtText } from '../lib/abgleich'
import { useEinstellungen } from '../lib/settings'
import { chf } from '../lib/lohn'
import { erklaeren } from '../lib/lohnErklaerung'
import { useMs, msVersand } from '../lib/microsoft'
import { whatsappLink } from '../lib/teilen'
import { isoDatum } from '../lib/zeit'

const fmt = (c, w, wert) => (c.einheit === 'h' ? `${(wert ?? 0).toFixed(2)} h` : c.einheit === '%' ? `${wert} %` : chf(wert, w))

/** Lohnabrechnung fotografieren → KI liest → Zeile für Zeile mit den eigenen Rapporten vergleichen */
export default function LohnPruefung({ gespeichert, onClose }) {
  const [einst] = useEinstellungen()
  const ms = useMs()
  const w = einst.waehrung
  const [fotos, setFotos] = useState(gespeichert?.fotos || [])
  const [schritt, setSchritt] = useState(gespeichert ? 'ergebnis' : 'fotos')
  const [ki, setKi] = useState(gespeichert?.daten || null)
  const [pruef, setPruef] = useState(gespeichert?.pruefung || [])
  const [auswahl, setAuswahl] = useState(() => new Set((gespeichert?.pruefung || []).filter((c) => c.status === 'abweichung').map((c) => c.id)))
  const [fehler, setFehler] = useState('')
  const [offen, setOffen] = useState(null)
  const [nachricht, setNachricht] = useState(null)
  const [gesendet, setGesendet] = useState('')
  const [periode, setPeriode] = useState({ von: '', bis: '' })
  const gespeichertId = useRef(gespeichert?.id || null)
  const datei = useRef()
  const einsaetze = useLiveQuery(() => db.einsaetze.toArray(), [], [])
  const einsatz = useMemo(() => (einsaetze || []).find((e) => ki?.firma && e.firma.toLowerCase().includes(String(ki.firma).toLowerCase().slice(0, 8)))
    || (einsaetze || []).find((e) => ki?.buero && (e.buero || '').toLowerCase().includes(String(ki.buero).toLowerCase().slice(0, 6)))
    || (einsaetze || []).find((e) => e.firma === einst.firma) || null, [einsaetze, ki, einst.firma])

  async function fotosDazu(e) {
    const neu = []
    for (const d of [...(e.target.files || [])]) neu.push(await alsDataUrl(d, 2000, 0.85))
    e.target.value = ''
    setFotos((f) => [...f, ...neu].slice(0, 6))
  }

  async function pruefen(kiDaten) {
    const von = kiDaten.periodeVon || periode.von, bis = kiDaten.periodeBis || periode.bis
    if (!von || !bis) { setSchritt('periode'); return }
    const app = await appLohn(von, bis, einst)
    const p = vergleichen({ ...kiDaten, periodeVon: von, periodeBis: bis }, app, einst)
    setPruef(p)
    setAuswahl(new Set(p.filter((c) => c.status === 'abweichung' && c.id !== 'auszahlung').map((c) => c.id)))
    setSchritt('ergebnis')
    // gleiche Prüfung aktualisieren statt doppelt speichern
    gespeichertId.current = await db.lohnabrechnungen.put({ ...(gespeichertId.current ? { id: gespeichertId.current } : {}), firma: einsatz?.firma || kiDaten.firma || '', buero: kiDaten.buero || einsatz?.buero || '',
      von, bis, fotos, daten: { ...kiDaten, periodeVon: von, periodeBis: bis }, pruefung: p, erstellt: Date.now() })
  }

  async function lesen() {
    setFehler(''); setSchritt('lesen')
    try { const d = await lohnabrechnungLesen(fotos); setKi(d); await pruefen(d) }
    catch (e) { setFehler(e.message); setSchritt('fotos') }
  }

  const [fixMeldung, setFixMeldung] = useState('')
  const [erklaerAlle, setErklaerAlle] = useState(false)
  const [erklaert, setErklaert] = useState(() => new Set())
  const umschalten = (id) => setErklaert((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  async function fixAnwenden(fix) {
    await db.einsaetze.update(fix.einsatzId, { [fix.feld]: fix.wert })
    await pruefen(ki)
    setFixMeldung(`✓ ${fix.label.replace(/ übernehmen$| umstellen$/, '')} — neu verglichen`)
  }
  async function alleFixes() {
    const fixes = [...new Map(pruef.filter((c) => c.fix).map((c) => [c.fix.feld, c.fix])).values()]
    for (const f of fixes) await db.einsaetze.update(f.einsatzId, { [f.feld]: f.wert })
    await pruefen(ki)
    setFixMeldung(`✓ ${fixes.length} Einstellungen übernommen — neu verglichen`)
  }

  const abw = pruef.filter((c) => c.status === 'abweichung' && c.id !== 'auszahlung'), hin = pruef.filter((c) => c.status === 'hinweis')
  const gesamt = pruef.find((c) => c.id === 'auszahlung')
  const nFix = new Set(pruef.filter((c) => c.fix).map((c) => c.fix.feld)).size
  const gruppen = [...new Set(pruef.map((c) => c.gruppe))]

  return (
    <Sheet titel="Lohnabrechnung prüfen" icon={ScanSearch} onClose={onClose}>
      {schritt === 'fotos' && (
        <>
          <div className="text-sm text-white/60">Fotografiere deine Lohnabrechnung (alle Seiten) oder wähle das PDF aus Mail/Dateien. Die App liest sie aus und vergleicht jede Zeile mit deinen Rapporten, deinem Einsatzvertrag und den Guthaben.</div>
          {fotos.length > 0 && <div className="flex gap-2 overflow-x-auto">{fotos.map((f, i) => (
            <div key={i} className="relative shrink-0">{f.startsWith('data:application/pdf') ? <div className="h-24 w-[4.5rem] rounded-lg border border-white/15 bg-white/10 flex items-center justify-center text-xs font-bold">PDF</div> : <img src={f} alt="" className="h-24 w-[4.5rem] object-cover rounded-lg border border-white/15" />}
              <button onClick={() => setFotos(fotos.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-black/80 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button></div>
          ))}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => datei.current?.click()} className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Camera className="w-5 h-5" /> {fotos.length ? 'Seite dazu' : 'Foto oder PDF'}</button>
            <button onClick={lesen} disabled={!fotos.length} className="rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40"><ScanSearch className="w-5 h-5" /> Prüfen</button>
          </div>
          <input ref={datei} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={fotosDazu} />
          {fehler && <div className="text-sm text-ember">{fehler}</div>}
        </>
      )}
      {schritt === 'lesen' && <div className="py-10 text-center text-white/60 space-y-2"><Loader2 className="w-8 h-8 animate-spin mx-auto" /><div>Abrechnung wird gelesen und nachgerechnet …</div></div>}
      {schritt === 'periode' && (
        <>
          <div className="text-sm text-white/60">Die Abrechnungsperiode war nicht lesbar — bitte angeben:</div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="eingabe" value={periode.von} onChange={(e) => setPeriode({ ...periode, von: e.target.value })} />
            <input type="date" className="eingabe" value={periode.bis} onChange={(e) => setPeriode({ ...periode, bis: e.target.value })} />
          </div>
          <button onClick={() => pruefen(ki)} disabled={!periode.von || !periode.bis} className="w-full rounded-2xl py-3 btn-grad font-bold disabled:opacity-40">Vergleichen</button>
        </>
      )}
      {schritt === 'ergebnis' && ki && (
        <>
          <div className="text-xs text-white/45">{ki.buero || einsatz?.buero || ''} · Periode {String(ki.periodeVon || '').split('-').reverse().join('.')}–{String(ki.periodeBis || '').split('-').reverse().join('.')}</div>
          <div className={'rounded-2xl p-4 flex items-center gap-3 border ' + (abw.length ? 'bg-ember/12 border-ember/40' : nFix ? 'bg-amber-400/10 border-amber-400/35' : 'bg-lime/10 border-lime/35')}>
            {abw.length ? <XCircle className="w-8 h-8 text-ember shrink-0" /> : nFix ? <Wrench className="w-8 h-8 text-amber-300 shrink-0" /> : <CheckCircle2 className="w-8 h-8 text-lime shrink-0" />}
            <div>
              <div className="font-bold text-lg">{abw.length ? `${abw.length} Abweichung${abw.length > 1 ? 'en' : ''}` : nFix ? `Noch ${nFix} Einstellung${nFix > 1 ? 'en' : ''} übernehmen` : 'Abrechnung stimmt'}</div>
              {gesamt && !['ok', 'folge'].includes(gesamt.status) && Math.abs(gesamt.app - gesamt.ab) > 0.05 && <div className="text-sm font-semibold">{gesamt.ab < gesamt.app ? `Dir fehlen ${chf(gesamt.app - gesamt.ab, w)}` : `${chf(gesamt.ab - gesamt.app, w)} mehr als berechnet`} bei der Auszahlung</div>}
              <div className="text-sm text-white/60">{pruef.filter((c) => c.status === 'ok').length} Punkte stimmen{hin.length ? ` · ${hin.length} Hinweis${hin.length > 1 ? 'e' : ''}` : ''}</div>
            </div>
          </div>
          <button onClick={() => setErklaerAlle(!erklaerAlle)} className={'w-full rounded-2xl py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 border ' + (erklaerAlle ? 'bg-sky-400/15 border-sky-400/40 text-sky-200' : 'bg-white/[0.06] border-white/10 text-white/75')}>
            <BookOpen className="w-4 h-4" /> {erklaerAlle ? 'Erklärungen ausblenden' : 'Erklären: was bedeutet jede Zeile?'}
          </button>
          {pruef.filter((c) => c.fix).length > 1 && (
            <button onClick={alleFixes} className="w-full rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-2">
              <Wrench className="w-4 h-4" /> Alle {new Set(pruef.filter((c) => c.fix).map((c) => c.fix.feld)).size} Korrekturen übernehmen
            </button>
          )}
          {fixMeldung && <div className="text-sm rounded-xl px-3 py-2 bg-lime/10 border border-lime/30 text-lime">{fixMeldung}</div>}
          {gruppen.map((g) => (
            <div key={g} className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wider text-white/40 pt-1">{g}</div>
              {pruef.filter((c) => c.gruppe === g).map((c) => (
                <div key={c.id} className={'rounded-xl border px-3 py-2 ' + (c.status === 'ok' ? 'border-white/10 bg-white/[0.03]' : c.status === 'abweichung' ? 'border-ember/40 bg-ember/10' : c.status === 'folge' ? 'border-white/10 bg-white/[0.02] opacity-70' : 'border-amber-400/35 bg-amber-400/10')}>
                  <div className="flex items-center gap-2">
                    {c.status === 'ok' ? <CheckCircle2 className="w-4 h-4 text-lime shrink-0" /> : c.status === 'abweichung' ? <XCircle className="w-4 h-4 text-ember shrink-0" /> : c.status === 'folge' ? <ChevronDown className="w-4 h-4 text-white/40 shrink-0 -rotate-90" /> : <Info className="w-4 h-4 text-amber-300 shrink-0" />}
                    <button type="button" onClick={() => umschalten(c.id)} className="flex-1 min-w-0 text-sm font-semibold truncate text-left inline-flex items-center gap-1.5">
                      <span className="truncate">{c.titel}</span><HelpCircle className={'w-3.5 h-3.5 shrink-0 ' + (erklaerAlle || erklaert.has(c.id) ? 'text-sky-300' : 'text-white/30')} />
                    </button>
                    {!['ok', 'folge'].includes(c.status) && c.id !== 'auszahlung' && <input type="checkbox" className="w-4 h-4 accent-cyan-400" checked={auswahl.has(c.id)} title="In die Nachricht ans Büro"
                      onChange={(e) => { const s = new Set(auswahl); e.target.checked ? s.add(c.id) : s.delete(c.id); setAuswahl(s) }} />}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs tabular-nums mt-1">
                    <div><span className="text-white/40">Abrechnung </span><b>{fmt(c, w, c.ab)}</b></div>
                    <div className="text-right"><span className="text-white/40">laut App </span><b>{fmt(c, w, c.app)}</b></div>
                  </div>
                  {c.text && <div className={'text-xs mt-1 ' + (c.status === 'abweichung' ? 'text-ember' : c.status === 'folge' ? 'text-white/50' : 'text-amber-200')}>{c.text}</div>}
                  {(erklaerAlle || erklaert.has(c.id)) && (() => { const e = erklaeren(c, ki, w); return (
                    <div className="mt-2 rounded-lg bg-sky-400/10 border border-sky-400/20 px-2.5 py-2 text-xs text-sky-100/90 space-y-1">
                      <div>{e.was}</div>
                      {e.rechnung && <div className="tabular-nums"><span className="text-sky-300/80">Rechnung: </span>{e.rechnung}</div>}
                      {e.woher && <div><span className="text-sky-300/80">Grundlage: </span>{e.woher}</div>}
                    </div>) })()}
                  {c.fix && <button onClick={() => fixAnwenden(c.fix)} className="mt-1.5 text-xs rounded-lg px-2 py-1 bg-white/10 inline-flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> {c.fix.label}</button>}
                  {c.tage?.length > 0 && (
                    <button onClick={() => setOffen(offen === c.id ? null : c.id)} className="mt-1 text-xs text-white/50 inline-flex items-center gap-1">
                      <ChevronDown className={'w-3.5 h-3.5 ' + (offen === c.id ? 'rotate-180' : '')} /> Stunden pro Tag laut Rapport
                    </button>
                  )}
                  {offen === c.id && <div className="text-xs text-white/60 mt-1 columns-2">{c.tage.map((t) => <div key={t}>{t}</div>)}</div>}
                </div>
              ))}
            </div>
          ))}
          {auswahl.size > 0 && !nachricht && (
            <button onClick={() => setNachricht(nachrichtText({ ki, pruef: pruef.filter((c) => auswahl.has(c.id)), einst, einsatz, gesamt: pruef.find((c) => c.id === 'auszahlung') }))}
              className="w-full rounded-2xl py-3.5 btn-grad font-bold inline-flex items-center justify-center gap-2"><Send className="w-5 h-5" /> Nachricht ans Büro vorbereiten</button>
          )}
          {nachricht != null && (
            <div className="space-y-2">
              <textarea className="eingabe min-h-[220px] text-sm" value={nachricht} onChange={(e) => setNachricht(e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                {ms.refreshToken && einsatz?.bueroEmail ? (
                  <button onClick={async () => {
                    try {
                      const blob = await (await fetch(fotos[0])).blob()
                      const r = await msVersand({ datei: { name: `Lohnabrechnung_${ki.periodeBis || isoDatum(new Date())}.jpg`, blob }, mail: { an: einsatz.bueroEmail, cc: einst.kopieAnMich ? ms.konto : '', betreff: `Lohnabrechnung ${String(ki.periodeVon || '').slice(0, 7)} — Rückfrage ${einst.name}`, text: nachricht } })
                      setGesendet(r.mail?.ok ? `Gesendet an ${einsatz.bueroEmail}` : `Fehler: ${r.mail?.fehler}`)
                    } catch (e) { setGesendet('Fehler: ' + e.message) }
                  }} className="rounded-xl py-2.5 btn-grad text-sm font-bold inline-flex items-center justify-center gap-1.5"><Send className="w-4 h-4" /> E-Mail</button>
                ) : <a href={`mailto:${einsatz?.bueroEmail || ''}?subject=${encodeURIComponent('Rückfrage Lohnabrechnung')}&body=${encodeURIComponent(nachricht)}`} className="rounded-xl py-2.5 btn-grad text-sm font-bold inline-flex items-center justify-center gap-1.5"><Send className="w-4 h-4" /> E-Mail</a>}
                <a href={whatsappLink(einsatz?.bueroTel || '', nachricht)} target="_blank" rel="noreferrer" className="rounded-xl py-2.5 bg-white/10 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
                <button onClick={() => { navigator.clipboard?.writeText(nachricht); setGesendet('Text kopiert') }} className="rounded-xl py-2.5 bg-white/10 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Copy className="w-4 h-4" /> Kopieren</button>
              </div>
              {gesendet && <div className="text-sm text-lime">{gesendet}</div>}
            </div>
          )}
          <div className="text-xs text-white/35">Die App rechnet mit deinen Rapporten und deinem Einsatzvertrag. Weicht etwas ab, kann auch eine Einstellung im Einsatz falsch sein — die Hinweise helfen beim Unterscheiden.</div>
        </>
      )}
    </Sheet>
  )
}
