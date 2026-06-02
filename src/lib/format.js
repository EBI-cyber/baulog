export const euro = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
export const hrs = (min) => ((Number(min) || 0) / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' h'
export const dmy = (d) => new Date(d).toLocaleDateString('de-DE')
export const dmyhm = (d) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

export function clock(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((x) => String(x).padStart(2, '0')).join(':')
}
