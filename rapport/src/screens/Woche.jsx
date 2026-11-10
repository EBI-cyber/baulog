import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Send, CloudUpload, FileText, Plus, CheckCircle2, MessageCircle, AlertTriangle } from 'lucide-react'
import { db, wocheMarkieren } from '../lib/db'
import { useEinstellungen } from '../lib/settings'
import { isoWoche, wochenKey, ausKey, wocheVersetzt, wochenTage, isoDatum, TAGE_LANG, datumKurz, datumLang, arbeitMs, hm, dezimal, uhr } from '../lib/zeit'
import { rapportPdf, dateiName } from '../lib/pdf'
import { teileDatei, whatsappLink } from '../lib/teilen'
import SchichtSheet from '../components/SchichtSheet'
import SchichtZeile from '../components/SchichtZeile'
import IconChip from '../ui/IconChip'

const zeitpunkt = (ts) => `${datumKurz(new Date(ts))} ${uhr(ts)}`

export default function Woche() {
  const { key } = useParams()
  const nav = useNavigate()
  const woche = ausKey(key) || isoWoche()
  const wKey = wochenKey(woche)
  const [einst] = useEinstellungen()
  const schichten = useLiveQuery(() => db.schichten.where('wocheKey').equals(wKey).sortBy('start'), [wKey], null)
  const status = useLiveQuery(() => db.wochen.get(wKey), [wKey], null)
  const [bearbeiten, setBearbeiten] = useState(null) // Schicht | {neu: datum}
  const [meldung, setMeldung] = useState(null)
  const tage = wochenTage(woche)
  const aktuelleWoche = wKey === wochenKey(isoWoche())

  const fertig = (schichten || []).filter((s) => s.ende != null)
  const laeuftNoch = (schichten || []).some((s) => s.ende == null)
  const summe = fertig.reduce((a, s) => a + arbeitMs(s), 0)

  // PDF vorab erzeugen: iOS erlaubt das Teilen-Menü nur direkt im Klick (ohne Warten davor)
  const pdf = useMemo(() => (fertig.length ? rapportPdf({ einst, woche, schichten: fertig }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schichten, einst, wKey])
  const name = dateiName(einst, woche)
  const [pdfUrl, setPdfUrl] = useState(null)
  useEffect(() => {
    if (!pdf) return setPdfUrl(null)
    const u = URL.createObjectURL(pdf); setPdfUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [pdf])

  async function teilen(feld, erfolgText) {
    if (!pdf) return
    setMeldung(null)
    try {
      const r = await teileDatei(pdf, name)
      if (r === 'abgebrochen') return
      await wocheMarkieren(wKey, feld)
      setMeldung({ ok: true, text: r === 'heruntergeladen' ? 'PDF wurde heruntergeladen.' : erfolgText })
    } catch (e) {
      setMeldung({ ok: false, text: 'Teilen fehlgeschlagen: ' + (e?.message || e) })
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <button onClick={() => nav(`/woche/${wochenKey(wocheVersetzt(woche, -1))}`)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Vorherige Woche">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center min-w-0">
          <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">KW {woche.kw}</h1>
          <div className="text-sm text-white/50">{datumLang(tage[0])} – {datumLang(tage[6])}{aktuelleWoche ? ' · diese Woche' : ''}</div>
        </div>
        <button onClick={() => nav(`/woche/${wochenKey(wocheVersetzt(woche, 1))}`)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Nächste Woche">
          <ChevronRight className="w-5 h-5" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-3xl p-4">
          <div className="text-white/40 text-xs">Total Woche</div>
          <div className="text-2xl font-extrabold grad-text tabular-nums">{hm(summe)} h</div>
        </div>
        <div className="glass rounded-3xl p-4">
          <div className="text-white/40 text-xs">Dezimal</div>
          <div className="text-2xl font-extrabold tabular-nums">{dezimal(summe)}</div>
        </div>
      </div>

      {/* Rapport */}
      <section className="glass rounded-3xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <IconChip icon={FileText} />
          <div className="min-w-0">
            <div className="font-bold">Wochenrapport</div>
            <div className="text-xs text-white/45 truncate">{name}</div>
          </div>
        </div>
        {laeuftNoch && (
          <div className="text-sm rounded-xl px-3 py-2 bg-amber-400/10 border border-amber-400/30 text-amber-300 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Eine Zeit läuft noch — sie kommt erst nach „Feierabend" in den Rapport.
          </div>
        )}
        {!fertig.length ? (
          <div className="text-sm text-white/45">Noch keine Zeiten in dieser Woche.</div>
        ) : (
          <>
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
              {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full text-xs border border-white/15 text-white/70 inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Vorschau
              </a>}
              {einst.bueroTel && <a href={whatsappLink(einst.bueroTel, `Hallo, anbei mein Rapport KW ${woche.kw}/${woche.jahr} (${hm(summe)} h). Gruss ${einst.name}`)}
                target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full text-xs border border-white/15 text-white/70 inline-flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" /> Chat mit {einst.buero || 'Büro'}
              </a>}
            </div>
            {meldung && <div className={'text-sm rounded-xl px-3 py-2 border ' + (meldung.ok ? 'bg-lime/15 border-lime/30 text-lime' : 'bg-ember/15 border-ember/30 text-ember')}>{meldung.text}</div>}
          </>
        )}
      </section>

      {/* Tage */}
      <section className="space-y-4">
        {tage.map((tag) => {
          const liste = (schichten || []).filter((s) => s.datum === isoDatum(tag))
          const t = liste.reduce((a, s) => a + arbeitMs(s), 0)
          return (
            <div key={isoDatum(tag)} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="font-semibold">{TAGE_LANG[tag.getDay()]} <span className="text-white/40 font-normal">{datumKurz(tag)}</span></div>
                <div className="flex items-center gap-3">
                  {liste.length > 0 && <span className="tabular-nums text-white/60">{hm(t)} h</span>}
                  <button onClick={() => setBearbeiten({ neu: isoDatum(tag) })} className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/50" aria-label="Zeit nachtragen">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {liste.map((s) => <SchichtZeile key={s.id} s={s} onClick={() => setBearbeiten(s)} />)}
            </div>
          )
        })}
      </section>

      {bearbeiten && <SchichtSheet schicht={bearbeiten.neu ? null : bearbeiten} datum={bearbeiten.neu} onClose={() => setBearbeiten(null)} />}
    </div>
  )
}
