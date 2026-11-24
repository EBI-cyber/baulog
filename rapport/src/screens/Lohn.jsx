import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Briefcase, AlertTriangle, FileText, Info, ScanSearch, CheckCircle2, XCircle, FolderTree } from 'lucide-react'
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
import ZahlungenKarte from '../components/ZahlungenKarte'
import LohnPruefung from '../components/LohnPruefung'
import { db } from '../lib/db'
import { Link } from 'react-router-dom'
import IconChip from '../ui/IconChip'
import LohnDetailSheet from '../components/LohnDetailSheet'
import { lohnDetail } from '../lib/lohnDetail'

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function zeitraum(modus, basis) {
  if (modus === 'monat') {
    const a = new Date(basis.getFullYear(), basis.getMonth(), 1), b = new Date(basis.getFullYear(), basis.getMonth() + 1, 0)
    return { von: isoDatum(a), bis: isoDatum(b), titel: `${MONATE[a.getMonth()]} ${a.getFullYear()}` }
  }
  const w = isoWoche(basis), a = wochenStart(w), b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6)
  return { von: isoDatum(a), bis: isoDatum(b), titel: `KW ${w.kw} / ${w.jahr}`, unter: `${datumLang(a)} – ${datumLang(b)}` }
}

function Zeile({ label, info, betrag, w, fett, minus, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={'w-full text-left flex items-baseline justify-between gap-3 py-1.5 ' + (onClick ? 'rounded-lg active:bg-white/5 ' : '') + (fett ? 'font-bold border-t border-white/10 mt-1 pt-2.5' : 'text-sm')}>
      <div className="min-w-0">
        <div className={fett ? '' : 'text-white/80'}>{label}</div>
        {info && <div className="text-xs text-white/60 tabular-nums">{info}</div>}
      </div>
      <div className={'shrink-0 tabular-nums inline-flex items-baseline gap-1 ' + (minus ? 'text-rose-300' : '')}>{minus ? '− ' : ''}{chf(betrag, w)}{onClick && <ChevronRight className="w-3.5 h-3.5 text-white/35 self-center" />}</div>
    </Tag>
  )
}

