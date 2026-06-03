// Supabase Edge Function: KI-Texte für BauLog (DIN-Text, Setup, Abschluss).
// Der OpenAI-Key liegt NUR hier als Secret (OPENAI_KEY) — nie im Client/auf den Geräten.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const OPENAI = 'https://api.openai.com/v1/chat/completions'

function out(o, code = 200) {
  return new Response(JSON.stringify(o), { status: code, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const key = Deno.env.get('OPENAI_KEY')
    if (!key) return out({ error: 'OPENAI_KEY Secret fehlt (in Supabase setzen).' }, 500)
    const body = await req.json()
    const task = body.task
    let messages
    let jsonMode = false

    if (task === 'din') {
      messages = [
        { role: 'system', content: 'Du bist Bauleiter im Sanierungsbau. Forme aus gesprochenen Notizen eine professionelle, sachliche Leistungsbeschreibung für Bautagebuch/Leistungsnachweis im VOB/DIN-Stil. Korrekte deutsche Fachbegriffe und Einheiten (m, m², Stk), Gewerk nennen, knapp und präzise. Gib NUR den fertigen Text aus, ohne Einleitung oder Anführungszeichen.' },
        { role: 'user', content: String(body.transcript || '') },
      ]
    } else if (task === 'setup') {
      jsonMode = true
      const cat = (body.katalog || []).map((l) => `${l.gewerk} > ${l.name} (${l.einheit})`).join('\n')
      messages = [
        { role: 'system', content: 'Ordne eine gesprochene Tätigkeit einem Gewerk und einer Leistung aus dem Katalog zu. Antworte NUR als JSON: {"gewerk":"...","leistung":"...","beschreibung":"..."}. gewerk EXAKT aus der Gewerke-Liste; leistung EXAKT aus dem Katalog des Gewerks (sonst leer).' },
        { role: 'user', content: `Gewerke: ${(body.gewerke || []).join(', ')}\nKatalog:\n${cat}\n\nGesprochen: "${body.transcript || ''}"` },
      ]
    } else if (task === 'abschluss') {
      jsonMode = true
      const ctx = body.ctx || {}
      const masch = (ctx.maschinen || []).map((m) => m.name).join(', ')
      const sys = 'Extrahiere aus einer gesprochenen Abschluss-Notiz die ausgeführte Menge, das verbrauchte Material und die benutzten Maschinen/Werkzeuge. ' +
        'Antworte NUR als JSON: {"menge":number|null,"einheit":"string","materials":[{"label":"string","qty":number,"unitCost":number}],"maschinen":[{"name":"string","minutes":number}],"beschreibung":"string"}. ' +
        'maschinen.name möglichst aus: [' + masch + ']. Wenn Maschinendauer nicht genannt: minutes = ' + (ctx.workMinutes || 0) + '. unitCost (EK €) nur wenn genannt, sonst 0. einheit bevorzugt "' + (ctx.einheit || '') + '".'
      messages = [
        { role: 'system', content: sys },
        { role: 'user', content: `Kontext: Gewerk ${ctx.gewerk}, Leistung ${ctx.leistung}, Einheit ${ctx.einheit}.\nGesprochen: "${body.transcript || ''}"` },
      ]
    } else {
      return out({ error: 'unbekannter task' }, 400)
    }

    const payload = { model: 'gpt-4o-mini', temperature: task === 'din' ? 0.3 : 0.2, messages }
    if (jsonMode) payload.response_format = { type: 'json_object' }

    const res = await fetch(OPENAI, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(payload) })
    if (!res.ok) return out({ error: 'OpenAI ' + res.status + ': ' + (await res.text()).slice(0, 200) }, 500)
    const j = await res.json()
    const content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''
    if (jsonMode) { try { return out(JSON.parse(content)) } catch { return out({}) } }
    return out({ text: String(content).trim() })
  } catch (e) {
    return out({ error: String(e) }, 500)
  }
})
