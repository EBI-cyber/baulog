import { useEffect, useState } from 'react'
import { MessageCircle, Mail, Loader2, CheckCircle2, Pencil } from 'lucide-react'
import { db } from '../lib/db'
import { statusKey } from '../lib/rapporte'
import { finde, merken } from '../lib/unterschreiber'
import { durchschlagHochladen, durchschlagLink } from '../lib/signatur'
import { whatsappLink } from '../lib/teilen'
import { kiVerfuegbar } from '../lib/ki'

/**
 * Durchschlag an den Unterzeichner des Einsatzbetriebs — ohne Microsoft: Das fertige PDF wird hochgeladen (Link 30 Tage)
 * und per WhatsApp (Nummer vorausgefüllt) bzw. E-Mail (Adresse vorausgefüllt) verschickt. Kontakt wird beim
 * Unterzeichner gespeichert und nächstes Mal automatisch genommen.
 */
export default function DurchschlagSenden({ g, woche, wKey, status, pdf, name }) {
  const einsatz = g.einsatz
  const person = finde(einsatz, { id: status?.firmaId, name: status?.firmaName }) || null
  const [tel, setTel] = useState(''), [email, setEmail] = useState('')
  const [bearbeiten, setBearbeiten] = useState(false)
  const [link, setLink] = useState(null), [fehler, setFehler] = useState('')
  const stand = `${status?.firmaAm || ''}|${status?.stempel ? 1 : 0}|${pdf?.size || 0}`
  useEffect(() => { setTel(status?.kopieTel || person?.tel || ''); setEmail(status?.kopieEmail || person?.email || '') }, [status?.firmaId, status?.firmaName]) // eslint-disable-line react-hooks/exhaustive-deps

  // PDF vorab hochladen (damit die Knöpfe direkt WhatsApp/Mail öffnen können)
  useEffect(() => {
    if (!kiVerfuegbar || !status?.firmaBild || !pdf) return
    if (status.durchschlag?.stand === stand) { setLink(status.durchschlag.link); return }
    let aktiv = true
    durchschlagHochladen(pdf, name, `Rapport KW ${woche.kw}/${woche.jahr} – ${g.einst.name || ''} – ${g.firma}`).then(async (token) => {
      const l = durchschlagLink(token)
      const k = statusKey(wKey, g.firma), alt = (await db.wochen.get(k)) || { key: k }
      await db.wochen.put({ ...alt, durchschlag: { token, link: l, stand } })
      if (aktiv) setLink(l)
    }).catch((e) => aktiv && setFehler(e.message))
    return () => { aktiv = false }
  }, [stand, kiVerfuegbar]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!status?.firmaBild || !kiVerfuegbar) return null
  const wer = status.firmaName || 'Einsatzbetrieb'
  const text = `Guten Tag${status.firmaName ? ' ' + status.firmaName : ''}\n\nHier Ihr Durchschlag des unterschriebenen Rapports KW ${woche.kw}/${woche.jahr} (${g.einst.name || ''}, Einsatz bei ${g.firma}):\n${link}\n\nFreundliche Grüsse\n${g.einst.name || ''}`
  async function gesendet(kanal) {
    // Kontakt merken (nächstes Mal vorausgefüllt) und Versand vermerken
    const e = einsatz?.id ? await db.einsaetze.get(einsatz.id) : null
    if (e && status.firmaName) await merken(e, { ...(person || {}), name: status.firmaName, funktion: status.firmaFunktion || person?.funktion, tel, email }).catch(() => {})
    const k = statusKey(wKey, g.firma), alt = (await db.wochen.get(k)) || { key: k }
    await db.wochen.put({ ...alt, kopieTel: tel, kopieEmail: email, kopieGesendetAm: Date.now(), kopieKanal: kanal })
  }
  const betreff = `Durchschlag Rapport KW ${woche.kw}/${woche.jahr} – ${g.einst.name || ''}`
  return (
    <div className="rounded-2xl border border-white/10 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex-1">Durchschlag an {wer}</span>
        {status.kopieGesendetAm && <span className="text-xs text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> gesendet</span>}
        <button type="button" onClick={() => setBearbeiten(!bearbeiten)} className="text-white/60 p-1" aria-label="Kontakt ändern"><Pencil className="w-4 h-4" /></button>
      </div>
      {(bearbeiten || (!tel && !email)) && <div className="grid grid-cols-2 gap-2">
        <input className="eingabe !py-2 text-sm" type="tel" inputMode="tel" placeholder="WhatsApp-Nr." value={tel} onChange={(e) => setTel(e.target.value)} />
        <input className="eingabe !py-2 text-sm" type="email" inputMode="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>}
      {!link ? <div className="text-xs text-white/60 inline-flex items-center gap-1.5">{fehler ? `Fehler: ${fehler}` : <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Durchschlag wird vorbereitet …</>}</div>
        : <div className="grid grid-cols-2 gap-2">
          <a href={tel ? whatsappLink(tel, text) : undefined} target="_blank" rel="noreferrer" onClick={() => tel && gesendet('whatsapp')}
            className={'rounded-xl py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1.5 ' + (tel ? 'btn-grad' : 'bg-white/5 text-white/40 pointer-events-none')}><MessageCircle className="w-4 h-4" /> WhatsApp</a>
          <a href={email ? `mailto:${email}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}` : undefined} onClick={() => email && gesendet('email')}
            className={'rounded-xl py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1.5 ' + (email ? 'bg-white/10' : 'bg-white/5 text-white/40 pointer-events-none')}><Mail className="w-4 h-4" /> E-Mail</a>
        </div>}
      <div className="text-xs text-white/60">{tel || email ? `An ${[tel, email].filter(Boolean).join(' · ')} — gespeichert, nächstes Mal automatisch.` : 'WhatsApp-Nummer oder E-Mail einmal eintragen — wird gespeichert.'} {wer} bekommt einen Link zum PDF mit beiden Unterschriften (30 Tage gültig).</div>
    </div>
  )
}
