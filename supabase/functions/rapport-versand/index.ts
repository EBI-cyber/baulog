// Supabase Edge Function: automatischer Versand für die Rapport-App über Microsoft Graph.
// - Anmeldung einmalig per Gerätecode (funktioniert auch in der iPhone-Home-Bildschirm-App)
// - Rapport-PDF in OneDrive hochladen (Ordner werden automatisch angelegt)
// - Rapport per E-Mail vom eigenen Microsoft-Konto ans Temporärbüro senden
// Es wird nichts gespeichert: Das Gerät hält den Refresh-Token und schickt ihn mit;
// die Antwort enthält den erneuerten Token. Client-ID = eigene App-Registrierung (öffentlicher Client).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const out = (o: unknown, code = 200) =>
  new Response(JSON.stringify(o), { status: code, headers: { ...cors, 'Content-Type': 'application/json' } })

const SCOPE = 'offline_access openid profile User.Read Files.ReadWrite Mail.Send'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const login = (tenant: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenant || 'common')}/oauth2/v2.0`

async function form(url: string, daten: Record<string, string>) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(daten) })
  return { ok: res.ok, j: await res.json().catch(() => ({})) }
}

function b64zuBytes(b64: string) {
  const bin = atob(b64.replace(/^data:[^,]+,/, ''))
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

// Ordner-/Dateiname für den Graph-Pfad: Sonderzeichen entschärfen, Segmente einzeln kodieren
const pfad = (...teile: string[]) => teile.join('/').split('/').map((s) => s.trim()).filter(Boolean)
  .map((s) => encodeURIComponent(s.replace(/[\\:*?"<>|#%]/g, '_'))).join('/')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json()
    const clientId = String(b.clientId || Deno.env.get('MS_CLIENT_ID') || '')
    const tenant = String(b.tenant || 'common')
    if (!clientId) return out({ error: 'Microsoft Client-ID fehlt (in den Rapport-Einstellungen eintragen).' }, 400)

    if (b.task === 'start') {
      const { ok, j } = await form(`${login(tenant)}/devicecode`, { client_id: clientId, scope: SCOPE })
      if (!ok) return out({ error: j.error_description || j.error || 'Gerätecode fehlgeschlagen' }, 400)
      return out({ deviceCode: j.device_code, userCode: j.user_code, url: j.verification_uri, intervall: j.interval || 5, ablauf: j.expires_in })
    }

    if (b.task === 'poll') {
      const { ok, j } = await form(`${login(tenant)}/token`, {
        client_id: clientId, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: String(b.deviceCode || ''),
      })
      if (!ok) {
        if (j.error === 'authorization_pending' || j.error === 'slow_down') return out({ wartet: true })
        return out({ error: j.error_description || j.error || 'Anmeldung fehlgeschlagen' }, 400)
      }
      const me = await (await fetch(`${GRAPH}/me`, { headers: { Authorization: `Bearer ${j.access_token}` } })).json().catch(() => ({}))
      return out({ refreshToken: j.refresh_token, konto: me.mail || me.userPrincipalName || '', name: me.displayName || '' })
    }

    if (b.task === 'versand') {
      const { ok, j } = await form(`${login(tenant)}/token`, {
        client_id: clientId, grant_type: 'refresh_token', refresh_token: String(b.refreshToken || ''), scope: SCOPE,
      })
      if (!ok) return out({ error: 'Microsoft-Anmeldung abgelaufen — bitte in den Einstellungen neu verbinden. (' + (j.error || '') + ')', neuVerbinden: true }, 401)
      const auth = { Authorization: `Bearer ${j.access_token}` }
      const ergebnis: Record<string, unknown> = {}

      // 1) OneDrive
      if (b.onedrive && b.datei) {
        const ziel = pfad(b.onedrive.ordner || 'Rapporte', b.datei.name)
        const res = await fetch(`${GRAPH}/me/drive/root:/${ziel}:/content?@microsoft.graph.conflictBehavior=replace`, {
          method: 'PUT', headers: { ...auth, 'Content-Type': b.datei.typ || 'application/pdf' }, body: b64zuBytes(b.datei.base64),
        })
        const r = await res.json().catch(() => ({}))
        ergebnis.onedrive = res.ok ? { ok: true, url: r.webUrl, pfad: decodeURIComponent(ziel) } : { ok: false, fehler: r.error?.message || res.status }
      }

      // 2) E-Mail ans Büro
      if (b.mail && b.datei) {
        const an = String(b.mail.an || '').split(/[,;\s]+/).filter(Boolean)
        const cc = String(b.mail.cc || '').split(/[,;\s]+/).filter(Boolean)
        if (!an.length) ergebnis.mail = { ok: false, fehler: 'Keine E-Mail-Adresse des Büros' }
        else {
          const res = await fetch(`${GRAPH}/me/sendMail`, {
            method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                subject: String(b.mail.betreff || b.datei.name),
                body: { contentType: 'Text', content: String(b.mail.text || '') },
                toRecipients: an.map((address) => ({ emailAddress: { address } })),
                ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
                attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: b.datei.name, contentType: b.datei.typ || 'application/pdf', contentBytes: String(b.datei.base64).replace(/^data:[^,]+,/, '') }],
              },
              saveToSentItems: true,
            }),
          })
          ergebnis.mail = res.ok ? { ok: true, an } : { ok: false, fehler: (await res.json().catch(() => ({}))).error?.message || res.status }
        }
      }
      return out({ ...ergebnis, refreshToken: j.refresh_token || b.refreshToken })
    }

    return out({ error: 'unbekannter task' }, 400)
  } catch (e) {
    return out({ error: String(e) }, 500)
  }
})
