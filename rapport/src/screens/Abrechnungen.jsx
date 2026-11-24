import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, FolderOpen, Folder, FileCheck2, CheckCircle2, XCircle, FileText, Info, Receipt, ScanSearch, FileImage, Plus, Archive } from 'lucide-react'
import { db } from '../lib/db'
import { useEinstellungen, zahl } from '../lib/settings'
import { chf } from '../lib/lohn'
import { quellensteuerPflichtig, tarif } from '../lib/profil'
import { tarifLaden } from '../lib/quellensteuer'
import { jahresabschluss, gruppen, lohnausweis, eindeutig, abrechnungWerte, GRUPPEN, MONATE } from '../lib/jahresabschluss'
import { jahresabschlussPdf } from '../lib/pdf'
import { teileDatei } from '../lib/teilen'
import LohnPruefung from '../components/LohnPruefung'
import LohnDetailSheet from '../components/LohnDetailSheet'
import OriginalSheet from '../components/OriginalSheet'
import { teilen as originalTeilen, abrechnungOriginalSpeichern } from '../lib/originale'
import { alsDataUrl } from '../lib/bild'

// Farben wie in der Statistik (netto / Sozialabzüge), dazu Quellensteuer und Übrige
const FARBEN = { netto: '#0891b2', sozial: '#8b5cf6', bvg: '#a78bfa', quellensteuer: '#f59e0b', uebrige: '#64748b' }
const kurz = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(Math.round(n)))

