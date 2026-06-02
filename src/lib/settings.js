const KEY = 'baulog.settings.v1'

export const defaultSettings = {
  defaultRate: 45, // Stundensatz Selbstkosten (€/h)
  gewerke: [
    'Badsanierung', 'Fliesen', 'Sanitär', 'Elektro', 'Fenstermontage',
    'Trockenbau', 'Abbruch/Entsorgung', 'Maler', 'Sonstiges',
  ],
  company: '',
  owner: '',
}

export function loadSettings() {
  try {
    const m = { ...defaultSettings, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
    if (!Array.isArray(m.gewerke) || !m.gewerke.length) m.gewerke = defaultSettings.gewerke
    return m
  } catch {
    return { ...defaultSettings }
  }
}
export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
