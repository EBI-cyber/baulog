import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { ChevronRight, FolderOpen, Folder, FileText, Clock3, Image as ImageIcon, CheckCircle2, CircleDashed, PenLine, CloudUpload, Loader2, Share2, Eye, ArrowLeft, CalendarDays } from 'lucide-react'
import { db } from '../lib/db'
import { useEinstellungen } from '../lib/settings'
import { ausKey, wochenStart, datumKurz, isoWoche, wochenKey } from '../lib/zeit'
import { wochenMonat, gruppenPdf, zeitnachweisDatei } from '../lib/versand'
import { gruppenLaden, rapportStatus } from '../lib/rapporte'
import { fotosZuPdf } from '../lib/papierrapport'
import { dateiName } from '../lib/pdf'
import { teileDatei } from '../lib/teilen'
import Sheet from '../components/Sheet'

const std = (h) => (Math.round(h * 100) / 100).toFixed(2)

/** Alle Rapporte als Baum: Jahr → Monat → Kalenderwoche → Firma → Dateien (werden beim Antippen frisch erzeugt) */
export default function Rapporte() {
  const [einst] = useEinstellungen()
  const daten = useLiveQuery(async () => {
    const [schichten, absenzen, wochen] = await Promise.all([db.schichten.toArray(), db.absenzen.toArray(), db.wochen.toArray()])
    return { schichten, absenzen, wochen }
  }, [], null)
  const jetzt = wochenKey(isoWoche(new Date()))
  const [offen, setOffen] = useState(() => {
    const w = isoWoche(new Date())
    return { [String(w.jahr)]: true, [`${w.jahr}|${wochenMonat(w)}`]: true }
  })
  const [datei, setDatei] = useState(null)
  const umschalten = (k) => setOffen((o) => ({ ...o, [k]: !o[k] }))

  const baum = useMemo(() => {
    if (!daten) return null
    const eintraege = {} // wKey|firma → { stunden, tage }
    const add = (wKey, firma, h, datum) => {
      if (!wKey || wKey > jetzt) return
      const k = `${wKey}|${firma || einst.firma || 'Ohne Firma'}`
      const e = (eintraege[k] ||= { wKey, firma: firma || einst.firma || 'Ohne Firma', stunden: 0, tage: new Set(), abw: 0 })
      e.stunden += h; if (datum) e.tage.add(datum)
    }
    for (const s of daten.schichten) if (s.ende) add(s.wocheKey, s.firma, (s.ende - s.start - (s.pausen || []).reduce((a, p) => a + ((p.ende || p.start) - p.start), 0) - (s.pauseMin || 0) * 6e4) / 36e5, s.datum)
    for (const a of daten.absenzen) { add(a.wocheKey, a.firma, 0, a.datum); eintraege[`${a.wocheKey}|${a.firma || einst.firma || 'Ohne Firma'}`] && (eintraege[`${a.wocheKey}|${a.firma || einst.firma || 'Ohne Firma'}`].abw += 1) }
    const status = Object.fromEntries(daten.wochen.map((w) => [w.key, w]))
    const jahre = {}
    for (const e of Object.values(eintraege)) {
      const w = ausKey(e.wKey)
      const st = status[`${e.wKey}|${e.firma}`] || status[e.wKey] || null
      const j = (jahre[w.jahr] ||= { jahr: w.jahr, monate: {}, anzahl: 0, offen: 0 })
      const mName = wochenMonat(w)
      const m = (j.monate[mName] ||= { name: mName, wochen: {}, anzahl: 0, offen: 0 })
      const wk = (m.wochen[e.wKey] ||= { wKey: e.wKey, woche: w, firmen: [] })
      const fertig = !!(st?.gesendetAm || st?.papierBilder?.length || st?.gespeichertAm)
      wk.firmen.push({ ...e, tage: e.tage.size, st, fertig })
      j.anzahl++; m.anzahl++
      if (!fertig && e.wKey < jetzt) { j.offen++; m.offen++ }
    }
    return Object.values(jahre).sort((a, b) => b.jahr - a.jahr).map((j) => ({
      ...j, monate: Object.values(j.monate).sort((a, b) => b.name.localeCompare(a.name)).map((m) => ({
        ...m, wochen: Object.values(m.wochen).sort((a, b) => b.wKey.localeCompare(a.wKey)),
      })),
    }))
  }, [daten, einst.firma, jetzt])

  async function oeffnen(wKey, firma, art) {
    setDatei({ laeuft: true, titel: '' })
    try {
      const woche = ausKey(wKey)
      const gruppen = await gruppenLaden(wKey, einst)
      const mehrere = gruppen.length > 1
      const g = gruppen.find((x) => x.firma === firma) || gruppen[0]
      const st = (await rapportStatus(wKey, firma, !mehrere)) || {}
      let d
      if (art === 'papier') d = { blob: fotosZuPdf(st.papierBilder), name: dateiName(einst, woche, mehrere ? firma : null, 'Rapport_unterschrieben') }
      else if (art === 'zeit') d = zeitnachweisDatei(g, woche, mehrere)
      else d = gruppenPdf(g, woche, st, mehrere)
      setDatei({ ...d, url: URL.createObjectURL(d.blob), titel: art === 'zeit' ? 'Zeitnachweis' : art === 'papier' ? 'Papier-Rapport (Foto)' : 'Rapport', woche, firma })
    } catch (e) { setDatei({ fehler: e.message || String(e) }) }
  }

  const gesamt = baum ? baum.reduce((a, j) => a + j.anzahl, 0) : 0
  const offenTotal = baum ? baum.reduce((a, j) => a + j.offen, 0) : 0

  return (
    <div className="space-y-4">
      <Link to="/kalender" className="text-sm text-white/65 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Kalender</Link>
      <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">Rapporte</h1>
      <div className="text-sm text-white/70">Alle Wochenrapporte, sortiert nach Jahr, Monat und Kalenderwoche. Antippen klappt auf; jede Datei wird aus deinen Einträgen frisch erstellt (mit den gespeicherten Unterschriften).</div>
      {baum && <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="glass rounded-2xl px-3 py-2"><div className="text-xs text-white/60">Rapporte</div><div className="text-xl font-bold tabular-nums">{gesamt}</div></div>
        <div className="glass rounded-2xl px-3 py-2"><div className="text-xs text-white/60">Noch nicht gesendet</div><div className={'text-xl font-bold tabular-nums ' + (offenTotal ? 'text-amber-300' : 'text-lime')}>{offenTotal}</div></div>
      </div>}
      {!baum && <div className="text-white/60 text-sm">Lade …</div>}
      {baum && !baum.length && <div className="text-white/60 text-sm">Noch keine Einträge.</div>}

      <div className="space-y-2">
        {baum?.map((j) => (
          <div key={j.jahr} className="glass rounded-3xl p-2">
            <Knoten offen={offen[j.jahr]} onClick={() => umschalten(String(j.jahr))} titel={String(j.jahr)} gross zahl={j.anzahl} warn={j.offen} />
            {offen[j.jahr] && <div className="pl-3 border-l border-white/10 ml-4 space-y-1">
              {j.monate.map((m) => {
                const mk = `${j.jahr}|${m.name}`
                return (
                  <div key={mk}>
                    <Knoten offen={offen[mk]} onClick={() => umschalten(mk)} titel={m.name.slice(3)} zahl={m.anzahl} warn={m.offen} />
                    {offen[mk] && <div className="pl-3 border-l border-white/10 ml-4 space-y-1">
                      {m.wochen.map((w) => {
                        const wk = `w|${w.wKey}`
                        const a = wochenStart(w.woche), b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6)
                        const alle = w.firmen.every((f) => f.fertig)
                        return (
                          <div key={wk}>
                            <button onClick={() => umschalten(wk)} className="w-full flex items-center gap-2 px-2 py-2.5 rounded-xl hover:bg-white/5 text-left">
                              <ChevronRight className={'w-4 h-4 shrink-0 transition ' + (offen[wk] ? 'rotate-90' : '')} />
                              <span className="font-semibold">KW {w.woche.kw}</span>
                              <span className="text-xs text-white/60 flex-1 truncate">{datumKurz(a)} – {datumKurz(b)}</span>
                              {alle ? <CheckCircle2 className="w-4 h-4 text-lime shrink-0" /> : w.wKey === jetzt ? <Clock3 className="w-4 h-4 text-sky-300 shrink-0" /> : <CircleDashed className="w-4 h-4 text-amber-300 shrink-0" />}
                            </button>
                            {offen[wk] && <div className="pl-3 border-l border-white/10 ml-4 space-y-2 pb-2">
                              {w.firmen.map((f) => (
                                <div key={f.firma} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <div className="font-semibold truncate">{f.firma}</div>
                                    <div className="text-sm tabular-nums text-white/75 shrink-0">{std(f.stunden)} h</div>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 text-xs">
                                    {f.st?.gesendetAm ? <Chip ok icon={CheckCircle2} text={`gesendet ${datumKurz(new Date(f.st.gesendetAm))}${f.st.gesendetAn ? ' an ' + f.st.gesendetAn : ''}`} />
                                      : f.st?.papierBilder?.length ? <Chip ok icon={CheckCircle2} text="Papier-Rapport abgegeben" />
                                      : w.wKey === jetzt ? <Chip icon={Clock3} text="laufende Woche" /> : <Chip warn icon={CircleDashed} text="noch nicht gesendet" />}
                                    {f.st?.firmaBild && <Chip ok icon={PenLine} text="vom Betrieb unterschrieben" />}
                                    {f.st?.abgelegtAm && <Chip ok icon={CloudUpload} text="in OneDrive" />}
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <DateiKnopf icon={FileText} text="Rapport" onClick={() => oeffnen(w.wKey, f.firma, 'rapport')} />
                                    {f.stunden > 0 && <DateiKnopf icon={Clock3} text="Zeitnachweis" onClick={() => oeffnen(w.wKey, f.firma, 'zeit')} />}
                                    {f.st?.papierBilder?.length > 0 && <DateiKnopf icon={ImageIcon} text="Papier-Foto" onClick={() => oeffnen(w.wKey, f.firma, 'papier')} />}
                                    <Link to={`/woche/${w.wKey}`} className="rounded-xl py-2.5 px-2 bg-white/[0.06] text-sm inline-flex items-center justify-center gap-1.5"><CalendarDays className="w-4 h-4" /> Woche</Link>
                                  </div>
                                </div>
                              ))}
                            </div>}
                          </div>
                        )
                      })}
                    </div>}
                  </div>
                )
              })}
            </div>}
          </div>
        ))}
      </div>

      {datei && (
        <Sheet titel={datei.titel || 'Datei'} icon={FileText} onClose={() => { if (datei.url) URL.revokeObjectURL(datei.url); setDatei(null) }}>
          {datei.laeuft && <div className="text-sm text-white/70 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Wird erstellt …</div>}
          {datei.fehler && <div className="text-sm text-ember">{datei.fehler}</div>}
          {datei.url && (
            <div className="space-y-3">
              <div className="text-sm text-white/75 break-all">{datei.name}</div>
              <div className="grid grid-cols-2 gap-2">
                <a href={datei.url} target="_blank" rel="noreferrer" className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Eye className="w-5 h-5" /> Ansehen</a>
                <button onClick={() => teileDatei(datei.blob, datei.name).catch(() => {})} className="rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-2"><Share2 className="w-5 h-5" /> Teilen / Sichern</button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}

function Knoten({ offen, onClick, titel, zahl, warn, gross }) {
  const Icon = offen ? FolderOpen : Folder
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2 py-2.5 rounded-xl hover:bg-white/5 text-left min-h-[44px]">
      <ChevronRight className={'w-4 h-4 shrink-0 transition ' + (offen ? 'rotate-90' : '')} />
      <Icon className="w-5 h-5 shrink-0 text-amber-300" />
      <span className={'flex-1 truncate ' + (gross ? 'text-lg font-bold' : 'font-semibold')}>{titel}</span>
      {warn > 0 && <span className="text-xs rounded-full px-2 py-0.5 bg-amber-400/15 text-amber-300 shrink-0">{warn} offen</span>}
      <span className="text-xs text-white/60 tabular-nums shrink-0">{zahl}</span>
    </button>
  )
}

const Chip = ({ icon: Icon, text, ok, warn }) => (
  <span className={'rounded-full px-2 py-1 inline-flex items-center gap-1 border ' + (ok ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300' : warn ? 'bg-amber-400/10 border-amber-400/30 text-amber-300' : 'bg-white/5 border-white/15 text-white/70')}>
    <Icon className="w-3.5 h-3.5" /> {text}
  </span>
)

const DateiKnopf = ({ icon: Icon, text, onClick }) => (
  <button onClick={onClick} className="rounded-xl py-2.5 px-2 bg-white/[0.06] text-sm inline-flex items-center justify-center gap-1.5"><Icon className="w-4 h-4" /> {text}</button>
)
