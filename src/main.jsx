import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { taeglicheSicherung } from './lib/backup'

// Datensicherung im Gerät: einmal täglich, gleich beim Start (vor dem ersten Cloud-Abgleich)
taeglicheSicherung().catch((e) => console.warn('Tägliche Sicherung fehlgeschlagen', e))

// Neue App-Version automatisch laden: beim Start und jedes Mal, wenn die App wieder
// in den Vordergrund kommt, nach einem Update suchen. Ein gefundenes Update lädt die
// Seite neu (Daten liegen in IndexedDB, ein laufender Timer im localStorage — nichts geht verloren).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {})
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
