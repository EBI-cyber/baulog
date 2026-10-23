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
        { role: 'system', content: 'Du bist Bauleiter im Sanierungsbau und überarbeitest einen deutschen Bautagebuch-/Leistungsnachweis-Text redaktionell. Korrigiere nicht nur Rechtschreibung und Grammatik, sondern verbessere auch Satzbau und Wortwahl spürbar, sodass der Text flüssig, klar und professionell klingt — wie von einem erfahrenen Bauleiter formuliert. Inhalt, genannte Fakten (Mengen, Maße, Material, Reihenfolge der Arbeiten) bleiben exakt erhalten, nichts erfinden oder weglassen, aber die Formulierung darf merklich überarbeitet werden. Fachbegriffe richtig schreiben (z. B. Stemmbohrer, Stemmarbeiten, Regendusche, Unterputz, Vorwandinstallation); Produkt- und Markennamen nie austauschen oder vereinheitlichen (Easybox bleibt Easybox, I-Box bleibt I-Box), nur Schreibweise glätten; offensichtliche Diktierfehler sinngemäß korrigieren (z. B. „Regen Duschleitung“ = Leitung der Regendusche, „stemmen Arbeiten“ = Stemmarbeiten). Sachlich im Perfekt oder Präteritum, kurze klare Sätze. Gib NUR den überarbeiteten Text aus, ohne Einleitung, Erklärung oder Anführungszeichen.' },
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
      const tage = (body.tage || []).map((t) => 'Tag ' + t.datum + '\nBautagebuch: ' + (t.text || '(kein Text)') + '\nZeiteinträge: ' +
        (t.zeiten || []).map((z) => 'id=' + z.id + ' ' + (z.von ? z.von + '–' + z.bis + ' Uhr ' : '') + z.stunden + ' h').join('; ')).join('\n\n')
      messages = [
        { role: 'system', content: 'Du bist Bauleiter im Sanierungsbau und erstellst den Leistungsteil eines Nachweises für den Kunden. Für jeden Arbeitstag bekommst du den Bautagebuch-Text und die Zeiteinträge. ' +
          'Aufgabe: die im Text TATSÄCHLICH genannten Tätigkeiten erkennen und die Stunden JEDES Zeiteintrags darauf verteilen (realistische Schätzung nach Umfang; Summe je Eintrag = seine Stunden; Stunden auf 0,25 h gerundet). ' +
          'Strenge Regeln: Nur Tätigkeiten, die im Text stehen – nichts ergänzen oder ableiten (z. B. „Badewanne ausgebaut“ ist Rückbau, nicht „Badewanne setzen“; „Leitungen angeschlossen für WC“ ist Leitungsanschluss, nicht „WC montieren“). Jede genannte Tätigkeitsgruppe soll vorkommen, auch Stemm-, Schlitz-, Putz- und Rückbauarbeiten. Ähnliche Tätigkeiten eines Tages zusammenfassen, höchstens 6 Leistungen je Zeiteintrag. Nebenleistungen wie Aufmaß, Aufräumen, Besprechung knapp bemessen (meist 0,25–0,5 h), die Hauptarbeiten bekommen die meiste Zeit. ' +
          'gewerk EXAKT aus der Gewerke-Liste. leistung: Leistungsposition wie in einem Angebot – Substantiv oder Infinitiv, 2–5 Wörter, ohne Zeitform, ohne Einheit, ohne Klammern (z. B. „Stemmarbeiten“, „Gefälleestrich einbauen“, „Wasserleitungen verlegen“, „Wasserverteiler installieren“, „Badewanne ausbauen“, „Fliesen abschlagen“), nie „… vorgenommen/durchgeführt/eingebaut“. Dieselbe Tätigkeit an allen Tagen exakt gleich benennen und demselben Gewerk zuordnen (Stemm- und Schlitzarbeiten für Leitungen gehören zu Sanitär). ' +
          'Typische Zuordnungen: Schlitze/Stemmstellen wieder verputzen, verschließen oder egalisieren = „Schlitze verschließen“ (Sanitär), nicht Trockenbau/Spachteln/Maler; Putzarbeiten oder „Flächen egalisiert“ an einem Tag mit Stemm- oder Schlitzarbeiten sind ebenfalls „Schlitze verschließen“ (Sanitär). Aufmaß = „Aufmaß erstellen“ (Sonstiges). Keine Sammelpositionen wie „Stundenlohnarbeiten“. ' +
          'Bei mehreren Zeiteinträgen eines Tages die Tätigkeiten sinnvoll auf die Abschnitte verteilen. Ohne Text: leistungen leer lassen. ' +
          'Antworte NUR als JSON: {"eintraege":[{"id":"...","leistungen":[{"gewerk":"...","leistung":"...","stunden":number}]}]}' },
        { role: 'user', content: `Gewerke: ${(body.gewerke || []).join(', ')}\n\n${tage}` },
      ]
    } else if (task === 'beleg') {
      jsonMode = true
      messages = [
        { role: 'system', content: 'Du liest Fotos von Einkaufsbelegen (Rechnung, Kassenbon, Lieferschein) für einen Handwerksbetrieb. ' +
          'Bestimme (1) die vier Ecken des Papiers im Foto so genau wie möglich (auf 0,01) als Anteile der Bildbreite/-höhe (0 bis 1), Reihenfolge oben-links, oben-rechts, unten-rechts, unten-links in Bildkoordinaten (oben = kleines y). Die Ecken liegen exakt am Papierrand, nicht am Text; ist ein Rand abgeschnitten, nimm den Bildrand; ' +
          '(2) lieferant (Firmenname), datum (Belegdatum YYYY-MM-DD; die Jahreszahl Ziffer für Ziffer lesen, heute ist ' + new Date().toISOString().slice(0, 10) + ', Belege sind meist aus diesem oder dem Vorjahr), betrag (Gesamtbetrag brutto in Euro als Zahl), mwst (enthaltene MwSt. in Euro oder null), beschreibung (2–6 Wörter, was gekauft wurde); ' +
          '(3) positionen: jede Artikelzeile mit bezeichnung (kurz und verständlich, Fachbegriff, z. B. „Trinkwasserverteiler 5-fach DN 20“, ohne Artikelnummern), menge (Zahl), gesamt (Zeilenbetrag BRUTTO in Euro; sind die Preise netto angegeben, die MwSt. anteilig aufschlagen), gewerk (EXAKT aus der Liste: ' + (body.gewerke || []).join(', ') + '). Versand, Pfand o. Ä. ebenfalls als Position. Die Summe der Positionen soll dem Gesamtbetrag entsprechen. ' +
          'Privatverdacht: Der Betrieb rechnet Material für die Baustelle „' + String(body.projekt || '') + '“ beim Kunden ab. Markiere Positionen, die offensichtlich nicht dazu gehören, sondern privat sein könnten (z. B. Pool-, Garten-, Haushalts-, Lebensmittel-, Freizeit-, Deko-, Auto-, Tierbedarf oder Werkzeug zur dauerhaften eigenen Nutzung), mit privat: true und einem kurzen grund. Im Zweifel bei baustellentypischem Material nicht markieren. ' +
          'Verschleiß: Markiere Werkzeuge und Verschleißteile, die nicht im Bauwerk verbleiben, sondern über mehrere Baustellen genutzt werden (z. B. Meißel, Bohrer, Bits, Trennscheiben, Sägeblätter, Schleifscheiben, Spachtel, Kellen, Pinsel, Rollen, Kartuschenpistole), mit verschleiss: true und kurzem grund. Verbrauchsmaterial, das im Bauwerk bleibt (Rohre, Fittings, Kleber, Silikon, Dübel, Schrauben), ist kein Verschleiß. ' +
          'Unlesbares als null. Antworte NUR als JSON: {"ecken":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1},{"x":0,"y":1}],"lieferant":"","datum":"","betrag":0,"mwst":null,"beschreibung":"","gewerk":"","positionen":[{"bezeichnung":"","menge":1,"gesamt":0,"gewerk":"","privat":false,"verschleiss":false,"grund":""}]}' },
        // langer Beleg: mehrere überlappende Stücke von oben nach unten
        Array.isArray(body.bilder) && (body.bilder.length > 1 || body.uebersicht)
          ? { role: 'user', content: [
            ...(body.uebersicht ? [
              { type: 'text', text: 'Übersichtsfoto des ganzen Belegs (unscharf, nur zur Orientierung: Aufbau, Reihenfolge, wo die Summe steht):' },
              { type: 'image_url', image_url: { url: String(body.uebersicht), detail: 'high' } },
            ] : []),
            { type: 'text', text: 'Beleg auswerten. Es ist EIN langer Beleg, aufgeteilt in ' + body.bilder.length + ' scharfe Detailbilder von oben nach unten' + (body.uebersicht ? ' – alle Zahlen und Texte aus diesen Detailbildern lesen, nicht aus dem Übersichtsfoto' : '') + '. Aufeinanderfolgende Bilder überlappen sich: Zeilen, die am unteren Rand eines Bildes und am oberen Rand des nächsten stehen, sind dieselbe Zeile und dürfen nur EINMAL als Position vorkommen. Ecken: gib für das Gesamtbild einfach 0/0, 1/0, 1/1, 0/1 an.' },
            ...body.bilder.slice(0, 10).map((u: unknown) => ({ type: 'image_url', image_url: { url: String(u || ''), detail: 'high' } })),
          ] }
          : { role: 'user', content: [{ type: 'text', text: 'Beleg auswerten.' }, { type: 'image_url', image_url: { url: String(body.bild || ''), detail: 'high' } }] },
      ]
    } else if (task === 'finden') {
      // Position auf einem Belegbild finden: Die Textzeilen sind links rot nummeriert, die KI nennt die Nummern
      jsonMode = true
      messages = [
        { role: 'system', content: 'Du bekommst das Bild eines Einkaufsbelegs, dessen Textzeilen am linken Rand rot nummeriert sind, und den Text einer Artikelposition. Nenne die Nummer(n) der Zeile(n), die zu dieser Position gehören (Artikelbezeichnung, ggf. Folgezeile, Menge und Betrag). Antworte NUR als JSON: {"zeilen":[3]} – nicht gefunden: {"zeilen":[]}' },
        { role: 'user', content: [{ type: 'text', text: 'Position: ' + String(body.text || '') }, { type: 'image_url', image_url: { url: String(body.bild || ''), detail: 'high' } }] },
      ]
    } else if (task === 'privat') {
      // bereits erfasste Materialpositionen auf mögliche Privatkäufe prüfen
      jsonMode = true
      const liste = (body.positionen || []).map((p) => 'id=' + p.id + ': ' + p.text + ' (' + p.betrag + ' €)').join('\n')
      messages = [
        { role: 'system', content: 'Ein Handwerksbetrieb rechnet Material für die Baustelle „' + String(body.projekt || '') + '“ beim Kunden ab. Prüfe die Positionen und nenne nur die, die offensichtlich nicht zu dieser Baustelle gehören, sondern privat sein könnten (z. B. Pool-, Garten-, Haushalts-, Lebensmittel-, Freizeit-, Deko-, Auto-, Tierbedarf oder Werkzeug zur dauerhaften eigenen Nutzung). Nenne außerdem Werkzeuge und Verschleißteile, die nicht im Bauwerk verbleiben, sondern über mehrere Baustellen genutzt werden (z. B. Meißel, Bohrer, Bits, Trennscheiben, Sägeblätter, Schleifscheiben, Kellen, Pinsel), mit art „verschleiss“; Verbrauchsmaterial wie Rohre, Kleber, Silikon, Schrauben nicht. Baustellentypisches Material nicht nennen. Antworte NUR als JSON: {"verdacht":[{"id":"...","art":"privat|verschleiss","grund":"kurz"}]}' },
        { role: 'user', content: liste },
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

    const model = ['korrektur', 'leistungen', 'beleg', 'privat', 'finden'].includes(task) ? 'gpt-4o' : 'gpt-4o-mini'
    const temperature = task === 'din' ? 0.3 : task === 'korrektur' ? 0.4 : task === 'leistungen' ? 0 : 0.2
    const ask = async (msgs, temp) => {
      const payload = { model, temperature: temp, messages: msgs }
      if (jsonMode) payload.response_format = { type: 'json_object' }
      const res = await fetch(OPENAI, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('OpenAI ' + res.status + ': ' + (await res.text()).slice(0, 200))
      const j = await res.json()
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || ''
    }
    let content = await ask(messages, temperature)

    // Selbstprüfung: ein zweiter Durchgang findet und korrigiert Fehler des ersten
    if (task === 'korrektur' && content.trim()) {
      content = await ask([
        { role: 'system', content: 'Du bist Prüfer für Bautagebuch-Texte im Sanierungsbau. Vergleiche Original und Überarbeitung und gib die korrigierte, endgültige Fassung aus. Prüfe: (1) Keine Bedeutung verändert, nichts hinzugefügt oder weggelassen; Mengen, Maße, Material, Produkt- und Markennamen exakt wie im Original. ' +
          '(2) Diktier- und Tippfehler mit dem ähnlichst geschriebenen Baufachwort aufgelöst, nicht mit einem anderen Verb geraten (z. B. „ausgeemmt“ → „ausgestemmt“, „Stembohrer“ → „Stemmbohrer“, „Regen Duschleitung“ → „Leitung der Regendusche“). (3) Rechtschreibung, Grammatik, Zeichensetzung. (4) Sachlicher, professioneller Stil, keine Wiederholungen wie „Anschließend … Abschließend“. Gib NUR den finalen Text aus.' },
        { role: 'user', content: 'Original:\n' + String(body.transcript || '') + '\n\nÜberarbeitung:\n' + content },
      ], 0)
    }
    if (task === 'leistungen' && content.trim()) {
      content = await ask([
        ...messages,
        { role: 'assistant', content },
        { role: 'user', content: 'Prüfe deine Antwort Zeile für Zeile und korrigiere alle Fehler: (1) Steht die Tätigkeit wirklich im Text des Tages? Sonst entfernen. Fehlt eine genannte Tätigkeit? Ergänzen. ' +
          '(2) Gewerk fachlich richtig: Rückbau, Ausbau, Abschlagen, Demontage, Entsorgung → Abbruch/Entsorgung (auch Fliesen abschlagen, Badewanne ausbauen); Schlitze oder Stemmstellen verputzen, verschließen, egalisieren sowie Putzarbeiten/Flächen egalisieren an Tagen mit Stemmarbeiten → Sanitär „Schlitze verschließen“ (nicht Maler/Putz/Trockenbau); Stemmarbeiten, die im Text stehen, müssen als „Stemmarbeiten“ (Sanitär) vorkommen; Nebenleistungen wie Aufmaß höchstens 0,5 h; Leitungen, Armaturen, Wasserverteiler, Installationsboxen, Stemm- und Schlitzarbeiten für Leitungen → Sanitär; Estrich → Estrich/Boden. ' +
          '(3) Gleiche Tätigkeit überall gleich benannt, Bezeichnung als Angebotsposition. (4) Summe der Stunden je Zeiteintrag = seine Stunden. Antworte NUR mit dem vollständigen korrigierten JSON im selben Format.' },
      ], 0)
    }
    if (task === 'beleg' && content.trim()) {
      content = await ask([
        ...messages,
        { role: 'assistant', content },
        { role: 'user', content: 'Prüfe jede Zahl Ziffer für Ziffer gegen das Bild (bei mehreren Bildern: keine Zeile aus dem Überlappungsbereich doppelt): Gesamtbetrag (Zeile „Gesamtsumme“/„Summe“/„zu zahlen“), Menge und Zeilenbetrag jeder Position, Datum. Die Summe der Positionen muss den Gesamtbetrag ergeben; passt es nicht, hast du dich verlesen – lies die betroffenen Zahlen erneut. Antworte NUR mit dem vollständigen korrigierten JSON im selben Format.' },
      ], 0)
    }
    if (jsonMode) { try { return out(JSON.parse(content)) } catch { return out({}) } }
    return out({ text: String(content).trim() })
  } catch (e) {
    return out({ error: String(e) }, 500)
  }
})
