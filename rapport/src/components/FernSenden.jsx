import { useState } from 'react'
import { Send, MessageCircle, Mail, Share2, Loader2, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { fernVorbereiten, fernText, fernGesendet } from '../lib/fernsignatur'
import { zeitnachweisDatei } from '../lib/versand'
import { whatsappLink, teileDatei } from '../lib/teilen'
import { msVerbunden, msVersand } from '../lib/microsoft'
import { kiVerfuegbar } from '../lib/ki'

const zeit = (ts) => new Date(ts).toLocaleString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * „Zur Kontrolle senden“: Link + Zeitnachweis an den Unterzeichner (WhatsApp oder E-Mail).
 * Er unterschreibt später auf seinem Handy; die App holt das ab und sendet dann automatisch ans Büro.
 */
export default function FernSenden({ g, woche, wKey, ma, wer, setWer, ort, eb, einst, status, mehrere }) {
  const [vorb, setVorb] = useState(null) // { link, text }
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState(null)
  if (!kiVerfuegbar) return null
  const fern = status?.fern
  const zn = () => zeitnachweisDatei(g, woche, mehrere)

  async function vorbereiten() {
    setLaeuft(true); setMeldung(null)
    try {
      const { link } = await fernVorbereiten({ g, woche, wKey, ma, wer, maOrt: ort, eb })
      setVorb({ link, text: fernText({ einst, woche, an: wer.name, link }) })
    } catch (e) { setMeldung({ ok: false, text: e.message }) }
    setLaeuft(false)
  }
  async function perMail() {
    setLaeuft(true); setMeldung(null)
    try {
      const r = await msVersand({ datei: zn(), mail: { an: wer.email, betreff: `Arbeitszeiten KW ${woche.kw}/${woche.jahr} zur Kontrolle – ${einst.name || ''}`, text: vorb.text } })
      if (r.mail && !r.mail.ok) throw new Error(r.mail.fehler)
      await fernGesendet(wKey, g.firma, 'email')
      setMeldung({ ok: true, text: `Per E-Mail an ${wer.email} gesendet.` })
    } catch (e) { setMeldung({ ok: false, text: 'E-Mail: ' + e.message }) }
    setLaeuft(false)
  }

  // schon vorab geschickt und noch offen
  if (fern?.gesendetAm && !fern.erledigt && !vorb) return (
    <div className="rounded-2xl px-3 py-2.5 bg-sky-400/10 border border-sky-400/30 text-sky-200 text-sm space-y-1.5">
      <div className="flex gap-2"><Clock className="w-4 h-4 shrink-0 mt-0.5" />
        <div>Zur Kontrolle gesendet an <b>{fern.an || 'Einsatzbetrieb'}</b> ({fern.kanal === 'email' ? 'E-Mail' : 'WhatsApp'}, {zeit(fern.gesendetAm)}). Sobald unterschrieben ist, sendet die App automatisch ans Büro.</div></div>
      <button type="button" onClick={vorbereiten} className="text-xs underline text-sky-100/80">Nochmals senden</button>
    </div>
  )

  return (
    <div className="rounded-2xl border border-white/10 p-3 space-y-2">
      <div className="text-sm font-semibold flex items-center gap-2"><Send className="w-4 h-4 text-aqua" /> Vorab zur Kontrolle senden</div>
      <div className="text-xs text-white/50">{wer?.name || 'Der Unterzeichner'} bekommt deine Zeiten mit Pausen (und den Zeitnachweis) und unterschreibt auf seinem Handy, z.B. Montag früh. Danach geht der Rapport automatisch ans Büro und in deinen OneDrive-Ordner.</div>
      {!vorb ? <>
        {!wer?.id && <div className="grid grid-cols-2 gap-2">
          <input className="eingabe !py-2 text-sm" placeholder="WhatsApp-Nr." value={wer?.tel || ''} onChange={(e) => setWer({ ...wer, tel: e.target.value })} />
          <input className="eingabe !py-2 text-sm" placeholder="E-Mail" value={wer?.email || ''} onChange={(e) => setWer({ ...wer, email: e.target.value })} />
        </div>}
        <button type="button" disabled={!ma?.bild || laeuft} onClick={vorbereiten}
          className="w-full rounded-2xl py-2.5 bg-white/10 font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40">
          {laeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Link für {wer?.name || 'den Unterzeichner'} erstellen
        </button>
        {!ma?.bild && <div className="text-xs text-white/40 text-center">Zuerst selbst unterschreiben.</div>}
      </> : <>
        <div className="grid grid-cols-1 gap-2">
          {wer?.tel && <a href={whatsappLink(wer.tel, vorb.text)} target="_blank" rel="noreferrer" onClick={() => fernGesendet(wKey, g.firma, 'whatsapp')}
            className="rounded-2xl py-2.5 font-semibold text-sm btn-grad inline-flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> WhatsApp an {wer.name || wer.tel}</a>}
          {wer?.email && (msVerbunden()
            ? <button type="button" onClick={perMail} disabled={laeuft} className="rounded-2xl py-2.5 font-semibold text-sm bg-white/10 inline-flex items-center justify-center gap-2">{laeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} E-Mail mit Zeitnachweis an {wer.email}</button>
            : <a href={`mailto:${wer.email}?subject=${encodeURIComponent(`Arbeitszeiten KW ${woche.kw}/${woche.jahr} zur Kontrolle`)}&body=${encodeURIComponent(vorb.text)}`} onClick={() => fernGesendet(wKey, g.firma, 'email')}
              className="rounded-2xl py-2.5 font-semibold text-sm bg-white/10 inline-flex items-center justify-center gap-2"><Mail className="w-4 h-4" /> E-Mail an {wer.email}</a>)}
          {navigator.share && <button type="button" onClick={() => navigator.share({ text: vorb.text }).then(() => fernGesendet(wKey, g.firma, 'teilen')).catch(() => {})}
            className="rounded-2xl py-2.5 text-sm bg-white/[0.06] border border-white/10 inline-flex items-center justify-center gap-2"><Share2 className="w-4 h-4" /> Anders teilen (Kontakt wählen) …</button>}
          <button type="button" onClick={() => teileDatei(zn().blob, zn().name).catch(() => {})} className="py-1.5 text-xs text-white/50 underline">Zeitnachweis-PDF zusätzlich schicken</button>
        </div>
      </>}
      {meldung && <div className={'text-xs flex gap-1.5 ' + (meldung.ok ? 'text-emerald-300' : 'text-ember')}>{meldung.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{meldung.text}</div>}
    </div>
  )
}
