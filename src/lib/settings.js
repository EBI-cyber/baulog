const KEY = 'baulog.settings.v3'

export const EINHEITEN = ['m²', 'm', 'Stk', 'm³', 'h', 'psch']

// DIN/VOB-orientierter Leistungskatalog (Sanierung) — { gewerk, name, einheit }
export const defaultKatalog = [
  // Abbruch/Entsorgung (DIN 18459)
  { gewerk: 'Abbruch/Entsorgung', name: 'Wandfliesen abschlagen', einheit: 'm²' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Bodenfliesen abschlagen', einheit: 'm²' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Estrich abbrechen', einheit: 'm²' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Mauerwerk abbrechen', einheit: 'm²' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Trockenbauwand rückbauen', einheit: 'm²' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Sanitärobjekt demontieren', einheit: 'Stk' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Tür/Zarge ausbauen', einheit: 'Stk' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Bauschutt entsorgen', einheit: 'm³' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Schutt verladen/Container', einheit: 'h' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Sondermüll/Asbest entsorgen', einheit: 'psch' },
  // Abdichtung (DIN 18534 – Innenraum)
  { gewerk: 'Abdichtung', name: 'Voranstrich/Grundierung', einheit: 'm²' },
  { gewerk: 'Abdichtung', name: 'Flächenabdichtung (Verbund)', einheit: 'm²' },
  { gewerk: 'Abdichtung', name: 'Abdichtung Dichtbahn/Flächenmatte', einheit: 'm²' },
  { gewerk: 'Abdichtung', name: 'Dichtband Wand/Boden', einheit: 'm' },
  { gewerk: 'Abdichtung', name: 'Dichtecke innen/außen', einheit: 'Stk' },
  { gewerk: 'Abdichtung', name: 'Dichtmanschette (Boden/Wand)', einheit: 'Stk' },
  // Fliesen (DIN 18352)
  { gewerk: 'Fliesen', name: 'Wandfliesen verlegen', einheit: 'm²' },
  { gewerk: 'Fliesen', name: 'Bodenfliesen verlegen', einheit: 'm²' },
  { gewerk: 'Fliesen', name: 'Großformat verlegen', einheit: 'm²' },
  { gewerk: 'Fliesen', name: 'Mosaik verlegen', einheit: 'm²' },
  { gewerk: 'Fliesen', name: 'Sockelfliesen', einheit: 'm' },
  { gewerk: 'Fliesen', name: 'Verfugen', einheit: 'm²' },
  { gewerk: 'Fliesen', name: 'Silikonfuge', einheit: 'm' },
  { gewerk: 'Fliesen', name: 'Fliesenschiene/Profil', einheit: 'm' },
  { gewerk: 'Fliesen', name: 'Bohrung/Ausschnitt', einheit: 'Stk' },
  // Sanitär (DIN 18381)
  { gewerk: 'Sanitär', name: 'WC wandhängend montieren', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'WC-Stand montieren', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Waschtisch montieren', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Doppelwaschtisch montieren', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Duschwanne setzen', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Bodengleiche Dusche/Ablauf', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Badewanne setzen', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Armatur Waschtisch', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Armatur Dusche (UP)', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Trinkwasserleitung verlegen', einheit: 'm' },
  { gewerk: 'Sanitär', name: 'Abwasserleitung verlegen', einheit: 'm' },
  { gewerk: 'Sanitär', name: 'Handtuchheizkörper', einheit: 'Stk' },
  // Elektro (DIN 18382)
  { gewerk: 'Elektro', name: 'Steckdose setzen', einheit: 'Stk' },
  { gewerk: 'Elektro', name: 'Schalter setzen', einheit: 'Stk' },
  { gewerk: 'Elektro', name: 'Leitung NYM verlegen', einheit: 'm' },
  { gewerk: 'Elektro', name: 'Leerrohr verlegen', einheit: 'm' },
  { gewerk: 'Elektro', name: 'UP-Dose setzen', einheit: 'Stk' },
  { gewerk: 'Elektro', name: 'Einbauspot montieren', einheit: 'Stk' },
  { gewerk: 'Elektro', name: 'Leuchte montieren', einheit: 'Stk' },
  { gewerk: 'Elektro', name: 'Unterverteilung erweitern', einheit: 'Stk' },
  { gewerk: 'Elektro', name: 'FI/LS-Schalter', einheit: 'Stk' },
  // Trockenbau (DIN 18340)
  { gewerk: 'Trockenbau', name: 'Ständerwand einfach beplankt', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Ständerwand doppelt beplankt', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Vorwandinstallation', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Decke abhängen', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Schacht verkleiden', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Dämmung einbringen', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Revisionsklappe', einheit: 'Stk' },
  { gewerk: 'Trockenbau', name: 'Spachteln Q2', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Spachteln Q3', einheit: 'm²' },
  // Fenstermontage (DIN 18355 / RAL)
  { gewerk: 'Fenstermontage', name: 'Fenster ausbauen', einheit: 'Stk' },
  { gewerk: 'Fenstermontage', name: 'Fenster einbauen (RAL)', einheit: 'Stk' },
  { gewerk: 'Fenstermontage', name: 'Balkon-/Terrassentür einbauen', einheit: 'Stk' },
  { gewerk: 'Fenstermontage', name: 'Anschlussfuge innen abdichten', einheit: 'm' },
  { gewerk: 'Fenstermontage', name: 'Anschlussfuge außen abdichten', einheit: 'm' },
  { gewerk: 'Fenstermontage', name: 'Fensterbank innen', einheit: 'Stk' },
  { gewerk: 'Fenstermontage', name: 'Fensterbank außen', einheit: 'm' },
  { gewerk: 'Fenstermontage', name: 'Rollladen montieren', einheit: 'Stk' },
  // Maler (DIN 18363)
  { gewerk: 'Maler', name: 'Untergrund grundieren', einheit: 'm²' },
  { gewerk: 'Maler', name: 'Wand streichen (2x)', einheit: 'm²' },
  { gewerk: 'Maler', name: 'Decke streichen (2x)', einheit: 'm²' },
  { gewerk: 'Maler', name: 'Spachteln/Glätten', einheit: 'm²' },
  { gewerk: 'Maler', name: 'Tapezieren', einheit: 'm²' },
  { gewerk: 'Maler', name: 'Heizkörper lackieren', einheit: 'Stk' },
  { gewerk: 'Maler', name: 'Türen lackieren', einheit: 'Stk' },
  // Estrich/Boden (DIN 18353 / 18560)
  { gewerk: 'Estrich/Boden', name: 'Trennlage/Dämmung verlegen', einheit: 'm²' },
  { gewerk: 'Estrich/Boden', name: 'Zementestrich einbringen', einheit: 'm²' },
  { gewerk: 'Estrich/Boden', name: 'Fließestrich einbringen', einheit: 'm²' },
  { gewerk: 'Estrich/Boden', name: 'Ausgleichsmasse', einheit: 'm²' },
  { gewerk: 'Estrich/Boden', name: 'Trittschalldämmung', einheit: 'm²' },
  { gewerk: 'Estrich/Boden', name: 'Randdämmstreifen', einheit: 'm' },
  // Sonstiges
  { gewerk: 'Sonstiges', name: 'Stundenlohnarbeiten', einheit: 'h' },
  { gewerk: 'Sonstiges', name: 'Baustelleneinrichtung', einheit: 'psch' },
  { gewerk: 'Sonstiges', name: 'An-/Abfahrt', einheit: 'psch' },
  { gewerk: 'Sonstiges', name: 'Baustellenreinigung', einheit: 'h' },
  { gewerk: 'Sonstiges', name: 'Schutzabdeckung', einheit: 'm²' },
]

export const defaultGewerke = [
  'Abbruch/Entsorgung', 'Abdichtung', 'Fliesen', 'Sanitär', 'Elektro',
  'Trockenbau', 'Fenstermontage', 'Maler', 'Estrich/Boden', 'Sonstiges',
]

export const defaultSettings = {
  defaultRate: 45,
  rundungMinuten: 0,
  gewerke: defaultGewerke,
  leistungskatalog: defaultKatalog,
  maschinen: [
    { name: 'Fliesenschneider', satz: 4 },
    { name: 'Bohr-/Stemmhammer', satz: 8 },
    { name: 'Rührwerk / Mischer', satz: 3 },
    { name: 'Kernbohrgerät', satz: 15 },
    { name: 'Estrich-/Mischpumpe', satz: 20 },
    { name: 'Bautrockner', satz: 6 },
    { name: 'Nass-/Trockensauger', satz: 2 },
    { name: 'Akku-Geräte (div.)', satz: 1 },
  ],
  openaiKey: '',
  company: '',
  owner: '',
  street: '',
  zip: '',
  city: '',
  taxId: '',
}

export function loadSettings() {
  try {
    const m = { ...defaultSettings, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
    if (!Array.isArray(m.gewerke) || !m.gewerke.length) m.gewerke = defaultGewerke
    if (!Array.isArray(m.leistungskatalog) || !m.leistungskatalog.length) m.leistungskatalog = defaultKatalog
    if (!Array.isArray(m.maschinen)) m.maschinen = defaultSettings.maschinen
    return m
  } catch {
    return { ...defaultSettings }
  }
}
export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function leistungenFor(s, gewerk) {
  return (s.leistungskatalog || []).filter((l) => l.gewerk === gewerk)
}
export function einheitOf(s, gewerk, name) {
  const l = (s.leistungskatalog || []).find((x) => x.gewerk === gewerk && x.name === name)
  return l ? l.einheit : ''
}
// DIN-Standardkatalog non-destruktiv ergänzen (fehlende Positionen + Gewerke hinzufügen)
export function mergeDinKatalog(s) {
  const have = new Set((s.leistungskatalog || []).map((l) => l.gewerk + '||' + l.name))
  const add = defaultKatalog.filter((l) => !have.has(l.gewerk + '||' + l.name))
  const gewerke = Array.from(new Set([...(s.gewerke || []), ...defaultGewerke]))
  return { leistungskatalog: [...(s.leistungskatalog || []), ...add], gewerke, added: add.length }
}
