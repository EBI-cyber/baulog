import { useState, useEffect, useRef } from 'react'
import { ReceiptText, Trash2, AlertTriangle, Sparkles, CalendarDays, Camera } from 'lucide-react'
import IconChip from '../ui/IconChip'
import Vollbild from './Vollbild'
import BelegScanner from './BelegScanner'
import { privatPruefen, positionFinden, materialZuordnen } from '../lib/ai'
import { listeSicherungen, sicherungLesen } from '../lib/backup'
import { melden, frage, toast } from '../ui/Hinweise'

// Belegnotiz ohne Datum vergleichen (das Datum kann nachträglich geändert worden sein)
const ohneDatum = (n) => String(n || '').replace(/\s*vom \d{1,2}\.\d{1,2}\.\d{4}/, '').trim()

// Belegbild aus den automatischen Sicherungen suchen (neueste zuerst)
async function bildAusSicherung(beleg) {
  const ziel = ohneDatum(beleg.note)
  for (const s of await listeSicherungen()) {
    const d = await sicherungLesen(s.id)
    const treffer = (d && d.eintraege || []).find((e) => e.type === 'material' && e.dataUrl && ohneDatum(e.note) === ziel)
    if (treffer) return { dataUrl: treffer.dataUrl, belegRoh: treffer.belegRoh || null }
  }
  return null
}

const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const tag = (d) => { try { return new Date(d).toLocaleDateString('de-DE') } catch { return '' } }
const zeile = (e) => (Number(e.qty) || 0) * (Number(e.unitCost) || 0)
const istDifferenz = (e) => /Differenz laut Beleg/.test(e.label || '')
// Positionen in Belegreihenfolge: Baustellen-Positionen, dann private, zuletzt die Differenzzeile
const rang = (e) => (istDifferenz(e) ? 2 : /privat, nicht berechnet/.test(e.label || '') ? 1 : 0)
// Art einer gespeicherten Position und ihr voller Betrag laut Beleg (steht bei privat/Verschleiß in der Bezeichnung)
const betragAus = (s) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0
function artVon(e) {
  const l = e.label || ''
  const p = l.match(/\s*\(privat, nicht berechnet: ([\d.,]+) €\)$/)
  if (p) return { art: 'privat', voll: betragAus(p[1]), basis: l.slice(0, p.index) }
  const v = l.match(/\s*\(Verschleißanteil [\d.,]+ % von ([\d.,]+) €\)$/)
  if (v) return { art: 'verschleiss', voll: betragAus(v[1]), basis: l.slice(0, v.index) }
  return { art: 'baustelle', voll: (Number(e.qty) || 1) * (Number(e.unitCost) || 0), basis: l }
}
// Position nachträglich umstellen: Baustelle = voll berechnet, Verschleiß = Anteil, privat = 0 € mit Vermerk
function artPatch(e, art, prozent) {
  const { voll, basis } = artVon(e), menge = Number(e.qty) > 0 ? Number(e.qty) : 1
  const rund = (n) => Math.round(n * 10000) / 10000
  if (art === 'privat') return { unitCost: 0, label: basis + ' (privat, nicht berechnet: ' + eur(voll) + ')' }
  if (art === 'verschleiss') return { unitCost: rund(voll * prozent / 100 / menge), label: basis + ' (Verschleißanteil ' + prozent + ' % von ' + eur(voll) + ')' }
  return { unitCost: rund(voll / menge), label: basis }
}
const belegfolge = (x, y) => rang(x) - rang(y) || String(x.createdAt).localeCompare(String(y.createdAt)) || Number(x.id) - Number(y.id)

