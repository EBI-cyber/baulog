import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, BarChart3, Table2, Clock, Banknote, TrendingUp, Gauge, ArrowRight } from 'lucide-react'
import { db } from '../lib/db'
import { useEinstellungen, zahl } from '../lib/settings'
import { chf } from '../lib/lohn'
import { kantonFuer } from '../lib/kanton'
import { quellensteuerPflichtig, tarif } from '../lib/profil'
import { tarifLaden } from '../lib/quellensteuer'
import { wocheVersetzt, isoDatum } from '../lib/zeit'
import { perioden, auswerten, zusammenfassen, aktuelleWoche, MONATE_LANG } from '../lib/statistik'

// Diagrammfarben (geprüft: Helligkeit, Farbsehschwäche, Kontrast auf dunklem Grund)
const FARBE_A = '#0891b2' // gearbeitet / netto
const FARBE_B = '#8b5cf6' // bezahlte Abwesenheit
const FARBE_SCHNITT = '#fbbf24' // Durchschnittslinie

const h2 = (h) => (Math.round((h || 0) * 100) / 100).toFixed(2)
const kurzChf = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(Math.round(n)))
const ART_NAME = { woche: 'Woche', monat: 'Monat', jahr: 'Jahr' }
const ART_MEHR = { woche: 'Wochen', monat: 'Monate', jahr: 'Jahre' }

/** runde Skala: 0 … max in 3–4 Schritten */
function skala(max) {
  if (!(max > 0)) return { top: 1, ticks: [0] }
  const roh = max / 3, p = 10 ** Math.floor(Math.log10(roh))
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= roh)
  const top = Math.ceil(max / schritt) * schritt
  const ticks = []
  for (let t = 0; t <= top + 1e-9; t += schritt) ticks.push(t)
  return { top, ticks }
}

