import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { ausstehendeVersenden } from './lib/versand'
import { abholenStarten } from './lib/stempel'
import { fernStarten } from './lib/fernsignatur'
import { automatischSichern } from './lib/sicherung'

registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {})
    })
  },
})

// Vorgemerkte Rapporte (ohne Netz abgeschlossen) automatisch nachsenden
setTimeout(() => ausstehendeVersenden().catch(() => {}), 2000)
window.addEventListener('online', () => ausstehendeVersenden().catch(() => {}))
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ausstehendeVersenden().catch(() => {}) })

// Tipps vom iPhone-Kurzbefehl (Rückseite, Siri, Ort) regelmässig abholen
if (!location.hash.startsWith('#/unterschreiben')) {
  abholenStarten()
  // per Link vorab geschickte Rapporte: Unterschrift abholen → automatisch abschliessen
  fernStarten()
  // wöchentliche Datensicherung in OneDrive
  setTimeout(() => automatischSichern().catch(() => {}), 6000)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
