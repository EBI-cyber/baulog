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
    } else if (task === 'korrektur') {
      messages = [
        { role: 'system', content: 'Du bist Bauleiter im Sanierungsbau und überarbeitest einen deutschen Bautagebuch-/Leistungsnachweis-Text redaktionell. Korrigiere nicht nur Rechtschreibung und Grammatik, sondern verbessere auch Satzbau und Wortwahl spürbar, sodass der Text flüssig, klar und professionell klingt — wie von einem erfahrenen Bauleiter formuliert. Inhalt, genannte Fakten (Mengen, Maße, Material, Reihenfolge der Arbeiten) bleiben exakt erhalten, nichts erfinden oder weglassen, aber die Formulierung darf merklich überarbeitet werden. Gib NUR den überarbeiteten Text aus, ohne Einleitung, Erklärung oder Anführungszeichen.' },
        { role: 'user', content: String(body.transcript || '') },
      ]
    } else if (task === 'nachtrag') {
      jsonMode = true
      const heute = new Date().toISOString().slice(0, 10)
      messages = [
        { role: 'system', content: 'Du liest handschriftliche/diktierte Arbeitszeit-Notizen eines Bauleiters (oft mehrere Tage, je Tag ein oder mehrere Zeiträume und ein oder mehrere Beschreibungs-Absätze) und strukturierst sie. ' +
          'Antworte NUR als JSON: {"tage":[{"datum":"YYYY-MM-DD","zeiten":[{"von":"HH:MM","bis":"HH:MM"}],"notizen":["..."]}]}. ' +
          'Ein Tag-Objekt pro erkanntem Datum. "zeiten": jeder im Text genannte Zeitraum dieses Tages als eigener Eintrag, Uhrzeiten im 24h-Format HH:MM. "notizen": jeder Beschreibungs-Absatz dieses Tages als eigener String, Inhalt wortgetreu/sinngemäß übernehmen, nicht erfinden, nicht zusammenfassen, nur offensichtliche Tippfehler bereinigen. ' +
          'Deutsche Datumsformate (z.B. "24.08.2026", "24.08.", "24.8.") in YYYY-MM-DD umwandeln; fehlt das Jahr, aktuelles Jahr annehmen (heute ist ' + heute + '). Kein Fließtext, keine Erklärung — nur das JSON-Objekt.' },
        { role: 'user', content: String(body.transcript || '') },
      ]
    } else if (task === 'setup') {
      jsonMode = true
      const cat = (body.katalog || []).map((l) => `${l.gewerk} > ${l.name} (${l.einheit})`).join('\n')
      messages = [
        { role: 'system', content: 'Ordne eine gesprochene Tätigkeit einem Gewerk und einer Leistung aus dem Katalog zu. Antworte NUR als JSON: {"gewerk":"...","leistung":"...","beschreibung":"..."}. gewerk EXAKT aus der Gewerke-Liste; leistung EXAKT aus dem Katalog des Gewerks (sonst leer).' },
        { role: 'user', content: `Gewerke: ${(body.gewerke || []).join(', ')}\nKatalog:\n${cat}\n\nGesprochen: "${body.transcript || ''}"` },
      ]
    } else if (task === 'leistungen') {
      jsonMode = true
      const cat = (body.katalog || []).map((l) => `${l.gewerk} > ${l.name}`).join('\n')
      const tage = (body.tage || []).map((t) => 'Tag ' + t.datum + '\nBautagebuch: ' + (t.text || '(kein Text)') + '\nZeiteinträge: ' +
        (t.zeiten || []).map((z) => 'id=' + z.id + ' ' + (z.von ? z.von + '–' + z.bis + ' Uhr ' : '') + z.stunden + ' h').join('; ')).join('\n\n')
      messages = [
        { role: 'system', content: 'Du bist Bauleiter im Sanierungsbau und erstellst den Leistungsteil eines Nachweises für den Kunden. Für jeden Arbeitstag bekommst du den Bautagebuch-Text und die Zeiteinträge. ' +
          'Aufgabe: die im Text TATSÄCHLICH genannten Tätigkeiten erkennen und die Stunden JEDES Zeiteintrags darauf verteilen (realistische Schätzung nach Umfang; Summe je Eintrag = seine Stunden; Stunden auf 0,25 h gerundet). ' +
          'Strenge Regeln: Nur Tätigkeiten, die im Text stehen – nichts ergänzen oder ableiten (z. B. „Badewanne ausgebaut“ ist Rückbau, nicht „Badewanne setzen“; „Leitungen angeschlossen für WC“ ist Leitungsanschluss, nicht „WC montieren“). Jede genannte Tätigkeitsgruppe soll vorkommen, auch Stemm-, Schlitz-, Putz- und Rückbauarbeiten. Ähnliche Tätigkeiten eines Tages zusammenfassen, höchstens 5 Leistungen je Zeiteintrag. ' +
          'gewerk EXAKT aus der Gewerke-Liste. leistung: kurze fachliche Bezeichnung (2–5 Wörter, ohne Einheit, ohne Klammern), nah am Text formuliert. Eine Katalogbezeichnung nur verwenden, wenn sie genau dieselbe Tätigkeit meint. Gleiche Tätigkeit an verschiedenen Tagen gleich benennen. ' +
          'Bei mehreren Zeiteinträgen eines Tages die Tätigkeiten sinnvoll auf die Abschnitte verteilen. Ohne Text: leistungen leer lassen. ' +
          'Antworte NUR als JSON: {"eintraege":[{"id":"...","leistungen":[{"gewerk":"...","leistung":"...","stunden":number}]}]}' },
        { role: 'user', content: `Gewerke: ${(body.gewerke || []).join(', ')}\nKatalog (nur als Orientierung):\n${cat}\n\n${tage}` },
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

    const model = task === 'korrektur' || task === 'leistungen' ? 'gpt-4o' : 'gpt-4o-mini'
    const payload = { model, temperature: task === 'din' ? 0.3 : task === 'korrektur' ? 0.4 : 0.2, messages }
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
