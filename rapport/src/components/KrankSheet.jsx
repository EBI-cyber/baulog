import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Thermometer, Mail, MessageCircle, Loader2, CheckCircle2, AlertTriangle, Camera } from 'lucide-react'
import Sheet from './Sheet'
import { db, speichereAbsenz } from '../lib/db'
import { useEinstellungen, tagesSoll } from '../lib/settings'
import { useMs, msVersand } from '../lib/microsoft'
import { standardPerson } from '../lib/unterschreiber'
import { whatsappLink } from '../lib/teilen'
import { isoDatum, datumLang, uhr } from '../lib/zeit'

/** Krank melden: Abwesenheit eintragen + Büro und Polier informieren (E-Mail automatisch, WhatsApp mit einem Tipp) */
export default function KrankSheet({ onClose }) {
  const [einst] = useEinstellungen()
  const ms = useMs()
  const einsatz = useLiveQuery(() => db.einsaetze.where('firma').equals(einst.firma || '').first(), [einst.firma], null)
  const heute = new Date(), morgen = new Date(Date.now() + 864e5)
  const [tag, setTag] = useState(isoDatum(heute))
  const [tage, setTage] = useState(1)
  const [text, setText] = useState('')
  const [laeuft, setLaeuft] = useState(false), [fertig, setFertig] = useState(null), [fehler, setFehler] = useState('')
  const polier = standardPerson(einsatz)
  const frist = einst.profil?.krankMeldenBis
  const zuSpaet = frist && tag === isoDatum(heute) && uhr(Date.now()) > frist

  const ab = datumLang(new Date(tag + 'T12:00'))
  const nachricht = text || `Guten Tag\n\nIch bin leider krank und kann ab ${ab}${tage > 1 ? ` voraussichtlich ${tage} Tage` : ''} nicht zur Arbeit kommen` +
    `${einsatz ? ` (Einsatz bei ${einsatz.firma}${einsatz.einsatznummer ? ', Nr. ' + einsatz.einsatznummer : ''})` : ''}. Ein Arztzeugnis reiche ich nach, falls nötig.\n\nFreundliche Grüsse\n${einst.name}`

  async function melden() {
    setLaeuft(true); setFehler('')
    try {
      // Abwesenheit(en) eintragen (Werktage)
      const d = new Date(tag + 'T12:00')
      for (let n = 0; n < tage; ) {
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          await speichereAbsenz({ datum: isoDatum(d), art: 'krank', firma: einst.firma, halbtag: false, stunden: tagesSoll(einst), zeugnis: false, notiz: `Krankmeldung ${datumLang(new Date())} ${uhr(Date.now())}` })
          n++
        }
        d.setDate(d.getDate() + 1)
      }
      let mail = null
      if (ms.refreshToken && (einsatz?.bueroEmail || polier?.email)) {
        const r = await msVersand({ datei: null, mail: einsatz?.bueroEmail ? { an: einsatz.bueroEmail, cc: polier?.email || '', betreff: `Krankmeldung ${einst.name} ab ${ab}`, text: nachricht } : null,
          kopie: !einsatz?.bueroEmail && polier?.email ? { an: polier.email, betreff: `Krankmeldung ${einst.name} ab ${ab}`, text: nachricht } : null })
        mail = r.mail || r.kopie
        if (mail && !mail.ok) setFehler(`E-Mail: ${mail.fehler}`)
      }
      setFertig({ mail })
    } catch (e) { setFehler(e.message) } finally { setLaeuft(false) }
  }

  return (
    <Sheet titel="Krank melden" icon={Thermometer} onClose={onClose}>
      {!fertig ? (
        <>
          {frist && <div className={'text-sm rounded-xl px-3 py-2 border flex gap-2 ' + (zuSpaet ? 'bg-ember/15 border-ember/30 text-ember' : 'bg-white/[0.04] border-white/10 text-white/60')}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {zuSpaet ? `Die Frist war ${frist} Uhr — bitte sofort melden und zusätzlich anrufen.` : `Melden bis ${frist} Uhr.`}
          </div>}
          <div className="flex gap-2">
            {[[isoDatum(heute), 'Ab heute'], [isoDatum(morgen), 'Ab morgen']].map(([d, l]) => (
              <button key={d} onClick={() => setTag(d)} className={'flex-1 rounded-xl py-2 text-sm border ' + (tag === d ? 'btn-grad border-transparent font-semibold' : 'border-white/15 text-white/65')}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/60">Voraussichtlich</span>
            <button className="w-9 h-9 rounded-xl bg-white/10" onClick={() => setTage(Math.max(1, tage - 1))}>−</button>
            <b className="w-6 text-center tabular-nums">{tage}</b>
            <button className="w-9 h-9 rounded-xl bg-white/10" onClick={() => setTage(Math.min(20, tage + 1))}>+</button>
            <span className="text-white/60">Arbeitstag{tage > 1 ? 'e' : ''}</span>
          </div>
          <textarea className="eingabe min-h-[140px] text-sm" value={nachricht} onChange={(e) => setText(e.target.value)} />
          <div className="text-xs text-white/45">
            Geht an: {[einsatz?.bueroEmail && `Büro (${einsatz.bueroEmail})`, polier?.email && `${polier.name}`].filter(Boolean).join(' und ') || '— keine E-Mail im Einsatz hinterlegt'}
            {!ms.refreshToken && ' · E-Mail automatisch nur mit verbundenem Microsoft-Konto'}
          </div>
          <button onClick={melden} disabled={laeuft} className="w-full rounded-2xl py-3.5 font-bold btn-grad inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {laeuft ? <Loader2 className="w-5 h-5 animate-spin" /> : <Thermometer className="w-5 h-5" />} Krank melden
          </button>
        </>
      ) : (
        <>
          <div className="text-sm text-lime flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Abwesenheit „Krank“ eingetragen{fertig.mail?.ok ? ' und per E-Mail gemeldet' : ''}.</div>
          {fehler && <div className="text-sm text-ember">{fehler}</div>}
          {einsatz?.bueroTel && <a href={whatsappLink(einsatz.bueroTel, nachricht)} target="_blank" rel="noreferrer" className="w-full rounded-2xl py-3 bg-[#25D366]/15 border border-[#25D366]/40 text-[#7ee2a8] font-semibold inline-flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> Auch per WhatsApp ans Büro</a>}
          {polier?.tel && <a href={whatsappLink(polier.tel, nachricht)} target="_blank" rel="noreferrer" className="w-full rounded-2xl py-3 bg-[#25D366]/15 border border-[#25D366]/40 text-[#7ee2a8] font-semibold inline-flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> WhatsApp an {polier.name}</a>}
          {!fertig.mail?.ok && einsatz?.bueroEmail && <a href={`mailto:${einsatz.bueroEmail}?subject=${encodeURIComponent(`Krankmeldung ${einst.name}`)}&body=${encodeURIComponent(nachricht)}`} className="w-full rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Mail className="w-5 h-5" /> E-Mail öffnen</a>}
          <div className="text-sm text-white/55 flex gap-2"><Camera className="w-4 h-4 shrink-0 mt-0.5" /> Arztzeugnis: meist ab dem 3. Krankheitstag nötig (siehe Vertrag). Unter „Woche“ die Abwesenheit öffnen und „Arztzeugnis vorhanden“ abhaken.</div>
          <button onClick={onClose} className="w-full rounded-2xl py-3 bg-white/10 font-semibold">Schliessen</button>
        </>
      )}
    </Sheet>
  )
}
