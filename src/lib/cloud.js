import { supabase, isCloudReady } from './supabase'
import {
  pendingProjekte, pendingEintraege, pendingRechnungen, markProjektSynced, markEintragSynced, markRechnungSynced,
  upsertProjekteFromCloud, upsertEintraegeFromCloud, upsertRechnungenFromCloud, projektMap,
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
  created_at: e.createdAt,
})
const eintFromRow = (r) => ({
  token: r.token, projektToken: r.projekt_token, type: r.type, gewerk: r.gewerk, leistung: r.leistung,
  einheit: r.einheit, menge: r.menge, minutes: r.minutes, label: r.label, qty: r.qty, unitCost: r.unit_cost,
  maschine: r.maschine, satz: r.satz, dataUrl: r.data_url, note: r.note, text: r.text,
  startAt: r.start_at, endAt: r.end_at, pausen: r.pausen || null, createdAt: r.created_at, owner: r.owner,
})
const rechToRow = (r) => ({
  token: r.token, projekt_token: r.projektToken, von: r.von || null, bis: r.bis || null,
  betrag: Number(r.betrag) || 0, bezahlt: Boolean(r.bezahlt), bezahlt_am: r.bezahltAm || null, created_at: r.createdAt,
})
const rechFromRow = (r) => ({
  token: r.token, projektToken: r.projekt_token, von: r.von, bis: r.bis,
  betrag: r.betrag, bezahlt: r.bezahlt ? 1 : 0, bezahltAm: r.bezahlt_am, createdAt: r.created_at, owner: r.owner,
})

export async function syncAll() {
  if (!(await hasSession())) return { ok: false }
  const pProj = await pendingProjekte()
  if (pProj.length) {
    const { error } = await supabase.from('bau_projekte').upsert(pProj.map(projToRow), { onConflict: 'token' })
    if (!error) for (const p of pProj) await markProjektSynced(p.token)
  }
  const pEint = await pendingEintraege()
  if (pEint.length) {
    const map = await projektMap()
    const { data: sess } = await supabase.auth.getSession()
    const myId = sess && sess.session ? sess.session.user.id : null
    const rows = pEint.map((e) => { const r = eintToRow(e); r.owner = map[e.projektToken] || myId; return r })
    const { error } = await supabase.from('bau_eintraege').upsert(rows, { onConflict: 'token' })
    if (!error) for (const e of pEint) await markEintragSynced(e.token)
  }
  const { data: projs } = await supabase.from('bau_projekte').select('*')
  if (projs) await upsertProjekteFromCloud(projs.map(projFromRow))
  const { data: eints } = await supabase.from('bau_eintraege').select('*')
  if (eints) await upsertEintraegeFromCloud(eints.map(eintFromRow))

  const pRech = await pendingRechnungen()
  if (pRech.length) {
    const { error } = await supabase.from('bau_rechnungen').upsert(pRech.map(rechToRow), { onConflict: 'token' })
    if (!error) for (const r of pRech) await markRechnungSynced(r.token)
  }
  const { data: rechs } = await supabase.from('bau_rechnungen').select('*')
  if (rechs) await upsertRechnungenFromCloud(rechs.map(rechFromRow))
  return { ok: true }
}
