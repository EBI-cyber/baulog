import { supabase, isCloudReady } from './supabase'
import {
  pendingProjekte, pendingEintraege, markProjektSynced, markEintragSynced,
  upsertProjekteFromCloud, upsertEintraegeFromCloud,
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
  created_at: e.createdAt,
})
const eintFromRow = (r) => ({
  token: r.token, projektToken: r.projekt_token, type: r.type, gewerk: r.gewerk, leistung: r.leistung,
  einheit: r.einheit, menge: r.menge, minutes: r.minutes, label: r.label, qty: r.qty, unitCost: r.unit_cost,
  maschine: r.maschine, satz: r.satz, dataUrl: r.data_url, note: r.note, text: r.text, createdAt: r.created_at, owner: r.owner,
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
    const { error } = await supabase.from('bau_eintraege').upsert(pEint.map(eintToRow), { onConflict: 'token' })
    if (!error) for (const e of pEint) await markEintragSynced(e.token)
  }
  const { data: projs } = await supabase.from('bau_projekte').select('*')
  if (projs) await upsertProjekteFromCloud(projs.map(projFromRow))
  const { data: eints } = await supabase.from('bau_eintraege').select('*')
  if (eints) await upsertEintraegeFromCloud(eints.map(eintFromRow))
  return { ok: true }
}
