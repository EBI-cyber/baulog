import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import Heute from './screens/Heute'
import Woche from './screens/Woche'
import Einstellungen from './screens/Einstellungen'

export default function App() {
  return (
    <HashRouter>
      <div className="md:flex min-h-[100dvh]">
        <Nav />
        <main className="flex-1 min-w-0 pb-28 md:pb-12">
          <div className="max-w-2xl mx-auto w-full px-4 pt-5 md:pt-10">
            <Routes>
              <Route path="/" element={<Heute />} />
              <Route path="/woche" element={<Woche />} />
              <Route path="/woche/:key" element={<Woche />} />
              <Route path="/einstellungen" element={<Einstellungen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </HashRouter>
  )
}