// Gescannte Belege eines Projekts zusammenfassen: Einträge mit gleicher Belegnotiz und gleichem Datum gehören zu einem Beleg
export function belegeAus(eintraege) {
  const gruppen = new Map()
  for (const e of eintraege) {
    if (e.type !== 'material' || !e.note || !/^Beleg/.test(e.note)) continue
    const key = e.note + '|' + String(e.createdAt || '').slice(0, 10)
    if (!gruppen.has(key)) gruppen.set(key, { key, note: e.note, datum: e.createdAt, eintraege: [], bild: '', betrag: 0 })
    const g = gruppen.get(key)
    g.eintraege.push(e)
    g.betrag += (Number(e.qty) || 0) * (Number(e.unitCost) || 0)
    if (e.dataUrl) g.bild = e.dataUrl
  }
  const liste = [...gruppen.values()].sort((a, b) => String(a.datum).localeCompare(String(b.datum)))
  // mögliche Doppelte: gleicher Betrag am selben Tag (Lieferantenname kann unterschiedlich gelesen sein)
  liste.forEach((g) => {
    g.lieferant = g.note.replace(/^Beleg\s*/, '').replace(/\s*vom .*$/, '').replace(/\s*·.*$/, '').trim()
    // doppelt: gleicher Betrag am selben Tag, gleicher Gesamtbetrag laut Belegnotiz,
    // oder die meisten Positionsbeträge stimmen überein (falls Datum/Betrag beim Scannen unterschiedlich gelesen wurden)
    const betraege = (x) => x.eintraege.map((e) => Math.round((Number(e.qty) || 0) * (Number(e.unitCost) || 0) * 100))
    const gesamtLaut = (x) => (String(x.note).match(/·\s*([\d.]+,\d{2})\s*€/) || [])[1]
    const aehnlich = (h) => {
      const a = betraege(g), b = betraege(h)
      if (a.length < 2 || b.length < 2) return false
      const rest = [...b]; let gleich = 0
      for (const v of a) { const i = rest.indexOf(v); if (i >= 0) { gleich++; rest.splice(i, 1) } }
      return gleich / Math.max(a.length, b.length) >= 0.6
    }
    g.doppelt = liste.some((h) => h !== g && (
      (String(h.datum).slice(0, 10) === String(g.datum).slice(0, 10) && Math.abs(h.betrag - g.betrag) < 0.01) ||
      (gesamtLaut(g) && gesamtLaut(g) === gesamtLaut(h)) || aehnlich(h)))
    // Jahr vermutlich falsch gelesen: Beleg älter als 18 Monate oder in der Zukunft
    const alter = (Date.now() - new Date(g.datum).getTime()) / 86400000
    g.datumPruefen = !(alter >= -1 && alter <= 548)
  })
  return liste
}

