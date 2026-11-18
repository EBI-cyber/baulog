import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Download, Loader2, AlertTriangle, Timer } from 'lucide-react'
import { durchschlagLaden } from '../lib/signatur'

/** Öffentliche Seite für den Unterzeichner: Durchschlag (PDF mit beiden Unterschriften) ansehen und sichern */
export default function Durchschlag() {
  const { token } = useParams()
  const [d, setD] = useState(null), [fehler, setFehler] = useState('')
  useEffect(() => {
    durchschlagLaden(token).then((r) => {
      const bin = atob(r.pdf), a = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
      const blob = new Blob([a], { type: 'application/pdf' })
      setD({ ...r, blob, url: URL.createObjectURL(blob) })
    }).catch((e) => setFehler(e.message))
  }, [token])
  const sichern = async () => {
    const datei = new File([d.blob], d.name || 'Rapport.pdf', { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [datei] })) { try { await navigator.share({ files: [datei] }); return } catch { /* abgebrochen */ } }
    const a = document.createElement('a'); a.href = d.url; a.download = d.name || 'Rapport.pdf'; a.click()
  }
  return (
    <div className="min-h-[100dvh] px-4 py-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-2.5 text-white/70">
        <div className="w-9 h-9 rounded-xl btn-grad flex items-center justify-center"><Timer className="w-5 h-5" strokeWidth={2.2} /></div>
        <div className="font-semibold">Rapport — Durchschlag</div>
      </div>
      {fehler ? <div className="text-sm rounded-2xl px-4 py-3 bg-ember/10 border border-ember/40 text-rose-200 flex gap-2"><AlertTriangle className="w-5 h-5 shrink-0" /> {fehler}</div>
        : !d ? <div className="py-16 text-center text-white/60"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
        : <>
          <div className="glass rounded-3xl p-5 space-y-3">
            <div className="flex items-center gap-3"><FileText className="w-8 h-8 text-aqua shrink-0" /><div><div className="font-bold">{d.titel || d.name}</div><div className="text-sm text-white/65">Unterschriebener Rapport (PDF) — Ihr Durchschlag</div></div></div>
            <a href={d.url} target="_blank" rel="noreferrer" className="w-full rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-2"><FileText className="w-5 h-5" /> PDF ansehen</a>
            <button onClick={sichern} className="w-full rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Download className="w-5 h-5" /> Sichern / weiterleiten</button>
          </div>
          <div className="text-xs text-white/60">Der Link ist 30 Tage gültig.</div>
        </>}
    </div>
  )
}
