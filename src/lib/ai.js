// Formt aus diktierten Stichpunkten eine professionelle Leistungsbeschreibung (VOB/DIN-Stil).
// Nutzt OpenAI direkt (Key liegt nur lokal auf dem Gerät). Für Team-Einsatz später besser via Edge Function.
export async function dinText(transcript, key) {
  if (!key) throw new Error('Kein OpenAI-Key hinterlegt — in Einstellungen → KI-Texte eintragen.')
  if (!transcript || !transcript.trim()) throw new Error('Erst etwas diktieren oder tippen.')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'Du bist Bauleiter im Sanierungsbau. Forme aus den (ggf. unsortierten, gesprochenen) Notizen eine ' +
            'professionelle, sachliche Leistungsbeschreibung für Bautagebuch/Leistungsnachweis im VOB/DIN-Stil. ' +
            'Verwende korrekte deutsche Fachbegriffe und Einheiten (m, m², Stk), nenne das Gewerk, halte dich knapp ' +
            'und präzise. Gib NUR den fertigen Text aus, ohne Einleitung oder Anführungszeichen.',
        },
        { role: 'user', content: transcript },
      ],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error('OpenAI-Fehler ' + res.status + ': ' + t.slice(0, 140))
  }
  const j = await res.json()
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim()
}

async function chatJSON(key, system, user) {
  if (!key) throw new Error('Kein OpenAI-Key — Einstellungen → KI-Texte.')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error('OpenAI-Fehler ' + res.status + ': ' + (await res.text()).slice(0, 140))
  const j = await res.json()
  try { return JSON.parse(j.choices[0].message.content) } catch { return {} }
}

// Sprachbeschreibung -> Gewerk + Leistung aus Katalog
export async function parseSetup(transcript, gewerke, katalog, key) {
  const cat = katalog.map((l) => `${l.gewerk} > ${l.name} (${l.einheit})`).join('\n')
  const system = 'Ordne eine gesprochene Tätigkeit einem Gewerk und einer Leistung aus dem Katalog zu. ' +
    'Antworte NUR als JSON: {"gewerk":"...","leistung":"...","beschreibung":"..."}. ' +
    'gewerk EXAKT aus der Gewerke-Liste; leistung EXAKT aus dem Katalog des Gewerks (sonst leer). beschreibung = kurze saubere Formulierung der Tätigkeit.'
  const user = `Gewerke: ${gewerke.join(', ')}\nKatalog:\n${cat}\n\nGesprochen: "${transcript}"`
  return chatJSON(key, system, user)
}

// Abschluss-Sprachnotiz -> Menge, Material, Maschinen
export async function parseAbschluss(transcript, ctx, key) {
  const maschListe = (ctx.maschinen || []).map((m) => m.name).join(', ')
  const system = 'Extrahiere aus einer gesprochenen Abschluss-Notiz die ausgeführte Menge, das verbrauchte Material und die benutzten Maschinen/Werkzeuge. ' +
    'Antworte NUR als JSON: {"menge":number|null,"einheit":"string","materials":[{"label":"string","qty":number,"unitCost":number}],"maschinen":[{"name":"string","minutes":number}],"beschreibung":"string"}. ' +
    'maschinen.name möglichst aus dieser Liste: [' + maschListe + ']. ' +
    'Wenn Maschinendauer nicht genannt: minutes = ' + (ctx.workMinutes || 0) + '. unitCost (EK €) nur wenn genannt, sonst 0. einheit bevorzugt "' + (ctx.einheit || '') + '".'
  const user = `Kontext: Gewerk ${ctx.gewerk}, Leistung ${ctx.leistung}, Einheit ${ctx.einheit}.\nGesprochen: "${transcript}"`
  return chatJSON(key, system, user)
}

