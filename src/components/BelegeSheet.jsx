import { useState } from 'react'
import { ReceiptText, Trash2, AlertTriangle, Sparkles } from 'lucide-react'
import IconChip from '../ui/IconChip'
import Vollbild from './Vollbild'
import { privatPruefen } from '../lib/ai'

const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const tag = (d) => { try { return new Date(d).toLocaleDateString('de-DE') } catch { return '' } }

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
    g.doppelt = liste.some((h) => h !== g && String(h.datum).slice(0, 10) === String(g.datum).slice(0, 10) && Math.abs(h.betrag - g.betrag) < 0.01)
  })
  return liste
}

export default function BelegeSheet({ eintraege, projektName, onClose, onDelete }) {
  const [gross, setGross] = useState('')
  const [verdacht, setVerdacht] = useState(null) // [{ e, grund }]
  const [busy, setBusy] = useState(false)
  const belege = belegeAus(eintraege)
  const summe = belege.reduce((a, b) => a + b.betrag, 0)
  const doppelte = belege.filter((b) => b.doppelt).length
  const ohneBeleg = eintraege.filter((e) => e.type === 'material' && !(e.note && /^Beleg/.test(e.note)))

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
            <AlertTriangle className="w-4 h-4 shrink-0" /> {doppelte} Belege haben am selben Tag den gleichen Betrag. Bitte prüfen, ob einer doppelt gescannt wurde.
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
                  setVerdacht(v.map((x) => ({ e: eintraege.find((e) => String(e.id) === String(x.id)), grund: x.grund })).filter((x) => x.e))
                } catch (err) { alert(err && err.message ? err.message : String(err)) }
                setBusy(false)
              }} className="w-full rounded-xl py-2 text-sm font-semibold bg-white/10 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                <Sparkles className="w-4 h-4 text-amber" />{busy ? 'KI prüft …' : 'Auf private Sachen prüfen'}
              </button>
            ) : verdacht.length === 0 ? (
              <div className="text-emerald-400 text-sm">Keine privaten Positionen gefunden.</div>
            ) : (
              <>
                <div className="text-ember text-sm font-semibold">Möglicherweise privat ({verdacht.length})</div>
                {verdacht.map((x) => (
                  <div key={x.e.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{x.e.label}</div>
                      <div className="text-white/60 text-xs">{x.grund} · {eur((Number(x.e.qty) || 0) * (Number(x.e.unitCost) || 0))}</div>
                    </div>
                    <button onClick={() => setVerdacht((v) => v.filter((y) => y !== x))} className="text-xs px-2 py-1 rounded-lg border border-white/20 text-white/70 shrink-0">gehört dazu</button>
                    <button onClick={async () => { if (confirm('„' + x.e.label + '“ als privat entfernen? Es wird dem Kunden dann nicht berechnet.')) { await onDelete([x.e]); setVerdacht((v) => v.filter((y) => y !== x)) } }}
                      className="text-xs px-2 py-1 rounded-lg btn-grad font-semibold shrink-0">privat, raus</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {belege.length === 0 && <div className="text-white/70 text-sm">Noch keine Belege gescannt. Über die Kachel „Material“ geht es los.</div>}
        <div className="space-y-2">
          {belege.map((b, i) => (
            <div key={b.key} className={'rounded-2xl p-2.5 flex items-center gap-3 border ' + (b.doppelt ? 'border-ember/50 bg-ember/10' : 'border-white/15 bg-white/5')}>
              <button onClick={() => b.bild && setGross(b.bild)} className="shrink-0">
                {b.bild ? <img src={b.bild} alt="" className="w-14 h-16 rounded-lg object-cover bg-white" /> : <div className="w-14 h-16 rounded-lg bg-white/10" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{i + 1}. {b.lieferant || 'Beleg'}</div>
                <div className="text-white/70 text-xs">{tag(b.datum)} · {b.eintraege.length} {b.eintraege.length === 1 ? 'Position' : 'Positionen'}</div>
                {b.doppelt && <div className="text-ember text-xs font-semibold">möglicherweise doppelt</div>}
              </div>
              <div className="font-bold text-sm shrink-0">{eur(b.betrag)}</div>
              <button onClick={() => { if (confirm('Beleg ' + (b.lieferant || '') + ' vom ' + tag(b.datum) + ' mit allen ' + b.eintraege.length + ' Positionen löschen?\n\nVorher wird automatisch gesichert.')) onDelete(b.eintraege) }}
                className="text-white/60 hover:text-ember p-1 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        {ohneBeleg.length > 0 && <div className="text-white/60 text-xs">Dazu {ohneBeleg.length} Material-Einträge ohne Beleg (von Hand erfasst).</div>}
        <button onClick={onClose} className="w-full rounded-2xl py-2 text-white/70 text-sm">Schließen</button>
      </div>
      {gross && <Vollbild src={gross} onClose={() => setGross('')} />}
    </div>
  )
}