/** Lohnabrechnungen als Baum + Jahresabschluss (Summen, Grafiken, Werte für die Steuererklärung) */
export default function Abrechnungen({ eingebettet = false }) {
  const [einst] = useEinstellungen()
  const w = einst.waehrung
  const [jahr, setJahr] = useState(new Date().getFullYear())
  const [pruefung, setPruefung] = useState(null)
  const [detail, setDetail] = useState(null)
  const [offen, setOffen] = useState({})
  const [original, setOriginal] = useState(null)
  const [ablegen, setAblegen] = useState(null) // { monat, buero, dateien, laeuft }
  async function ablegenDateien(e) {
    const files = [...(e.target.files || [])]; e.target.value = ''
    const neu = []
    for (const f of files) neu.push(await alsDataUrl(f, 2400, 0.85))
    setAblegen((a) => ({ ...a, dateien: [...(a.dateien || []), ...neu] }))
  }
  async function ablegenSpeichern() {
    await abrechnungOriginalSpeichern({ monat: ablegen.monat, buero: ablegen.buero, firma: einst.firma, dateien: ablegen.dateien })
    setAblegen(null)
  }
  const alle = useLiveQuery(() => db.lohnabrechnungen.toArray(), [], null)
  const daten = useLiveQuery(async () => ({
    schichten: (await db.schichten.toArray()).filter((s) => s.ende != null),
    absenzen: await db.absenzen.toArray(), spesen: await db.spesen.toArray(), einsaetze: await db.einsaetze.toArray(),
  }), [], null)
  const p = einst?.profil
  const auto = quellensteuerPflichtig(p) && !zahl(p?.qstSatz) && p?.wohnkanton
  const [qstTarif, setQstTarif] = useState(null)
  useEffect(() => {
    let aktiv = true
    if (!auto) { setQstTarif(null); return }
    tarifLaden(jahr, p.wohnkanton, tarif(p)).then((t) => aktiv && setQstTarif(t))
    return () => { aktiv = false }
  }, [auto, jahr, p?.wohnkanton]) // eslint-disable-line react-hooks/exhaustive-deps

  const ja = useMemo(() => (alle && daten ? jahresabschluss({ jahr, abrechnungen: alle, daten, einst, qstTarif }) : null), [alle, daten, jahr, einst, qstTarif])
  const t = ja?.total
  const g = t ? gruppen(t) : null
  const abzuegeTotal = g ? Object.values(g).reduce((a, b) => a + b, 0) : 0

  // Baum: Jahr → Monat → Abrechnungen (alle Jahre)
  const baum = useMemo(() => {
    const out = {}
    for (const a of eindeutig(alle || [])) {
      const j = a.bis.slice(0, 4), m = +a.bis.slice(5, 7) - 1
      ;((out[j] ||= {})[m] ||= []).push(a)
    }
    return Object.entries(out).sort((a, b) => b[0].localeCompare(a[0]))
  }, [alle])
  const umschalten = (k) => setOffen((o) => ({ ...o, [k]: !o[k] }))

  const zeigGruppe = (k) => {
    const [, label, arten] = GRUPPEN.find((x) => x[0] === k)
    setDetail({ titel: label, betrag: -g[k], was: {
      sozial: 'AHV/IV/EO (Rente, Invalidität, Erwerbsersatz), Arbeitslosenversicherung und Nichtberufsunfall-Versicherung. Diese Beiträge stehen im Lohnausweis unter Ziffer 9 und sind in der Steuererklärung schon vom Lohn abgezogen.',
      bvg: 'Beiträge an die Pensionskasse — Lohnausweis Ziffer 10.1, ebenfalls schon vom Lohn abgezogen.',
      quellensteuer: 'Direkt vom Lohn abgezogene Steuer. Lohnausweis Ziffer 12. Bei nachträglicher ordentlicher Veranlagung (NOV) wird sie angerechnet.',
      uebrige: 'Krankentaggeld-Prämie, GAV-Vollzugskosten u.ä. Sie stehen nicht unter Ziffer 9/10 des Lohnausweises.',
    }[k], rechnung: [...arten.filter((a) => t.abzug[a]).map((a) => [a.toUpperCase(), -t.abzug[a]]), ['Total', -g[k], true]], grundlage: 'Summe aus deinen geprüften Lohnabrechnungen' + (ja.mitSchaetzung ? ' (Monate ohne Abrechnung: Schätzung der App)' : '') + '.' })
  }
  const zeigMonat = (x) => setDetail({
    titel: `${x.name} ${jahr}`, betrag: x.netto,
    was: x.quelle === 'abrechnung' ? `Laut ${x.abrechnungen.length > 1 ? x.abrechnungen.length + ' Lohnabrechnungen' : 'Lohnabrechnung'} des Büros.` : 'Keine Lohnabrechnung erfasst — Schätzung der App aus deinen Rapporten.',
    rechnung: [['Bruttolohn', x.brutto], ...Object.entries(x.abzug).filter(([, v]) => v).map(([k, v]) => [`− ${k.toUpperCase()}`, -v]), ['Nettolohn', x.netto, true], ['+ Spesen', x.spesen], ...(x.rueck ? [['− zurückbehalten', -x.rueck]] : []), ...(x.stunden ? [[`Stunden: ${x.stunden.toFixed(2)} h`]] : [])],
  })

  return (
    <div className="space-y-5">
      {!eingebettet && <Link to="/lohn" className="text-sm text-white/65 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Lohn</Link>}
      {!eingebettet && <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight">Lohnabrechnungen</h1>}

      <header className="flex items-center justify-between gap-2">
        <button onClick={() => setJahr(jahr - 1)} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center" aria-label="Vorjahr"><ChevronLeft className="w-5 h-5" /></button>
        <div className="text-center"><div className="text-xl font-extrabold">Jahresabschluss {jahr}</div><div className="text-xs text-white/60">{ja ? `${ja.abrechnungen.length} Abrechnung${ja.abrechnungen.length === 1 ? '' : 'en'}` : ''}</div></div>
        <button onClick={() => setJahr(jahr + 1)} disabled={jahr >= new Date().getFullYear()} className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center disabled:opacity-30" aria-label="Folgejahr"><ChevronRight className="w-5 h-5" /></button>
      </header>

      {ja && t.brutto > 0 && (
        <>
          {ja.mitSchaetzung && (
            <div className="text-sm rounded-2xl px-4 py-3 bg-amber-400/10 border border-amber-400/30 text-amber-200 flex gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Für {ja.monate.filter((x) => x.quelle === 'schaetzung' || x.quelle === 'laufend').map((x) => x.name).join(', ')} fehlt die Lohnabrechnung — dort steht die Schätzung der App (blass im Diagramm). Abrechnung fotografieren unter Lohn → „Lohnabrechnung prüfen“.</span>
            </div>
          )}

          <section className="glass rounded-4xl p-5 space-y-4">
            <button onClick={() => setDetail({ titel: `Netto ${jahr}`, betrag: t.netto, was: 'Was dir nach allen Abzügen vom Lohn geblieben ist (ohne Spesen).', rechnung: [['Bruttolohn', t.brutto], ...GRUPPEN.map(([k, l]) => [`− ${l}`, -g[k]]), ['Nettolohn', t.netto, true], ['+ Spesen', t.spesen], ['− zurückbehalten (Guthaben)', -t.rueck]] })} className="w-full text-center">
              <div className="text-xs text-white/65">Nettolohn {jahr}</div>
              <div className="text-5xl font-extrabold grad-text tabular-nums tracking-tight">{chf(t.netto, w)}</div>
              <div className="text-xs text-white/60 mt-1">{t.stunden > 0 ? `${t.stunden.toFixed(2)} h · ≈ ${chf(t.netto / t.stunden, w)} netto pro Stunde` : ''}</div>
            </button>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Kachel titel="Brutto" wert={chf(t.brutto, w)} onClick={() => setDetail({ titel: `Bruttolohn ${jahr}`, betrag: t.brutto, was: 'Alles, was du vor Abzügen verdient hast (Grundlohn, Zuschläge, Ferien-/Feiertagsentschädigung, 13. ML, Taggelder).', rechnung: ja.monate.filter((x) => x.brutto).map((x) => [`${x.name}${x.quelle !== 'abrechnung' ? ' (Schätzung)' : ''}`, x.brutto]).concat([['Total', t.brutto, true]]) })} />
              <Kachel titel="Abzüge total" wert={chf(abzuegeTotal, w)} rot sub={`${t.brutto ? Math.round(abzuegeTotal / t.brutto * 1000) / 10 : 0} % vom Brutto`} onClick={() => setDetail({ titel: 'Abzüge total', betrag: -abzuegeTotal, was: 'Alle Sozialabzüge, Pensionskasse, Quellensteuer und übrigen Abzüge zusammen.', rechnung: GRUPPEN.map(([k, l]) => [l, -g[k]]).concat([['Total', -abzuegeTotal, true]]) })} />
              <Kachel titel="Davon Steuern (QST)" wert={chf(g.quellensteuer, w)} onClick={() => zeigGruppe('quellensteuer')} />
              <Kachel titel="Spesen" wert={chf(t.spesen, w)} sub="steuerfrei, nicht im Brutto" />
              {t.rueck > 0 && <Kachel titel="Zurückbehalten" wert={chf(t.rueck, w)} sub="Feriengeld-Guthaben beim Büro" />}
              {ja.totalAbrechnung.auszahlung + ja.totalAbrechnung.vorschuesse > 0 && <Kachel titel="Ausbezahlt laut Abrechnungen" wert={chf(ja.totalAbrechnung.auszahlung + ja.totalAbrechnung.vorschuesse, w)} sub={ja.totalAbrechnung.vorschuesse ? `inkl. Vorschüsse ${chf(ja.totalAbrechnung.vorschuesse, w)}` : ''} />}
            </div>
          </section>

          <section className="glass rounded-3xl p-5 space-y-3">
            <div className="font-bold">Wohin ging dein Bruttolohn?</div>
            <div className="flex h-5 rounded-full overflow-hidden">
              {[['netto', t.netto], ...GRUPPEN.map(([k]) => [k, g[k]])].filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k} style={{ width: `${v / t.brutto * 100}%`, background: FARBEN[k] }} />
              ))}
            </div>
            <div className="space-y-1.5">
              {[['netto', 'Nettolohn', t.netto], ...GRUPPEN.map(([k, l]) => [k, l, g[k]])].filter(([, , v]) => v > 0).map(([k, l, v]) => (
                <button key={k} onClick={() => (k === 'netto' ? null : zeigGruppe(k))} className="w-full flex items-center gap-2 text-sm text-left">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: FARBEN[k] }} />
                  <span className="flex-1 text-white/80">{l}</span>
                  <span className="tabular-nums text-white/60 w-14 text-right">{(v / t.brutto * 100).toFixed(1)} %</span>
                  <span className="tabular-nums w-28 text-right">{chf(v, w)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="glass rounded-3xl p-5 space-y-2">
            <div className="font-bold">Monat für Monat</div>
            <MonatsSaeulen monate={ja.monate} onWahl={zeigMonat} />
            <div className="flex flex-wrap gap-3 text-xs text-white/65">
              {[['netto', 'Netto'], ['sozial', 'Sozialabzüge'], ['bvg', 'BVG'], ['quellensteuer', 'Quellensteuer'], ['uebrige', 'Übrige']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FARBEN[k] }} />{l}</span>)}
              <span>blass = Schätzung</span>
            </div>
          </section>

          <section className="glass rounded-3xl p-5 space-y-2">
            <div className="flex items-center gap-2 font-bold"><Receipt className="w-4 h-4 text-amber-300" /> Für die Steuererklärung</div>
            <div className="text-xs text-white/65">Aufbau wie der Lohnausweis (Formular 11). Den offiziellen Lohnausweis stellt das Büro aus — damit kannst du ihn kontrollieren.</div>
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-1">
              {lohnausweis(t).map((z) => (
                <div key={z.ziffer} className={'flex items-baseline gap-3 py-1.5 text-sm ' + (z.fett ? 'font-bold border-t border-white/10' : '')}>
                  <span className="w-9 shrink-0 text-white/55 tabular-nums">{z.ziffer}</span>
                  <span className="flex-1 min-w-0">{z.text}</span>
                  <span className="tabular-nums shrink-0">{z.betrag < 0 ? '− ' : ''}{chf(Math.abs(z.betrag), w)}</span>
                </div>
              ))}
            </div>
            {g.uebrige > 0 && <div className="text-xs text-white/60">Nicht im Lohnausweis unter Ziffer 9/10: übrige Abzüge {chf(g.uebrige, w)} (KTG-Prämie, GAV-Beitrag …).</div>}
            {quellensteuerPflichtig(p) && <div className="text-xs text-white/60">Mit Quellensteuer brauchst du meist keine Steuererklärung — ausser bei nachträglicher ordentlicher Veranlagung (z.B. für Abzüge wie Säule 3a, Berufsauslagen, oder ab CHF 120'000 Einkommen).</div>}
            <button onClick={() => teileDatei(jahresabschlussPdf({ einst, jahr, ja }), `Jahresabschluss_Lohn_${jahr}.pdf`).catch(() => {})}
              className="w-full rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2 mt-1"><FileText className="w-5 h-5" /> Jahresabschluss als PDF</button>
          </section>
        </>
      )}
      {ja && !(t.brutto > 0) && <div className="text-sm text-white/65">Für {jahr} gibt es noch keine Lohndaten.</div>}

      <section className="space-y-2">
        <div className="font-bold px-1">Alle Lohnabrechnungen</div>
        <button onClick={() => setPruefung(true)} className="w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 text-left">
          <ScanSearch className="w-5 h-5 text-cyan-300 shrink-0" /><span className="flex-1 font-semibold">Neue Lohnabrechnung prüfen</span><ChevronRight className="w-4 h-4 text-white/50" />
        </button>
        <button onClick={() => setAblegen({ monat: new Date().toISOString().slice(0, 7), buero: '', dateien: [] })} className="w-full glass rounded-2xl px-4 py-3 flex items-center gap-3 text-left">
          <Archive className="w-5 h-5 text-amber-300 shrink-0" /><span className="flex-1"><span className="font-semibold">Original ablegen (ohne Prüfung)</span><span className="block text-xs text-white/60">z.B. alte Abrechnungen — Foto oder PDF, später prüfbar</span></span><ChevronRight className="w-4 h-4 text-white/50" />
        </button>
        {ablegen && (
          <div className="glass rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-white/65">Monat<input type="month" value={ablegen.monat} onChange={(e) => setAblegen({ ...ablegen, monat: e.target.value })} className="mt-1 w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white" /></label>
              <label className="text-xs text-white/65">Büro<input value={ablegen.buero} onChange={(e) => setAblegen({ ...ablegen, buero: e.target.value })} placeholder="z.B. Bellini" className="mt-1 w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white" /></label>
            </div>
            <label className="w-full rounded-xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"><Plus className="w-5 h-5" /> {ablegen.dateien.length ? `${ablegen.dateien.length} Datei(en) — weitere` : 'Foto oder PDF wählen'}
              <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={ablegenDateien} /></label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAblegen(null)} className="rounded-xl py-2.5 bg-white/[0.06] text-sm">Abbrechen</button>
              <button onClick={ablegenSpeichern} disabled={!ablegen.dateien.length || !ablegen.monat} className="rounded-xl py-2.5 btn-grad text-sm font-bold disabled:opacity-40">Ablegen</button>
            </div>
          </div>
        )}
        {!baum.length && <div className="text-sm text-white/60 px-1">Noch keine Lohnabrechnung gespeichert.</div>}
        {baum.map(([j, mon]) => {
          const jk = 'j' + j, jo = offen[jk] ?? +j === jahr
          return (
            <div key={j} className="glass rounded-3xl p-2">
              <Knoten offen={jo} onClick={() => setOffen((o) => ({ ...o, [jk]: !jo }))} titel={j} gross zahl={Object.values(mon).flat().length} />
              {jo && <div className="pl-3 border-l border-white/10 ml-4 space-y-1">
                {Object.entries(mon).sort((a, b) => b[0] - a[0]).map(([m, liste]) => {
                  const mk = `m${j}-${m}`
                  return (
                    <div key={mk}>
                      <Knoten offen={offen[mk]} onClick={() => umschalten(mk)} titel={MONATE[m]} zahl={liste.length} />
                      {offen[mk] && <div className="pl-3 border-l border-white/10 ml-4 space-y-1.5 pb-1">
                        {liste.map((a) => {
                          const x = abrechnungWerte(a)
                          const n = (a.pruefung || []).filter((c) => c.status === 'abweichung' && c.id !== 'auszahlung').length
                          const orig = originalTeilen(a.fotos || [])
                          return (
                            <div key={a.id} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <FileCheck2 className="w-4 h-4 text-cyan-300 shrink-0" />
                                <span className="flex-1 font-semibold truncate">{a.buero || 'Lohnabrechnung'}</span>
                                {a.nurArchiv ? <span className="text-xs text-white/60">nur abgelegt</span> : n ? <span className="text-xs text-ember inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />{n} Abweichung{n > 1 ? 'en' : ''}</span> : <CheckCircle2 className="w-4 h-4 text-lime" />}
                              </div>
                              <div className="text-xs text-white/60">{a.von.split('-').reverse().join('.')} – {a.bis.split('-').reverse().join('.')}{a.firma ? ` · ${a.firma}` : ''}</div>
                              {!a.nurArchiv && <div className="grid grid-cols-3 gap-1 text-xs tabular-nums">
                                <span><span className="text-white/55">brutto </span>{x.brutto.toFixed(2)}</span>
                                <span><span className="text-white/55">netto </span>{x.netto.toFixed(2)}</span>
                                <span><span className="text-white/55">aus. </span>{x.auszahlung.toFixed(2)}</span>
                              </div>}
                              <div className="grid grid-cols-2 gap-1.5">
                                {(orig.bilder.length + orig.pdfs.length) > 0
                                  ? <button onClick={() => setOriginal({ titel: `Lohnabrechnung ${MONATE[m]} ${j}`, ...orig, name: `Lohnabrechnung_${j}-${String(+m + 1).padStart(2, '0')}_${(a.buero || '').replace(/[^\w]+/g, '_')}.pdf` })}
                                    className="rounded-xl py-2.5 px-2 bg-emerald-400/15 border border-emerald-400/30 text-emerald-200 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><FileImage className="w-4 h-4" /> Original</button>
                                  : <span className="text-xs text-white/50 self-center">kein Original gespeichert</span>}
                                <button onClick={() => setPruefung(a)} className="rounded-xl py-2.5 px-2 bg-white/[0.06] text-sm inline-flex items-center justify-center gap-1.5"><ScanSearch className="w-4 h-4" /> {a.nurArchiv ? 'Jetzt prüfen' : 'Prüfung'}</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>}
                    </div>
                  )
                })}
              </div>}
            </div>
          )
        })}
      </section>

      <div className="text-xs text-white/55 flex gap-2"><Info className="w-4 h-4 shrink-0" /> Ohne Gewähr, keine Steuerberatung. Massgebend sind der Lohnausweis des Büros und die Wegleitung deines Kantons.</div>

      {original && <OriginalSheet {...original} onClose={() => setOriginal(null)} />}
      <LohnDetailSheet d={detail} w={w} onClose={() => setDetail(null)} />
      {pruefung && <LohnPruefung gespeichert={pruefung === true ? null : pruefung} onClose={() => setPruefung(null)} />}
    </div>
  )
}

const Kachel = ({ titel, wert, sub, rot, onClick }) => (
  <button onClick={onClick} className="rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-2 text-left">
    <div className="text-xs text-white/60">{titel}</div>
    <div className={'font-bold tabular-nums ' + (rot ? 'text-rose-300' : '')}>{wert}</div>
    {sub && <div className="text-xs text-white/55">{sub}</div>}
  </button>
)

function Knoten({ offen, onClick, titel, zahl, gross }) {
  const Icon = offen ? FolderOpen : Folder
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2 py-2.5 rounded-xl hover:bg-white/5 text-left min-h-[44px]">
      <ChevronRight className={'w-4 h-4 shrink-0 transition ' + (offen ? 'rotate-90' : '')} />
      <Icon className="w-5 h-5 shrink-0 text-amber-300" />
      <span className={'flex-1 truncate ' + (gross ? 'text-lg font-bold' : 'font-semibold')}>{titel}</span>
      <span className="text-xs text-white/60 tabular-nums shrink-0">{zahl}</span>
    </button>
  )
}

/** Gestapelte Monatssäulen: Netto + Sozialabzüge + BVG + Quellensteuer + Übrige = Brutto */
function MonatsSaeulen({ monate, onWahl }) {
  const W = 340, H = 190, unten = 22, oben = 18, links = 4
  const max = Math.max(1, ...monate.map((x) => x.brutto))
  const bw = (W - links) / 12
  const y = (v) => H - unten - (v / max) * (H - unten - oben)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="Lohn pro Monat">
      {monate.map((x, i) => {
        const gr = gruppen(x)
        const teile = [['netto', x.netto], ['sozial', gr.sozial], ['bvg', gr.bvg], ['quellensteuer', gr.quellensteuer], ['uebrige', gr.uebrige]]
        let acc = 0
        const cx = links + i * bw
        return (
          <g key={x.key} onClick={() => x.brutto > 0 && onWahl(x)} style={{ cursor: x.brutto > 0 ? 'pointer' : 'default' }} opacity={x.quelle === 'abrechnung' ? 1 : 0.45}>
            <rect x={cx} y={oben} width={bw} height={H - unten - oben} fill="transparent" />
            {teile.filter(([, v]) => v > 0).map(([k, v]) => {
              const y0 = y(acc), y1 = y(acc + v); acc += v
              return <rect key={k} x={cx + 3} y={y1} width={bw - 6} height={Math.max(0, y0 - y1)} fill={FARBEN[k]} rx="1.5" />
            })}
            {x.brutto > 0 && <text x={cx + bw / 2} y={y(x.brutto) - 4} textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,.75)">{kurz(x.netto)}</text>}
            <text x={cx + bw / 2} y={H - 7} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.6)">{x.name.slice(0, 3)}</text>
          </g>
        )
      })}
    </svg>
  )
}
