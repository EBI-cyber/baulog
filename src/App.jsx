import { HashRouter, Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Projekte from './screens/Projekte'
import ProjektDetail from './screens/ProjektDetail'
import Dashboard from './screens/Dashboard'
import Einstellungen from './screens/Einstellungen'

function WithNav({ children }) {
  return (
    <div className="min-h-[100dvh] flex flex-col max-w-md mx-auto">
      <div className="flex-1">{children}</div>
      <Nav />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<WithNav><Projekte /></WithNav>} />
        <Route path="/projekt/:id" element={<ProjektDetail />} />
        <Route path="/auswertung" element={<WithNav><Dashboard /></WithNav>} />
        <Route path="/einstellungen" element={<WithNav><Einstellungen /></WithNav>} />
      </Routes>
    </HashRouter>
  )
}
