import { useState } from 'react'
import { KeyRound, Mail, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import IconChip from '../ui/IconChip'

// Anmeldedaten ansehen & ändern. Das Passwort selbst ist nirgends gespeichert
// (Supabase kennt nur einen Hash) — daher nur „ändern“, nie „anzeigen“.
export default function Zugangsdaten({ isWorker }) {
  const { user } = useAuth()
  const [modus, setModus] = useState(null) // null | 'email' | 'passwort'
  const [aktuell, setAktuell] = useState('')
  const [neu, setNeu] = useState('')
  const [neu2, setNeu2] = useState('')
  const [zeigen, setZeigen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }

  const inp = 'w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 outline-none focus:border-amber'
  const btn = 'text-amber text-sm px-2.5 py-1.5 rounded-xl border border-white/20 inline-flex items-center gap-1.5'

  const oeffnen = (m) => { setModus(m); setAktuell(''); setNeu(''); setNeu2(''); setZeigen(false); setMsg(null) }

  // Aktuelles Passwort prüfen, bevor etwas geändert wird — schützt, falls das Gerät offen herumliegt.
  async function pruefeAktuell() {
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: aktuell })
    return !error
  }

  async function speichern(e) {
    e?.preventDefault?.()
    setMsg(null)
    if (!aktuell) { setMsg({ ok: false, text: 'Bitte dein aktuelles Passwort eingeben.' }); return }
    if (modus === 'email') {
      const mail = neu.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setMsg({ ok: false, text: 'Bitte eine gültige E-Mail-Adresse eingeben.' }); return }
      if (mail === (user.email || '').toLowerCase()) { setMsg({ ok: false, text: 'Das ist schon deine aktuelle E-Mail-Adresse.' }); return }
    } else {
      if (neu.length < 6) { setMsg({ ok: false, text: 'Das neue Passwort braucht mindestens 6 Zeichen.' }); return }
      if (neu !== neu2) { setMsg({ ok: false, text: 'Die neuen Passwörter stimmen nicht überein.' }); return }
    }
    setBusy(true)
    try {
      if (!(await pruefeAktuell())) { setMsg({ ok: false, text: 'Das aktuelle Passwort stimmt nicht.' }); return }
      if (modus === 'email') {
        const mail = neu.trim().toLowerCase()
        const { data, error } = await supabase.auth.updateUser({ email: mail })
        if (error) { setMsg({ ok: false, text: error.message }); return }
        if ((data?.user?.email || '').toLowerCase() === mail) {
          await supabase.auth.refreshSession() // neue Adresse sofort in der Sitzung (Team-Freigaben hängen daran)
          setModus(null); setMsg({ ok: true, text: 'E-Mail-Adresse geändert. Ab jetzt meldest du dich mit ' + mail + ' an.' })
        } else {
          setModus(null); setMsg({ ok: true, text: 'Bestätigungs-Mail an ' + mail + ' geschickt. Erst nach dem Klick auf den Link gilt die neue Adresse.' })
        }
      } else {
        const { error } = await supabase.auth.updateUser({ password: neu })
        if (error) { setMsg({ ok: false, text: error.message }); return }
        setModus(null); setMsg({ ok: true, text: 'Passwort geändert. Beim nächsten Anmelden gilt das neue Passwort.' })
      }
    } finally {
      setBusy(false)
    }
  }

  const pwTyp = zeigen ? 'text' : 'password'

  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <IconChip icon={KeyRound} size="w-9 h-9" iconClass="w-[18px] h-[18px]" />
        <div>
          <div className="font-semibold">Anmeldedaten</div>
          <div className="text-white/60 text-xs">womit du dich bei BauLog anmeldest</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 bg-white/5 rounded-xl px-3 py-2">
          <div className="min-w-0">
            <div className="text-white/60 text-xs">E-Mail</div>
            <div className="truncate">{user?.email}</div>
          </div>
          {modus !== 'email' && <button onClick={() => oeffnen('email')} className={btn}><Mail className="w-4 h-4" />Ändern</button>}
        </div>
        <div className="flex items-center justify-between gap-3 bg-white/5 rounded-xl px-3 py-2">
          <div className="min-w-0">
            <div className="text-white/60 text-xs">Passwort</div>
            <div className="tracking-widest">••••••••</div>
          </div>
          {modus !== 'passwort' && <button onClick={() => oeffnen('passwort')} className={btn}><KeyRound className="w-4 h-4" />Ändern</button>}
        </div>
        {!modus && (
          <div className="text-white/50 text-xs">Das Passwort wird aus Sicherheitsgründen nirgends lesbar gespeichert, auch nicht in der Cloud. Du kannst es deshalb nicht nachschauen, aber jederzeit ändern.</div>
        )}
      </div>

      {modus && (
        <form onSubmit={speichern} className="mt-3 space-y-2">
          {modus === 'email' ? (
            <>
              <input value={neu} onChange={(e) => setNeu(e.target.value)} type="email" placeholder="Neue E-Mail-Adresse" className={inp} autoComplete="email" />
              {isWorker && <div className="text-amber text-xs">Achtung: Dein Chef muss die neue Adresse im Team eintragen, sonst siehst du deine Projekte nicht mehr.</div>}
            </>
          ) : (
            <>
              <input value={neu} onChange={(e) => setNeu(e.target.value)} type={pwTyp} placeholder="Neues Passwort (mind. 6 Zeichen)" className={inp} autoComplete="new-password" />
              <input value={neu2} onChange={(e) => setNeu2(e.target.value)} type={pwTyp} placeholder="Neues Passwort wiederholen" className={inp} autoComplete="new-password" />
            </>
          )}
          <input value={aktuell} onChange={(e) => setAktuell(e.target.value)} type={pwTyp} placeholder="Aktuelles Passwort zur Bestätigung" className={inp} autoComplete="current-password" />
          <button type="button" onClick={() => setZeigen((z) => !z)} className="text-white/60 text-xs inline-flex items-center gap-1">
            {zeigen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{zeigen ? 'Eingabe verbergen' : 'Eingabe anzeigen'}
          </button>
          {msg && !msg.ok && <div className="text-amber text-sm">{msg.text}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-2xl py-2.5 font-bold btn-grad disabled:opacity-40 active:scale-[0.98] transition">
              {busy ? '…' : modus === 'email' ? 'E-Mail ändern' : 'Passwort ändern'}
            </button>
            <button type="button" onClick={() => oeffnen(null)} className="px-4 rounded-2xl border border-white/20 text-white/80 text-sm">Abbrechen</button>
          </div>
        </form>
      )}
      {!modus && msg && <div className={(msg.ok ? 'text-emerald-400' : 'text-amber') + ' text-sm mt-3'}>{msg.text}</div>}
    </div>
  )
}