export default function Lohn() {
  const [einst] = useEinstellungen()
  const [modus, setModus] = useState('monat')
  const [basis, setBasis] = useState(() => new Date())
  const [einsatzNeu, setEinsatzNeu] = useState(null)
  const [pruefung, setPruefung] = useState(null) // true = neu | gespeicherter Datensatz
  const [detail, setDetail] = useState(null)
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
  // bereits erhaltene Zahlungen (Vorschüsse/Lohn) für diesen Monat → was noch offen ist
  const zahlungen = useLiveQuery(() => (modus === 'monat' ? db.zahlungen.where('fuerMonat').equals(z.von.slice(0, 7)).sortBy('datum') : []), [modus, z.von], [])
  const erhalten = Math.round((zahlungen || []).reduce((a, x) => a + x.betrag, 0) * 100) / 100
  const offen = lohn ? Math.round((lohn.auszahlung - erhalten) * 100) / 100 : 0
  const w = einst.waehrung
  const zeig = (ziel) => () => setDetail(lohnDetail(ziel, { lohn, w, einst, erhalten, zahlungen: zahlungen || [] }))

  const blaettern = (d) => setBasis((b) => modus === 'monat'
    ? new Date(b.getFullYear(), b.getMonth() + d, 1)
    : wochenStart(wocheVersetzt(isoWoche(b), d)))

  const pdf = useMemo(() => (lohn && lohn.posten.length ? lohnPdf({ einst, lohn, titel: z.titel, von: z.von, bis: z.bis, zahlungen: zahlungen || [] }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lohn && JSON.stringify([lohn.brutto, lohn.spesen, lohn.mittag, lohn.rueckstellung]), z.titel, einst, JSON.stringify(zahlungen)])

  return (
    <div className="space-y-5">
      <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">Lohn</h1>

      <button onClick={() => setPruefung(true)} className="w-full glass rounded-3xl p-4 flex items-center gap-3 card-hover text-left">
        <IconChip icon={ScanSearch} variant="grad" />
        <div className="min-w-0">
          <div className="font-bold">Lohnabrechnung prüfen</div>
          <div className="text-sm text-white/70">Foto machen — die App vergleicht jede Zeile mit deinen Rapporten</div>
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
                <span className={'text-xs shrink-0 ' + (n ? 'text-ember' : 'text-white/65')}>{n ? `${n} Abweichung${n > 1 ? 'en' : ''}` : 'stimmt'}</span>
              </button>
            )
          })}
        </div>
      )}

      <Link to="/abrechnungen" className="w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 card-hover">
        <FolderTree className="w-5 h-5 text-amber-300 shrink-0" />
        <span className="flex-1"><span className="font-semibold">Alle Abrechnungen & Jahresabschluss</span><span className="block text-xs text-white/60">Ordner nach Jahr/Monat, Jahressummen, Grafiken, Werte für die Steuererklärung</span></span>
        <ChevronRight className="w-4 h-4 text-white/50" />
      </Link>

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
          {z.unter && <div className="text-xs text-white/65">{z.unter}</div>}
        </div>
        <button onClick={() => blaettern(1)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0" aria-label="Weiter"><ChevronRight className="w-5 h-5" /></button>
      </header>

      {lohn && (
        <>
          <section className="glass rounded-4xl p-6 text-center">
            <div className="text-xs text-white/65">{erhalten > 0 ? (offen >= -0.025 ? 'Noch auszuzahlen (Büro schuldet dir)' : 'Zu viel ausbezahlt (wird verrechnet)') : 'Auszahlung (geschätzt)'}{laufend ? ' · live' : ''}</div>
            <div onClick={zeig({ art: 'auszahlung' })} role="button" className="text-5xl font-extrabold grad-text tabular-nums tracking-tight">{chf(Math.abs(erhalten > 0 ? offen : runde5(lohn.auszahlung, w)), w)}</div>
            {erhalten > 0 && <div className="text-xs text-white/65 mt-1 tabular-nums">Anspruch {chf(lohn.auszahlung, w)} − bereits erhalten {chf(erhalten, w)}</div>}
            <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
              <button onClick={lohn.posten.length === 1 ? zeig({ art: 'brutto', p: lohn.posten[0] }) : undefined} className="rounded-xl py-1 active:bg-white/5"><div className="text-white/60 text-xs">Brutto</div><div className="font-bold tabular-nums">{chf(lohn.brutto, w)}</div></button>
              <button onClick={zeig({ art: 'abzuege' })} className="rounded-xl py-1 active:bg-white/5"><div className="text-white/60 text-xs">Abzüge</div><div className="font-bold tabular-nums text-rose-300">{chf(lohn.abzuege, w)}</div></button>
              <button onClick={lohn.posten.length === 1 ? zeig({ art: 'netto', p: lohn.posten[0] }) : undefined} className="rounded-xl py-1 active:bg-white/5"><div className="text-white/60 text-xs">Netto</div><div className="font-bold tabular-nums">{chf(lohn.netto, w)}</div></button>
            </div>
            <div className="text-xs text-white/50 mt-3">Tipp: jede Zahl antippen — die App erklärt, woher sie kommt.
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
          {modus === 'monat' && <ZahlungenKarte monat={z.von.slice(0, 7)} anspruch={lohn.fehlendeLoehne.length ? null : lohn.auszahlung} w={w} laufend={z.von <= isoDatum(new Date()) && z.bis >= isoDatum(new Date())} />}

          {lohn.qstAuto && lohn.brutto > 0 && (
            <div className="text-xs text-white/65 px-1">
              Quellensteuer {lohn.qstAuto.satz.toFixed(2)} % — offizielle Tabelle {lohn.qstAuto.kanton} {lohn.qstAuto.jahr}, Tarif {lohn.qstAuto.code}, Monatslohn {chf(lohn.qstAuto.monatsBrutto, w)}{lohn.qstAuto.monatsBrutto > lohn.brutto + 1 ? ' (hochgerechnet)' : ''}.
            </div>
          )}

          {einst.profil?.rav && modus === 'monat' && lohn.posten.length > 0 && (
            <section className="glass rounded-3xl p-5 space-y-2">
              <div className="font-bold">RAV · Zwischenverdienst {z.titel}</div>
              <div className="text-xs text-white/65">Angaben pro Arbeitgeber (Temporärbüro) für deine monatlichen RAV-Unterlagen. Die Bescheinigung selbst stellt das Büro aus.</div>
              {Object.values(lohn.posten.reduce((acc, p) => {
                const b = p.einsatz?.buero || 'Ohne Büro'
                const x = (acc[b] ||= { buero: b, std: 0, brutto: 0, firmen: [] })
                x.std += p.grundStd; x.brutto += p.brutto; x.firmen.push(p.firma)
                return acc
              }, {})).map((x) => (
                <div key={x.buero} className="flex items-baseline justify-between gap-3 text-sm border-t border-white/10 pt-2">
                  <div className="min-w-0"><div className="font-semibold truncate">{x.buero}</div><div className="text-xs text-white/60 truncate">{x.firmen.join(', ')}</div></div>
                  <div className="shrink-0 text-right tabular-nums"><div>{x.std.toFixed(2)} h</div><div className="text-xs text-white/65">brutto {chf(x.brutto, w)}</div></div>
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
                  <div className="text-xs text-white/65">{p.einsatz?.funktion ? `${p.einsatz.funktion} · ` : ''}{p.einsatz?.kanton ? `${p.einsatz.kanton} · ` : ''}{p.stundenlohn ? `${chf(p.stundenlohn, w)} / Std. Grundlohn` : 'kein Stundenlohn'}</div>
                </div>
              </div>
              {p.zeilen.filter((x) => !x.konto).map((x, i) => (
                <Zeile key={i} w={w} betrag={x.betrag} info={x.info} onClick={zeig({ art: 'zeile', p, x })}
                  label={x.art ? `${absenzArt(x.art).label} (${x.ausKonto ? 'aus Konto' : x.art === 'krank' || x.art === 'unfall' ? (x.taggeld ? 'Taggeld' : x.betrag ? 'Lohnfortzahlung' : 'unbezahlt') : 'Lohnfortzahlung'})` : x.label} />
              ))}
              {p.zeilen.some((x) => x.konto) && (
                <div className="mt-1 rounded-xl bg-white/[0.03] border border-dashed border-white/15 px-3 py-1">
                  <div className="text-xs uppercase tracking-wider text-white/55 pt-1">Angespart beim Büro (nicht im Bruttolohn)</div>
                  {p.zeilen.filter((x) => x.konto).map((x, i) => <Zeile key={i} w={w} betrag={x.betrag} info={x.info} label={`→ ${x.label}`} onClick={zeig({ art: 'zeile', p, x })} />)}
                </div>
              )}
              <Zeile fett label="Bruttolohn" betrag={p.brutto} w={w} onClick={zeig({ art: 'brutto', p })} />
              {p.abzuege.map((a) => <Zeile key={a.k} minus label={`${a.label} ${a.prozent} %`} info={a.basis !== p.brutto ? `auf ${chf(a.basis, w)}` : ''} betrag={a.betrag} w={w} onClick={zeig({ art: 'abzug', p, x: a })} />)}
              <Zeile fett label="Nettolohn" betrag={p.netto} w={w} onClick={zeig({ art: 'netto', p })} />
            </section>
          ))}

          {(lohn.posten.length > 0 || lohn.spesen > 0) && (
            <section className="glass rounded-3xl p-5">
              <Zeile label="Nettolohn" betrag={lohn.netto} w={w} />
              <Zeile label="Spesen (nicht AHV-pflichtig)" betrag={lohn.spesen} w={w} onClick={zeig({ art: 'spesen' })} />
              {lohn.mittag > 0 && <Zeile label="Mittagszulage" info={lohn.posten.filter((p) => p.mittag).map((p) => `${p.tage} Tage`).join(', ')} betrag={lohn.mittag} w={w} onClick={zeig({ art: 'mittag' })} />}
              {lohn.rueckstellung > 0 && <Zeile minus label="Zurückbehalten (Guthaben, netto)" info="Feriengeld usw. — gehört dir, wird bei Ferien ausbezahlt" betrag={lohn.rueckstellung} w={w} onClick={zeig({ art: 'rueckstellung' })} />}
              <Zeile fett label={erhalten > 0 ? 'Lohnanspruch' : 'Auszahlung'} info={erhalten > 0 ? '' : w === 'CHF' ? 'auf 5 Rappen gerundet' : ''} betrag={erhalten > 0 ? lohn.auszahlung : runde5(lohn.auszahlung, w)} w={w} onClick={zeig({ art: 'auszahlung' })} />
              {(zahlungen || []).map((x) => (
                <Zeile key={x.id} minus label={`Bereits ausbezahlt: ${x.art === 'lohn' ? 'Lohn' : x.art === 'vorschuss' ? 'Vorschuss' : 'Zahlung'} ${x.datum.split('-').reverse().join('.').slice(0, 6)}`} info={x.kw ? `für KW ${x.kw}` : x.text || ''} betrag={x.betrag} w={w} />
              ))}
              {erhalten > 0 && <Zeile fett label={offen >= -0.005 ? 'Noch auszuzahlen (Büro schuldet dir)' : 'Zu viel ausbezahlt (wird verrechnet)'} betrag={Math.abs(offen)} w={w} onClick={zeig({ art: 'auszahlung' })} />}
            </section>
          )}

          {!lohn.posten.length && <div className="text-sm text-white/65">In diesem Zeitraum gibt es noch keine Einträge.</div>}

          {pdf && (
            <button onClick={() => teileDatei(pdf, `Lohn_${z.titel.replace(/[\s/]+/g, '_')}.pdf`).catch(() => {})}
              className="w-full rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2">
              <FileText className="w-5 h-5" /> Lohnabrechnung als PDF
            </button>
          )}

          <div className="text-xs text-white/60 flex gap-2">
            <Info className="w-4 h-4 shrink-0" />
            Schätzung nach dem Schema des GAV Personalverleih (Grundlohn, Zuschläge, Feiertags- und Ferienentschädigung, 13. Monatslohn, Sozialabzüge).
            Quellensteuer nach der offiziellen Tabelle der Steuerverwaltung (Wohnkanton, Tarif, Monatslohn). Lohnobergrenzen werden nicht abgebildet. Massgebend ist die Abrechnung des Temporärbüros.
          </div>
        </>
      )}

      <LohnDetailSheet d={detail} w={w} onClose={() => setDetail(null)} />
      {pruefung && <LohnPruefung gespeichert={pruefung === true ? null : pruefung} onClose={() => setPruefung(null)} />}
      {einsatzNeu && <EinsatzSheet einsatz={null} vorgabe={einsatzNeu} onClose={() => setEinsatzNeu(null)} />}
    </div>
  )
}
