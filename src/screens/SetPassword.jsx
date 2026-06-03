import { useState } from 'react'
import { motion } from 'framer-motion'
import { HardHat, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function SetPassword() {
  const { user } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 outline-none focus:border-amber'

  async function save(e) {
    e?.preventDefault?.()
    if (pw.length < 6) { setMsg('Mindestens 6 Zeichen.'); return }
    if (pw !== pw2) { setMsg('Passwörter stimmen nicht überein.'); return }
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    // Sauber neu starten, ohne Einladungs-Token in der URL
    window.location.replace(import.meta.env.BASE_URL)
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 max-w-md mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-3xl btn-grad shadow-glow flex items-center justify-center">
            <HardHat className="w-8 h-8" strokeWidth={2.2} />
          </div>
        </div>
        <h1 className="text-3xl font-extrabold grad-text text-center">Willkommen bei BauLog!</h1>
        <p className="text-white/55 text-center mt-2 mb-7 text-sm">
          Schön, dass du dabei bist{user?.email ? ' (' + user.email + ')' : ''}. Leg jetzt dein Passwort fest, dann kannst du loslegen und deine Zeiten erfassen.
        </p>
        <form onSubmit={save} className="glass rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-white/60 text-sm"><KeyRound className="w-4 h-4" /> Passwort wählen</div>
          <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Neues Passwort" className={inp} autoComplete="new-password" />
          <input value={pw2} onChange={(e) => setPw2(e.target.value)} type="password" placeholder="Passwort wiederholen" className={inp} autoComplete="new-password" />
          {msg && <div className="text-amber text-sm">{msg}</div>}
          <button type="submit" disabled={busy} className="w-full rounded-2xl py-3 font-bold btn-grad disabled:opacity-40 active:scale-[0.98] transition">
            {busy ? '…' : 'Passwort speichern & loslegen'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
