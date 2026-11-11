import { useLiveQuery } from 'dexie-react-hooks'
import { Clock, CheckCircle2, AlertTriangle, ShieldAlert, X } from 'lucide-react'
import { db } from '../lib/db'

const kw = (key) => +String(key).split('|')[0].slice(-2)
const wk = (key) => String(key).split('|')[0]

/** Hinweise zu vorab verschickten Rapporten (Fern-Unterschrift) auf „Heute“ */
export default function FernHinweise({ onOeffnen }) {
  const liste = useLiveQuery(() => db.wochen.filter((w) => !!w.fern?.token && !w.fern.gesehen).toArray(), [], [])
  if (!liste?.length) return null
  const gesehen = (s) => db.wochen.put({ ...s, fern: { ...s.fern, gesehen: true } })
  return (
    <div className="space-y-2">
      {liste.map((s) => {
        const f = s.fern
        if (!f.erledigt) return f.gesendetAm ? (
          <div key={s.key} className="rounded-3xl p-4 flex gap-3 bg-sky-400/10 border border-sky-400/30 text-sky-100">
            <Clock className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm"><b>Rapport KW {kw(s.key)}</b> wartet auf die Unterschrift von {f.an || 'Einsatzbetrieb'}. Danach geht er automatisch ans Büro.</div>
          </div>
        ) : null
        if (f.abgelehnt) return (
          <button key={s.key} onClick={() => onOeffnen(wk(s.key))} className="w-full text-left rounded-3xl p-4 flex gap-3 bg-amber-400/10 border border-amber-400/30 text-amber-200">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm"><b>{f.abgelehnt.name || 'Der Einsatzbetrieb'}</b> ist mit KW {kw(s.key)} nicht einverstanden{f.abgelehnt.bemerkung ? `: „${f.abgelehnt.bemerkung}“` : '.'} Zeiten korrigieren und neu senden.</div>
          </button>
        )
        if (f.bestaetigen && !(s.abgeschlossenAm > f.unterschriebenAm)) return (
          <button key={s.key} onClick={() => onOeffnen(wk(s.key))} className="w-full text-left rounded-3xl p-4 flex gap-3 bg-amber-400/10 border border-amber-400/30 text-amber-200">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm"><b>{s.firmaName || 'Jemand'}</b> hat KW {kw(s.key)} unterschrieben, ist aber nicht als unterschriftsberechtigt eingetragen. Antippen, bestätigen und senden.</div>
          </button>
        )
        return (
          <div key={s.key} className={'rounded-3xl p-4 flex gap-3 border ' + (s.fehler || f.ohneMicrosoft ? 'bg-amber-400/10 border-amber-400/30 text-amber-200' : 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200')}>
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <b>KW {kw(s.key)}</b> von {s.firmaName || 'Einsatzbetrieb'} unterschrieben.{' '}
              {f.ohneMicrosoft ? 'Microsoft ist nicht verbunden — bitte selbst senden.' : s.fehler ? `Versand: ${s.fehler}` : `Gesendet${s.gesendetAn ? ' an ' + s.gesendetAn : ''}${s.gespeichertAm ? ' und in OneDrive abgelegt' : ''}.`}
              <button onClick={() => onOeffnen(wk(s.key))} className="block mt-1 underline">{s.fehler || f.ohneMicrosoft ? 'Öffnen und senden' : 'Öffnen (z.B. WhatsApp an den Berater)'}</button>
            </div>
            <button onClick={() => gesehen(s)} className="self-start opacity-60" aria-label="Ausblenden"><X className="w-4 h-4" /></button>
          </div>
        )
      })}
    </div>
  )
}
