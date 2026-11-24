import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import Heute from './screens/Heute'
import Woche from './screens/Woche'
import Kalender from './screens/Kalender'
import Einstellungen from './screens/Einstellungen'
import Lohn from './screens/Lohn'
import Statistik from './screens/Statistik'
import Rapporte from './screens/Rapporte'
import Abrechnungen from './screens/Abrechnungen'
import Unterschreiben from './screens/Unterschreiben'
import Durchschlag from './screens/Durchschlag'
import Fragebogen from './screens/Fragebogen'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Öffentliche Seite für den Polier (QR-Code) — ohne Navigation */}
        <Route path="/unterschreiben/:token" element={<Unterschreiben />} />
        <Route path="/durchschlag/:token" element={<Durchschlag />} />
        {/* mehrstufiger Ablauf ohne Navigationsleiste */}
        <Route path="/fragebogen" element={<div className="max-w-2xl mx-auto w-full px-4 pt-5 md:pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))]"><Fragebogen /></div>} />
        <Route path="*" element={<Hauptlayout />} />
      </Routes>
    </HashRouter>
  )
}

function Hauptlayout() {
  return (
      <div className="md:flex min-h-[100dvh]">
        <Nav />
        <main className="flex-1 min-w-0 pb-28 md:pb-12">
          <div className="max-w-2xl mx-auto w-full px-4 pt-5 md:pt-10">
            <Routes>
              <Route path="/" element={<Heute />} />
              <Route path="/kalender" element={<Kalender />} />
              <Route path="/kalender/:monat" element={<Kalender />} />
              <Route path="/woche" element={<Woche />} />
              <Route path="/woche/:key" element={<Woche />} />
              <Route path="/lohn" element={<Lohn />} />
              <Route path="/statistik" element={<Statistik />} />
              <Route path="/rapporte" element={<Rapporte />} />
              <Route path="/abrechnungen" element={<Abrechnungen />} />
              <Route path="/einstellungen" element={<Einstellungen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
  )
}
