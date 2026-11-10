import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Briefcase, AlertTriangle, FileText, Info, ScanSearch, CheckCircle2, XCircle } from 'lucide-react'
import { laufendeSchicht } from '../lib/db'
import { useEinstellungen } from '../lib/settings'
import { useLohn } from '../lib/useLohn'
import { chf, runde5 } from '../lib/lohn'
import { absenzArt } from '../lib/arten'
import { isoDatum, isoWoche, wochenStart, wocheVersetzt, datumLang } from '../lib/zeit'
import { lohnPdf } from '../lib/pdf'
import { teileDatei } from '../lib/teilen'
import EinsatzSheet from '../components/EinsatzSheet'
import KontenKarte from '../components/KontenKarte'
import LohnPruefung from '../components/LohnPruefung'
import { db } from '../lib/db'
import { Link } from 'react-router-dom'
import IconChip from '../ui/IconChip'

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function zeitraum(modus, basis) {
  if (modus === 'monat') {
    const a = new Date(basis.getFullYear(), basis.getMonth(), 1), b = new Date(basis.getFullYear(), basis.getMonth() + 1, 0)
    return { von: isoDatum(a), bis: isoDatum(b), titel: `${MONATE[a.getMonth()]} ${a.getFullYear()}` }
  }
  const w = isoWoche(basis), a = wochenStart(w), b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6)
  return { von: isoDatum(a), bis: isoDatum(b), titel: `KW ${w.kw} / ${w.jahr}`, unter: `${datumLang(a)} – ${datumLang(b)}` }
}

function Zeile({ label, info, betrag, w, fett, minus }) {
  return (
    <div className={'flex items-baseline justify-between gap-3 py-1.5 ' + (fett ? 'font-bold border-t border-white/10 mt-1 pt-2.5' : 'text-sm')}>
      <div className="min-w-0">
        <div className={fett ? '' : 'text-white/80'}>{label}</div>
        {info && <div className="text-xs text-white/40 tabular-nums">{info}</div>}
      </div>
      <div className={'shrink-0 tabular-nums ' + (minus ? 'text-rose-300' : '')}>{minus ? '− ' : ''}{chf(betrag, w)}</div>
    </div>
  )
}

