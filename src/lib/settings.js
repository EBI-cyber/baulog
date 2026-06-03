const KEY = 'baulog.settings.v3'

export const EINHEITEN = ['m²', 'm', 'Stk', 'm³', 'h', 'psch']

// Dingerecht vorbelegter Leistungskatalog (Sanierung) — { gewerk, name, einheit }
export const defaultKatalog = [
  // Abbruch/Entsorgung
  { gewerk: 'Abbruch/Entsorgung', name: 'Fliesen abschlagen', einheit: 'm²' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Estrich abbrechen', einheit: 'm²' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Wand abbrechen', einheit: 'm²' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Sanitärobjekt demontieren', einheit: 'Stk' },
  { gewerk: 'Abbruch/Entsorgung', name: 'Bauschutt entsorgen', einheit: 'm³' },
  // Abdichtung
  { gewerk: 'Abdichtung', name: 'Flächenabdichtung (Anstrich)', einheit: 'm²' },
  { gewerk: 'Abdichtung', name: 'Abdichtung Flächenmatte/Dichtbahn', einheit: 'm²' },
  { gewerk: 'Abdichtung', name: 'Dichtband / Abdichtungsband', einheit: 'm' },
  { gewerk: 'Abdichtung', name: 'Dichtmanschette / Eckband', einheit: 'Stk' },
  // Fliesen
  { gewerk: 'Fliesen', name: 'Wandfliesen verlegen', einheit: 'm²' },
  { gewerk: 'Fliesen', name: 'Bodenfliesen verlegen', einheit: 'm²' },
  { gewerk: 'Fliesen', name: 'Sockelfliesen', einheit: 'm' },
  { gewerk: 'Fliesen', name: 'Verfugen', einheit: 'm²' },
  { gewerk: 'Fliesen', name: 'Silikonfuge', einheit: 'm' },
  // Sanitär
  { gewerk: 'Sanitär', name: 'WC montieren', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Waschtisch montieren', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Dusche/Duschwanne setzen', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Badewanne setzen', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Armatur montieren', einheit: 'Stk' },
  { gewerk: 'Sanitär', name: 'Rohrleitung verlegen', einheit: 'm' },
  // Elektro
  { gewerk: 'Elektro', name: 'Steckdose/Schalter setzen', einheit: 'Stk' },
  { gewerk: 'Elektro', name: 'Leitung verlegen', einheit: 'm' },
  { gewerk: 'Elektro', name: 'Leuchte/Spot montieren', einheit: 'Stk' },
  { gewerk: 'Elektro', name: 'Unterverteilung', einheit: 'Stk' },
  // Trockenbau
  { gewerk: 'Trockenbau', name: 'Ständerwand', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Vorwandinstallation', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Decke abhängen', einheit: 'm²' },
  { gewerk: 'Trockenbau', name: 'Revisionsklappe', einheit: 'Stk' },
  // Fenstermontage
  { gewerk: 'Fenstermontage', name: 'Fenster ausbauen', einheit: 'Stk' },
  { gewerk: 'Fenstermontage', name: 'Fenster einbauen', einheit: 'Stk' },
  { gewerk: 'Fenstermontage', name: 'Anschlussfuge abdichten', einheit: 'm' },
  { gewerk: 'Fenstermontage', name: 'Fensterbank montieren', einheit: 'Stk' },
  // Maler
  { gewerk: 'Maler', name: 'Grundierung', einheit: 'm²' },
  { gewerk: 'Maler', name: 'Wand streichen', einheit: 'm²' },
  { gewerk: 'Maler', name: 'Decke streichen', einheit: 'm²' },
  { gewerk: 'Maler', name: 'Spachteln (Q3)', einheit: 'm²' },
  // Sonstiges
  { gewerk: 'Sonstiges', name: 'Stundenlohnarbeiten', einheit: 'h' },
  { gewerk: 'Sonstiges', name: 'Baustelleneinrichtung', einheit: 'psch' },
  { gewerk: 'Sonstiges', name: 'Anfahrt', einheit: 'psch' },
]

export const defaultSettings = {
  defaultRate: 45,
  gewerke: [
    'Abbruch/Entsorgung', 'Abdichtung', 'Fliesen', 'Sanitär', 'Elektro',
    'Trockenbau', 'Fenstermontage', 'Maler', 'Sonstiges',
  ],
  leistungskatalog: defaultKatalog,
  openaiKey: '', // optional, falls KI-Texte ohne Edge Function genutzt werden
  company: '',
  owner: '',
}

export function loadSettings() {
  try {
    const m = { ...defaultSettings, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
    if (!Array.isArray(m.gewerke) || !m.gewerke.length) m.gewerke = defaultSettings.gewerke
    if (!Array.isArray(m.leistungskatalog) || !m.leistungskatalog.length) m.leistungskatalog = defaultKatalog
    return m
  } catch {
    return { ...defaultSettings }
  }
}
export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

// Leistungen eines Gewerks
export function leistungenFor(s, gewerk) {
  return (s.leistungskatalog || []).filter((l) => l.gewerk === gewerk)
}
export function einheitOf(s, gewerk, name) {
  const l = (s.leistungskatalog || []).find((x) => x.gewerk === gewerk && x.name === name)
  return l ? l.einheit : ''
}