export default function BelegeSheet({ eintraege, projektName, projektToken, verschleissProzent = 25, onUpdate, onRestore, onClose, onDelete }) {
  const [gross, setGross] = useState('') // Bild-URL oder { src, markierung, titel }
  const [suche, setSuche] = useState('')
  const [nachscan, setNachscan] = useState(null) // Beleg, dessen Bild neu fotografiert wird
  const [offen, setOffen] = useState('') // key des Belegs, dessen Positionen gerade angezeigt werden
  // Löschabfrage in der App statt confirm(): Browser können native Abfragen unterdrücken, dann passierte beim Klick nichts
  const [loeschFrage, setLoeschFrage] = useState(null) // { titel, text, liste, busy, fehler }
  const loeschen = async () => {
    setLoeschFrage((f) => ({ ...f, busy: true, fehler: '' }))
    try { await onDelete(loeschFrage.liste); setLoeschFrage(null) }
    catch (err) { setLoeschFrage((f) => ({ ...f, busy: false, fehler: 'Löschen fehlgeschlagen: ' + (err && err.message ? err.message : String(err)) })) }
  }
  const [geloeschte, setGeloeschte] = useState(null) // gelöschte Material-Positionen aus den Sicherungen

  // Material-Positionen dieses Projekts, die in einer Sicherung stehen, aber heute fehlen
  const geloeschteSuchen = async () => {
    setSuche('geloeschte')
    try {
      const jetzt = new Set(eintraege.map((e) => e.token))
      const gefunden = new Map()
      for (const s of await listeSicherungen()) {
        const d = await sicherungLesen(s.id)
        for (const e of (d && d.eintraege) || []) {
          if (e.type === 'material' && e.projektToken === projektToken && e.token && !jetzt.has(e.token) && !gefunden.has(e.token)) gefunden.set(e.token, { e, wann: s.createdAt })
        }
      }
      setGeloeschte([...gefunden.values()])
    } catch (err) { melden(err && err.message ? err.message : String(err)) }
    setSuche('')
  }
  const [datumEdit, setDatumEdit] = useState('') // key des Belegs, dessen Datum gerade geändert wird
  const [verdacht, setVerdacht] = useState(null) // [{ e, grund }]
  const [busy, setBusy] = useState(false)
  const belege = belegeAus(eintraege)
  // Position auf dem Belegbild markieren lassen und das Bild groß zeigen
  const aufBelegZeigen = async (b, e) => {
    if (!b || !b.bild) { melden('Zu dieser Position gibt es kein Belegbild.'); return }
    setSuche(String(e.id))
    let markierung = null
    try { markierung = await positionFinden(b.bild, (e.label || '').replace(/^[^:]*:\s*/, '').replace(/\s*\((Verschleißanteil|privat, nicht berechnet).*$/, '')) } catch { /* ohne Markierung zeigen */ }
    setSuche('')
    setGross({ src: b.bild, markierung, titel: (e.label || '') + (markierung ? '' : ' (Stelle nicht gefunden)') })
  }
  const offenerBeleg = belege.find((b) => b.key === offen)
  const summe = belege.reduce((a, b) => a + b.betrag, 0)
  const doppelte = belege.filter((b) => b.doppelt).length
  const ohneBeleg = eintraege.filter((e) => e.type === 'material' && !(e.note && /^Beleg/.test(e.note)))
  const ohnePreis = ohneBeleg.filter((e) => !(Number(e.unitCost) > 0) && !/privat, nicht berechnet/.test(e.label || ''))

  // KI ordnet Material ohne Preis den Belegpositionen zu: doppelt erfasst oder beim Diktat falsch aufgenommen
  const [zuordnung, setZuordnung] = useState({}) // id → { art, position, grund }
  const [zuordnenBusy, setZuordnenBusy] = useState(false)
  const positionen = belege.flatMap((b) => b.eintraege.filter((e) => !istDifferenz(e) && !/privat, nicht berechnet/.test(e.label || '')).map((e) => ({ e, b })))
  const ohneLieferant = (t) => String(t || '').replace(/^[^:]*:\s*/, '').replace(/\s*\(Verschleißanteil.*$/, '')
  const zuordnen = async (still) => {
    if (!ohnePreis.length) return
    setZuordnenBusy(true)
    try {
      const liste = await materialZuordnen(
        ohnePreis.map((e) => ({ id: String(e.id), text: e.label || '', menge: Number(e.qty) || 1, gewerk: e.gewerk || '', datum: tag(e.createdAt) })),
        positionen.map(({ e, b }) => ({ id: String(e.id), text: ohneLieferant(e.label), menge: Number(e.qty) || 1, datum: tag(b.datum), lieferant: b.lieferant })))
      const neu = {}
      for (const z of liste) if (z && z.id) neu[String(z.id)] = z
      setZuordnung(neu)
    } catch (err) { if (!still) melden(err && err.message ? err.message : String(err)) }
    setZuordnenBusy(false)
  }
  // beim Öffnen einmal automatisch abgleichen lassen
  const gestartet = useRef(false)
  useEffect(() => { if (!gestartet.current && ohnePreis.length) { gestartet.current = true; zuordnen(true) } })
  const vorschlag = (e) => { const z = zuordnung[String(e.id)]; return z && (z.art === 'beleg' || z.art === 'kein_material') ? z : null }
  const zuLoeschen = ohnePreis.filter(vorschlag)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={onClose}>
      <div className="glass w-full max-w-lg mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 max-h-[90dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold flex items-center gap-2.5"><IconChip icon={ReceiptText} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> Materialbelege</div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-white/5 rounded-xl p-2"><div className="text-white/70 text-xs">Belege</div><div className="font-bold">{belege.length}</div></div>
          <div className="bg-white/5 rounded-xl p-2"><div className="text-white/70 text-xs">Summe</div><div className="font-bold">{eur(summe)}</div></div>
        </div>
        {doppelte > 0 && (
          <div className="rounded-xl px-3 py-2 text-xs border bg-ember/10 text-ember border-ember/25 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {doppelte} Belege ähneln sich stark (gleicher Betrag oder fast dieselben Positionen). Bitte prüfen, ob einer doppelt gescannt wurde.
          </div>
        )}
        {belege.length > 0 && (
          <div className="rounded-xl p-3 border border-white/20 bg-white/5 space-y-2">
            {!verdacht ? (
              <button disabled={busy} onClick={async () => {
                setBusy(true)
                try {
                  const pos = belege.flatMap((b) => b.eintraege).map((e) => ({ id: String(e.id), text: e.label || '', betrag: Math.round((Number(e.qty) || 0) * (Number(e.unitCost) || 0) * 100) / 100 }))
                  const v = await privatPruefen(pos, projektName)
                  // bereits als Verschleiß abgerechnete Positionen nicht erneut melden
                  setVerdacht(v.map((x) => ({ e: eintraege.find((e) => String(e.id) === String(x.id)), grund: x.grund, art: x.art === 'verschleiss' ? 'verschleiss' : 'privat' }))
                    .filter((x) => x.e && !/Verschleißanteil|\(privat, nicht berechnet/.test(x.e.label || '')))
                } catch (err) { melden(err && err.message ? err.message : String(err)) }
                setBusy(false)
              }} className="w-full rounded-xl py-2 text-sm font-semibold bg-white/10 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                <Sparkles className="w-4 h-4 text-amber" />{busy ? 'KI prüft …' : 'Auf Privates und Verschleißteile prüfen'}
              </button>
            ) : verdacht.length === 0 ? (
              <div className="text-emerald-400 text-sm">Nichts Privates und keine Verschleißteile gefunden.</div>
            ) : (
              <>
                <div className="text-ember text-sm font-semibold">Bitte prüfen ({verdacht.length})</div>
                {verdacht.map((x) => (
                  <div key={x.e.id} className="flex items-center gap-2 text-sm">
                    {/* zugehörigen Beleg über die id suchen: nach Änderungen sind die Eintrags-Objekte neu */}
                    <button className="flex-1 min-w-0 text-left" title="Beleg mit markierter Position ansehen" onClick={() => aufBelegZeigen(belege.find((g) => g.eintraege.some((e) => e.id === x.e.id)), x.e)}>
                      <div className="truncate underline decoration-dotted underline-offset-2">{suche === String(x.e.id) ? 'Suche auf dem Beleg …' : x.e.label}</div>
                      <div className={'text-xs ' + (x.art === 'verschleiss' ? 'text-amber' : 'text-ember')}>{x.art === 'verschleiss' ? 'Verschleißteil' : 'Privat?'} · {x.grund} · {eur((Number(x.e.qty) || 0) * (Number(x.e.unitCost) || 0))}</div>
                    </button>
                    <button onClick={() => setVerdacht((v) => v.filter((y) => y !== x))} className="text-xs px-2 py-1 rounded-lg border border-white/20 text-white/70 shrink-0">gehört dazu</button>
                    {x.art === 'verschleiss' ? (
                      <button onClick={async () => {
                        const voll = (Number(x.e.qty) || 0) * (Number(x.e.unitCost) || 0)
                        await onUpdate(x.e, { unitCost: (Number(x.e.unitCost) || 0) * verschleissProzent / 100, label: (x.e.label || '') + ' (Verschleißanteil ' + verschleissProzent + ' % von ' + eur(voll) + ')' })
                        setVerdacht((v) => v.filter((y) => y !== x))
                      }} className="text-xs px-2 py-1 rounded-lg btn-grad font-semibold shrink-0">nur {verschleissProzent} %</button>
                    ) : (
                      <button onClick={async () => {
                        // nicht löschen, sondern auf 0 € setzen und vermerken: so bleibt der Abzug im Leistungsnachweis dokumentiert
                        const voll = (Number(x.e.qty) || 0) * (Number(x.e.unitCost) || 0)
                        await onUpdate(x.e, { unitCost: 0, label: (x.e.label || '') + ' (privat, nicht berechnet: ' + eur(voll) + ')' })
                        setVerdacht((v) => v.filter((y) => y !== x))
                      }} className="text-xs px-2 py-1 rounded-lg btn-grad font-semibold shrink-0">privat, nicht berechnen</button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        <div className="rounded-xl p-3 border border-white/20 bg-white/5 space-y-2">
          {!geloeschte ? (
            <button onClick={geloeschteSuchen} disabled={suche === 'geloeschte'} className="w-full rounded-xl py-2 text-sm font-semibold bg-white/10 disabled:opacity-50">
              {suche === 'geloeschte' ? 'Suche in den Sicherungen …' : 'Gelöschte Positionen wiederfinden'}
            </button>
          ) : geloeschte.length === 0 ? (
            <div className="text-white/70 text-sm">In den Sicherungen dieses Geräts gibt es keine gelöschten Material-Positionen.</div>
          ) : (
            <>
              <div className="text-sm font-semibold">Gelöschte Positionen ({geloeschte.length})</div>
              {geloeschte.map((g) => {
                const voll = (Number(g.e.qty) || 0) * (Number(g.e.unitCost) || 0)
                const fertig = (patch) => async () => { await onRestore({ ...g.e, ...patch }); setGeloeschte((l) => l.filter((x) => x !== g)) }
                return (
                  <div key={g.e.token} className="flex items-center gap-2 text-sm flex-wrap">
                    <div className="flex-1 min-w-[10rem]">
                      <div className="truncate">{g.e.label}</div>
                      <div className="text-white/60 text-xs">{eur(voll)} · {g.e.note ? g.e.note.replace(/\s*·.*$/, '') : ''}</div>
                    </div>
                    <button onClick={fertig({ unitCost: 0, dataUrl: '', belegRoh: null, label: (g.e.label || '') + ' (privat, nicht berechnet: ' + eur(voll) + ')' })} className="text-xs px-2 py-1 rounded-lg btn-grad font-semibold">als privat dokumentieren</button>
                    <button onClick={fertig({})} className="text-xs px-2 py-1 rounded-lg border border-white/20 text-white/75">normal zurückholen</button>
                  </div>
                )
              })}
            </>
          )}
        </div>
        {belege.length === 0 && <div className="text-white/70 text-sm">Noch keine Belege gescannt. Über die Kachel „Material“ geht es los.</div>}
        <div className="space-y-2">
          {belege.map((b, i) => (
            <div key={b.key} className={'rounded-2xl p-2.5 flex items-center gap-3 border ' + (b.doppelt ? 'border-ember/50 bg-ember/10' : 'border-white/15 bg-white/5')}>
              <button onClick={async () => {
                if (b.bild) { setGross(b.bild); return }
                // Bild fehlt (z. B. weil die Position mit dem Bild gelöscht wurde): aus den Sicherungen zurückholen
                setSuche('bild:' + b.key)
                try {
                  const r = await bildAusSicherung(b)
                  if (r) { await onUpdate(b.eintraege[0], r); setGross(r.dataUrl) }
                  else if (await frage('Für diesen Beleg ist in den Sicherungen dieses Geräts kein Bild zu finden.\n\nJetzt nur das Bild neu fotografieren? Positionen und Beträge bleiben unverändert.')) setNachscan(b)
                } catch (err) { melden(err && err.message ? err.message : String(err)) }
                setSuche('')
              }} className="shrink-0">
                {b.bild ? <img src={b.bild} alt="" className="w-14 h-16 rounded-lg object-cover bg-white" />
                  : <div className="w-14 h-16 rounded-lg bg-white/10 text-xs leading-tight text-amber flex items-center justify-center text-center p-1">{suche === 'bild:' + b.key ? 'suche …' : 'Bild holen'}</div>}
              </button>
              <div className="flex-1 min-w-0">
                {datumEdit === b.key ? (
                  <input type="date" autoFocus defaultValue={String(b.datum).slice(0, 10)} className="bg-white/10 border border-amber/50 rounded-lg px-2 py-1 text-sm"
                    onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }}
                    onBlur={async (ev) => {
                      // erst beim Verlassen übernehmen, damit halb getippte Jahreszahlen nicht gespeichert werden
                      const neu = ev.target.value
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(neu) || neu === String(b.datum).slice(0, 10) || Number(neu.slice(0, 4)) < 2000) { setDatumEdit(''); return }
                      // alle Positionen des Belegs auf das neue Datum setzen, auch in der Belegnotiz
                      const de = new Date(neu + 'T12:00:00').toLocaleDateString('de-DE')
                      // Reihenfolge der Positionen dabei behalten (je eine Millisekunde Abstand)
                      const basis = Date.parse(neu + 'T12:00:00')
                      for (const [i, e] of [...b.eintraege].sort(belegfolge).entries()) {
                        await onUpdate(e, { createdAt: new Date(basis + i).toISOString(), note: (e.note || '').replace(/vom \d{1,2}\.\d{1,2}\.\d{4}/, 'vom ' + de) })
                      }
                      setDatumEdit('')
                    }} />
                ) : (
                  <button onClick={() => setOffen(b.key)} className="block w-full text-left" title="Positionen ansehen">
                    <div className="font-semibold text-sm truncate">{i + 1}. {b.lieferant || 'Beleg'}</div>
                    <div className="text-white/70 text-xs">{tag(b.datum)} · <span className="text-amber">{b.eintraege.length} {b.eintraege.length === 1 ? 'Position' : 'Positionen'} ansehen</span></div>
                  </button>
                )}
                {b.eintraege.some(istDifferenz) && <div className="text-ember text-xs font-semibold">Summe passt nicht – Positionen prüfen</div>}
                {b.doppelt && <div className="text-ember text-xs font-semibold">möglicherweise doppelt</div>}
                {b.datumPruefen && <div className="text-amber text-xs font-semibold">Datum prüfen – Jahr weicht ab (Datum antippen zum Ändern)</div>}
              </div>
              <div className="font-bold text-sm shrink-0">{eur(b.betrag)}</div>
              <button onClick={() => onDelete(b.eintraege)}
                title="Beleg löschen" className="text-white/60 hover:text-ember p-2 -m-1 shrink-0"><Trash2 className="w-5 h-5" /></button>
            </div>
          ))}
        </div>
        {ohneBeleg.length > 0 && <div className="text-white/60 text-xs">Dazu {ohneBeleg.length} Material-Einträge ohne Beleg (von Hand erfasst).</div>}
        {ohnePreis.length > 0 && (
          // von Hand erfasstes Material ohne Preis: fehlt sonst unbemerkt in Selbstkosten und Abrechnung
          <div className="rounded-xl p-3 border border-amber/40 bg-amber/10 space-y-2">
            <div className="text-amber text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Preis fehlt bei {ohnePreis.length} {ohnePreis.length === 1 ? 'Material' : 'Materialien'}</div>
            {zuordnenBusy ? <div className="text-white/70 text-xs flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber animate-pulse" /> KI gleicht mit den Belegen ab …</div>
              : zuLoeschen.length > 0 ? (
                <button onClick={() => onDelete(zuLoeschen)} className="w-full rounded-xl py-2 text-sm font-semibold btn-grad inline-flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" /> {zuLoeschen.length} {zuLoeschen.length === 1 ? 'Eintrag' : 'Einträge'} laut KI entfernen
                </button>
              ) : <button onClick={() => zuordnen(false)} className="text-amber text-xs font-semibold inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Von der KI mit den Belegen abgleichen</button>}
            {ohnePreis.map((e) => {
              const z = vorschlag(e)
              const pos = z && z.art === 'beleg' ? positionen.find((p) => String(p.e.id) === String(z.position)) : null
              return (
                <div key={e.id} className="space-y-1">
                  <form className="flex items-center gap-2 text-sm" onSubmit={async (ev) => {
                    ev.preventDefault()
                    const v = parseFloat(String(new FormData(ev.currentTarget).get('preis') || '').replace(/\./g, '').replace(',', '.'))
                    if (v > 0) await onUpdate(e, { unitCost: v })
                  }}>
                    <div className="flex-1 min-w-0"><div className="truncate">{e.label}</div><div className="text-white/60 text-xs">{Number(e.qty) || 1} × Einzelpreis</div></div>
                    <input name="preis" inputMode="decimal" placeholder="€" className="w-20 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-right" />
                    <button className="rounded-lg px-3 py-1.5 btn-grad font-semibold text-xs">OK</button>
                    <button type="button" onClick={() => onDelete([e])} title="Eintrag löschen" className="text-white/60 hover:text-ember p-1.5 -m-1 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </form>
                  {z && (
                    <div className="text-xs text-amber/90">
                      {z.art === 'beleg'
                        ? <>Steht schon auf dem Beleg{pos ? <> {pos.b.lieferant} vom {tag(pos.b.datum)}: „{ohneLieferant(pos.e.label)}“</> : null} – doppelt erfasst</>
                        : <>Kein Material – vermutlich beim Diktat falsch aufgenommen{z.grund ? ' (' + z.grund + ')' : ''}</>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {belege.length > 0 && (
          <button onClick={() => {
            const alle = belege.flatMap((b) => b.eintraege)
            setLoeschFrage({ titel: 'Wirklich ALLE ' + belege.length + ' Belege löschen?', text: 'Zusammen ' + alle.length + ' Positionen (' + eur(summe) + '). Vorher wird automatisch gesichert. Über „Gelöschte Positionen wiederfinden“ lassen sie sich zurückholen.', liste: alle })
          }} className="w-full rounded-2xl py-2 text-sm font-semibold border border-ember/40 text-ember inline-flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Alle Belege löschen
          </button>
        )}
        <button onClick={onClose} className="w-full rounded-2xl py-2 text-white/70 text-sm">Schließen</button>
      </div>
      {loeschFrage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => { e.stopPropagation(); if (!loeschFrage.busy) setLoeschFrage(null) }}>
          <div className="glass w-full max-w-sm rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold flex items-center gap-2"><Trash2 className="w-5 h-5 text-ember" /> {loeschFrage.titel}</div>
            <div className="text-white/75 text-sm">{loeschFrage.text}</div>
            {loeschFrage.fehler && <div className="text-ember text-sm">{loeschFrage.fehler}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button disabled={loeschFrage.busy} onClick={() => setLoeschFrage(null)} className="rounded-2xl py-2.5 bg-white/10 text-sm disabled:opacity-50">Abbrechen</button>
              <button disabled={loeschFrage.busy} onClick={loeschen} className="rounded-2xl py-2.5 bg-ember text-white font-semibold text-sm disabled:opacity-50">{loeschFrage.busy ? 'Sichere und lösche …' : 'Ja, löschen'}</button>
            </div>
          </div>
        </div>
      )}
      {offenerBeleg && (() => {
        const b = offenerBeleg
        const pos = [...b.eintraege].sort(belegfolge)
        const diff = b.eintraege.filter(istDifferenz).reduce((a, e) => a + zeile(e), 0)
        return (
          <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-40" onClick={(e) => { e.stopPropagation(); setOffen('') }}>
            <div className="glass w-full max-w-lg mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 max-h-[92dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start gap-3">
                {b.bild && <button onClick={() => setGross(b.bild)} className="shrink-0" title="Beleg groß ansehen"><img src={b.bild} alt="" className="w-16 h-20 rounded-lg object-cover object-top bg-white" /></button>}
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold truncate">{b.lieferant || 'Beleg'}</div>
                  <div className="text-white/70 text-sm">{tag(b.datum)} · {b.eintraege.length} {b.eintraege.length === 1 ? 'Position' : 'Positionen'}</div>
                  <div className="font-bold">{eur(b.betrag)}</div>
                </div>
              </div>
              {diff ? (
                <div className="rounded-xl px-3 py-2 text-xs border bg-ember/10 text-ember border-ember/40">
                  <div className="font-semibold text-sm">{diff > 0 ? 'Hier fehlt vermutlich eine Position (' + eur(diff) + ')' : 'Hier ist vermutlich eine Position doppelt (' + eur(-diff) + ')'}</div>
                  Die erkannten Positionen ergaben nicht den Betrag des Belegs. Die Differenz steht unten als eigene Zeile. Bitte mit dem Bild vergleichen oder den Beleg neu scannen.
                </div>
              ) : (
                <div className="rounded-xl px-3 py-2 text-xs border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Die Positionen ergeben genau den Betrag des Belegs.</div>
              )}
              <div className="text-white/60 text-xs">Position antippen, um sie auf dem Beleg zu zeigen.</div>
              <div className="space-y-1">
                {pos.map((e) => {
                  const art = istDifferenz(e) ? null : artVon(e).art
                  return (
                    <div key={e.id} className={'rounded-xl ' + (istDifferenz(e) ? 'bg-ember/15 text-ember border border-ember/40' : 'bg-white/5')}>
                      <button onClick={() => (istDifferenz(e) ? (b.bild && setGross(b.bild)) : aufBelegZeigen(b, e))}
                        className="w-full flex items-center gap-2 text-left text-sm px-2.5 pt-2 pb-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{suche === String(e.id) ? 'Suche auf dem Beleg …' : (e.label || '').replace(/^[^:]*:\s*/, '')}</div>
                          <div className="text-white/60 text-xs">{Number(e.qty) || 1} × {eur(e.unitCost)}{e.gewerk ? ' · ' + e.gewerk : ''}</div>
                        </div>
                        <div className="font-semibold shrink-0">{eur(zeile(e))}</div>
                      </button>
                      {art && (
                        // nachträglich umstellen, falls die KI eine Position falsch eingeordnet hat
                        <div className="flex rounded-lg overflow-hidden border border-white/20 text-xs mx-2.5 mb-2 w-fit">
                          {[['baustelle', 'Baustelle', 'bg-emerald-500/25 text-emerald-300'], ['verschleiss', 'Verschleiß', 'bg-amber/20 text-amber'], ['privat', 'privat', 'bg-ember/20 text-ember']].map(([k, t, aktiv], j) => (
                            <button key={k} disabled={art === k} onClick={() => onUpdate(e, artPatch(e, k, verschleissProzent))}
                              className={'px-2.5 py-1 ' + (j ? 'border-l border-white/20 ' : '') + (art === k ? aktiv + ' font-semibold' : 'text-white/60')}>{t}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setOffen(''); setDatumEdit(b.key) }} className="rounded-2xl py-2 text-sm bg-white/10 inline-flex items-center justify-center gap-2"><CalendarDays className="w-4 h-4" /> Datum ändern</button>
                <button onClick={() => { setOffen(''); setNachscan(b) }} className="rounded-2xl py-2 text-sm bg-white/10 inline-flex items-center justify-center gap-2"><Camera className="w-4 h-4" /> Bild neu fotografieren</button>
              </div>
              <button onClick={() => { setOffen(''); onDelete(b.eintraege) }}
                className="w-full rounded-2xl py-2 text-sm font-semibold border border-ember/40 text-ember inline-flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Beleg löschen</button>
              <button onClick={() => setOffen('')} className="w-full rounded-2xl py-2 text-white/70 text-sm">Zurück</button>
            </div>
          </div>
        )
      })()}
      {nachscan && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-40" onClick={(e) => { e.stopPropagation(); setNachscan(null) }}>
          <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 max-h-[92dvh] overflow-y-auto m-0 md:m-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-bold">Bild nachscannen</div>
            <div className="text-white/75 text-xs">{nachscan.note}</div>
            <BelegScanner nurBild onAbbrechen={() => setNachscan(null)} onKorrigiert={async (url, ecken, roh) => {
              await onUpdate(nachscan.eintraege[0], { dataUrl: url, belegRoh: { bild: roh, ecken } })
              setNachscan(null)
            }} />
          </div>
        </div>
      )}
      {gross && (typeof gross === 'string'
        ? <Vollbild src={gross} onClose={() => setGross('')} />
        : <Vollbild src={gross.src} markierung={gross.markierung} titel={gross.titel} onClose={() => setGross('')} />)}
    </div>
  )
}
