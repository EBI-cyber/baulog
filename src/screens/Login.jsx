import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e?.preventDefault?.()
    if (!email || !pw) return
    setBusy(true); setMsg('')
    try {
      const fn = mode === 'in' ? signIn : signUp
      const { data, error } = await fn(email.trim(), pw)
      if (error) setMsg(error.message)
      else if (mode === 'up' && !data.session) setMsg('Fast geschafft! Bestätige deine E-Mail (oder Confirm-email in Supabase aus).')
    } finally {
      setBusy(false)
    }
  }
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 outline-none focus:border-amber'

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 max-w-md mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full">
        <h1 className="text-5xl font-extrabold grad-text text-center">BauLog</h1>
        <p className="text-white/45 text-center mt-1 mb-8">{mode === 'in' ? 'Willkommen zurück' : 'Konto erstellen'}</p>
        <form onSubmit={submit} className="glass rounded-3xl p-5 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-Mail" className={inp} autoComplete="email" />
          <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Passwort" className={inp} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          {msg && <div className="text-amber text-sm">{msg}</div>}
          <button type="submit" disabled={busy} className="w-full rounded-2xl py-3 font-bold bg-gradient-to-r from-amber to-ember text-ink disabled:opacity-40 active:scale-[0.98] transition">
            {busy ? '…' : mode === 'in' ? 'Anmelden' : 'Registrieren'}
          </button>
        </form>
        <button onClick={() => { setMode((m) => (m === 'in' ? 'up' : 'in')); setMsg('') }} className="w-full text-white/50 text-sm mt-4">
          {mode === 'in' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
        </button>
      </motion.div>
    </div>
  )
}
