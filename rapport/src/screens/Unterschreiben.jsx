import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Loader2, CheckCircle2, AlertTriangle, Timer, PenLine, MessageSquareWarning } from 'lucide-react'
import Unterschrift from '../components/Unterschrift'
import { signaturLesen, signaturAntworten } from '../lib/signatur'
import { rapportPdf } from '../lib/pdf'
import { wochenTage, isoDatum, TAGE, datumKurz, datumLang, uhr, pauseMs, arbeitMs, hm } from '../lib/zeit'
import { absenzArt } from '../lib/arten'
import { wochenRechnung, std } from '../lib/woche'
import { zahl } from '../lib/settings'

/** Öffentliche Seite für den Polier/Vorarbeiter (per QR-Code): Rapport ansehen und unterschreiben — ohne Konto */
export default function Unterschreiben() {
  const { token } = useParams()
  const [d, setD] = useState(null), [fehler, setFehler] = useState('')
  const [bild, setBild] = useState(null), [name, setName] = useState('')
  const [nein, setNein] = useState(false), [bemerkung, setBemerkung] = useState('')
  const [sende, setSende] = useState(false), [fertig, setFertig] = useState(null)

  useEffect(() => {
    signaturLesen(token).then((r) => {
      setD(r.daten)
      if (r.status !== 'offen') setFertig(r.status)
    }).catch((e) => setFehler(e.message))
  }, [token])

  const pdfUrl = useMemo(() => {
    if (!d) return null
    return URL.createObjectURL(rapportPdf({ einst: d.einst, woche: d.woche, schichten: d.schichten, absenzen: d.absenzen, spesen: d.spesen, einsatz: d.einsatz }))
  }, [d])

  async function senden(einverstanden) {
    setSende(true); setFehler('')
    try {
      await signaturAntworten(token, einverstanden ? { einverstanden: true, bild, name } : { einverstanden: false, name, bemerkung })
      setFertig(einverstanden ? 'unterschrieben' : 'abgelehnt')
    } catch (e) { setFehler(e.message) } finally { setSende(false) }
  }

  const rahmen = (inhalt) => (
    <div className="min-h-[100dvh] px-4 py-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-2.5 text-white/70">
        <div className="w-9 h-9 rounded-xl btn-grad flex items-center justify-center"><Timer className="w-5 h-5" strokeWidth={2.2} /></div>
        <span className="font-bold">Arbeitsrapport bestätigen</span>
      </div>
      {inhalt}
    </div>
  )

  if (fehler && !d) return rahmen(<div className="rounded-2xl p-4 bg-ember/15 border border-ember/30 text-ember flex gap-2"><AlertTriangle className="w-5 h-5 shrink-0" /> {fehler}</div>)
  if (!d) return rahmen(<div className="text-white/50 inline-flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Rapport wird geladen …</div>)
  if (fertig) return rahmen(
    <div className="glass rounded-3xl p-6 text-center space-y-3">
      <CheckCircle2 className="w-12 h-12 mx-auto text-mint" />
      <div className="text-xl font-bold">{fertig === 'unterschrieben' ? 'Danke, der Rapport ist unterschrieben.' : 'Danke, Ihre Bemerkung wurde übermittelt.'}</div>
      <div className="text-sm text-white/55">{d.einst.name} erhält die Antwort automatisch. Sie können diese Seite schliessen.</div>
    </div>,
  )

  const tage = wochenTage(d.woche)
  const total = wochenRechnung({ schichten: d.schichten, absenzen: d.absenzen, einst: d.einst }).total
  return rahmen(
    <>
      <section className="glass rounded-3xl p-5 space-y-1">
        <div className="text-2xl font-extrabold grad-text">KW {d.woche.kw} / {d.woche.jahr}</div>
        <div className="text-sm text-white/50">{datumLang(tage[0])} – {datumLang(tage[6])}</div>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-3 text-sm">
          <span className="text-white/45">Mitarbeiter</span><b>{d.einst.name}</b>
          <span className="text-white/45">Einsatzbetrieb</span><b>{d.firma}</b>
          <span className="text-white/45">Temporärbüro</span><span>{d.einst.buero || '—'}</span>
          {d.einsatz?.einsatznummer && <><span className="text-white/45">Einsatz-Nr.</span><span>{d.einsatz.einsatznummer}</span></>}
        </div>
      </section>

      <section className="glass rounded-3xl p-4">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="text-white/40 text-xs text-left"><th className="pb-2">Tag</th><th>Beginn</th><th>Ende</th><th>Pause</th><th className="text-right">Std.</th></tr></thead>
          <tbody>
            {tage.map((t) => {
              const iso = isoDatum(t)
              const s = d.schichten.filter((x) => x.datum === iso && x.ende != null).sort((a, b) => a.start - b.start)
              const a = d.absenzen.filter((x) => x.datum === iso)
              if (!s.length && !a.length) return <tr key={iso} className="text-white/25 border-t border-white/5"><td className="py-1.5">{TAGE[t.getDay()]} {datumKurz(t)}</td><td colSpan={4}>–</td></tr>
              return [
                ...a.map((x, i) => <tr key={iso + 'a' + i} className="border-t border-white/5"><td className="py-1.5">{TAGE[t.getDay()]} {datumKurz(t)}</td><td colSpan={3} className="text-white/70">{absenzArt(x.art).label}{x.halbtag ? ' (½)' : ''}</td><td className="text-right">{std(zahl(x.stunden))}</td></tr>),
                ...s.map((x, i) => <tr key={iso + 's' + i} className="border-t border-white/5"><td className="py-1.5">{TAGE[t.getDay()]} {datumKurz(t)}</td><td>{uhr(x.start)}</td><td>{uhr(x.ende)}</td><td>{hm(pauseMs(x))}</td><td className="text-right font-semibold">{hm(arbeitMs(x))}</td></tr>),
              ]
            })}
          </tbody>
          <tfoot><tr className="border-t border-white/15 font-bold"><td className="pt-2" colSpan={4}>Total</td><td className="pt-2 text-right">{std(total)} h</td></tr></tfoot>
        </table>
        {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-white/70 underline"><FileText className="w-4 h-4" /> Rapport als PDF ansehen</a>}
      </section>

      {!nein ? (
        <section className="glass rounded-3xl p-5 space-y-3">
          <div className="font-bold flex items-center gap-2"><PenLine className="w-5 h-5 text-aqua" /> Unterschrift Einsatzbetrieb</div>
          <input className="eingabe" placeholder="Ihr Name (z.B. Polier, Vorarbeiter)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <Unterschrift wert={bild} onChange={setBild} hoehe={170} />
          <button onClick={() => senden(true)} disabled={!bild || !name.trim() || sende}
            className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {sende ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Rapport bestätigen & unterschreiben
          </button>
          <button onClick={() => setNein(true)} className="w-full text-sm text-white/45 inline-flex items-center justify-center gap-1.5"><MessageSquareWarning className="w-4 h-4" /> Nicht einverstanden</button>
        </section>
      ) : (
        <section className="glass rounded-3xl p-5 space-y-3">
          <div className="font-bold">Was stimmt nicht?</div>
          <input className="eingabe" placeholder="Ihr Name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="eingabe min-h-[110px]" placeholder="z.B. Dienstag erst um 07:30 begonnen" value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />
          <button onClick={() => senden(false)} disabled={!bemerkung.trim() || sende} className="w-full rounded-2xl py-3 font-bold bg-white/10 disabled:opacity-40">Bemerkung senden</button>
          <button onClick={() => setNein(false)} className="w-full text-sm text-white/45">Zurück</button>
        </section>
      )}
      {fehler && <div className="text-sm text-ember">{fehler}</div>}
      <div className="text-xs text-white/30 text-center">Die Angaben werden nur für diese Bestätigung übermittelt und danach gelöscht.</div>
    </>,
  )
}
