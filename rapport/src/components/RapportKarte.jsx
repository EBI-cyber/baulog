import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Send, CloudUpload, FileText, CheckCircle2, MessageCircle, Building2 } from 'lucide-react'
import { wocheMarkieren } from '../lib/db'
import { rapportPdf, dateiName } from '../lib/pdf'
import { teileDatei, whatsappLink } from '../lib/teilen'
import { rapportStatus, statusKey } from '../lib/rapporte'
import { wochenRechnung, std } from '../lib/woche'
import { datumKurz, uhr } from '../lib/zeit'
import IconChip from '../ui/IconChip'

const zeitpunkt = (ts) => `${datumKurz(new Date(ts))} ${uhr(ts)}`

/** Rapport einer Firma für eine Woche: PDF vorab erzeugen (iOS teilt nur direkt im Klick), senden, sichern */
export default function RapportKarte({ g, woche, wKey, mehrere }) {
  const status = useLiveQuery(() => rapportStatus(wKey, g.firma, !mehrere), [wKey, g.firma, mehrere], null)
  const [meldung, setMeldung] = useState(null)
  const pdf = useMemo(() => rapportPdf({ einst: g.einst, woche, schichten: g.schichten, absenzen: g.absenzen, spesen: g.spesen }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify([g.schichten, g.absenzen, g.spesen, g.einst]), wKey])
  const name = dateiName(g.einst, woche, mehrere ? g.firma : null)
  const [url, setUrl] = useState(null)
  useEffect(() => { const u = URL.createObjectURL(pdf); setUrl(u); return () => URL.revokeObjectURL(u) }, [pdf])
  const total = wochenRechnung({ schichten: g.schichten, absenzen: g.absenzen, einst: g.einst }).total

  async function teilen(feld, ok) {
    setMeldung(null)
    try {
      const r = await teileDatei(pdf, name)
      if (r === 'abgebrochen') return
      await wocheMarkieren(statusKey(wKey, g.firma), feld)
      setMeldung({ ok: true, text: r === 'heruntergeladen' ? 'PDF wurde heruntergeladen.' : ok })
    } catch (e) {
      setMeldung({ ok: false, text: 'Teilen fehlgeschlagen: ' + (e?.message || e) })
    }
  }

  return (
    <section className="glass rounded-3xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <IconChip icon={FileText} />
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">Rapport {g.firma}</div>
          <div className="text-xs text-white/45 truncate flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" /> an {g.buero || 'Temporärbüro (in Einsatz eintragen)'} · {std(total)} h</div>
        </div>
      </div>
      <button onClick={() => teilen('gesendetAm', 'Rapport geteilt — als gesendet markiert.')}
        className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2">
        <Send className="w-5 h-5" /> Ans Büro senden (WhatsApp)
      </button>
      <button onClick={() => teilen('gespeichertAm', 'Rapport gesichert.')}
        className="w-full rounded-2xl py-3.5 font-semibold bg-white/10 inline-flex items-center justify-center gap-2">
        <CloudUpload className="w-5 h-5" /> In OneDrive sichern
      </button>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className={'w-3.5 h-3.5 ' + (status?.gesendetAm ? 'text-mint' : 'text-white/20')} />
          {status?.gesendetAm ? `Gesendet ${zeitpunkt(status.gesendetAm)}` : 'Noch nicht gesendet'}
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className={'w-3.5 h-3.5 ' + (status?.gespeichertAm ? 'text-mint' : 'text-white/20')} />
          {status?.gespeichertAm ? `Gesichert ${zeitpunkt(status.gespeichertAm)}` : 'Noch nicht gesichert'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {url && <a href={url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full text-xs border border-white/15 text-white/70 inline-flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Vorschau
        </a>}
        {g.bueroTel && <a href={whatsappLink(g.bueroTel, `Hallo${g.einsatz?.bueroKontakt ? ' ' + g.einsatz.bueroKontakt : ''}, anbei mein Rapport KW ${woche.kw}/${woche.jahr} für ${g.firma} (${std(total)} h). Gruss ${g.einst.name}`)}
          target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full text-xs border border-white/15 text-white/70 inline-flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5" /> Chat mit {g.einsatz?.bueroKontakt || g.buero || 'Büro'}
        </a>}
      </div>
      {meldung && <div className={'text-sm rounded-xl px-3 py-2 border ' + (meldung.ok ? 'bg-lime/15 border-lime/30 text-lime' : 'bg-ember/15 border-ember/30 text-ember')}>{meldung.text}</div>}
    </section>
  )
}
