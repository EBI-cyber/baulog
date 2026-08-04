import { useEffect, useState } from 'react'
import { FolderKanban, Clock, Wallet, Layers, Ruler, Lightbulb, Receipt, PiggyBank } from 'lucide-react'
import { listProjekte, allEintraege, allRechnungen } from '../lib/db'
import { gewerkAnalytics, projektTotals, leistungAnalytics } from '../lib/calc'
import { euro, hrs } from '../lib/format'
import IconChip from '../ui/IconChip'

function Stat({ icon, label, value, grad }) {
  return (
    <div className="glass rounded-3xl p-4 flex items-center gap-3">
      <IconChip icon={icon} />
      <div className="min-w-0">
        <div className="text-white/40 text-xs">{label}</div>
        <div className={'text-xl font-bold truncate ' + (grad ? 'grad-text' : '')}>{value}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [projekte, setProjekte] = useState([])
  const [eintraege, setEintraege] = useState([])
  const [rechnungen, setRechnungen] = useState([])
  useEffect(() => { (async () => { setProjekte(await listProjekte()); setEintraege(await allEintraege()); setRechnungen(await allRechnungen()) })() }, [])

  const totalMin = eintraege.filter((e) => e.type === 'zeit').reduce((a, e) => a + (Number(e.minutes) || 0), 0)
  let totalCost = 0
  projekte.forEach((p) => { totalCost += projektTotals(eintraege.filter((e) => e.projektId === p.id), p.hourlyRate).total })
  const gw = gewerkAnalytics(eintraege, projekte)
  const la = leistungAnalytics(eintraege, projekte)

  // aktueller Saldo je Projekt = jüngster Abschnitt (höchste Nr.); offene Forderungen & Kunden-Guthaben über alle Projekte
  const aktuellerProjektSaldo = {}
  rechnungen.forEach((r) => {
    const cur = aktuellerProjektSaldo[r.projektId]
    if (!cur || (Number(r.nr) || 0) > (Number(cur.nr) || 0)) aktuellerProjektSaldo[r.projektId] = r
  })
  const salden = Object.values(aktuellerProjektSaldo).map((r) => Number(r.saldo) || 0)
  const offenGesamt = salden.filter((x) => x > 0).reduce((a, x) => a + x, 0)
  const guthabenGesamt = salden.filter((x) => x < 0).reduce((a, x) => a - x, 0)

  return (
    <div className="px-6 md:px-8 pt-10 md:pt-12">
      <h2 className="text-3xl md:text-4xl font-extrabold grad-text tracking-tight mb-5">Auswertung</h2>

      <div className={'grid grid-cols-1 sm:grid-cols-3 gap-3 ' + (rechnungen.length > 0 ? 'mb-3' : 'mb-7')}>
        <Stat icon={FolderKanban} label="Projekte" value={projekte.length} />
        <Stat icon={Clock} label="Stunden" value={hrs(totalMin)} />
        <Stat icon={Wallet} label="Selbstkosten" value={euro(totalCost)} grad />
      </div>
      {rechnungen.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
          <Stat icon={Receipt} label="Offene Forderungen (alle Projekte)" value={euro(offenGesamt)} />
          <Stat icon={PiggyBank} label="Guthaben bei Kunden (überzahlt)" value={euro(guthabenGesamt)} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-x-8 gap-y-7">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-5 h-5 text-amber" strokeWidth={1.9} />
            <h3 className="font-semibold">Kennzahlen pro Gewerk</h3>
            <span className="text-white/30 text-xs">— für deine Preiskalkulation</span>
          </div>
          <div className="space-y-2">
            {gw.length === 0 && <div className="glass rounded-2xl p-5 text-white/40 text-sm">Noch keine Daten — erfasse Zeiten &amp; Material, dann erscheinen hier die Durchschnittswerte.</div>}
            {gw.map((g) => (
              <div key={g.gewerk} className="glass card-hover rounded-2xl p-4">
                <div className="flex justify-between items-baseline">
                  <div className="font-semibold">{g.gewerk}</div>
                  <div className="grad-text font-bold">{euro(g.total)}</div>
                </div>
                <div className="text-white/45 text-xs mt-1">
                  {hrs(g.minutes)} · {g.projCount} Projekt(e) · Ø {g.avgHoursPerProj.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h &amp; {euro(g.avgCostPerProj)} / Projekt
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Ruler className="w-5 h-5 text-amber" strokeWidth={1.9} />
            <h3 className="font-semibold">EP-Basis pro Leistung</h3>
            <span className="text-white/30 text-xs">— Selbstkosten je Einheit</span>
          </div>
          <div className="space-y-2">
            {la.length === 0 && <div className="glass rounded-2xl p-5 text-white/40 text-sm">Erfasse Leistungen mit Menge sowie Zeit/Material, dann erscheint hier dein €/Einheit als Kalkulationsgrundlage.</div>}
            {la.map((l, i) => (
              <div key={i} className="glass card-hover rounded-2xl p-4">
                <div className="flex justify-between items-baseline gap-2">
                  <div className="font-semibold truncate">{l.leistung}</div>
                  <div className="grad-text font-bold whitespace-nowrap">{l.ep != null ? euro(l.ep) + ' / ' + l.einheit : '—'}</div>
                </div>
                <div className="text-white/45 text-xs mt-1">
                  {l.gewerk} · {l.menge ? l.menge + ' ' + l.einheit + ' · ' : ''}{euro(l.total)} Selbstkosten{l.ep == null ? ' · Menge erfassen für €/Einheit' : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex items-start gap-2 text-white/35 text-xs mt-7 max-w-2xl">
        <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Tipp: Die €/Einheit-Werte sind deine echten Selbstkosten — schlag deinen Aufschlag drauf und du hast den EP fürs Angebot.</span>
      </div>
    </div>
  )
}
