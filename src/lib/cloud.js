import { supabase, isCloudReady } from './supabase'
import {
  pendingProjekte, pendingEintraege, pendingRechnungen, pendingLoeschungen, loeschungErledigt, pendingCount,
  markProjektSynced, markEintragSynced, markRechnungSynced,
  mergeProjekteFromCloud, mergeEintraegeFromCloud, mergeRechnungenFromCloud, projektMap, onLocalChange,
} from './db'

async function hasSession() {
  if (!isCloudReady) return false
  const { data } = await supabase.auth.getSession()
  return Boolean(data.session)
}

const projToRow = (p) => ({
  token: p.token, name: p.name, customer: p.customer || '', address: p.address || '',
  hourly_rate: Number(p.hourlyRate) || 0, status: p.status || 'aktiv', created_at: p.createdAt,
})
const projFromRow = (r) => ({
  token: r.token, name: r.name, customer: r.customer, address: r.address,
  hourlyRate: Number(r.hourly_rate) || 0, status: r.status, createdAt: r.created_at, owner: r.owner,
})
const eintToRow = (e) => ({
  token: e.token, projekt_token: e.projektToken, type: e.type, gewerk: e.gewerk || '', leistung: e.leistung || '',
  einheit: e.einheit || '', menge: Number(e.menge) || null, minutes: Number(e.minutes) || null,
  label: e.label || '', qty: Number(e.qty) || null, unit_cost: Number(e.unitCost) || null,
  maschine: e.maschine || '', satz: Number(e.satz) || null, data_url: e.dataUrl || '', note: e.note || '', text: e.text || '',
  start_at: e.startAt || null, end_at: e.endAt || null, pausen: e.pausen && e.pausen.length ? e.pausen : null,
  abschlag_token: e.abschlagToken || null,
  aufteilung: e.aufteilung && e.aufteilung.length ? e.aufteilung : null,
  beleg_roh: e.belegRoh || null,
  created_at: e.createdAt,
})
const eintFromRow = (r) => ({
  token: r.token, projektToken: r.projekt_token, type: r.type, gewerk: r.gewerk, leistung: r.leistung,
  einheit: r.einheit, menge: r.menge, minutes: r.minutes, label: r.label, qty: r.qty, unitCost: r.unit_cost,
  maschine: r.maschine, satz: r.satz, dataUrl: r.data_url, note: r.note, text: r.text,
  startAt: r.start_at, endAt: r.end_at, pausen: r.pausen || null, abschlagToken: r.abschlag_token || null, aufteilung: r.aufteilung || null, belegRoh: r.beleg_roh || null, createdAt: r.created_at, owner: r.owner,
})
const rechToRow = (r) => ({
  token: r.token, projekt_token: r.projektToken, nr: Number(r.nr) || null, von: r.von || null, bis: r.bis || null,
  betrag: Number(r.betrag) || 0, vorheriger_saldo: Number(r.vorherigerSaldo) || 0,
  gesamtbetrag: Number(r.gesamtbetrag) || Number(r.betrag) || 0, bezahlter_betrag: Number(r.bezahlterBetrag) || 0,
  saldo: Number(r.saldo) || 0, bezahlt: Boolean(r.bezahlt), bezahlt_am: r.bezahltAm || null, created_at: r.createdAt,
})
const rechFromRow = (r) => ({
  token: r.token, projektToken: r.projekt_token, nr: r.nr, von: r.von, bis: r.bis,
  betrag: r.betrag, vorherigerSaldo: r.vorheriger_saldo, gesamtbetrag: r.gesamtbetrag,
  bezahlterBetrag: r.bezahlter_betrag, saldo: r.saldo,
  bezahlt: r.bezahlt ? 1 : 0, bezahltAm: r.bezahlt_am, createdAt: r.created_at, owner: r.owner,
})

// ---------------------------------------------------------------------------
// Sync-Status für die Anzeige (SyncBadge) — state: 'ok' | 'laeuft' | 'wartet' | 'fehler' | 'offline' | 'aus'
// ---------------------------------------------------------------------------
let status = { state: 'aus', pending: 0, fehler: [], zuletzt: null }
const statusListeners = new Set()
function setStatus(patch) { status = { ...status, ...patch }; statusListeners.forEach((fn) => fn(status)) }
export function getSyncStatus() { return status }
export function onSyncStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn) }

// Screens hören hierauf und laden neu, wenn der Sync Daten aus der Cloud geändert hat
export const SYNC_EVENT = 'baulog:cloud-daten'

const errText = (error) => (error && (error.message || error.details || error.hint || error.code)) || 'Unbekannter Fehler'

