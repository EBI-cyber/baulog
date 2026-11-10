import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { ausstehendeVersenden } from './lib/versand'
import { abholenStarten } from './lib/stempel'

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
if (!location.hash.startsWith('#/unterschreiben')) abholenStarten()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
