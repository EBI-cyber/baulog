import { useMemo, useState } from 'react'
import { ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle, Info, AlertTriangle, ChevronDown, Send, MessageCircle, Copy } from 'lucide-react'
import { vertragPruefen, vertragNachricht } from '../lib/vertragscheck'
import { useMs, msVersand } from '../lib/microsoft'
import { whatsappLink } from '../lib/teilen'

const URTEIL = {
  gut: { icon: ShieldCheck, titel: 'Guter Vertrag', farbe: 'bg-lime/10 border-lime/35 text-lime', text: 'Keine Mängel bei den geprüften Punkten.' },
  pruefenswert: { icon: ShieldAlert, titel: 'Prüfenswert', farbe: 'bg-amber-400/10 border-amber-400/40 text-amber-300', text: 'Einige Punkte solltest du vor dem Unterschreiben klären.' },
  problematisch: { icon: ShieldX, titel: 'Problematisch', farbe: 'bg-ember/12 border-ember/45 text-ember', text: 'Der Vertrag enthält Mängel — vor dem Unterschreiben korrigieren lassen.' },
}
const ICON = { ok: [CheckCircle2, 'text-lime'], fehler: [XCircle, 'text-ember'], warnung: [AlertTriangle, 'text-amber-300'], info: [Info, 'text-white/45'] }

/** Vertrags-Check im Einsatz: Urteil, Punkte mit Quelle und Korrektur, Anfrage ans Büro */
export default function VertragsCheck({ e, einst }) {
  const ms = useMs()
  const { urteil, punkte } = useMemo(() => vertragPruefen(e, einst), [e, einst])
  const [offen, setOffen] = useState(urteil !== 'gut')
  const [alleOk, setAlleOk] = useState(false)
  const [text, setText] = useState(null)
  const [status, setStatus] = useState('')
  const U = URTEIL[urteil]
  const maengel = punkte.filter((p) => p.status === 'fehler' || p.status === 'warnung')
  const sichtbar = punkte.filter((p) => alleOk || p.status !== 'ok')
  const gruppen = [...new Set(sichtbar.map((p) => p.gruppe))]

  return (
    <div className={'rounded-2xl border p-3 space-y-2 ' + U.farbe}>
      <button type="button" onClick={() => setOffen(!offen)} className="w-full flex items-center gap-3 text-left">
        <U.icon className="w-7 h-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-bold">Vertrags-Check: {U.titel}</div>
          <div className="text-xs text-white/60">{U.text} {maengel.length ? `${maengel.length} Punkt${maengel.length > 1 ? 'e' : ''} zu klären.` : ''}</div>
        </div>
        <ChevronDown className={'w-4 h-4 text-white/50 transition ' + (offen ? 'rotate-180' : '')} />
      </button>
      {offen && (
        <div className="space-y-2 text-white">
          {gruppen.map((g) => (
            <div key={g} className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-white/40 pt-1">{g}</div>
              {sichtbar.filter((p) => p.gruppe === g).map((p) => {
                const [I, f] = ICON[p.status]
                return (
                  <div key={p.id} className="rounded-xl bg-black/20 border border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold"><I className={'w-4 h-4 shrink-0 ' + f} /> <span className="min-w-0">{p.titel}</span></div>
                    {p.text && <div className="text-xs text-white/65 mt-0.5">{p.text}</div>}
                    {p.quelle && <div className="text-[11px] text-white/35 mt-0.5">{p.quelle}</div>}
                  </div>
                )
              })}
            </div>
          ))}
          <button type="button" onClick={() => setAlleOk(!alleOk)} className="text-xs text-white/50 underline">{alleOk ? 'Nur offene Punkte zeigen' : `Auch die ${punkte.filter((p) => p.status === 'ok').length} erfüllten Punkte zeigen`}</button>
          {maengel.length > 0 && text == null && (
            <button type="button" onClick={() => setText(vertragNachricht({ e, einst, punkte: maengel }))}
              className="w-full rounded-xl py-2.5 btn-grad text-sm font-bold inline-flex items-center justify-center gap-2"><Send className="w-4 h-4" /> Korrekturen beim Büro anfragen</button>
          )}
          {text != null && (
            <div className="space-y-2">
              <textarea className="eingabe min-h-[180px] text-sm" value={text} onChange={(x) => setText(x.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                {ms.refreshToken && e?.bueroEmail ? (
                  <button type="button" onClick={async () => {
                    try { const r = await msVersand({ datei: null, mail: { an: e.bueroEmail, cc: einst.kopieAnMich ? ms.konto : '', betreff: `Einsatzvertrag ${e.einsatznummer || e.firma || ''} — Rückfragen`, text } }); setStatus(r.mail?.ok ? `Gesendet an ${e.bueroEmail}` : `Fehler: ${r.mail?.fehler}`) }
                    catch (x) { setStatus('Fehler: ' + x.message) }
                  }} className="rounded-xl py-2 btn-grad text-xs font-bold inline-flex items-center justify-center gap-1"><Send className="w-3.5 h-3.5" /> E-Mail</button>
                ) : <a href={`mailto:${e?.bueroEmail || ''}?subject=${encodeURIComponent('Einsatzvertrag — Rückfragen')}&body=${encodeURIComponent(text)}`} className="rounded-xl py-2 btn-grad text-xs font-bold inline-flex items-center justify-center gap-1"><Send className="w-3.5 h-3.5" /> E-Mail</a>}
                <a href={whatsappLink(e?.bueroTel || '', text)} target="_blank" rel="noreferrer" className="rounded-xl py-2 bg-white/10 text-xs font-semibold inline-flex items-center justify-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(text); setStatus('Text kopiert') }} className="rounded-xl py-2 bg-white/10 text-xs font-semibold inline-flex items-center justify-center gap-1"><Copy className="w-3.5 h-3.5" /> Kopieren</button>
              </div>
              {status && <div className="text-xs text-lime">{status}</div>}
            </div>
          )}
          <div className="text-[11px] text-white/35">Automatische Prüfung, keine Rechtsberatung. Verbindlich helfen Gewerkschaften (Unia, Syna), die paritätische Kommission Personalverleih oder das kantonale Arbeitsinspektorat.</div>
        </div>
      )}
    </div>
  )
}
