import { useEffect, useState } from 'react'
import { listProjekte, allEintraege } from '../lib/db'
import { gewerkAnalytics, projektTotals, leistungAnalytics } from '../lib/calc'
import { euro, hrs } from '../lib/format'

export default function Dashboard() {
  const [projekte, setProjekte] = useState([])
  const [eintraege, setEintraege] = useState([])
  useEffect(() => { (async () => { setProjekte(await listProjekte()); setEintraege(await allEintraege()) })() }, [])

  const totalMin = eintraege.filter((e) => e.type === 'zeit').reduce((a, e) => a + (Number(e.minutes) || 0), 0)
  let totalCost = 0
  projekte.forEach((p) => { totalCost += projektTotals(eintraege.filter((e) => e.projektId === p.id), p.hourlyRate).total })
  const gw = gewerkAnalytics(eintraege, projekte)
  const la = leistungAnalytics(eintraege, projekte)

  return (
    <div className="px-6 pt-10">
      <h2 className="text-2xl font-bold mb-4">Auswertung</h2>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="glass rounded-2xl p-3"><div className="text-white/40 text-xs">Projekte</div><div className="text-xl font-bold">{projekte.length}</div></div>
        <div className="glass rounded-2xl p-3"><div className="text-white/40 text-xs">Stunden</div><div className="text-xl font-bold">{hrs(totalMin)}</div></div>
        <div className="glass rounded-2xl p-3"><div className="text-white/40 text-xs">Selbstkosten</div><div className="text-xl font-bold grad-text">{euro(totalCost)}</div></div>
      </div>

      <div className="text-white/50 text-sm mb-2">Kennzahlen pro Gewerk <span className="text-white/30">— für deine Preiskalkulation</span></div>
      <div className="space-y-2">
        {gw.length === 0 && <div className="text-white/40 text-sm">Noch keine Daten — erfasse Zeiten & Material in deinen Projekten, dann erscheinen hier die Durchschnittswerte.</div>}
        {gw.map((g) => (
          <div key={g.gewerk} className="glass rounded-2xl p-4">
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
      <div className="text-white/50 text-sm mt-6 mb-2">EP-Basis pro Leistung <span className="text-white/30">— Selbstkosten je Einheit</span></div>
      <div className="space-y-2">
        {la.length === 0 && <div className="text-white/40 text-sm">Erfasse Leistungen mit Menge (📐) sowie Zeit/Material, dann erscheint hier dein €/Einheit als Kalkulationsgrundlage.</div>}
        {la.map((l, i) => (
          <div key={i} className="glass rounded-2xl p-4">
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

      <div className="text-white/30 text-xs mt-5">Tipp: Die €/Einheit-Werte sind deine echten Selbstkosten — schlag deinen Aufschlag drauf und du hast den EP fürs Angebot.</div>
    </div>
  )
}
