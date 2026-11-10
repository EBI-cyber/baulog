import { useEffect, useState } from 'react'
import { tarifLaden, satzFuer } from '../lib/quellensteuer'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Check, User, IdCard, Landmark, Briefcase, Car, PenLine, CheckCircle2 } from 'lucide-react'
import { useEinstellungen } from '../lib/settings'
import { KANTONE } from '../lib/feiertage'
import { STATUS, quellensteuerPflichtig, tarifAuto, tarif, alter, ferienMindestProzent, ausweisTage } from '../lib/profil'
import Unterschrift from '../components/Unterschrift'
import OrtSuche from '../components/OrtSuche'
import IconChip from '../ui/IconChip'

function Chips({ werte, wert, onWahl }) {
  return (
    <div className="flex flex-wrap gap-2">
      {werte.map(([id, label]) => (
        <button key={String(id)} type="button" onClick={() => onWahl(id)}
          className={'px-3.5 py-2 rounded-xl text-sm border ' + (wert === id ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/70')}>{label}</button>
      ))}
    </div>
  )
}
const Frage = ({ titel, hinweis, children }) => (
  <div className="space-y-2">
    <div className="font-semibold">{titel}</div>
    {hinweis && <div className="text-xs text-white/45">{hinweis}</div>}
    {children}
  </div>
)
const JaNein = ({ wert, onWahl }) => <Chips werte={[[true, 'Ja'], [false, 'Nein']]} wert={wert} onWahl={onWahl} />

/** Quellensteuer: Tarif und Satz automatisch aus der offiziellen ESTV-Tabelle — Eingaben nur als Korrektur */
function QstVorschau({ p, setP }) {
  const [t, setT] = useState(undefined)
  const [korrektur, setKorrektur] = useState(!!(p.qstTarif || p.qstSatz))
  const code = p.qstTarif || tarifAuto(p)
  useEffect(() => {
    let aktiv = true
    setT(undefined)
    if (p.wohnkanton) tarifLaden(new Date().getFullYear(), p.wohnkanton, code).then((x) => aktiv && setT(x))
    return () => { aktiv = false }
  }, [p.wohnkanton, code])
  return (
    <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-3 space-y-2">
      <div className="text-sm">Dein Tarif: <b className="font-mono text-base">{code}</b>{p.wohnkanton ? ` · Wohnkanton ${p.wohnkanton}` : ''}</div>
      {!p.wohnkanton ? <div className="text-sm text-amber-300">Bitte im ersten Schritt den Wohnkanton wählen — er bestimmt die Quellensteuer.</div>
        : t === undefined ? <div className="text-xs text-white/40">Offizielle Tabelle wird geladen …</div>
        : t ? (
          <>
            <div className="text-sm text-white/75">Der Satz wird <b>automatisch</b> aus der offiziellen Tabelle der Steuerverwaltung ({t.kanton} {t.jahr}) berechnet — je nach Monatslohn:</div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
              {[4000, 5000, 6000, 7000].map((b) => (
                <div key={b} className="rounded-lg bg-white/[0.05] py-1.5"><div className="text-white/45">{b.toLocaleString('de-CH')}</div><b className="text-sm">{satzFuer(t, b).toFixed(2)} %</b></div>
              ))}
            </div>
            <div className="text-xs text-white/40">Du musst nichts eintragen.</div>
          </>
        ) : <div className="text-sm text-amber-300">Tabelle gerade nicht erreichbar — der Satz wird automatisch nachgeladen.</div>}
      <button type="button" onClick={() => setKorrektur(!korrektur)} className="text-xs text-white/45 underline">Lohnabrechnung zeigt etwas anderes?</button>
      {korrektur && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-white/50 mb-1">Tarif laut Abrechnung</label>
            <input className="eingabe font-mono" placeholder={tarifAuto(p)} value={p.qstTarif} onChange={(e) => setP({ qstTarif: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Fester Satz % (leer = automatisch)</label>
            <input className="eingabe" inputMode="decimal" placeholder="automatisch" value={p.qstSatz} onChange={(e) => setP({ qstSatz: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Fragebogen „Meine Situation“ — passt die App an die Person an */
export default function Fragebogen() {
  const nav = useNavigate()
  const [einst, setEinst] = useEinstellungen()
  const p = einst.profil
  const setP = (teil) => setEinst({ profil: { ...p, ...teil } })
  const qst = quellensteuerPflichtig(p)

  const schritte = [
    { icon: User, titel: 'Zu dir', inhalt: (
      <>
        <Frage titel="Dein Name" hinweis="Steht auf jedem Rapport.">
          <input className="eingabe" value={einst.name} autoComplete="name" placeholder="Vorname Nachname" onChange={(e) => setEinst({ name: e.target.value })} />
        </Frage>
        <Frage titel="Geburtsdatum" hinweis="Für den Ferienanspruch (unter 20 und ab 50 Jahren mehr Ferien).">
          <input className="eingabe" type="date" value={p.geburtsdatum} onChange={(e) => setP({ geburtsdatum: e.target.value })} />
        </Frage>
        <Frage titel="Wohnort" hinweis="Ort oder PLZ eintippen und auswählen — PLZ und Kanton werden ergänzt. Der Wohnkanton bestimmt die Quellensteuer.">
          <OrtSuche wert={p.ort ? `${p.plz} ${p.ort}`.trim() : ''} onWahl={(t) => setP({ plz: t.plz, ort: t.ort, wohnkanton: t.kanton })} />
          {p.wohnkanton && <div className="text-sm text-white/60">Kanton: <b className="text-white">{KANTONE[p.wohnkanton]} ({p.wohnkanton})</b></div>}
        </Frage>
      </>
    ) },
    { icon: IdCard, titel: 'Aufenthalt', inhalt: (
      <>
        <Frage titel="Welchen Ausweis hast du?" hinweis="Davon hängt ab, ob Quellensteuer abgezogen wird.">
          <Chips werte={STATUS.map((s) => [s.id, s.label])} wert={p.status} onWahl={(v) => setP({ status: v })} />
        </Frage>
        {p.status && p.status !== 'CH' && (
          <Frage titel="Gültig bis" hinweis="Die App erinnert dich rechtzeitig vor dem Ablauf.">
            <input className="eingabe" type="date" value={p.ausweisBis} onChange={(e) => setP({ ausweisBis: e.target.value })} />
          </Frage>
        )}
        {qst && <div className="text-sm rounded-xl px-3 py-2 bg-aqua/10 border border-aqua/25 text-white/75">Mit {p.status === 'G' ? 'G-Ausweis' : `${p.status}-Ausweis`} wird dir Quellensteuer vom Lohn abgezogen — nach dem Tarif deines <b>Wohnkantons</b>. Die App rechnet sie automatisch.</div>}
      </>
    ) },
    { icon: Landmark, titel: 'Familie & Steuer', aus: !qst, inhalt: (
      <>
        <Frage titel="Zivilstand">
          <Chips werte={[['ledig', 'Ledig'], ['verheiratet', 'Verheiratet'], ['partnerschaft', 'Eingetr. Partnerschaft'], ['geschieden', 'Geschieden / getrennt'], ['verwitwet', 'Verwitwet']]} wert={p.zivilstand} onWahl={(v) => setP({ zivilstand: v })} />
        </Frage>
        {['verheiratet', 'partnerschaft'].includes(p.zivilstand) && (
          <Frage titel="Arbeitet dein Partner / deine Partnerin auch?"><JaNein wert={p.partnerArbeitet} onWahl={(v) => setP({ partnerArbeitet: v })} /></Frage>
        )}
        <Frage titel="Kinder (mit Anspruch auf Kinderzulage)">
          <div className="flex items-center gap-3">
            <button className="w-11 h-11 rounded-xl bg-white/10 text-xl" onClick={() => setP({ kinder: Math.max(0, (+p.kinder || 0) - 1) })}>−</button>
            <div className="text-2xl font-bold w-8 text-center tabular-nums">{+p.kinder || 0}</div>
            <button className="w-11 h-11 rounded-xl bg-white/10 text-xl" onClick={() => setP({ kinder: Math.min(9, (+p.kinder || 0) + 1) })}>+</button>
          </div>
        </Frage>
        <Frage titel="Kirchensteuer?" hinweis="Mitglied einer Landeskirche (reformiert, katholisch …)."><JaNein wert={p.kirche} onWahl={(v) => setP({ kirche: v })} /></Frage>
        <QstVorschau p={p} setP={setP} />
      </>
    ) },
    { icon: Briefcase, titel: 'Arbeit & Lohn', inhalt: (
      <>
        <Frage titel="Wie oft wird der Lohn bezahlt?"><Chips werte={[['woche', 'Wöchentlich'], ['monat', 'Monatlich']]} wert={p.lohnRhythmus} onWahl={(v) => setP({ lohnRhythmus: v })} /></Frage>
        <Frage titel="Beim RAV angemeldet (Zwischenverdienst)?" hinweis="Dann zeigt die App am Monatsende deine Stunden und den Lohn pro Arbeitgeber für die RAV-Angaben."><JaNein wert={p.rav} onWahl={(v) => setP({ rav: v })} /></Frage>
        <Frage titel="Fehlende Pausen automatisch ergänzen?" hinweis="Arbeitsgesetz: ab 5½ h 15 Min., ab 7 h 30 Min., ab 9 h 60 Min. Pause. Hast du weniger gedrückt, ergänzt die App die Pause beim Feierabend und zeigt es an.">
          <JaNein wert={p.mindestpause} onWahl={(v) => setP({ mindestpause: v })} />
        </Frage>
        <Frage titel="Bis wann musst du dich krank melden?" hinweis="Meist vor Arbeitsbeginn — steht im Einsatzvertrag.">
          <input className="eingabe w-32" type="time" value={p.krankMeldenBis} onChange={(e) => setP({ krankMeldenBis: e.target.value })} />
        </Frage>
      </>
    ) },
    { icon: Car, titel: 'Arbeitsweg', inhalt: (
      <Frage titel="Wie kommst du meistens zur Arbeit?" hinweis="Für die Jahresübersicht (Berufsauslagen). Die Strecke trägst du pro Einsatz ein.">
        <Chips werte={[['auto', 'Auto'], ['motorrad', 'Motorrad'], ['oev', 'ÖV'], ['velo', 'Velo'], ['fuss', 'Zu Fuss'], ['geschaeft', 'Geschäftsfahrzeug']]} wert={p.arbeitsweg} onWahl={(v) => setP({ arbeitsweg: v })} />
      </Frage>
    ) },
    { icon: PenLine, titel: 'Unterschrift', inhalt: (
      <Frage titel="Deine Unterschrift" hinweis="Einmal unterschreiben — sie wird automatisch in jeden Rapport eingesetzt.">
        <Unterschrift wert={einst.unterschrift?.bild || null} onChange={(bild) => setEinst({ unterschrift: bild ? { bild, am: Date.now() } : null })} />
      </Frage>
    ) },
  ].filter((s) => !s.aus)

  const [i, setI] = useState(0)
  const [fertig, setFertig] = useState(false)
  const s = schritte[Math.min(i, schritte.length - 1)]

  if (fertig) {
    const a = alter(p), fm = ferienMindestProzent(p), tage = ausweisTage(p)
    const punkte = [
      qst ? `Quellensteuer: Tarif ${tarif(p)}, Kanton ${p.wohnkanton || '?'} — ${p.qstSatz ? `fester Satz ${p.qstSatz} %` : 'Satz automatisch nach offizieller Tabelle und Monatslohn'}` : 'Keine Quellensteuer',
      fm && `Ferien: mit ${a} Jahren mindestens ${fm} % (${fm > 9 ? '5' : '4'} Wochen) — die App warnt, wenn ein Vertrag weniger hat`,
      tage != null && `Erinnerung ${tage > 60 ? 'ab 60 Tage' : 'jetzt'} vor Ablauf des Ausweises (${p.ausweisBis.split('-').reverse().join('.')})`,
      p.mindestpause && 'Fehlende Pausen werden nach Arbeitsgesetz ergänzt',
      p.rav && 'RAV-Übersicht am Monatsende im Bereich „Lohn“',
      p.krankMeldenBis && `„Krank melden“ erinnert an die Frist ${p.krankMeldenBis} Uhr`,
    ].filter(Boolean)
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-extrabold grad-text tracking-tight">Alles eingerichtet</h1>
        <section className="glass rounded-3xl p-5 space-y-2.5">
          {punkte.map((t) => <div key={t} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-mint shrink-0 mt-0.5" /> {t}</div>)}
        </section>
        <div className="text-sm text-white/55">Als Nächstes: unter Einstellungen einen <b>Einsatz</b> anlegen (Vertrag fotografieren) und den <b>automatischen Versand</b> mit Microsoft verbinden.</div>
        <button onClick={() => nav('/einstellungen')} className="w-full rounded-2xl py-3.5 font-bold btn-grad">Zu den Einstellungen</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <IconChip icon={s.icon} variant="grad" />
        <div className="min-w-0">
          <div className="text-xs text-white/45">Meine Situation · Schritt {i + 1} von {schritte.length}</div>
          <h1 className="text-2xl font-extrabold tracking-tight">{s.titel}</h1>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full btn-grad transition-all" style={{ width: `${((i + 1) / schritte.length) * 100}%` }} /></div>
      <section className="glass rounded-3xl p-5 space-y-5">{s.inhalt}</section>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => (i ? setI(i - 1) : nav('/einstellungen'))} className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-1.5">
          <ChevronLeft className="w-5 h-5" /> {i ? 'Zurück' : 'Abbrechen'}
        </button>
        {i < schritte.length - 1 ? (
          <button onClick={() => setI(i + 1)} className="rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-1.5">Weiter <ChevronRight className="w-5 h-5" /></button>
        ) : (
          <button onClick={() => { setP({ fertigAm: Date.now() }); setFertig(true) }} className="rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-1.5"><Check className="w-5 h-5" /> Fertig</button>
        )}
      </div>
    </div>
  )
}