// Erst alles in einem Paket versuchen; schlägt das fehl, einzeln — damit ein fehlerhafter
// Datensatz nicht alle anderen blockiert. Gibt die Fehlermeldungen zurück.
async function pushRows(table, items, toRow, markSynced, label) {
  if (!items.length) return []
  const rows = items.map(toRow)
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'token' })
  if (!error) { for (const it of items) await markSynced(it); return [] }
  const fehler = []
  for (let i = 0; i < items.length; i++) {
    const { error: e1 } = await supabase.from(table).upsert([rows[i]], { onConflict: 'token' })
    if (e1) fehler.push(label + ': ' + errText(e1))
    else await markSynced(items[i])
  }
  return fehler
}

const LOESCH_TABELLE = { projekte: 'bau_projekte', eintraege: 'bau_eintraege', rechnungen: 'bau_rechnungen' }
async function pushLoeschungen() {
  const fehler = []
  for (const g of await pendingLoeschungen()) {
    const table = LOESCH_TABELLE[g.tabelle]
    if (!table) { await loeschungErledigt(g.tabelle, g.token); continue }
    const { error } = await supabase.from(table).delete().eq('token', g.token)
    if (error) fehler.push('Löschen: ' + errText(error))
    else await loeschungErledigt(g.tabelle, g.token)
  }
  return fehler
}

// Alle Zeilen holen (Supabase liefert pro Anfrage höchstens 1000)
async function fetchAll(table) {
  const all = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').order('token').range(from, from + PAGE - 1)
    if (error) return { error }
    all.push(...data)
    if (data.length < PAGE) return { data: all }
  }
}

async function runSync() {
  const fehler = []
  // 1) Lokale Änderungen hochladen
  fehler.push(...await pushRows('bau_projekte', await pendingProjekte(), projToRow, markProjektSynced, 'Projekt'))
  const pEint = await pendingEintraege()
  if (pEint.length) {
    const map = await projektMap()
    const { data: sess } = await supabase.auth.getSession()
    const myId = sess && sess.session ? sess.session.user.id : null
    const toRow = (e) => { const r = eintToRow(e); r.owner = map[e.projektToken] || myId; return r }
    fehler.push(...await pushRows('bau_eintraege', pEint, toRow, markEintragSynced, 'Eintrag'))
  }
  fehler.push(...await pushRows('bau_rechnungen', await pendingRechnungen(), rechToRow, markRechnungSynced, 'Abrechnung'))
  fehler.push(...await pushLoeschungen())

  // 2) Cloud-Stand holen. Nur eine vollständig geladene Tabelle wird abgeglichen.
  let geaendert = false
  const projs = await fetchAll('bau_projekte')
  if (projs.error) fehler.push('Projekte laden: ' + errText(projs.error))
  else if (await mergeProjekteFromCloud(projs.data.map(projFromRow))) geaendert = true
  const eints = await fetchAll('bau_eintraege')
  if (eints.error) fehler.push('Einträge laden: ' + errText(eints.error))
  else if (await mergeEintraegeFromCloud(eints.data.map(eintFromRow))) geaendert = true
  const rechs = await fetchAll('bau_rechnungen')
  if (rechs.error) fehler.push('Abrechnungen laden: ' + errText(rechs.error))
  else if (await mergeRechnungenFromCloud(rechs.data.map(rechFromRow))) geaendert = true

  if (geaendert && typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT))
  return { fehler: [...new Set(fehler)], geaendert }
}

let running = null
let again = false
export async function syncAll() {
  if (!(await hasSession())) { setStatus({ state: 'aus' }); return { ok: false } }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline', pending: await pendingCount() }); return { ok: false }
  }
  if (running) { again = true; return running }
  running = (async () => {
    let res
    do {
      again = false
      setStatus({ state: 'laeuft' })
      try { res = await runSync() } catch (e) { res = { fehler: [errText(e)] } }
    } while (again)
    const pending = await pendingCount()
    setStatus({ state: res.fehler.length ? 'fehler' : pending ? 'wartet' : 'ok', pending, fehler: res.fehler, zuletzt: new Date() })
    return { ok: !res.fehler.length, fehler: res.fehler }
  })()
  try { return await running } finally { running = null }
}

// ---------------------------------------------------------------------------
// Automatischer Sync: kurz nach jeder Änderung, beim Zurückkehren in die App,
// sobald wieder Netz da ist und jede Minute, solange die App offen ist.
// ---------------------------------------------------------------------------
export function startAutoSync() {
  let timer = null
  const soon = (ms = 1500) => { clearTimeout(timer); timer = setTimeout(() => { syncAll().catch(() => {}) }, ms) }
  const offChange = onLocalChange(() => {
    pendingCount().then((n) => setStatus({ pending: n, state: status.state === 'fehler' ? 'fehler' : 'wartet' }))
    soon()
  })
  const onVisible = () => { if (document.visibilityState === 'visible') soon(300) }
  const onOnline = () => soon(300)
  const onOffline = () => setStatus({ state: 'offline' })
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  const iv = setInterval(() => { if (document.visibilityState === 'visible') soon(0) }, 60000)
  return () => {
    clearTimeout(timer); clearInterval(iv); offChange()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}
