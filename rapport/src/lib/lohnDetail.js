import { chf, einsatzWert as wert, modus, stundenSaetze } from './lohn'
import { absenzArt } from './arten'
import { tarif } from './profil'

/**
 * Erklärung einer Zahl im Lohn-Bildschirm: was ist das, wie wird gerechnet (mit den echten Zahlen), worauf beruht es.
 * ziel = { art: 'zeile'|'abzug'|'brutto'|'netto'|'abzuege'|'spesen'|'mittag'|'rueckstellung'|'auszahlung'|'zahlung'|'offen', p (Posten), x (Zeile/Abzug) }
 * Rückgabe: { titel, betrag, was, rechnung: [[text, betrag?, fett?]], grundlage, hinweis }
 */
export function lohnDetail(ziel, { lohn, w = 'CHF', einst, erhalten = 0, zahlungen = [] }) {
  const f = (n) => chf(n, w)
  const h = (n) => `${(n || 0).toFixed(2)} h`
  const { p, x } = ziel
  const e = p?.einsatz
  const g = p?.stundenlohn || 0
  const wochenZeilen = () => Object.entries(p.wochenStd || {}).sort().map(([k, std]) => [`KW ${+k.slice(6)}: ${h(std)} × ${g.toFixed(2)}`, Math.round(std * g * 100) / 100])

  if (ziel.art === 'zeile') {
        if (x.typ === 'grund') return {
      titel: 'Grundlohn', betrag: x.betrag,
      was: 'Dein Lohn für die tatsächlich gearbeiteten Stunden — ohne Zuschläge, Ferien, Feiertage und 13. Monatslohn (die kommen als eigene Zeilen dazu).',
      rechnung: [...wochenZeilen(), [`Total ${h(p.grundStd)}`, x.betrag, true]],
      grundlage: `Stundenlohn ${g.toFixed(2)} laut Einsatzvertrag ${p.firma}. Die Stunden stammen aus deinen Einträgen (Arbeitszeit ohne Pausen).`,
      hinweis: 'Wie auf der Abrechnung wird jede Kalenderwoche einzeln auf den Rappen gerundet.',
    }
    const zuschlag = { ueberzeit: ['ueberzeitZuschlag', 'Überzeitzuschlag', `Angeordnete Arbeit über der gesetzlichen Höchstarbeitszeit (${wert(e, 'ueberzeitGrenze')} h pro Woche) = Überzeit. Zählt nur in Wochen, in denen du „Länger bleiben angeordnet“ markiert hast.`, 'Arbeitsgesetz Art. 9 und 13, GAV Betonwaren-Industrie Art. 3 (25 % in Geld oder Freizeit).', p?.ueberzeitStd],
      ueber: ['ueberstundenZuschlag', 'Überstundenzuschlag', 'Stunden über der vereinbarten Wochenarbeitszeit werden mit einem Zuschlag bezahlt.', 'OR Art. 321c (mind. 25 %), Einsatzvertrag / GAV.', p?.ueberStd],
      nacht: ['nachtZuschlag', 'Nachtzuschlag', `Arbeit zwischen ${wert(e, 'nachtVon')} und ${wert(e, 'nachtBis')} Uhr wird mit einem Zuschlag bezahlt.`, 'Arbeitsgesetz Art. 17b (vorübergehende Nachtarbeit mind. 25 %), Einsatzvertrag.', p?.nachtStd],
      samstag: ['samstagZuschlag', 'Samstagszuschlag', 'Arbeit am Samstag laut Vertrag mit Zuschlag.', 'Einsatzvertrag / GAV des Einsatzbetriebs.', p?.samstagStd],
      sonntag: ['sonntagZuschlag', 'Sonntagszuschlag', 'Sonntagsarbeit wird mit Zuschlag bezahlt.', 'Arbeitsgesetz Art. 19 (vorübergehende Sonntagsarbeit mind. 50 %), Einsatzvertrag.', p?.sonntagStd],
      feiertagarbeit: ['feiertagArbeitZuschlag', 'Zuschlag Feiertagsarbeit', 'Arbeit an einem gesetzlichen Feiertag im Kanton des Einsatzes.', 'Arbeitsgesetz Art. 20a (Feiertage wie Sonntage), Einsatzvertrag.', p?.feiertagStd] }[x.typ]
    if (zuschlag) {
      const [k, titel, was, grundlage, std] = zuschlag
      return { titel, betrag: x.betrag, was, rechnung: [[`${h(std)} × ${g.toFixed(2)} × ${wert(e, k)} %`, x.betrag, true]], grundlage }
    }
    if (x.typ === 'zulage') return { titel: 'Zulage pro Stunde', betrag: x.betrag, was: 'Fester Zusatz pro gearbeitete Stunde (z.B. Schicht-, Schmutz- oder Funktionszulage).', rechnung: [[x.info, x.betrag, true]], grundlage: 'Einsatzvertrag.' }
    const sz = stundenSaetze(e)
    if (x.k === 'ferien') {
      const pz = wert(e, 'ferienProzent'), wochen = 52 * pz / (100 + pz)
      const m = modus(e, 'ferien')
      return {
        titel: 'Ferienentschädigung', betrag: x.betrag,
        was: `Bei Stundenlohn bekommst du für die Ferien keinen Lohn an den Ferientagen, sondern auf jede gearbeitete Stunde einen Zuschlag von ${pz} % — das entspricht ≈ ${wochen.toFixed(1)} Wochen Ferien pro Jahr.`,
        rechnung: [[`${h(p.grundStd)} × ${(wert(e, 'ferienAnsatz') || sz.ferien).toFixed(4)} (= ${g.toFixed(2)} × ${pz} %)`, x.betrag, true],
          ...(m === 'netto' && /netto ([\d.]+)/.test(x.info || '') ? [['davon netto zurückbehalten (Guthaben)', +x.info.match(/netto ([\d.]+)/)[1]]] : [])],
        grundlage: 'OR Art. 329a/329d, GAV Personalverleih (Ferien nach Alter: 8.33 % = 4 Wochen, 10.64 % = 5 Wochen), Einsatzvertrag.',
        hinweis: m === 'netto' ? 'Dein Büro rechnet sie im Bruttolohn ab, behält den Nettobetrag aber als Feriengeld-Guthaben zurück. Es wird ausbezahlt, wenn du Ferien beziehst oder der Einsatz endet.'
          : m === 'konto' ? 'Wird beim Büro angespart (nicht im Bruttolohn) und bei Ferien als Lohn ausbezahlt.' : 'Wird mit jedem Lohn laufend ausbezahlt — an Ferientagen gibt es dann keinen Lohn mehr.',
      }
    }
    if (x.k === 'feiertag') {
      const pz = wert(e, 'feiertagProzent')
      return {
        titel: 'Feiertagsentschädigung', betrag: x.betrag,
        was: `Bezahlte Feiertage (z.B. Weihnachten, Ostermontag) werden bei Stundenlohn als Zuschlag von ${pz} % auf jede Stunde bezahlt — ≈ ${(pz / 100 * 52 * 5 / (1 + pz / 100)).toFixed(1)} Feiertage pro Jahr.`,
        rechnung: [[`${h(p.grundStd)} × ${(wert(e, 'feiertagAnsatz') || sz.feiertag).toFixed(4)} (= ${g.toFixed(2)} × ${pz} %)`, x.betrag, true]],
        grundlage: 'GAV Personalverleih bzw. GAV des Einsatzbetriebs, Einsatzvertrag.',
      }
    }
    if (x.k === 'dreizehnter') {
      const pz = wert(e, 'dreizehnterProzent')
      return {
        titel: '13. Monatslohn', betrag: x.betrag,
        was: `Der 13. Monatslohn wird pro Stunde mitbezahlt: ${pz} % (= 1/12) auf Grundlohn + Ferien- + Feiertagsentschädigung.`,
        rechnung: [[`(${g.toFixed(2)} + ${sz.ferien.toFixed(2)} + ${sz.feiertag.toFixed(2)}) × ${pz} % = ${sz.dreizehnter.toFixed(4)} pro Stunde`], [`${h(p.grundStd)} × ${sz.dreizehnter.toFixed(4)}`, x.betrag, true]],
        grundlage: 'GAV Personalverleih bzw. GAV des Einsatzbetriebs, Einsatzvertrag.',
      }
    }
    if (x.art) {
      const a = absenzArt(x.art)
      const texte = {
        krank: ['Lohn bei Krankheit: Die ersten Tage pro Krankheitsfall sind Wartetage ohne Lohn, danach zahlt die Krankentaggeld-Versicherung einen Teil deines Lohns (meist 80 %) — aber nur mit Arztzeugnis. Das Taggeld ist kein AHV-Lohn, darauf gibt es keine Sozialabzüge.', 'GAV Personalverleih Art. 28/29 (höchstens 2 Wartetage, mind. 80 %), Einsatzvertrag.'],
        unfall: ['Lohn bei Unfall: Unfalltag + 2 Tage zahlt der Arbeitgeber 80 %, danach die Unfallversicherung 80 % Taggeld.', 'Unfallversicherungsgesetz (UVG) Art. 16/17, OR Art. 324b.'],
        militaer: ['Lohnersatz bei Militär, Zivildienst oder Zivilschutz: 80 % über die Erwerbsersatzordnung (EO).', 'Erwerbsersatzgesetz (EOG).'],
        eltern: ['Mutterschafts- bzw. Vaterschaftsentschädigung: 80 % über die EO.', 'Erwerbsersatzgesetz (EOG).'],
        ferien: ['Ferientage: Ist die Ferienentschädigung laufend im Stundenlohn ausbezahlt, gibt es an Ferientagen keinen Lohn mehr. Ist sie angespart, wird der Lohn aus dem Guthaben bezahlt.', 'OR Art. 329d, Einsatzvertrag.'],
        feiertag: ['Feiertage: Wie bei den Ferien — laufend bezahlt (0 %) oder aus dem Guthaben.', 'GAV Personalverleih, Einsatzvertrag.'],
      }[x.art] || [`${a.label}: ${a.bezahlt ? 'bezahlte' : 'unbezahlte'} Abwesenheit.`, 'Einsatzvertrag / GAV.']
      return { titel: a.label, betrag: x.betrag, was: texte[0], rechnung: (x.info || '').split(' · ').filter(Boolean).map((t) => [t]).concat([['Betrag', x.betrag, true]]), grundlage: texte[1] }
    }
    return { titel: x.label, betrag: x.betrag, was: '', rechnung: [[x.info || '', x.betrag, true]], grundlage: '' }
  }

  if (ziel.art === 'abzug') {
    const a = x
    const info = {
      ahv: ['AHV/IV/EO: Altersrente (AHV), Invalidenversicherung (IV) und Lohnersatz bei Militär/Mutterschaft (EO). Der Arbeitgeber zahlt noch einmal gleich viel dazu.', 'AHVG — 5.3 % Arbeitnehmeranteil, auf dem ganzen AHV-Lohn.'],
      alv: ['Arbeitslosenversicherung: sichert dich bei Arbeitslosigkeit (RAV-Taggeld). Der Arbeitgeber zahlt gleich viel dazu.', 'AVIG — 1.1 % bis CHF 148\'200 Jahreslohn.'],
      nbu: ['Nichtberufsunfall-Versicherung: deckt Unfälle in der Freizeit (Sport, Haushalt, Verkehr). Berufsunfälle zahlt der Arbeitgeber allein.', 'UVG — Prämiensatz des Versicherers des Temporärbüros.'],
      ktg: ['Prämie der Krankentaggeld-Versicherung: sie zahlt dir bei Krankheit ab dem 3. Tag 80 % des Lohns. Höchstens die Hälfte der Prämie darf dir abgezogen werden.', 'GAV Personalverleih (Krankentaggeld).'],
      bvg: ['Pensionskasse (2. Säule): Altersguthaben für die Rente. Abgezogen wird nur auf dem „koordinierten Lohn“ (Lohn minus Koordinationsabzug).', 'BVG und GAV Personalverleih — bei Temporären je nach Einsatzdauer; Basis und Satz laut Lohnabrechnung.'],
      gav: ['Vollzugskostenbeitrag zum GAV Personalverleih: finanziert die Kontrolle der Mindestlöhne und die Weiterbildung (temptraining).', 'GAV Personalverleih — Satz laut Lohnabrechnung.'],
      far: ['Frühpensionierung Bau (FAR): ermöglicht Bauarbeitern die Pensionierung ab 60.', 'GAV FAR.'],
      parifonds: ['Parifonds / Berufsbeitrag des Einsatzbetriebs-GAV.', 'GAV des Einsatzbetriebs.'],
      quellensteuer: ['Quellensteuer: Einkommenssteuer, die bei ausländischen Arbeitnehmern ohne C-Bewilligung direkt vom Lohn abgezogen wird.', `Offizielle Tabelle der Steuerverwaltung, Kanton ${einst?.profil?.wohnkanton || '?'}, Tarif ${einst?.profil ? tarif(einst.profil) : '?'}.`],
    }[a.k] || [a.label, '']
    const rechnung = [[`Basis ${f(a.basis)} × ${a.prozent} %`, a.betrag, true]]
    if (a.k === 'bvg' && a.basis < p.brutto - (p.taggeld || 0) - 0.01) rechnung.unshift([`Bruttolohn ${f(p.brutto - (p.taggeld || 0))} − Koordinationsabzug ${h(p.grundStd)} × ${wert(e, 'bvgKoordStunde').toFixed(2)} = ${f(a.basis)}`])
    if (a.k !== 'quellensteuer' && a.k !== 'bvg' && p.taggeld) rechnung.unshift([`Bruttolohn ${f(p.brutto)} − Taggeld ${f(p.taggeld)} (kein AHV-Lohn) = ${f(a.basis)}`])
    return { titel: a.label, betrag: -a.betrag, was: info[0], rechnung, grundlage: info[1] }
  }

  if (ziel.art === 'brutto') return {
    titel: 'Bruttolohn', betrag: p.brutto, was: 'Alles, was du für den Zeitraum verdient hast, bevor Sozialabzüge und Steuern abgezogen werden.',
    rechnung: [...p.zeilen.filter((z) => !z.konto).map((z) => [z.art ? absenzArt(z.art).label : z.label, z.betrag]), ['Bruttolohn', p.brutto, true]],
    grundlage: 'Summe der Zeilen darüber. Angesparte Beträge (Konto beim Büro) zählen nicht dazu.',
  }
  if (ziel.art === 'netto') return {
    titel: 'Nettolohn', betrag: p.netto, was: 'Bruttolohn minus alle Abzüge — das gehört dir, bevor Spesen dazukommen und Guthaben zurückbehalten werden.',
    rechnung: [['Bruttolohn', p.brutto], ...p.abzuege.map((a) => [`− ${a.label} ${a.prozent} %`, -a.betrag]), ['Nettolohn', p.netto, true]], grundlage: '',
  }
  if (ziel.art === 'abzuege') return {
    titel: 'Abzüge total', betrag: -lohn.abzuege, was: 'Alle Sozialabzüge (und ggf. Quellensteuer) zusammen. Tipp: jede Zeile einzeln antippen für Details.',
    rechnung: [...lohn.posten.flatMap((pp) => pp.abzuege.map((a) => [`${a.label} ${a.prozent} %`, -a.betrag])), ['Total', -lohn.abzuege, true]], grundlage: '',
  }
  if (ziel.art === 'spesen') return { titel: 'Spesen', betrag: lohn.spesen, was: 'Rückerstattung deiner Auslagen (Verpflegung, Fahrt …). Spesen sind kein Lohn: keine AHV, keine Steuer.', rechnung: [['Summe der erfassten Spesen', lohn.spesen, true]], grundlage: 'OR Art. 327a, Einsatzvertrag.' }
  if (ziel.art === 'mittag') return { titel: 'Mittagszulage', betrag: lohn.mittag, was: 'Fester Betrag pro Arbeitstag fürs Mittagessen.', rechnung: lohn.posten.filter((pp) => pp.mittag).map((pp) => [`${pp.tage} Tage × ${wert(pp.einsatz, 'mittagszulage').toFixed(2)} (${pp.firma})`, pp.mittag]), grundlage: 'Einsatzvertrag.' }
  if (ziel.art === 'rueckstellung') return {
    titel: 'Zurückbehalten (Guthaben)', betrag: -lohn.rueckstellung,
    was: 'Ein Teil des Nettolohns (meist das Feriengeld) wird nicht ausbezahlt, sondern für dich beim Büro angespart. Du bekommst es, wenn du Ferien beziehst oder der Einsatz endet.',
    rechnung: lohn.posten.flatMap((pp) => pp.zeilen.filter((z) => z.k && modus(pp.einsatz, z.k) === 'netto').map((z) => [z.label + ' netto', -(z.info.match(/netto ([\d.]+)/)?.[1] || 0)])).concat([['Total zurückbehalten', -lohn.rueckstellung, true]]),
    grundlage: 'Einsatzvertrag / Lohnabrechnung des Büros („Rückstellung Feriengeld netto“).',
  }
  if (ziel.art === 'auszahlung') return {
    titel: erhalten > 0 ? 'Lohnanspruch' : 'Auszahlung', betrag: lohn.auszahlung,
    was: 'So viel sollte auf dein Konto kommen.',
    rechnung: [['Nettolohn', lohn.netto], ['+ Spesen', lohn.spesen], ...(lohn.mittag ? [['+ Mittagszulage', lohn.mittag]] : []), ...(lohn.rueckstellung ? [['− Zurückbehalten (Guthaben)', -lohn.rueckstellung]] : []), ['= Anspruch', lohn.auszahlung, true],
      ...zahlungen.map((z) => [`− bereits erhalten ${z.datum.split('-').reverse().join('.')}`, -z.betrag]), ...(erhalten > 0 ? [['= noch offen', Math.round((lohn.auszahlung - erhalten) * 100) / 100, true]] : [])],
    grundlage: 'Ohne Zahlungen wird auf 5 Rappen gerundet, wie bei der Überweisung.',
  }
  return null
}
