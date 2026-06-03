import { HashRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { syncAll } from './lib/cloud'
import { listProjekte } from './lib/db'
import { RoleContext } from './lib/role'
import Nav from './components/Nav'
import Projekte from './screens/Projekte'
import ProjektDetail from './screens/ProjektDetail'
import Dashboard from './screens/Dashboard'
import Einstellungen from './screens/Einstellungen'
import Login from './screens/Login'

function Splash() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-white/20 border-t-amber rounded-full animate-spin" />
    </div>
  )
}
function WithNav({ children }) {
  return (
    <div className="min-h-[100dvh] flex flex-col max-w-md mx-auto">
      <div className="flex-1">{children}</div>
      <Nav />
    </div>
  )
}

function Shell() {
  const { loading, user, isCloudReady } = useAuth()
  const [ready, setReady] = useState(false)
  const [role, setRole] = useState('owner')
  useEffect(() => {
    let active = true
    if (!user) { setReady(true); return }
    setReady(false)
    ;(async () => {
      try { await syncAll() } catch {}
      try {
        const all = await listProjekte()
        const owns = all.some((p) => p.owner && p.owner === user.id)
        if (active) setRole(!owns && all.length > 0 ? 'worker' : 'owner')
      } catch {}
      if (active) setReady(true)
    })()
    return () => { active = false }
  }, [user])

  if (loading) return <Splash />
  if (isCloudReady && !user) return <Login />
  if (!ready) return <Splash />

  return (
    <RoleContext.Provider value={role}>
      <Routes>
        <Route path="/" element={<WithNav><Projekte /></WithNav>} />
        <Route path="/projekt/:id" element={<ProjektDetail />} />
        <Route path="/auswertung" element={<WithNav><Dashboard /></WithNav>} />
        <Route path="/einstellungen" element={<WithNav><Einstellungen /></WithNav>} />
      </Routes>
    </RoleContext.Provider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  )
}
