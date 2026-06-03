import { supabase, isCloudReady } from './supabase'

// Chef: alle Mitglieder eines Projekts (mit zugewiesenen Gewerken)
export async function listMembers(projektToken) {
  if (!isCloudReady) return []
  const { data } = await supabase.from('bau_members').select('member_email, gewerke').eq('projekt_token', projektToken)
  return (data || []).map((r) => ({ email: r.member_email, gewerke: r.gewerke || [] }))
}
export async function addMember(projektToken, email, gewerke = []) {
  if (!isCloudReady) throw new Error('Keine Cloud-Verbindung.')
  const { error } = await supabase.from('bau_members').insert({ projekt_token: projektToken, member_email: email.trim().toLowerCase(), gewerke })
  if (error) throw new Error(error.message)
}
export async function setMemberGewerke(projektToken, email, gewerke) {
  if (!isCloudReady) throw new Error('Keine Cloud-Verbindung.')
  const { error } = await supabase.from('bau_members').update({ gewerke }).eq('projekt_token', projektToken).eq('member_email', email.trim().toLowerCase())
  if (error) throw new Error(error.message)
}
export async function removeMember(projektToken, email) {
  if (!isCloudReady) throw new Error('Keine Cloud-Verbindung.')
  const { error } = await supabase.from('bau_members').delete().eq('projekt_token', projektToken).eq('member_email', email.trim().toLowerCase())
  if (error) throw new Error(error.message)
}

// Mitarbeiter: eigene Gewerk-Zuweisung für ein Projekt (leer = alle erlaubt)
export async function myGewerke(projektToken, email) {
  if (!isCloudReady || !email) return []
  const { data } = await supabase.from('bau_members').select('gewerke').eq('projekt_token', projektToken).eq('member_email', email.trim().toLowerCase()).maybeSingle()
  return (data && data.gewerke) || []
}
