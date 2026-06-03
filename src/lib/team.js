import { supabase, isCloudReady } from './supabase'

export async function listMembers(projektToken) {
  if (!isCloudReady) return []
  const { data } = await supabase.from('bau_members').select('member_email').eq('projekt_token', projektToken)
  return (data || []).map((r) => r.member_email)
}
export async function addMember(projektToken, email) {
  if (!isCloudReady) throw new Error('Keine Cloud-Verbindung.')
  const { error } = await supabase.from('bau_members').insert({ projekt_token: projektToken, member_email: email.trim().toLowerCase() })
  if (error) throw new Error(error.message)
}
export async function removeMember(projektToken, email) {
  if (!isCloudReady) throw new Error('Keine Cloud-Verbindung.')
  const { error } = await supabase.from('bau_members').delete().eq('projekt_token', projektToken).eq('member_email', email.trim().toLowerCase())
  if (error) throw new Error(error.message)
}
