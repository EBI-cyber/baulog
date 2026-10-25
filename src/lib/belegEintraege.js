// Gescannten Beleg in Material-Einträge umwandeln: jede Belegposition wird ein eigener Eintrag, der erste trägt das Belegbild.
// b: Ergebnis des BelegScanners ({ dataUrl, roh, lieferant, datum, betrag, positionen, privat, privatPositionen })
// Wirft einen Fehler mit verständlicher Meldung, wenn es nichts abzulegen gibt.
export function belegEintraege(b, gewerk) {
  const createdAt = b.datum ? new Date(b.datum + 'T12:00:00').toISOString() : new Date().toISOString()
  const fmt = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  const notiz = 'Beleg' + (b.lieferant ? ' ' + b.lieferant : '') + (b.datum ? ' vom ' + new Date(b.datum + 'T12:00:00').toLocaleDateString('de-DE') : '') +
    ' · ' + fmt(b.betrag) + (b.privat > 0 ? ' (davon privat ' + fmt(b.privat) + ', nicht verrechnet)' : '')
  // rein privater Beleg: trotzdem ablegen (nur als Dokumentation, nichts wird berechnet)
  const nurPrivat = !b.positionen.length && (b.privatPositionen || []).length > 0 && b.betrag - (b.privat || 0) <= 0.01
  const pos = b.positionen.length || nurPrivat ? [...b.positionen] : [{ bezeichnung: b.lieferant || 'Materialbeleg', menge: 1, gesamt: b.betrag - (b.privat || 0), gewerk }]
  if (!nurPrivat && pos.reduce((a, p) => a + p.gesamt, 0) <= 0) throw new Error('Der Beleg hat keinen Betrag, es gibt nichts zu verrechnen.')
  const summe = pos.reduce((a, p) => a + p.gesamt, 0)
  // Privatanteil gehört nicht zur Baustelle: Differenz nur gegen den Baustellenanteil rechnen
  const baustelle = b.betrag - (b.privat || 0)
  if (b.positionen.length && Math.abs(summe - baustelle) > 0.01) pos.push({ bezeichnung: 'Differenz laut Beleg', menge: 1, gesamt: Math.round((baustelle - summe) * 100) / 100, gewerk: pos[0].gewerk || gewerk })
  // private Positionen dokumentieren: als Eintrag ohne Kosten, damit der Abzug im Leistungsnachweis steht
  for (const p of (b.privatPositionen || [])) pos.push({ ...p, privatDoku: true })
  // je Position eine Millisekunde später: so bleibt die Reihenfolge wie auf dem Beleg erhalten
  const zeitpunkt = (i) => new Date(Date.parse(createdAt) + i).toISOString()
  const liste = pos.map((p, i) => {
    if (p.privatDoku) return {
      type: 'material', gewerk: p.gewerk || gewerk, leistung: '', createdAt: zeitpunkt(i), note: notiz, qty: 1, unitCost: 0, dataUrl: '', belegRoh: null,
      label: (b.lieferant ? b.lieferant + ': ' : '') + p.bezeichnung + ' (privat, nicht berechnet: ' + fmt(p.gesamt) + ')',
    }
    // Verschleißteil: nur der Anteil wird berechnet, der volle Preis steht in der Bezeichnung
    const anteil = p.anteil != null && p.anteil < 100 ? p.anteil : 100
    const berechnet = p.gesamt * anteil / 100
    return {
      type: 'material', gewerk: p.gewerk || gewerk, leistung: '', createdAt: zeitpunkt(i), note: notiz,
      label: (b.lieferant ? b.lieferant + ': ' : '') + p.bezeichnung + (anteil < 100 ? ' (Verschleißanteil ' + anteil + ' % von ' + fmt(p.gesamt) + ')' : ''),
      qty: p.menge > 0 ? p.menge : 1, unitCost: Math.round((berechnet / (p.menge > 0 ? p.menge : 1)) * 10000) / 10000,
      dataUrl: '', belegRoh: null,
    }
  })
  // der erste Eintrag trägt das Belegbild (auch wenn er privat ist)
  liste[0] = { ...liste[0], dataUrl: b.dataUrl, belegRoh: b.roh }
  return liste
}
