import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Loader2, CheckCircle2, AlertTriangle, Timer, PenLine, MessageSquareWarning, Download, Mail, Phone } from 'lucide-react'
import Unterschrift from '../components/Unterschrift'
import { signaturLesen, signaturAntworten } from '../lib/signatur'
import { rapportPdf } from '../lib/pdf'
import { wochenTage, isoDatum, TAGE, datumKurz, datumLang, uhr, pauseMs, arbeitMs, hm } from '../lib/zeit'
import { absenzArt } from '../lib/arten'
import { wochenRechnung, std } from '../lib/woche'
import { zahl } from '../lib/settings'
import { FUNKTIONEN, unterzeichnerText } from '../lib/unterschreiber'

/** Öffentliche Seite für den Polier/Vorarbeiter (per QR-Code): Rapport ansehen und unterschreiben — ohne Konto */
export default function Unterschreiben() {
  const { token } = useParams()
  // neuer Link → alles frisch (kein alter Zustand aus einem vorherigen Rapport)
  return <Inhalt key={token} token={token} />
}

function Inhalt({ token }) {
  const [d, setD] = useState(null), [fehler, setFehler] = useState('')
  const [bild, setBild] = useState(null), [name, setName] = useState('')
  const [nein, setNein] = useState(false), [bemerkung, setBemerkung] = useState('')
  const [sende, setSende] = useState(false), [fertig, setFertig] = useState(null)
  const [email, setEmail] = useState(''), [tel, setTel] = useState('')
  const [wer, setWer] = useState(null) // id einer bekannten Person | 'neu'
  const [funktion, setFunktion] = useState('')
  const [durchschlag, setDurchschlag] = useState(null) // Blob-URL des PDFs mit beiden Unterschriften

  useEffect(() => {
    signaturLesen(token).then((r) => {
      setD(r.daten)
      if (r.status !== 'offen') setFertig(r.status)
      if (!(r.daten?.unterschreiber || []).length) setWer('neu')
    }).catch((e) => setFehler(e.message))
  }, [token])

  const bekannte = d?.unterschreiber || []
  const haupt = bekannte.find((x) => x.standard) || null
  const gewaehlt = bekannte.find((x) => x.id === wer)
  const nameOk = gewaehlt || (wer === 'neu' && name.trim() && funktion)

  const pdfUrl = useMemo(() => {
    if (!d) return null
    return URL.createObjectURL(rapportPdf({ einst: d.einst, woche: d.woche, schichten: d.schichten, absenzen: d.absenzen, spesen: d.spesen, einsatz: d.einsatz }))
  }, [d])

  async function senden(einverstanden) {
    setSende(true); setFehler('')
    try {
      const person = bekannte.find((x) => x.id === wer)
      const n = person ? person.name : name.trim(), fn = person ? person.funktion : funktion
      await signaturAntworten(token, einverstanden
        ? { einverstanden: true, bild, name: n, funktion: fn, unterschreiberId: person?.id || null, email, tel }
        : { einverstanden: false, name: n, funktion: fn, bemerkung })
      if (einverstanden) {
        // Durchschlag sofort: PDF mit beiden Unterschriften, hier auf dem Handy erzeugt
        const blob = rapportPdf({ einst: d.einst, woche: d.woche, schichten: d.schichten, absenzen: d.absenzen, spesen: d.spesen, einsatz: d.einsatz,
          unterschriften: { maBild: d.ma?.bild, maAm: d.ma?.am, firmaBild: bild, firmaName: n, firmaFunktion: fn, firmaAm: Date.now(),
            vertretungFuer: haupt && haupt.id !== person?.id ? haupt.name : null } })
        setDurchschlag(URL.createObjectURL(blob))
      }
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
      <div className="text-sm text-white/55">{d.einst.name} erhält die Antwort automatisch.
        {fertig === 'unterschrieben' && (email || tel) ? ` Ihr Durchschlag kommt ${[email && 'per E-Mail', tel && 'per WhatsApp'].filter(Boolean).join(' und ')}, sobald ${d.einst.name} den Rapport abschliesst.` : ''}</div>
      {durchschlag && <a href={durchschlag} download={`Rapport_KW${d.woche.kw}_${d.woche.jahr}_${d.einst.name || ''}.pdf`.replace(/\s+/g, '_')}
        className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2"><Download className="w-5 h-5" /> Durchschlag jetzt speichern (PDF)</a>}
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
          <div className="text-sm text-white/60">Wer unterschreibt?</div>
          <div className="flex flex-wrap gap-2">
            {bekannte.map((x) => (
              <button key={x.id} type="button" onClick={() => setWer(x.id)}
                className={'px-3 py-2 rounded-xl text-sm border text-left ' + (wer === x.id ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/75')}>
                {x.name}<span className="block text-[11px] opacity-70">{x.funktion}</span>
              </button>
            ))}
            <button type="button" onClick={() => setWer('neu')}
              className={'px-3 py-2 rounded-xl text-sm border ' + (wer === 'neu' ? 'btn-grad border-transparent font-semibold' : 'border-dashed border-white/25 text-white/60')}>
              {bekannte.length ? 'Jemand anderes' : 'Name eingeben'}
            </button>
          </div>
          {wer === 'neu' && <>
            <input className="eingabe" placeholder="Vor- und Nachname" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <div className="flex flex-wrap gap-1.5">
              {FUNKTIONEN.map((fn) => (
                <button key={fn} type="button" onClick={() => setFunktion(fn)}
                  className={'px-2.5 py-1 rounded-full text-xs border ' + (funktion === fn ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/60')}>{fn}</button>
              ))}
            </div>
          </>}
          {haupt && wer && wer !== haupt.id && (
            <div className="text-xs rounded-xl px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-200">
              Sie unterschreiben in Vertretung von <b>{haupt.name}</b> ({haupt.funktion}). {haupt.name} erhält eine Kopie.
            </div>
          )}
          <Unterschrift wert={bild} onChange={setBild} hoehe={170} />
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
            <div className="text-sm font-semibold">Durchschlag für Sie — wohin?</div>
            {gewaehlt && (gewaehlt.hatEmail || gewaehlt.hatTel) && <div className="text-xs text-white/45">Bereits hinterlegt ({[gewaehlt.hatEmail && 'E-Mail', gewaehlt.hatTel && 'WhatsApp'].filter(Boolean).join(' + ')}). Nur ausfüllen, wenn es sich geändert hat.</div>}
            <div className="relative"><Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input className="eingabe pl-9" type="email" inputMode="email" autoComplete="email" placeholder="E-Mail (optional)" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="relative"><Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input className="eingabe pl-9" type="tel" inputMode="tel" autoComplete="tel" placeholder="WhatsApp-Nummer (optional)" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
            <div className="text-xs text-white/35">{d.einst.name} merkt sich diese Angaben für den nächsten Rapport.</div>
          </div>
          <button onClick={() => senden(true)} disabled={!bild || !nameOk || sende}
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
