import TagMenue from './TagMenue'
import SchichtSheet from './SchichtSheet'
import AbsenzSheet from './AbsenzSheet'
import SpesenSheet from './SpesenSheet'

/**
 * Ein Ort für alle Eingabe-Fenster.
 * wert: { typ: 'menue'|'zeit'|'absenz'|'spesen', datum?, objekt? } | null
 */
export default function Erfassen({ wert, setWert }) {
  if (!wert) return null
  const zu = () => setWert(null)
  const { typ, datum, objekt } = wert
  if (typ === 'menue') return <TagMenue datum={datum} onWahl={(t) => setWert({ typ: t, datum })} onClose={zu} />
  if (typ === 'zeit') return <SchichtSheet schicht={objekt || null} datum={datum} onClose={zu} />
  if (typ === 'absenz') return <AbsenzSheet absenz={objekt} datum={datum} onClose={zu} />
  if (typ === 'spesen') return <SpesenSheet spesen={objekt} datum={datum} onClose={zu} />
  return null
}
