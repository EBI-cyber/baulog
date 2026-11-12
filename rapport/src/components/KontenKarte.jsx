import { useState } from 'react'
import { PiggyBank, Plus, X } from 'lucide-react'
import Sheet from './Sheet'
import IconChip from '../ui/IconChip'
import { db } from '../lib/db'
import { useKonten } from '../lib/konten'
import { chf } from '../lib/lohn'
import { zahl } from '../lib/settings'
import { isoDatum, datumLang } from '../lib/zeit'

/** Guthaben beim Temporärbüro: Ferien-/Feiertagskonto, 13. ML — mit Auszahlungen und Korrekturen */
export default function KontenKarte({ einst, bis, w }) {
  const konten = useKonten(einst, bis)
  const [bewegung, setBewegung] = useState(null) // { firma, konto }
  if (!konten?.length) return null
  return (
    <>
      {konten.map((k) => (
        <section key={k.firma} className="glass rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <IconChip icon={PiggyBank} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
            <div className="min-w-0">
              <div className="font-bold">Guthaben beim Büro</div>
              <div className="text-xs text-white/45 truncate">{k.buero || 'Büro'} · {k.firma} · Stand {datumLang(new Date(bis + 'T12:00'))}</div>
            </div>
          </div>
          {Object.entries(k.konten).map(([key, x]) => (
            <div key={key} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-semibold">{x.label}</div>
                <div className="text-lg font-extrabold tabular-nums">{chf(x.saldo, w)}</div>
              </div>
              {key !== 'dreizehnter' && x.stunden > 0 && <div className="text-xs text-emerald-300/90 text-right tabular-nums">≈ {x.tage.toFixed(1)} freie Tage ({x.stunden.toFixed(1)} Std.){x.proWocheTage > 0 ? ` · +${x.proWocheTage.toFixed(2)} Tage pro Woche` : ''}</div>}
              <div className="text-xs text-white/40 mt-1 tabular-nums">
                angespart {chf(x.gutschrift, w)}{x.bezug ? ` · bezogen ${chf(x.bezug, w)}` : ''}{x.bewegung ? ` · Auszahlungen/Korrekturen ${chf(x.bewegung, w)}` : ''}
              </div>
              <button onClick={() => setBewegung({ firma: k.firma, konto: key, label: x.label })} className="mt-2 text-xs text-white/55 inline-flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Auszahlung oder Korrektur erfassen
              </button>
            </div>
          ))}
          <div className="text-xs text-white/40">Vergleiche den Saldo mit dem „Guthaben“ auf deiner Lohnabrechnung — oder lass die App die ganze Abrechnung prüfen.</div>
        </section>
      ))}
      {bewegung && <BewegungSheet b={bewegung} onClose={() => setBewegung(null)} w={w} />}
    </>
  )
}

function BewegungSheet({ b, onClose, w }) {
  const [art, setArt] = useState('auszahlung')
  const [betrag, setBetrag] = useState('')
  const [datum, setDatum] = useState(isoDatum(new Date()))
  const [notiz, setNotiz] = useState('')
  const sichern = async () => {
    const v = zahl(betrag)
    if (!v) return
    await db.kontobewegungen.add({ firma: b.firma, konto: b.konto, datum, betrag: art === 'auszahlung' ? -Math.abs(v) : v, notiz: notiz || (art === 'auszahlung' ? 'Auszahlung' : 'Korrektur') })
    onClose()
  }
  return (
    <Sheet titel={`${b.label}: Bewegung`} icon={PiggyBank} onClose={onClose}>
      <div className="flex gap-2">
        {[['auszahlung', 'Ausbezahlt'], ['korrektur', 'Korrektur (+/−)']].map(([a, l]) => (
          <button key={a} onClick={() => setArt(a)} className={'flex-1 rounded-xl py-2 text-sm border ' + (art === a ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/65')}>{l}</button>
        ))}
      </div>
      <input className="eingabe" inputMode="decimal" placeholder={`Betrag ${w}`} value={betrag} onChange={(e) => setBetrag(e.target.value)} />
      <input className="eingabe" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
      <input className="eingabe" placeholder="Notiz (z.B. laut Lohnabrechnung Okt.)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
      <button onClick={sichern} className="w-full rounded-2xl py-3 btn-grad font-bold">Speichern</button>
      <button onClick={onClose} className="w-full text-sm text-white/45 inline-flex items-center justify-center gap-1"><X className="w-4 h-4" /> Abbrechen</button>
    </Sheet>
  )
}