export default function Lohn() {
  const [einst] = useEinstellungen()
  const [modus, setModus] = useState('monat')
  const [basis, setBasis] = useState(() => new Date())
  const [einsatzNeu, setEinsatzNeu] = useState(null)
  const [pruefung, setPruefung] = useState(null) // true = neu | gespeicherter Datensatz
  const geprueft = useLiveQuery(() => db.lohnabrechnungen.orderBy('von').reverse().limit(12).toArray(), [], [])
  const laufend = useLiveQuery(laufendeSchicht, [], null)
  const [jetzt, setJetzt] = useState(Date.now())
  useEffect(() => {
    if (!laufend) return
    const t = setInterval(() => setJetzt(Date.now()), 1000)
    return () => clearInterval(t)
  }, [laufend])

  const z = useMemo(() => zeitraum(modus, basis), [modus, basis])
  const lohn = useLohn(z.von, z.bis, einst, jetzt)
  const w = einst.waehrung

  const blaettern = (d) => setBasis((b) => modus === 'monat'
    ? new Date(b.getFullYear(), b.getMonth() + d, 1)
    : wochenStart(wocheVersetzt(isoWoche(b), d)))

  const pdf = useMemo(() => (lohn && lohn.posten.length ? lohnPdf({ einst, lohn, titel: z.titel, von: z.von, bis: z.bis }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lohn && JSON.stringify([lohn.brutto, lohn.spesen, lohn.mittag]), z.titel, einst])

  return (
    <div className="space-y-5">
      <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">Lohn</h1>

      <button onClick={() => setPruefung(true)} className="w-full glass rounded-3xl p-4 flex items-center gap-3 card-hover text-left">
        <IconChip icon={ScanSearch} variant="grad" />
        <div className="min-w-0">
          <div className="font-bold">Lohnabrechnung prüfen</div>
          <div className="text-sm text-white/55">Foto machen — die App vergleicht jede Zeile mit deinen Rapporten</div>
        </div>
      </button>
      {(geprueft || []).length > 0 && (
        <div className="space-y-1.5">
          {geprueft.slice(0, 4).map((g) => {
            const n = (g.pruefung || []).filter((c) => c.status === 'abweichung' && c.id !== 'auszahlung').length
            return (
              <button key={g.id} onClick={() => setPruefung(g)} className="w-full text-left rounded-2xl px-3 py-2 bg-white/[0.04] border border-white/10 flex items-center gap-2 text-sm">
                {n ? <XCircle className="w-4 h-4 text-ember shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-lime shrink-0" />}
                <span className="flex-1 truncate">Abrechnung {g.von.split('-').reverse().join('.')}–{g.bis.split('-').reverse().join('.')} {g.buero ? `· ${g.buero}` : ''}</span>
                <span className={'text-xs shrink-0 ' + (n ? 'text-ember' : 'text-white/45')}>{n ? `${n} Abweichung${n > 1 ? 'en' : ''}` : 'stimmt'}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        {[['monat', 'Monat'], ['woche', 'Woche']].map(([m, l]) => (
          <button key={m} onClick={() => setModus(m)}
            className={'flex-1 rounded-xl py-2 text-sm border ' + (modus === m ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/65')}>{l}</button>
        ))}
      </div>

      <header className="flex items-center justify-between gap-2">
        <button onClick={() => blaettern(-1)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Zurück"><ChevronLeft className="w-5 h-5" /></button>
        <div className="text-center min-w-0">
          <div className="text-xl font-extrabold">{z.titel}</div>
          {z.unter && <div className="text-xs text-white/45">{z.unter}</div>}
        </div>
        <button onClick={() => blaettern(1)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Weiter"><ChevronRight className="w-5 h-5" /></button>
      </header>

      {lohn && (
        <>
          <section className="glass rounded-4xl p-6 text-center">
            <div className="text-xs text-white/45">Auszahlung (geschätzt){laufend ? ' · live' : ''}</div>
            <div className="text-5xl font-extrabold grad-text tabular-nums tracking-tight">{chf(runde5(lohn.auszahlung, w), w)}</div>
            <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
              <div><div className="text-white/40 text-xs">Brutto</div><div className="font-bold tabular-nums">{chf(lohn.brutto, w)}</div></div>
              <div><div className="text-white/40 text-xs">Abzüge</div><div className="font-bold tabular-nums text-rose-300">{chf(lohn.abzuege, w)}</div></div>
              <div><div className="text-white/40 text-xs">Netto</div><div className="font-bold tabular-nums">{chf(lohn.netto, w)}</div></div>
            </div>
          </section>

          {lohn.fehlendeLoehne.length > 0 && (
            <div className="text-sm rounded-2xl px-4 py-3 bg-amber-400/10 border border-amber-400/30 text-amber-300 space-y-2">
              <div className="flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Kein Stundenlohn hinterlegt für: {lohn.fehlendeLoehne.join(', ')}</div>
              <button onClick={() => setEinsatzNeu({ firma: lohn.fehlendeLoehne[0] === 'Ohne Einsatzvertrag' ? '' : lohn.fehlendeLoehne[0] })}
                className="rounded-xl px-3 py-2 bg-white/10 text-white font-semibold inline-flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Einsatzvertrag erfassen
              </button>
            </div>
          )}

          {lohn.qstFehlt && (
            <Link to="/fragebogen" className="block text-sm rounded-2xl px-4 py-3 bg-amber-400/10 border border-amber-400/30 text-amber-300">
              Quellensteuer wird noch nicht abgezogen — die offizielle Tabelle ist gerade nicht erreichbar (oder der Wohnkanton fehlt im Fragebogen). Das Netto ist bis dahin zu hoch.
            </Link>
          )}

          <KontenKarte einst={einst} bis={z.bis} w={w} />

          {lohn.qstAuto && lohn.brutto > 0 && (
            <div className="text-xs text-white/45 px-1">
              Quellensteuer {lohn.qstAuto.satz.toFixed(2)} % — offizielle Tabelle {lohn.qstAuto.kanton} {lohn.qstAuto.jahr}, Tarif {lohn.qstAuto.code}, Monatslohn {chf(lohn.qstAuto.monatsBrutto, w)}{lohn.qstAuto.monatsBrutto > lohn.brutto + 1 ? ' (hochgerechnet)' : ''}.
            </div>
          )}

          {einst.profil?.rav && modus === 'monat' && lohn.posten.length > 0 && (
            <section className="glass rounded-3xl p-5 space-y-2">
              <div className="font-bold">RAV · Zwischenverdienst {z.titel}</div>
              <div className="text-xs text-white/45">Angaben pro Arbeitgeber (Temporärbüro) für deine monatlichen RAV-Unterlagen. Die Bescheinigung selbst stellt das Büro aus.</div>
              {Object.values(lohn.posten.reduce((acc, p) => {
                const b = p.einsatz?.buero || 'Ohne Büro'
                const x = (acc[b] ||= { buero: b, std: 0, brutto: 0, firmen: [] })
                x.std += p.grundStd; x.brutto += p.brutto; x.firmen.push(p.firma)
                return acc
              }, {})).map((x) => (
                <div key={x.buero} className="flex items-baseline justify-between gap-3 text-sm border-t border-white/10 pt-2">
                  <div className="min-w-0"><div className="font-semibold truncate">{x.buero}</div><div className="text-xs text-white/40 truncate">{x.firmen.join(', ')}</div></div>
                  <div className="shrink-0 text-right tabular-nums"><div>{x.std.toFixed(2)} h</div><div className="text-xs text-white/50">brutto {chf(x.brutto, w)}</div></div>
                </div>
              ))}
            </section>
          )}

          {lohn.posten.map((p) => (
            <section key={p.firma} className="glass rounded-3xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <IconChip icon={Briefcase} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
                <div className="min-w-0">
                  <div className="font-bold truncate">{p.firma}</div>
                  <div className="text-xs text-white/45">{p.einsatz?.funktion ? `${p.einsatz.funktion} · ` : ''}{p.einsatz?.kanton ? `${p.einsatz.kanton} · ` : ''}{p.stundenlohn ? `${chf(p.stundenlohn, w)} / Std. Grundlohn` : 'kein Stundenlohn'}</div>
                </div>
              </div>
              {p.zeilen.filter((x) => !x.konto).map((x, i) => (
                <Zeile key={i} w={w} betrag={x.betrag} info={x.info}
                  label={x.art ? `${absenzArt(x.art).label} (${x.ausKonto ? 'aus Konto' : 'Lohnfortzahlung'})` : x.label} />
              ))}
              {p.zeilen.some((x) => x.konto) && (
                <div className="mt-1 rounded-xl bg-white/[0.03] border border-dashed border-white/15 px-3 py-1">
                  <div className="text-[11px] uppercase tracking-wider text-white/35 pt-1">Angespart beim Büro (nicht im Bruttolohn)</div>
                  {p.zeilen.filter((x) => x.konto).map((x, i) => <Zeile key={i} w={w} betrag={x.betrag} info={x.info} label={`→ ${x.label}`} />)}
                </div>
              )}
              <Zeile fett label="Bruttolohn" betrag={p.brutto} w={w} />
              {p.abzuege.map((a) => <Zeile key={a.k} minus label={`${a.label} ${a.prozent} %`} betrag={a.betrag} w={w} />)}
              <Zeile fett label="Nettolohn" betrag={p.netto} w={w} />
            </section>
          ))}

          {(lohn.posten.length > 0 || lohn.spesen > 0) && (
            <section className="glass rounded-3xl p-5">
              <Zeile label="Nettolohn" betrag={lohn.netto} w={w} />
              <Zeile label="Spesen (nicht AHV-pflichtig)" betrag={lohn.spesen} w={w} />
              {lohn.mittag > 0 && <Zeile label="Mittagszulage" info={lohn.posten.filter((p) => p.mittag).map((p) => `${p.tage} Tage`).join(', ')} betrag={lohn.mittag} w={w} />}
              <Zeile fett label="Auszahlung" info={w === 'CHF' ? 'auf 5 Rappen gerundet' : ''} betrag={runde5(lohn.auszahlung, w)} w={w} />
            </section>
          )}

          {!lohn.posten.length && <div className="text-sm text-white/45">In diesem Zeitraum gibt es noch keine Einträge.</div>}

          {pdf && (
            <button onClick={() => teileDatei(pdf, `Lohn_${z.titel.replace(/[\s/]+/g, '_')}.pdf`).catch(() => {})}
              className="w-full rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2">
              <FileText className="w-5 h-5" /> Lohnabrechnung als PDF
            </button>
          )}

          <div className="text-xs text-white/40 flex gap-2">
            <Info className="w-4 h-4 shrink-0" />
            Schätzung nach dem Schema des GAV Personalverleih (Grundlohn, Zuschläge, Feiertags- und Ferienentschädigung, 13. Monatslohn, Sozialabzüge).
            Quellensteuer nach der offiziellen Tabelle der Steuerverwaltung (Wohnkanton, Tarif, Monatslohn). Karenztage und Lohnobergrenzen werden nicht abgebildet. Massgebend ist die Abrechnung des Temporärbüros.
          </div>
        </>
      )}

      {pruefung && <LohnPruefung gespeichert={pruefung === true ? null : pruefung} onClose={() => setPruefung(null)} />}
      {einsatzNeu && <EinsatzSheet einsatz={null} vorgabe={einsatzNeu} onClose={() => setEinsatzNeu(null)} />}
    </div>
  )
}