/** Säulen (gestapelt a + b), optional Soll-Marke je Säule. Antippen wählt einen Zeitraum. */
function Saeulen({ werte, a, b, soll, wahl, onWahl, format, wert, schnitt, schnittText, schnittVon = 0, schnittBis = null }) {
  const W = 340, H = 190, L = 34, R = 4, T = 16, B = 22
  const n = werte.length, band = (W - L - R) / n, bw = Math.min(26, band * 0.62)
  const max = Math.max(1, ...werte.map((w) => (w.leer ? 0 : a(w) + b(w))), ...(soll ? werte.map((w) => (w.leer ? 0 : soll(w) || 0)) : []), schnitt || 0)
  const { top, ticks } = skala(max)
  const y = (v) => T + (H - T - B) * (1 - v / top)
  const saeule = (x, y0, y1, rund) => {
    const h = y0 - y1
    if (h <= 0.5) return null
    const r = rund ? Math.min(4, h, bw / 2) : 0
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z`
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="Säulendiagramm">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.08)" strokeWidth="1" />
          <text x={L - 5} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.55)">{format(t)}</text>
        </g>
      ))}
      {werte.map((w, i) => {
        const x = L + i * band + (band - bw) / 2
        const va = w.leer ? 0 : a(w), vb = w.leer ? 0 : b(w)
        const aktiv = wahl === w.key
        const blass = wahl && !aktiv ? 0.45 : 1
        const ya = y(va), yb = y(va + vb)
        const sv = soll && !w.leer ? soll(w) : 0
        return (
          <g key={w.key} onClick={() => !w.zukunft && onWahl(w.key)} style={{ cursor: w.zukunft ? 'default' : 'pointer' }}>
            <rect x={L + i * band} y={T - 14} width={band} height={H - T - B + 14 + B} fill={aktiv ? 'rgba(255,255,255,.06)' : 'transparent'} rx="6" />
            <g opacity={blass * (w.laufend ? 0.75 : 1)}>
              {saeule(x, y(0), vb > 0 ? ya + (va > 0 ? 1 : 0) : ya, vb <= 0) && <path d={saeule(x, y(0), vb > 0 ? ya + (va > 0 ? 1 : 0) : ya, vb <= 0)} fill={FARBE_A} />}
              {vb > 0 && saeule(x, ya - (va > 0 ? 1 : 0), yb, true) && <path d={saeule(x, ya - (va > 0 ? 1 : 0), yb, true)} fill={FARBE_B} />}
            </g>
            {sv > 0 && <line x1={x - 3} x2={x + bw + 3} y1={y(sv)} y2={y(sv)} stroke="rgba(255,255,255,.75)" strokeWidth="1.5" strokeDasharray="3 2" />}
            {!w.leer && va + vb > 0 && <text x={x + bw / 2} y={Math.min(yb, sv ? y(sv) - 1 : yb) - 4} textAnchor="middle" fontSize={band < 30 ? 8.5 : 10} fontWeight={aktiv ? 800 : 600} fill={aktiv ? '#ffffff' : 'rgba(234,246,248,.85)'}>{wert(va + vb, band)}</text>}
            <text x={x + bw / 2} y={H - 7} textAnchor="middle" fontSize="10" fill={aktiv ? '#eaf6f8' : 'rgba(255,255,255,.6)'} fontWeight={aktiv ? 700 : 400}>{w.kurz}</text>
          </g>
        )
      })}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.25)" strokeWidth="1" />
      {schnitt > 0 && <g pointerEvents="none">
        {(() => {
          // Linie nur über den Säulen des Durchschnitts-Zeitraums (z.B. Wochen des Monats); Beschriftung bleibt im Bild
          const x1 = L + schnittVon * band + 2, x2 = L + ((schnittBis ?? n - 1) + 1) * band - 2
          const bw2 = schnittText.length * 5.6 + 8, lx = Math.max(L + 1, Math.min(x1, W - R - bw2))
          return <>
            <line x1={x1} x2={x2} y1={y(schnitt)} y2={y(schnitt)} stroke={FARBE_SCHNITT} strokeWidth="1.5" />
            <rect x={lx} y={y(schnitt) - 13} width={bw2} height="12" rx="3" fill="#0d1d26" opacity=".85" />
            <text x={lx + 4} y={y(schnitt) - 4} fontSize="9.5" fontWeight="700" fill={FARBE_SCHNITT}>{schnittText}</text>
          </>
        })()}
      </g>}
    </svg>
  )
}

function Kachel({ icon: I, titel, wert, sub, farbe = '' }) {
  return (
    <div className="glass rounded-2xl p-3.5 min-w-0">
      <div className="text-xs text-white/65 inline-flex items-center gap-1.5"><I className="w-3.5 h-3.5" /> {titel}</div>
      <div className={'text-xl font-extrabold tabular-nums leading-tight mt-0.5 ' + farbe}>{wert}</div>
      {sub && <div className="text-xs text-white/60 tabular-nums">{sub}</div>}
    </div>
  )
}

function Zeile({ label, wert, stark, farbe = '' }) {
  return (
    <div className={'flex items-baseline justify-between gap-3 py-1.5 border-t border-white/5 first:border-t-0 ' + (stark ? 'font-bold' : '')}>
      <span className={stark ? '' : 'text-white/75'}>{label}</span>
      <span className={'tabular-nums text-right ' + farbe}>{wert}</span>
    </div>
  )
}

/**
 * Statistik: Stunden und Verdienst je Woche (12 KW), Monat (12 Monate) und Jahr — Säulen zum Antippen,
 * Kennzahlen (Total, Ø je abgeschlossenen Zeitraum, bester Zeitraum), Details und Tabelle.
 */
export default function Statistik() {
  const [einst] = useEinstellungen()
  const heute = isoDatum(new Date())
  const jetzt = aktuelleWoche()
  const [art, setArt] = useState('woche')
  const [mass, setMass] = useState('stunden')
  const [ankerWoche, setAnkerWoche] = useState(jetzt)
  const [jahr, setJahr] = useState(new Date().getFullYear())
  const [wahl, setWahl] = useState(null)

  const daten = useLiveQuery(async () => ({
    schichten: (await db.schichten.toArray()).filter((s) => s.ende != null),
    absenzen: await db.absenzen.toArray(),
    spesen: await db.spesen.toArray(),
    einsaetze: await db.einsaetze.toArray(),
    erster: (await db.schichten.orderBy('start').first())?.datum || null,
  }), [], null)

  const ersterJahr = daten?.erster ? +daten.erster.slice(0, 4) : new Date().getFullYear()
  const jahre = useMemo(() => { const out = []; for (let j = ersterJahr; j <= new Date().getFullYear(); j++) out.push(j); return out }, [ersterJahr])

  // Quellensteuer-Tabellen je Jahr (wie im Lohn)
  const p = einst?.profil
  const auto = quellensteuerPflichtig(p) && !zahl(p?.qstSatz) && p?.wohnkanton
  const [qstTarife, setQstTarife] = useState({})
  useEffect(() => {
    let aktiv = true
    if (!auto) { setQstTarife({}); return }
    Promise.all(jahre.map((j) => tarifLaden(j, p.wohnkanton, tarif(p)).then((t) => [j, t]))).then((l) => aktiv && setQstTarife(Object.fromEntries(l)))
    return () => { aktiv = false }
  }, [auto, jahre.join(), p?.wohnkanton]) // eslint-disable-line react-hooks/exhaustive-deps

  const kanton = useMemo(() => daten ? kantonFuer([...new Set(daten.schichten.map((s) => s.firma))], daten.einsaetze, einst) : '', [daten, einst])

  const werte = useMemo(() => {
    if (!daten) return null
    const liste = art === 'woche' ? perioden('woche', ankerWoche) : art === 'monat' ? perioden('monat', jahr) : perioden('jahr', [jahre[0], jahre[jahre.length - 1]])
    // Wochen vor dem ersten Eintrag weglassen (mind. 6 Säulen bleiben)
    const sichtbar = art === 'woche' && daten.erster ? liste.filter((x, i) => x.bis >= daten.erster || i >= liste.length - 6) : liste
    return sichtbar.map((x) => auswerten({ p: x, daten, einst, kanton, qstTarife, heute }))
  }, [daten, art, ankerWoche, jahr, jahre, einst, kanton, qstTarife, heute])

  // Auswahl: zuletzt gewählter Zeitraum, sonst der jüngste mit Daten
  const gewaehlt = werte && (werte.find((w) => w.key === wahl) || [...werte].reverse().find((w) => !w.leer) || [...werte].reverse().find((w) => !w.zukunft))
  const sum = werte ? zusammenfassen(werte) : null
  const w$ = einst.waehrung
  const zeilen = werte ? werte.filter((w) => !w.leer) : []
  const name = (w) => `${art === 'woche' ? `KW ${w.kurz}` : w.kurz}${w.laufend ? ' …' : ''}`
  const fr = (n) => (n || 0).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const pm = (h) => `${h >= 0 ? '+' : '−'}${h2(Math.abs(h))}`
  // Durchschnitt über abgeschlossene Zeiträume mit Einträgen (laufender zählt nicht).
  // Wochen: Ø pro Woche im Monat der gewählten Woche (Monat = Donnerstag der KW), Linie nur über diesen Wochen.
  const wert1 = (w) => (mass === 'stunden' ? w.ist : w.netto)
  let schnittWert = sum && sum.fertig > 0 ? (mass === 'stunden' ? sum.schnittIst : sum.schnittNetto) : null
  let schnittVon = 0, schnittBis = null, schnittMonat = null, schnittN = sum?.fertig || 0, schnittLaufend = false
  if (art === 'woche' && werte && gewaehlt?.monat) {
    const m = gewaehlt.monat
    const imMonat = werte.filter((w) => w.monat === m && !w.leer)
    const fertig = imMonat.filter((w) => !w.laufend)
    const basis = fertig.length ? fertig : imMonat
    schnittLaufend = !fertig.length && imMonat.length > 0
    schnittWert = basis.length ? basis.reduce((x, w) => x + wert1(w), 0) / basis.length : null
    schnittN = basis.length
    const idx = werte.map((w, i) => (w.monat === m ? i : -1)).filter((i) => i >= 0)
    schnittVon = idx[0] ?? 0; schnittBis = idx[idx.length - 1] ?? null
    schnittMonat = MONATE_LANG[+m.slice(5, 7) - 1]
  }

  const blaettern = (d) => {
    setWahl(null)
    if (art === 'woche') {
      const neu = wocheVersetzt(ankerWoche, d * 12)
      const grenze = wocheVersetzt(jetzt, 0)
      setAnkerWoche(neu.jahr * 100 + neu.kw > grenze.jahr * 100 + grenze.kw ? jetzt : neu)
    } else if (art === 'monat') setJahr(jahr + d)
  }
  const kannVor = art === 'woche' ? ankerWoche.jahr * 100 + ankerWoche.kw < jetzt.jahr * 100 + jetzt.kw : art === 'monat' && jahr < new Date().getFullYear()
  const kannZurueck = art === 'woche' ? !!(werte && daten?.erster && werte[0].von > daten.erster) : art === 'monat' && jahr > ersterJahr
  const zeitraum = werte && (art === 'woche' ? `KW ${werte[0].kurz} – KW ${werte[werte.length - 1].kurz} · ${werte[0].von.slice(0, 4) === werte[werte.length - 1].von.slice(0, 4) ? werte[werte.length - 1].von.slice(0, 4) : `${werte[0].von.slice(0, 4)}/${werte[werte.length - 1].bis.slice(0, 4)}`}` : art === 'monat' ? String(jahr) : `${jahre[0]} – ${jahre[jahre.length - 1]}`)

  const stunden = mass === 'stunden'
  const detailLink = gewaehlt && (art === 'woche' ? `/woche/${gewaehlt.key}` : art === 'monat' ? `/kalender/${gewaehlt.key}` : null)

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight flex-1">Statistik</h1>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {['woche', 'monat', 'jahr'].map((a) => (
          <button key={a} onClick={() => { setArt(a); setWahl(null) }}
            className={'rounded-2xl py-2.5 font-semibold ' + (art === a ? 'btn-grad' : 'bg-white/[0.06] border border-white/10 text-white/80')}>{ART_MEHR[a]}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[['stunden', 'Stunden', Clock], ['verdienst', 'Verdienst', Banknote]].map(([k, l, I]) => (
          <button key={k} onClick={() => setMass(k)}
            className={'rounded-2xl py-2.5 font-semibold inline-flex items-center justify-center gap-2 border ' + (mass === k ? 'bg-white/15 border-white/30 text-white' : 'bg-transparent border-white/10 text-white/70')}>
            <I className="w-4 h-4" /> {l}</button>
        ))}
      </div>

      {!werte ? <div className="text-white/60 text-center py-10">Wird berechnet …</div> : <>
        <section className="glass rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            {art !== 'jahr' && <button onClick={() => blaettern(-1)} disabled={!kannZurueck} className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center disabled:opacity-30" aria-label="Zurück"><ChevronLeft className="w-5 h-5" /></button>}
            <div className="flex-1 text-center">
              <div className="font-bold">{stunden ? 'Geleistete Stunden' : 'Verdienst'}</div>
              <div className="text-sm text-white/65">{zeitraum}</div>
            </div>
            {art !== 'jahr' && <button onClick={() => blaettern(1)} disabled={!kannVor} className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center disabled:opacity-30" aria-label="Weiter"><ChevronRight className="w-5 h-5" /></button>}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: FARBE_A }} />{stunden ? 'Gearbeitet' : 'Ausbezahlt'}</span>
            {(stunden || sum.rueckstellung > 0) && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: FARBE_B }} />{stunden ? 'Bezahlte Abwesenheit' : 'Ferien einbehalten'}</span>}
            {stunden && art !== 'jahr' && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed border-white/75" />Soll</span>}
            {schnittWert > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 border-t-2" style={{ borderColor: FARBE_SCHNITT }} />{schnittMonat ? `Ø pro Woche im ${schnittMonat}${schnittLaufend ? ' (bisher)' : ''}` : `Durchschnitt${sum.fertig < sum.anzahl ? ' (abgeschlossene)' : ''}`}</span>}
          </div>

          {sum.anzahl === 0
            ? <div className="text-center text-white/60 py-8">Keine Einträge in diesem Zeitraum.</div>
            : <Saeulen werte={werte} wahl={gewaehlt?.key} onWahl={setWahl}
                a={(w) => (stunden ? w.arbeit : w.lohnFehlt ? 0 : w.netto - w.rueckstellung)} b={(w) => (stunden ? w.abw : w.lohnFehlt ? 0 : w.rueckstellung)}
                soll={stunden && art !== 'jahr' ? (w) => w.soll : null}
                format={stunden ? (v) => String(Math.round(v * 10) / 10) : kurzChf}
                schnitt={schnittWert} schnittVon={schnittVon} schnittBis={schnittBis} schnittText={`Ø ${schnittMonat ? schnittMonat.slice(0, 3) + ' ' : ''}${stunden ? `${h2(schnittWert)} h` : Math.round(schnittWert || 0).toLocaleString('de-CH')}`}
                wert={stunden ? (v, band) => (band < 30 ? (Math.round(v * 10) / 10).toFixed(1) : h2(v)) : (v) => Math.round(v).toLocaleString('de-CH')} />}
          <div className="text-xs text-white/60 text-center">{stunden ? 'Stunden je Säule' : `Zahl = Netto in ${w$}`} · antippen für Details{werte.some((w) => w.laufend && !w.leer) ? ' · heller = läuft noch' : ''}</div>
        </section>

        {sum.anzahl > 0 && <section className="glass rounded-3xl p-4">
          <div className="flex items-center gap-2 font-semibold">
            <Table2 className="w-4 h-4 text-white/65" /> Übersicht: Stunden & Verdienst
          </div>
          <div className="text-xs text-white/60 mt-3 mb-1">Stunden</div>
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-white/60 text-xs">
              <th className="text-left font-normal py-1">{ART_NAME[art]}</th>
              <th className="text-right font-normal">Gearbeitet</th>
              <th className="text-right font-normal">Abwesend</th>
              <th className="text-right font-normal">Total</th>
              {art !== 'jahr' && <th className="text-right font-normal">±Soll</th>}
            </tr></thead>
            <tbody>{zeilen.map((w) => (
              <tr key={w.key} onClick={() => setWahl(w.key)} className={'border-t border-white/5 ' + (gewaehlt?.key === w.key ? 'bg-white/[0.06]' : '')}>
                <td className="py-2">{name(w)}</td>
                <td className="text-right text-white/75">{h2(w.arbeit)}</td>
                <td className="text-right text-white/75">{w.abw > 0 ? h2(w.abw) : '–'}</td>
                <td className="text-right font-semibold">{h2(w.ist)}</td>
                {art !== 'jahr' && <td className={'text-right ' + (w.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{pm(w.saldo)}</td>}
              </tr>
            ))}
            {zeilen.length > 1 && <tr className="border-t border-white/20 font-bold">
              <td className="py-2">Total</td>
              <td className="text-right">{h2(sum.arbeit)}</td>
              <td className="text-right">{sum.abw > 0 ? h2(sum.abw) : '–'}</td>
              <td className="text-right">{h2(sum.ist)}</td>
              {art !== 'jahr' && <td className={'text-right ' + (sum.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{pm(sum.saldo)}</td>}
            </tr>}
            </tbody>
          </table>

          <div className="text-xs text-white/60 mt-4 mb-1">Verdienst in {w$}: Brutto − Abzüge (AHV, ALV, BVG …){sum.rueckstellung > 0 ? ' − Ferien einbehalten' : ''}{sum.spesen > 0 ? ' + Spesen' : ''} = Auszahlung</div>
          <table className="w-full text-sm tabular-nums [&_td+td]:pl-2 [&_th+th]:pl-2">
            <thead><tr className="text-white/60 text-xs">
              <th className="text-left font-normal py-1">{ART_NAME[art]}</th>
              <th className="text-right font-normal">Brutto</th>
              <th className="text-right font-normal">Abzüge</th>
              {sum.rueckstellung > 0 && <th className="text-right font-normal">Ferien<br />einbeh.</th>}
              {sum.spesen > 0 && <th className="text-right font-normal">Spesen</th>}
              <th className="text-right font-normal">Aus&shy;zahlung</th>
            </tr></thead>
            <tbody>{zeilen.map((w) => (
              <tr key={w.key} onClick={() => setWahl(w.key)} className={'border-t border-white/5 ' + (gewaehlt?.key === w.key ? 'bg-white/[0.06]' : '')}>
                <td className="py-2 whitespace-nowrap">{name(w)}</td>
                {w.lohnFehlt ? <td colSpan={3 + (sum.rueckstellung > 0) + (sum.spesen > 0)} className="text-right text-white/60">kein Stundenlohn</td> : <>
                  <td className="text-right text-white/75">{fr(w.brutto)}</td>
                  <td className="text-right text-rose-300">−{fr(w.abzuege)}</td>
                  {sum.rueckstellung > 0 && <td className="text-right text-violet-300">{w.rueckstellung > 0 ? `−${fr(w.rueckstellung)}` : '–'}</td>}
                  {sum.spesen > 0 && <td className="text-right">{w.spesen > 0 ? `+${fr(w.spesen)}` : '–'}</td>}
                  <td className="text-right font-bold">{fr(w.auszahlung)}</td>
                </>}
              </tr>
            ))}
            {zeilen.length > 1 && <tr className="border-t border-white/20 font-bold">
              <td className="py-2">Total</td>
              <td className="text-right">{fr(sum.brutto)}</td>
              <td className="text-right text-rose-300">−{fr(sum.abzuege)}</td>
              {sum.rueckstellung > 0 && <td className="text-right text-violet-300">−{fr(sum.rueckstellung)}</td>}
              {sum.spesen > 0 && <td className="text-right">+{fr(sum.spesen)}</td>}
              <td className="text-right">{fr(sum.auszahlung)}</td>
            </tr>}
            </tbody>
          </table>
          {sum.rueckstellung > 0 && <div className="text-xs text-white/65 mt-2 rounded-xl px-3 py-2 bg-violet-400/10 border border-violet-400/25">
            <b className="text-violet-300">Ferien einbehalten</b> = Feriengeld, das das Büro nicht jede Woche auszahlt, sondern für dich spart (Guthaben). Du bekommst es, wenn du Ferien beziehst oder der Einsatz endet — darum ist die Auszahlung tiefer als das Netto.
          </div>}
        </section>}

        {sum.anzahl > 0 && <div className="grid grid-cols-2 gap-3">
          {stunden ? <>
            <Kachel icon={Clock} titel="Total" wert={`${h2(sum.ist)} h`} sub={sum.abw > 0 ? `davon ${h2(sum.ist - sum.arbeit)} h Abwesenheit` : `${sum.anzahl} ${sum.anzahl === 1 ? ART_NAME[art] : ART_MEHR[art]} mit Einträgen`} />
            <Kachel icon={Gauge} titel={schnittMonat ? `Ø pro Woche im ${schnittMonat}` : `Ø pro ${ART_NAME[art]}`} wert={schnittWert != null ? `${h2(schnittWert)} h` : '–'} sub={schnittN ? `aus ${schnittN} ${schnittLaufend ? 'laufenden' : 'abgeschlossenen'}` : 'noch keiner abgeschlossen'} />
            {art !== 'jahr' && <Kachel icon={TrendingUp} titel={sum.saldo >= 0 ? 'Überstunden' : 'Minusstunden'} wert={`${sum.saldo >= 0 ? '+' : '−'}${h2(Math.abs(sum.saldo))} h`} sub={`Soll ${h2(sum.soll)} h`} farbe={sum.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400'} />}
            {sum.maxIst && <Kachel icon={BarChart3} titel="Meiste Stunden" wert={`${h2(sum.maxIst.ist)} h`} sub={sum.maxIst.titel} />}
          </> : <>
            <Kachel icon={Banknote} titel="Netto total" wert={chf(sum.netto, w$)} sub={sum.rueckstellung > 0 ? `ausbezahlt ${chf(sum.auszahlung, w$)} · Ferien ${chf(sum.rueckstellung, w$)}` : `brutto ${chf(sum.brutto, w$)}`} />
            <Kachel icon={Gauge} titel={schnittMonat ? `Ø netto pro Woche im ${schnittMonat}` : `Ø netto pro ${ART_NAME[art]}`} wert={schnittWert != null ? chf(schnittWert, w$) : '–'} sub={schnittN ? `aus ${schnittN} ${schnittLaufend ? 'laufenden' : 'abgeschlossenen'} ${art === 'woche' ? (schnittN === 1 ? 'Woche' : 'Wochen') : ''}` : 'noch keiner abgeschlossen'} />
            <Kachel icon={Clock} titel="Netto pro Stunde" wert={sum.proStunde != null ? chf(sum.proStunde, w$) : '–'} sub="inkl. bezahlte Abwesenheit" />
            {sum.maxNetto && <Kachel icon={TrendingUp} titel="Bester Verdienst" wert={chf(sum.maxNetto.netto, w$)} sub={sum.maxNetto.titel} />}
          </>}
        </div>}

        {gewaehlt && !gewaehlt.zukunft && <section className="glass rounded-3xl p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div>
              <div className="font-bold">{gewaehlt.titel}</div>
              <div className="text-xs text-white/60">{gewaehlt.laufend ? `läuft noch · Stand ${heute.split('-').reverse().join('.')}` : 'abgeschlossen'}</div>
            </div>
            {detailLink && <Link to={detailLink} className="text-sm text-aqua inline-flex items-center gap-1 shrink-0">{art === 'woche' ? 'Zur Woche' : 'Zum Kalender'} <ArrowRight className="w-4 h-4" /></Link>}
          </div>
          {gewaehlt.leer ? <div className="text-sm text-white/60 py-2">Keine Einträge.</div> : <div className="text-sm">
            {stunden ? <>
              <Zeile label={`Gearbeitet (${gewaehlt.tage} ${gewaehlt.tage === 1 ? 'Tag' : 'Tage'})`} wert={`${h2(gewaehlt.arbeit)} h`} />
              {gewaehlt.abw > 0 && <Zeile label="Bezahlte Abwesenheit" wert={`${h2(gewaehlt.abw)} h`} />}
              <Zeile label="Total angerechnet" wert={`${h2(gewaehlt.ist)} h`} stark />
              <Zeile label="Soll" wert={`${h2(gewaehlt.soll)} h`} />
              <Zeile label={gewaehlt.saldo >= 0 ? 'Überstunden' : 'Minusstunden'} wert={`${gewaehlt.saldo >= 0 ? '+' : '−'}${h2(Math.abs(gewaehlt.saldo))} h`} farbe={gewaehlt.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              {Object.keys(gewaehlt.nachArt).length > 0 && <Zeile label="Abwesend" wert={Object.entries(gewaehlt.nachArt).map(([k, n]) => `${n} T. ${k}`).join(', ')} />}
            </> : gewaehlt.lohnFehlt ? <div className="text-white/65 py-2">Kein Stundenlohn im Einsatz hinterlegt — in den Einstellungen beim Einsatz eintragen.</div> : <>
              <Zeile label="Bruttolohn" wert={chf(gewaehlt.brutto, w$)} />
              <Zeile label="Abzüge" wert={`− ${chf(gewaehlt.abzuege, w$)}`} farbe="text-rose-300" />
              <Zeile label="Nettolohn" wert={chf(gewaehlt.netto, w$)} stark />
              {gewaehlt.spesen > 0 && <Zeile label="Spesen" wert={chf(gewaehlt.spesen, w$)} />}
              {gewaehlt.rueckstellung > 0 && <Zeile label="Ferien einbehalten (Guthaben)" wert={`− ${chf(gewaehlt.rueckstellung, w$)}`} farbe="text-violet-300" />}
              <Zeile label="Auszahlung" wert={chf(gewaehlt.auszahlung, w$)} stark />
              {gewaehlt.ist > 0 && <Zeile label="Netto pro Stunde" wert={chf(gewaehlt.netto / gewaehlt.ist, w$)} />}
            </>}
          </div>}
        </section>}


        <div className="text-xs text-white/60 px-1">Geschätzt aus deinen Zeiten und dem Einsatzvertrag (wie im Lohn). Stunden = Arbeitszeit + bezahlte Abwesenheiten; Soll ab Einsatzbeginn ohne Feiertage. Massgebend ist die Abrechnung des Büros.</div>
      </>}
    </div>
  )
}
