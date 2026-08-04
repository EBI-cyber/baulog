// Einträge auf einen Zeitraum (YYYY-MM-DD, inklusive) eingrenzen
export function filterByRange(eintraege, von, bis) {
  if (!von && !bis) return eintraege
  return eintraege.filter((e) => {
    const d = String(e.createdAt || '').slice(0, 10)
    if (von && d < von) return false
    if (bis && d > bis) return false
    return true
  })
}

// Selbstkosten eines Projekts aus seinen Einträgen
export function projektTotals(eintraege, rate) {
  let minutes = 0, materialCost = 0, maschineCost = 0, photos = 0, diary = 0
  for (const e of eintraege) {
    if (e.type === 'zeit') minutes += Number(e.minutes) || 0
    else if (e.type === 'material') materialCost += (Number(e.qty) || 0) * (Number(e.unitCost) || 0)
    else if (e.type === 'maschine') maschineCost += ((Number(e.minutes) || 0) / 60) * (Number(e.satz) || 0)
    else if (e.type === 'foto') photos++
    else if (e.type === 'tagebuch') diary++
  }
  const laborCost = (minutes / 60) * (Number(rate) || 0)
  return { minutes, hours: minutes / 60, laborCost, materialCost, maschineCost, total: laborCost + materialCost + maschineCost, photos, diary }
}

// Kennzahlen pro Gewerk über alle Projekte (für Preiskalkulation)
export function gewerkAnalytics(allEintraege, projekte) {
  const rateByProj = {}
  projekte.forEach((p) => { rateByProj[p.id] = Number(p.hourlyRate) || 0 })
  const map = {}
  for (const e of allEintraege) {
    const g = e.gewerk || 'Sonstiges'
    if (!map[g]) map[g] = { gewerk: g, minutes: 0, laborCost: 0, materialCost: 0, projects: new Set() }
    map[g].projects.add(e.projektId)
    if (e.type === 'zeit') {
      const m = Number(e.minutes) || 0
      map[g].minutes += m
      map[g].laborCost += (m / 60) * (rateByProj[e.projektId] || 0)
    } else if (e.type === 'material') {
      map[g].materialCost += (Number(e.qty) || 0) * (Number(e.unitCost) || 0)
    }
  }
  return Object.values(map)
    .map((x) => {
      const projCount = x.projects.size || 1
      const total = x.laborCost + x.materialCost
      return {
        gewerk: x.gewerk, minutes: x.minutes, laborCost: x.laborCost, materialCost: x.materialCost,
        total, projCount: x.projects.size,
        avgHoursPerProj: (x.minutes / 60) / projCount,
        avgCostPerProj: total / projCount,
      }
    })
    .filter((x) => x.minutes > 0 || x.materialCost > 0)
    .sort((a, b) => b.total - a.total)
}

// Selbstkosten je Einheit (EP-Basis) pro Leistung
export function leistungAnalytics(allEintraege, projekte) {
  const rateByProj = {}
  projekte.forEach((p) => { rateByProj[p.id] = Number(p.hourlyRate) || 0 })
  const map = {}
  for (const e of allEintraege) {
    if (!e.leistung) continue
    const key = (e.gewerk || '') + '||' + e.leistung
    if (!map[key]) map[key] = { gewerk: e.gewerk, leistung: e.leistung, einheit: '', menge: 0, laborCost: 0, materialCost: 0 }
    if (e.type === 'zeit') map[key].laborCost += ((Number(e.minutes) || 0) / 60) * (rateByProj[e.projektId] || 0)
    else if (e.type === 'material') map[key].materialCost += (Number(e.qty) || 0) * (Number(e.unitCost) || 0)
    else if (e.type === 'maschine') map[key].maschineCost = (map[key].maschineCost || 0) + ((Number(e.minutes) || 0) / 60) * (Number(e.satz) || 0)
    else if (e.type === 'menge') { map[key].menge += Number(e.menge) || 0; if (e.einheit) map[key].einheit = e.einheit }
  }
  return Object.values(map)
    .map((x) => {
      const total = x.laborCost + x.materialCost + (x.maschineCost || 0)
      return { ...x, maschineCost: x.maschineCost || 0, total, ep: x.menge > 0 ? total / x.menge : null }
    })
    .sort((a, b) => b.total - a.total)
}

