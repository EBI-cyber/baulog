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
