import { supabase, isCloudReady } from './supabase'

function friendly(error) {
  const m = error && error.message ? error.message : String(error)
  if (/relation .*bau_members.* does not exist|bau_members/i.test(m) && /exist/i.test(m)) {
    return 'Team-Funktion noch nicht eingerichtet: Bitte supabase/schema_team.sql im Supabase-SQL-Editor ausführen.'
  }
  if (/column .*gewerke|gewerke/i.test(m) && /exist/i.test(m)) {
    return 'Spalte „gewerke" fehlt: Bitte schema_team.sql erneut komplett ausführen.'
  }
  if (/permission|rls|policy/i.test(m)) return 'Keine Berechtigung — bist du als Projekt-Inhaber angemeldet?'
  return m
}

// Chef: alle Mitglieder eines Projekts (mit zugewiesenen Gewerken)
export async function listMembers(projektToken) {
  if (!isCloudReady) return []
  const { data, error } = await supabase.from('bau_members').select('member_email, gewerke').eq('projekt_token', projektToken)
  if (error) throw new Error(friendly(error))
  return (data || []).map((r) => ({ email: r.member_email, gewerke: r.gewerke || [] }))
}
export async function addMember(projektToken, email, gewerke = []) {
  if (!isCloudReady) throw new Error('Keine Cloud-Verbindung.')
  const { error } = await supabase.from('bau_members').insert({ projekt_token: projektToken, member_email: email.trim().toLowerCase(), gewerke })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error('Diese E-Mail ist diesem Projekt bereits zugewiesen.')
    throw new Error(friendly(error))
  }
}
export async function setMemberGewerke(projektToken, email, gewerke) {
  if (!isCloudReady) throw new Error('Keine Cloud-Verbindung.')
  const { error } = await supabase.from('bau_members').update({ gewerke }).eq('projekt_token', projektToken).eq('member_email', email.trim().toLowerCase())
  if (error) throw new Error(friendly(error))
}
export async function removeMember(projektToken, email) {
  if (!isCloudReady) throw new Error('Keine Cloud-Verbindung.')
  const { error } = await supabase.from('bau_members').delete().eq('projekt_token', projektToken).eq('member_email', email.trim().toLowerCase())
  if (error) throw new Error(friendly(error))
}

// Mitarbeiter: eigene Gewerk-Zuweisung für ein Projekt (leer = alle erlaubt)
export async function myGewerke(projektToken, email) {
  if (!isCloudReady || !email) return []
  const { data } = await supabase.from('bau_members').select('gewerke').eq('projekt_token', projektToken).eq('member_email', email.trim().toLowerCase()).maybeSingle()
  return (data && data.gewerke) || []
}
