import { useEffect, useMemo, useState } from 'react'
import { FileImage, Share2, Eye } from 'lucide-react'
import Sheet from './Sheet'
import { originalPdf, dataUrlZuBlob } from '../lib/originale'
import { teileDatei } from '../lib/teilen'

/** Original-Beleg ansehen (Fotos direkt, PDFs zum Öffnen) und als PDF teilen/sichern */
export default function OriginalSheet({ titel, bilder = [], pdfs = [], name, onClose }) {
  const blob = useMemo(() => originalPdf({ bilder, pdfs }), [bilder, pdfs])
  const [url, setUrl] = useState(null)
  const pdfUrls = useMemo(() => pdfs.map((p) => URL.createObjectURL(dataUrlZuBlob(p))), [pdfs])
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => { URL.revokeObjectURL(u); pdfUrls.forEach((x) => URL.revokeObjectURL(x)) } }, [blob, pdfUrls])
  return (
    <Sheet titel={titel} icon={FileImage} onClose={onClose}>
      <div className="space-y-3">
        {bilder.map((b, i) => <a key={i} href={b} target="_blank" rel="noreferrer"><img src={b} alt={`Seite ${i + 1}`} className="w-full rounded-xl border border-white/10 bg-white" /></a>)}
        {pdfUrls.map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noreferrer" className="w-full rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Eye className="w-5 h-5" /> Original-PDF {pdfUrls.length > 1 ? i + 1 : ''} ansehen</a>
        ))}
        <div className="grid grid-cols-2 gap-2">
          {bilder.length > 0 && url && <a href={url} target="_blank" rel="noreferrer" className="rounded-2xl py-3 bg-white/10 font-semibold inline-flex items-center justify-center gap-2"><Eye className="w-5 h-5" /> Als PDF</a>}
          <button onClick={() => teileDatei(blob, name).catch(() => {})} className={'rounded-2xl py-3 btn-grad font-bold inline-flex items-center justify-center gap-2 ' + (bilder.length ? '' : 'col-span-2')}><Share2 className="w-5 h-5" /> Teilen / Sichern</button>
        </div>
        <div className="text-xs text-white/55">Gespeichert nur auf diesem Gerät (und in der Datensicherung).</div>
      </div>
    </Sheet>
  )
}
