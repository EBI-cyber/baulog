import { useEffect, useRef } from 'react'
import { SYNC_EVENT } from './cloud'

// Lädt die Daten eines Screens neu, sobald der Hintergrund-Sync etwas aus der Cloud übernommen hat
export function useCloudRefresh(load) {
  const ref = useRef(load)
  ref.current = load
  useEffect(() => {
    const fn = () => { ref.current() }
    window.addEventListener(SYNC_EVENT, fn)
    return () => window.removeEventListener(SYNC_EVENT, fn)
  }, [])
}
