import { supabase } from './ki'
import { liste } from './unterschreiber'

// Unterschrift des Einsatzbetriebs per QR-Code — über die Edge Function „rapport-signatur".
async function aufruf(body) {
  if (!supabase) throw new Error('Keine Cloud-Verbindung in dieser Version.')
  const { data, error } = await supabase.functions.invoke('rapport-signatur', { body })
  if (error) {
    let text = error.message
    try { text = (await error.context.clone().json()).error || text } catch {}
    throw new Error(text)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** Schnappschuss eines Rapports ohne Lohnangaben (für den Polier) */
/** ma: { bild, am } — meine Unterschrift, damit der Polier einen vollständigen Durchschlag bekommt */
export function schnappschuss(g, woche, ma = null) {
  const s = (x) => ({ start: x.start, ende: x.ende, pausen: x.pausen, pauseMin: x.pauseMin, firma: x.firma, notiz: x.notiz, datum: x.datum, wocheKey: x.wocheKey })
  return {
    v: 1, woche, firma: g.firma,
    einst: { name: g.einst.name, buero: g.einst.buero, waehrung: g.einst.waehrung, wochenSoll: g.einst.wochenSoll,
      profil: { strasse: g.einst.profil?.strasse, plz: g.einst.profil?.plz, ort: g.einst.profil?.ort, rav: g.einst.profil?.rav } },
    // nur was der Rapport zeigt — kein Lohn
    einsatz: g.einsatz ? Object.fromEntries(['firma', 'firmaAdresse', 'einsatznummer', 'funktion', 'einsatzort', 'kanton', 'rapportVorlage', 'ueberstundenModus', 'wochenstunden',
      'nachtVon', 'nachtBis', 'nachtZuschlag', 'samstagZuschlag', 'sonntagZuschlag', 'feiertagArbeitZuschlag', 'ueberstundenZuschlag'].map((k) => [k, g.einsatz[k]])) : null,
    schichten: g.schichten.map(s),
    absenzen: g.absenzen.map((a) => ({ datum: a.datum, wocheKey: a.wocheKey, art: a.art, stunden: a.stunden, halbtag: a.halbtag, zeugnis: a.zeugnis, notiz: a.notiz })),
    spesen: g.spesen.map((x) => ({ datum: x.datum, art: x.art, betrag: x.betrag, km: x.km, notiz: x.notiz })),
    ma: ma?.bild ? { bild: ma.bild, am: ma.am || Date.now() } : null,
    // bekannte Unterschriftsberechtigte zur Auswahl — ohne Kontaktdaten (nur ob welche hinterlegt sind)
    unterschreiber: liste(g.einsatz).map((x) => ({ id: x.id, name: x.name, funktion: x.funktion, standard: !!x.standard, hatEmail: !!x.email, hatTel: !!x.tel })),
  }
}

export const signaturAnlegen = (daten) => aufruf({ task: 'anlegen', daten }).then((r) => r.token)
export const signaturLesen = (token) => aufruf({ task: 'lesen', token })
export const signaturAntworten = (token, antwort) => aufruf({ task: 'antworten', token, ...antwort })
export const signaturStatus = (token, abholen) => aufruf({ task: 'status', token, abholen })

export const signaturLink = (token) => `${location.origin}${location.pathname}#/unterschreiben/${token}`
