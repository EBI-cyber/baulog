import { ladeBild } from './scan'

/**
 * Firmenstempel aus einem Foto freistellen: nur die farbige Stempelfarbe (violett/blau/rot) bleibt, Papier, graue
 * Formularlinien und schwarzer Kugelschreiber werden durchsichtig. Ergebnis: PNG mit Transparenz, max. 700 px breit,
 * einheitlich in der Stempelfarbe (wie frisch gestempelt). Bleibt nur auf dem Gerät (im Einsatz gespeichert).
 */
export async function stempelFreistellen(src) {
  const img = await ladeBild(src)
  const f = Math.min(1, 700 / img.naturalWidth)
  const W = Math.round(img.naturalWidth * f), H = Math.round(img.naturalHeight * f)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H)
  const im = x.getImageData(0, 0, W, H), d = im.data
  // Farbabweichung vom Papier (Helligkeit herausgerechnet): Stempelfarbe weicht stark ab, Papier, graue Linien und
  // schwarze Tinte kaum. Schwelle automatisch (Otsu), weiche Kante.
  const n = W * H, diff = new Float32Array(n), ch = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], m = (r + g + b) / 3; ch[i * 3] = r - m; ch[i * 3 + 1] = g - m; ch[i * 3 + 2] = b - m }
  const median = (k) => { const v = []; for (let i = 0; i < n; i += 7) v.push(ch[i * 3 + k]); v.sort((p, q) => p - q); return v[v.length >> 1] }
  const bg = [median(0), median(1), median(2)]
  let max = 0
  for (let i = 0; i < n; i++) { const v = Math.hypot(ch[i * 3] - bg[0], ch[i * 3 + 1] - bg[1], ch[i * 3 + 2] - bg[2]); diff[i] = v; if (v > max) max = v }
  const hist = new Float64Array(256)
  for (let i = 0; i < n; i++) hist[Math.min(255, Math.floor((diff[i] / (max || 1)) * 255))]++
  let summe = 0; for (let i = 0; i < 256; i++) summe += i * hist[i]
  let w0 = 0, s0 = 0, best = 0, t = 0
  for (let i = 0; i < 256; i++) { w0 += hist[i]; if (!w0 || w0 === n) continue; s0 += i * hist[i]; const m0 = s0 / w0, m1 = (summe - s0) / (n - w0), v = w0 * (n - w0) * (m0 - m1) ** 2; if (v > best) { best = v; t = i } }
  const schwelle = (t / 255) * max, lo = schwelle * 0.8, hi = schwelle * 1.4
  const a = new Float32Array(n)
  let sr = 0, sg = 0, sb = 0, cnt = 0
  for (let i = 0; i < n; i++) {
    a[i] = Math.max(0, Math.min(1, (diff[i] - lo) / (hi - lo || 1)))
    if (a[i] > 0.95) { sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; cnt++ }
  }
  if (cnt < 50 || schwelle < 6) throw new Error('Kein farbiger Stempel gefunden. Bitte den Stempel näher und bei gutem Licht fotografieren.')
  // Farbe etwas kräftiger als im Foto (Stempelkissen-Look)
  const mw = (sr + sg + sb) / (3 * cnt)
  const farbe = [sr / cnt, sg / cnt, sb / cnt].map((v) => Math.max(0, Math.min(255, mw + (v - mw) * 1.4 - 25)))
  let minX = W, minY = H, maxX = 0, maxY = 0
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const i = y * W + xx, o = i * 4
    d[o] = farbe[0]; d[o + 1] = farbe[1]; d[o + 2] = farbe[2]; d[o + 3] = Math.round(255 * a[i])
    if (a[i] > 0.5) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (y < minY) minY = y; if (y > maxY) maxY = y }
  }
  x.putImageData(im, 0, 0)
  // auf den Stempel zuschneiden (mit kleinem Rand)
  const rand = 6
  minX = Math.max(0, minX - rand); minY = Math.max(0, minY - rand); maxX = Math.min(W - 1, maxX + rand); maxY = Math.min(H - 1, maxY + rand)
  const z = document.createElement('canvas'); z.width = maxX - minX + 1; z.height = maxY - minY + 1
  z.getContext('2d').drawImage(c, minX, minY, z.width, z.height, 0, 0, z.width, z.height)
  return z.toDataURL('image/png')
}
