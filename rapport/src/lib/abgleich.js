import { db } from './db'
import { lohnBerechnen, erweitert, modus, chf, stundenSaetze } from './lohn'
import { kontenBerechnen } from './konten'
import { zahl } from './settings'
import { isoDatum, arbeitMs, TAGE, datumKurz } from './zeit'
import { quellensteuerPflichtig, tarif } from './profil'
import { tarifLaden, satzFuer } from './quellensteuer'
import { supabase } from './ki'

/** KI: Lohnabrechnung (Fotos) lesen */
export async function lohnabrechnungLesen(bilder) {
  if (!supabase) throw new Error('KI ist in dieser Version nicht eingerichtet.')
  const { data, error } = await supabase.functions.invoke('baulog-ai', { body: { task: 'lohnabrechnung', bilder } })
  if (error) {
    let d = ''; try { d = (await error.context.clone().json()).error } catch {}
    throw new Error('KI-Fehler: ' + (d || error.message))
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** Lohn laut App für einen Zeitraum (inkl. automatischer Quellensteuer nach Monatslohn) */
export async function appLohn(von, bis, einst) {
  const [a, b] = erweitert(von, bis)
  const daten = {
    schichten: await db.schichten.where('datum').between(a, b, true, true).toArray(),
    absenzen: await db.absenzen.where('datum').between(a, b, true, true).toArray(),
    spesen: await db.spesen.where('datum').between(von, bis, true, true).toArray(),
    einsaetze: await db.einsaetze.toArray(),
  }
  let e = einst, qstTarif = null
  const p = einst?.profil
  if (quellensteuerPflichtig(p) && p?.wohnkanton) qstTarif = await tarifLaden(+bis.slice(0, 4), p.wohnkanton, tarif(p))
  if (quellensteuerPflichtig(p) && !zahl(p?.qstSatz) && p?.wohnkanton) {
    const t = qstTarif
    if (t) {
      const brutto = lohnBerechnen({ ...daten, spesen: [], einst, von, bis }).brutto
      e = { ...einst, qstAuto: { satz: satzFuer(t, brutto), jahr: t.jahr, monatsBrutto: brutto, code: tarif(p), kanton: p.wohnkanton } }
    }
  }
  const lohn = lohnBerechnen({ ...daten, einst: e, von, bis })
  const konten = kontenBerechnen({ schichten: await db.schichten.toArray(), absenzen: await db.absenzen.toArray(), einsaetze: daten.einsaetze,
    bewegungen: await db.kontobewegungen.toArray(), einst, bis })
  // Arbeitstage im Zeitraum (für die Stunden-Kontrolle)
  const tage = {}
  for (const s of daten.schichten) if (s.ende && s.datum >= von && s.datum <= bis) tage[s.datum] = (tage[s.datum] || 0) + arbeitMs(s) / 36e5
  // erfasste Vorschüsse für die Monate der Periode (aus dem Bankauszug oder von Hand)
  const monate = new Set([von.slice(0, 7), bis.slice(0, 7)])
  const zahlungen = (await db.zahlungen.toArray()).filter((z) => monate.has(z.fuerMonat))
  // „Bereits ausbezahlt“ = alle Zahlungen des Büros für die Periode (Vorschüsse und Lohnzahlungen)
  const vorschuesse = zahlungen.reduce((a, z) => a + z.betrag, 0)
  return { lohn, konten, tage, qstTarif, vorschuesse, vorschussAnzahl: zahlungen.length }
}

const sum = (l, f = (x) => x) => l.reduce((a, x) => a + (zahl(f(x)) || 0), 0)
const ZUSCHLAG = { ueberstunden: 'Überstunden', nacht: 'Nacht', samstag: 'Samstag', sonntag: 'Sonntag', feiertagarbeit: 'Feiertagsarbeit', zulage: 'Zulage pro Stunde' }

/**
 * Lohnabrechnung (KI-Daten) mit der App-Rechnung vergleichen.
 * Rückgabe: [{ id, gruppe, titel, app, ab (Abrechnung), einheit, status: ok|abweichung|hinweis, text, fix? }]
 * Vorzeichen-Logik: bei Lohnzeilen ist „Abrechnung < App“ zu deinen Ungunsten, bei Abzügen „Abrechnung > App“.
 */
export function vergleichen(ki, app, einst) {
  const w = einst?.waehrung || 'CHF'
  const P = app.lohn.posten.find((p) => ki.firma && p.firma.toLowerCase().includes(String(ki.firma).toLowerCase().slice(0, 8))) || null
  const posten = P ? [P] : app.lohn.posten
  const pos = Array.isArray(ki.positionen) ? ki.positionen : []
  const abz = Array.isArray(ki.abzuege) ? ki.abzuege : []
  const art = (a) => pos.filter((x) => x.art === a)
  const pruef = []
  const add = (c) => pruef.push(c)

  const geld = (id, gruppe, titel, appW, abW, opt = {}) => {
    if (appW == null && abW == null) return
    const a = appW ?? 0, b = abW ?? 0, d = b - a
    const tol = opt.tol ?? Math.max(0.1, Math.abs(a) * 0.002)
    const ok = Math.abs(d) <= tol
    const zuUngunsten = opt.abzug ? d > 0 : d < 0
    add({ id, gruppe, titel, app: a, ab: b, einheit: w, status: ok ? 'ok' : opt.nurHinweis ? 'hinweis' : 'abweichung',
      text: ok ? '' : opt.text || (zuUngunsten ? `${opt.abzug ? 'Zu viel abgezogen' : 'Dir fehlen'}: ${chf(Math.abs(d), w)}` : `Abrechnung ${chf(Math.abs(d), w)} ${opt.abzug ? 'tiefer' : 'höher'} als berechnet`),
      zuUngunsten: !ok && zuUngunsten, ...opt.extra })
  }

  // 1) Stunden
  const appStd = sum(posten, (p) => p.grundStd)
  const abStd = zahl(ki.stundenTotal) || sum(art('grundlohn'), (x) => x.menge) || null
  if (abStd != null) {
    const d = abStd - appStd, ok = Math.abs(d) < 0.05
    add({ id: 'stunden', gruppe: 'Stunden', titel: 'Gearbeitete Stunden', app: appStd, ab: abStd, einheit: 'h', status: ok ? 'ok' : 'abweichung', zuUngunsten: d < 0,
      text: ok ? '' : d < 0 ? `Es fehlen ${(-d).toFixed(2)} h — deine Rapporte zeigen ${appStd.toFixed(2)} h` : `${d.toFixed(2)} h mehr als in deinen Rapporten`,
      nachricht: `Laut meinen Rapporten habe ich ${appStd.toFixed(2)} h gearbeitet, abgerechnet sind ${abStd.toFixed(2)} h (${d < 0 ? `es fehlen ${(-d).toFixed(2)} h` : `${d.toFixed(2)} h zu viel`}).`,
      tage: Object.entries(app.tage).sort().map(([d, h]) => `${TAGE[new Date(d + 'T12:00').getDay()]} ${datumKurz(new Date(d + 'T12:00'))}: ${h.toFixed(2)} h`) })
  }
  // 2) Grundlohn-Ansatz und Betrag
  const ansatz = art('grundlohn').find((x) => zahl(x.ansatz))?.ansatz
  const appAnsatz = P?.stundenlohn || posten[0]?.stundenlohn
  if (ansatz && appAnsatz) geld('ansatz', 'Lohn', 'Stundenlohn (Grundlohn)', appAnsatz, zahl(ansatz), { tol: 0.005, text: `Ansatz ${chf(zahl(ansatz), w)} statt ${chf(appAnsatz, w)} laut Einsatzvertrag` })
  const appGrund = sum(posten, (p) => p.zeilen.find((z) => z.label === 'Grundlohn')?.betrag)
  if (art('grundlohn').length) geld('grundlohn', 'Lohn', 'Grundlohn', appGrund, sum(art('grundlohn'), (x) => x.betrag))
  // 3) Zuschläge
  for (const [k, l] of Object.entries(ZUSCHLAG)) {
    const appZ = sum(posten, (p) => sum(p.zeilen.filter((z) => z.label.startsWith(l === 'Überstunden' ? 'Überstunden' : l)), (z) => z.betrag))
    const abZ = sum(art(k), (x) => x.betrag)
    if (appZ > 0.005 || abZ > 0.005) geld(k, 'Zuschläge', l === 'Zulage pro Stunde' ? 'Zulagen' : `${l}-Zuschlag`, appZ, abZ)
  }
  // 4) Entschädigungen: laufend vs. angespart
  const entsch = ['ferien', 'feiertag', 'dreizehnter']
  const totalApp = sum(posten, (p) => sum(p.zeilen.filter((z) => entsch.includes(z.k)), (z) => z.betrag)), totalAb = sum(pos.filter((x) => entsch.includes(x.art)), (x) => x.betrag)
  const totalStimmt = totalAb > 0 && Math.abs(totalApp - totalAb) <= 0.1
  for (const [k, l] of [['ferien', 'Ferienentschädigung'], ['feiertag', 'Feiertagsentschädigung'], ['dreizehnter', '13. Monatslohn']]) {
    const appL = sum(posten, (p) => sum(p.zeilen.filter((z) => z.k === k && !z.konto), (z) => z.betrag))
    const appKonto = sum(posten, (p) => sum(p.zeilen.filter((z) => z.k === k && z.konto), (z) => z.betrag))
    const abL = sum(art(k), (x) => x.betrag)
    const hatGuthaben = ki.guthaben && zahl(ki.guthaben[k]) > 0
    const e = P?.einsatz
    const abRueck = zahl(ki.rueckstellungen?.[k])
    if (abL > 0.005 && abRueck > 0.005 && e && modus(e, k) !== 'netto') {
      add({ id: k + '-modus', gruppe: 'Entschädigungen', titel: l, app: appL + appKonto, ab: abL, einheit: w, status: 'hinweis',
        text: `Das Büro rechnet die ${l} im Bruttolohn ab und behält netto ${chf(abRueck, w)} als Guthaben zurück.`,
        fix: { einsatzId: e.id, feld: `${k}Modus`, wert: 'netto', label: 'Auf „netto zurückbehalten“ umstellen' } })
    } else if (appKonto > 0 && abL > 0.005 && e) {
      add({ id: k + '-modus', gruppe: 'Entschädigungen', titel: l, app: appKonto, ab: abL, einheit: w, status: 'hinweis',
        text: `Das Büro zahlt die ${l} laufend aus — in deinem Einsatz steht „angespart“.`, fix: { einsatzId: e.id, feld: `${k}Modus`, wert: 'laufend', label: 'Auf „mit jedem Lohn“ umstellen' } })
    } else if (appL > 0.005 && abL < 0.005 && (hatGuthaben || !art(k).length) && e) {
      add({ id: k + '-modus', gruppe: 'Entschädigungen', titel: l, app: appL, ab: 0, einheit: w, status: hatGuthaben ? 'hinweis' : 'abweichung', zuUngunsten: !hatGuthaben,
        text: hatGuthaben ? `Nicht ausbezahlt, aber ein Guthaben ausgewiesen — das Büro spart die ${l} an.` : `${l} fehlt auf der Abrechnung (${chf(appL, w)}). Nachfragen, ob sie angespart wird.`,
        fix: hatGuthaben ? { einsatzId: e.id, feld: `${k}Modus`, wert: 'konto', label: 'Auf „angespart“ umstellen' } : null })
    } else if (appL > 0.005 || abL > 0.005) geld(k, 'Entschädigungen', l, appL, abL, totalStimmt ? { tol: 0.5 } : {})
  }
  // 5) Abwesenheiten (Krankheit, Ferienbezug …)
  const appAbs = sum(posten, (p) => sum(p.zeilen.filter((z) => z.art), (z) => z.betrag))
  const abAbs = sum(pos.filter((x) => ['absenz', 'ferienbezug', 'feiertagbezug'].includes(x.art)), (x) => x.betrag)
  if (appAbs > 0.005 || abAbs > 0.005) geld('absenzen', 'Lohn', 'Abwesenheiten (Lohnfortzahlung, Ferienlohn)', appAbs, abAbs)
  // 6) Brutto
  if (ki.brutto != null) geld('brutto', 'Summen', 'Bruttolohn', app.lohn.brutto, zahl(ki.brutto))
  // 7) Abzüge — Satz und Betrag
  const appAbz = {}
  for (const p of posten) for (const a of p.abzuege) { const x = (appAbz[a.k] ||= { label: a.label, prozent: a.prozent, betrag: 0 }); x.betrag += a.betrag }
  const arten = new Set([...Object.keys(appAbz), ...abz.map((a) => a.art || 'sonstiges'), ...(quellensteuerPflichtig(einst?.profil) ? ['quellensteuer'] : [])])
  for (const k of arten) {
    const a = appAbz[k], b = abz.filter((x) => (x.art || 'sonstiges') === k)
    if (k === 'quellensteuer' && quellensteuerPflichtig(einst?.profil)) {
      // gegen die offizielle Tabelle beim Bruttolohn der Abrechnung prüfen
      const bBetrag = sum(b, (x) => x.betrag), basis = zahl(ki.brutto) || app.lohn.brutto
      const soll = zahl(einst.profil.qstSatz) || (app.qstTarif ? satzFuer(app.qstTarif, basis) : null)
      const ist = basis ? Math.round((bBetrag / basis) * 10000) / 100 : 0
      if (soll == null) { add({ id: 'abzug-qst', gruppe: 'Abzüge', titel: 'Quellensteuer', app: 0, ab: bBetrag, einheit: w, status: 'hinweis', text: 'Offizielle Tabelle nicht verfügbar — nicht geprüft.' }); continue }
      const sollBetrag = basis * soll / 100, d = bBetrag - sollBetrag, ok = Math.abs(d) <= Math.max(0.1, sollBetrag * 0.01)
      if (!b.length && sollBetrag > 0.5) {
        add({ id: 'abzug-qst', gruppe: 'Abzüge', titel: `Quellensteuer (${tarif(einst.profil)}, ${einst.profil.wohnkanton})`, app: sollBetrag, ab: 0, einheit: w, status: 'hinweis',
          text: `Keine Quellensteuer abgezogen — laut Fragebogen bist du quellensteuerpflichtig (≈ ${soll.toFixed(2)} %, ${chf(sollBetrag, w)}). Fehlt sie, kann das Steueramt sie später nachfordern. Beim Büro nachfragen, ob der Abzug noch kommt.`,
          nachricht: `Quellensteuer: Auf der Abrechnung ist keine Quellensteuer abgezogen. Laut offizieller Tabelle (Kanton ${einst.profil.wohnkanton}, Tarif ${tarif(einst.profil)}) wären es ${soll.toFixed(2)} % (${chf(sollBetrag, w)}). Wird sie noch abgerechnet?` })
        continue
      }
      add({ id: 'abzug-qst', gruppe: 'Abzüge', titel: `Quellensteuer (${tarif(einst.profil)}, ${einst.profil.wohnkanton})`, app: sollBetrag, ab: bBetrag, einheit: w,
        status: ok ? 'ok' : d > 0 ? 'abweichung' : 'hinweis', zuUngunsten: !ok && d > 0,
        text: ok ? '' : `${ist.toFixed(2)} % abgezogen, laut offizieller Tabelle ${soll.toFixed(2)} % bei ${chf(basis, w)} Monatslohn${d > 0 ? ` — ${chf(d, w)} zu viel` : ''}. Hat das Büro einen anderen Tarif oder den Lohn hochgerechnet (Ein-/Austritt im Monat)? Nachfragen.`,
        nachricht: `Quellensteuer: Abgezogen wurden ${ist.toFixed(2)} % (${chf(bBetrag, w)}). Laut offizieller Tabelle (Kanton ${einst.profil.wohnkanton}, Tarif ${tarif(einst.profil)}) wären es bei ${chf(basis, w)} Monatslohn ${soll.toFixed(2)} % (${chf(sollBetrag, w)}). Welcher Tarif bzw. welches satzbestimmende Einkommen wurde angewendet?` })
      continue
    }
    const bBetrag = sum(b, (x) => x.betrag), bProzent = b.find((x) => zahl(x.prozent))?.prozent
    const titel = a?.label || b[0]?.text || k
    const E = P?.einsatz || posten[0]?.einsatz
    const bekannt = ['ahv', 'alv', 'nbu', 'ktg', 'bvg', 'gav', 'far', 'parifonds'].includes(k)
    const satzFix = E?.id && bekannt && bProzent != null ? { einsatzId: E.id, feld: k, wert: String(zahl(bProzent)), label: `${zahl(bProzent)} % im Einsatz übernehmen` } : null
    // BVG auf kleinerer Basis (koordinierter Lohn) → Koordinationsabzug pro Stunde übernehmen
    const bBasis = zahl(b.find((x) => zahl(x.basis))?.basis), kiStd = zahl(ki.stundenTotal) || sum(art('grundlohn'), (x) => x.menge)
    if (k === 'bvg' && E?.id && bBasis && zahl(ki.brutto) - bBasis > 1 && kiStd && !zahl(E.bvgKoordStunde)) {
      const koord = Math.round(((zahl(ki.brutto) - bBasis) / kiStd) * 100) / 100
      add({ id: 'abzug-bvg-basis', gruppe: 'Abzüge', titel: 'Pensionskasse — Basis', app: app.lohn.brutto, ab: bBasis, einheit: w, status: 'hinweis',
        text: `Die Pensionskasse wird auf dem koordinierten Lohn (${chf(bBasis, w)}) berechnet, nicht auf dem Bruttolohn — Abzug ≈ ${koord.toFixed(2)} pro Stunde.`,
        fix: { einsatzId: E.id, feld: 'bvgKoordStunde', wert: String(koord), label: `Koordinationsabzug ${koord.toFixed(2)}/h übernehmen` } })
    }
    if (!a && b.length) {
      add({ id: 'abzug-' + k, gruppe: 'Abzüge', titel, app: 0, ab: bBetrag, einheit: w, status: 'hinweis',
        text: `Abzug, den deine Einstellungen nicht kennen${bProzent ? ` (${bProzent} %)` : ''}${satzFix ? '' : ' — nachfragen oder im Einsatz ergänzen'}.`, fix: satzFix })
      continue
    }
    if (a && !b.length) {
      add({ id: 'abzug-' + k, gruppe: 'Abzüge', titel, app: a.betrag, ab: 0, einheit: w, status: 'hinweis', text: 'Nicht abgezogen — Satz im Einsatz prüfen.' })
      continue
    }
    if (bProzent != null && Math.abs(zahl(bProzent) - a.prozent) > 0.005) {
      add({ id: 'abzug-' + k + '-satz', gruppe: 'Abzüge', titel: `${titel} — Satz`, app: a.prozent, ab: zahl(bProzent), einheit: '%', status: zahl(bProzent) > a.prozent ? 'abweichung' : 'hinweis',
        zuUngunsten: zahl(bProzent) > a.prozent, text: `${bProzent} % statt ${a.prozent} % laut Vertrag/Gesetz`, fix: ['ahv', 'alv'].includes(k) ? null : satzFix })
    }
    geld('abzug-' + k, 'Abzüge', titel, a.betrag, bBetrag, { abzug: true })
  }
  // 8) Netto, Spesen, Auszahlung
  if (ki.netto != null) geld('netto', 'Summen', 'Nettolohn', app.lohn.netto, zahl(ki.netto))
  const appSp = app.lohn.spesen + app.lohn.mittag, abSp = sum(pos.filter((x) => ['spesen', 'mittag'].includes(x.art)), (x) => x.betrag)
  if (appSp > 0.005 || abSp > 0.005) geld('spesen', 'Summen', 'Spesen und Zulagen', appSp, abSp)
  // Vorschüsse: was das Büro abzieht, muss dem entsprechen, was auf dem Konto eingegangen ist
  const abRueck = zahl(ki.rueckstellungen?.ferien) + zahl(ki.rueckstellungen?.feiertag) + zahl(ki.rueckstellungen?.dreizehnter)
  if (app.lohn.rueckstellung > 0.005 || abRueck > 0.005) geld('rueckstellung', 'Summen', 'Zurückbehalten (Guthaben netto)', app.lohn.rueckstellung, abRueck, { tol: Math.max(0.5, abRueck * 0.03), nurHinweis: true })
  const kiV = ki.vorschuesse != null ? zahl(ki.vorschuesse) : sum(Array.isArray(ki.vorschussZeilen) ? ki.vorschussZeilen : [], (x) => x.betrag)
  if (app.vorschuesse > 0.005 || kiV > 0.005) {
    if (app.vorschussAnzahl) geld('vorschuesse', 'Summen', 'Bereits ausbezahlt (Vorschüsse/Lohn)', app.vorschuesse, kiV, { abzug: true, text: kiV > app.vorschuesse ? `Das Büro verrechnet ${chf(kiV - app.vorschuesse, w)} mehr, als laut deinen erfassten Zahlungen eingegangen ist — Bankauszug prüfen.` : undefined })
    else add({ id: 'vorschuesse', gruppe: 'Summen', titel: 'Bereits ausbezahlt (Vorschüsse/Lohn)', app: 0, ab: kiV, einheit: w, status: 'hinweis',
      text: 'Keine Zahlungen erfasst — Bankauszug unter Lohn → Zahlungen einfügen, dann prüft die App, ob die verrechneten Beträge wirklich eingegangen sind.' })
  }
  const vAbzug = app.vorschussAnzahl ? app.vorschuesse : kiV
  // die Netto-Rückstellung rechnet jedes Büro etwas anders (Abzüge darauf) → kleine Differenz dort ist keine Abweichung
  if (ki.auszahlung != null) geld('auszahlung', 'Summen', 'Auszahlung', app.lohn.auszahlung - vAbzug, zahl(ki.auszahlung), { tol: Math.max(0.06, app.lohn.rueckstellung * 0.03) })
  // 9) Guthaben
  const kt = app.konten.find((k) => !P || k.firma === P.firma)
  for (const [k, l] of [['ferien', 'Ferienguthaben'], ['feiertag', 'Feiertagsguthaben'], ['dreizehnter', '13. ML angespart']]) {
    const ab = ki.guthaben?.[k]
    if (ab == null && !kt?.konten[k]) continue
    if (ab != null && kt?.konten[k]) geld('guthaben-' + k, 'Guthaben', l, kt.konten[k].saldo, zahl(ab), { tol: Math.max(0.5, Math.abs(zahl(ab)) * 0.03) })
    else if (ab != null) add({ id: 'guthaben-' + k, gruppe: 'Guthaben', titel: l, app: 0, ab: zahl(ab), einheit: w, status: 'hinweis', text: 'Das Büro führt ein Guthaben — im Einsatz auf „angespart“ umstellen, dann rechnet die App mit.' })
  }
  // Auszahlung höher nur, weil keine Quellensteuer abgezogen wurde → Folge, keine eigene Abweichung
  const qstFehlt = pruef.find((c) => c.id === 'abzug-qst' && c.ab === 0 && c.app > 0)
  for (const id of ['netto', 'auszahlung']) {
    const c = pruef.find((x) => x.id === id)
    if (qstFehlt && c && c.status === 'abweichung' && Math.abs(c.ab - c.app - qstFehlt.app) <= Math.max(0.5, app.lohn.rueckstellung * 0.03)) {
      c.status = 'folge'; c.zuUngunsten = false; c.text = `Folge der fehlenden Quellensteuer (${chf(qstFehlt.app, w)}) — sonst stimmt ${id === 'netto' ? 'der Nettolohn' : 'die Auszahlung'}.`
    }
  }
  // Folgen erkennen: Stimmt eine Zeile für die Stunden der Abrechnung bzw. für deren Bruttolohn,
  // ist sie nicht selbst falsch, sondern nur eine Folge (z.B. der fehlenden Stunden) → grau statt rot.
  const st = pruef.find((c) => c.id === 'stunden')
  const r = st && st.app > 0 ? st.ab / st.app : 1
  const ursache = st?.status === 'abweichung' ? `fehlenden ${(st.app - st.ab).toFixed(2)} h` : null
  for (const c of pruef) {
    if (c.status !== 'abweichung' || c.einheit !== w) continue
    if (['grundlohn', 'ferien', 'feiertag', 'dreizehnter', ...Object.keys(ZUSCHLAG)].includes(c.id) && ursache && Math.abs(c.ab - c.app * r) <= Math.max(0.1, c.app * 0.003)) {
      c.status = 'folge'; c.text = `Folge der ${ursache} — der Satz stimmt`
    }
    if (c.id.startsWith('abzug-') && c.id !== 'abzug-qst') {
      const satz = appAbz[c.id.slice(6)]?.prozent, basis = zahl(ki.brutto)
      if (satz && basis && Math.abs(c.ab - basis * satz / 100) <= 0.1) { c.status = 'folge'; c.text = 'Satz stimmt — die Differenz kommt nur vom anderen Bruttolohn' }
    }
  }
  // Guthaben-Differenz, die genau den fehlenden Stunden entspricht
  if (ursache && P?.einsatz) {
    const sz = stundenSaetze(P.einsatz), fehl = st.app - st.ab
    for (const [k, satz] of [['ferien', sz.ferien], ['feiertag', sz.feiertag], ['dreizehnter', sz.dreizehnter]]) {
      const c = pruef.find((x) => x.id === 'guthaben-' + k)
      if (c?.status === 'abweichung' && Math.abs((c.app - c.ab) - fehl * satz) <= 0.15) { c.status = 'folge'; c.text = `Folge der ${ursache}` }
    }
  }
  // Summen sind Gesamtauswirkung, keine eigene Ursache
  const ursachen = pruef.filter((c) => c.status === 'abweichung' && !['brutto', 'netto', 'auszahlung'].includes(c.id) && !c.id.startsWith('guthaben'))
  for (const c of pruef) if (['brutto', 'netto'].includes(c.id) && c.status === 'abweichung' && ursachen.length) { c.status = 'folge'; c.text = 'Gesamtauswirkung der Abweichungen oben' }
  return pruef
}

/** Text für das Büro aus den ausgewählten Abweichungen */
export function nachrichtText({ ki, pruef, einst, einsatz, gesamt }) {
  const w = einst?.waehrung || 'CHF'
  const fmt = (c) => c.einheit === 'h' ? `${c.ab.toFixed(2)} h` : c.einheit === '%' ? `${c.ab} %` : chf(c.ab, w)
  const soll = (c) => c.einheit === 'h' ? `${c.app.toFixed(2)} h` : c.einheit === '%' ? `${c.app} %` : chf(c.app, w)
  const periode = ki.periodeVon && ki.periodeBis ? `${ki.periodeVon.split('-').reverse().join('.')}–${ki.periodeBis.split('-').reverse().join('.')}` : 'der letzten Periode'
  return `Guten Tag${einsatz?.bueroKontakt ? ' ' + einsatz.bueroKontakt : ''}\n\n` +
    `beim Nachrechnen meiner Lohnabrechnung ${periode}${einsatz?.einsatznummer ? ` (Einsatz-Nr. ${einsatz.einsatznummer})` : ''} sind mir folgende Punkte aufgefallen:\n\n` +
    pruef.filter((c) => c.id !== 'auszahlung').map((c) => `• ${c.nachricht || `${c.titel}: abgerechnet ${fmt(c)}, laut meinem Einsatzvertrag und meinen Rapporten ${soll(c)} (Differenz ${c.einheit === 'h' ? `${Math.abs(c.ab - c.app).toFixed(2)} h` : c.einheit === '%' ? `${Math.abs(c.ab - c.app).toFixed(2)} %` : chf(Math.abs(c.ab - c.app), w)}).`}`).join('\n') +
    (gesamt && Math.abs(gesamt.app - gesamt.ab) > 0.05 ? `\n\nInsgesamt ergibt das bei der Auszahlung eine Differenz von ${chf(Math.abs(gesamt.app - gesamt.ab), w)} (${chf(gesamt.ab, w)} statt ${chf(gesamt.app, w)}).` : '') +
    `\n\nKönnten Sie das bitte prüfen und mir Bescheid geben? Meine Rapporte sende ich gerne nochmals.\n\nFreundliche Grüsse\n${einst?.name || ''}`
}

export { modus, isoDatum }
