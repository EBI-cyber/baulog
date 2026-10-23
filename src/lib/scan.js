// Beleg-Scan im Browser: Bild verkleinern, perspektivisch entzerren (4 Ecken → Rechteck), Kontrast verbessern.

export function ladeBild(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
    img.src = src
  })
}

export function dateiAlsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    r.readAsDataURL(file)
  })
}

// Bild auf maximale Kantenlänge verkleinern → Canvas.
// Lange Belege (Video-Scan) werden nach der Breite begrenzt, sonst wäre die Schrift zu klein.
export function verkleinern(img, max = 1600) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height
  const f = h0 > w0 * 1.8 ? Math.min(1, 1200 / w0, 16000 / h0) : Math.min(1, max / Math.max(w0, h0))
  const c = document.createElement('canvas')
  c.width = Math.round((img.naturalWidth || img.width) * f)
  c.height = Math.round((img.naturalHeight || img.height) * f)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c
}

// Lineares Gleichungssystem lösen (Gauß mit Pivotsuche)
function loese(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

// Homographie, die die Punkte src[i] auf dst[i] abbildet (je 4 Punkte {x,y})
export function homographie(src, dst) {
  const A = [], b = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }
  const h = loese(A, b)
  return [...h, 1]
}

const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Ecken (oben-links, oben-rechts, unten-rechts, unten-links, in Pixeln von quelle) → entzerrtes Canvas
export function entzerren(quelle, ecken, maxSeite = 1400) {
  const [tl, tr, br, bl] = ecken
  let W = Math.max(abstand(tl, tr), abstand(bl, br))
  let H = Math.max(abstand(tl, bl), abstand(tr, br))
  // lange Belege nach der Breite begrenzen, damit die Schrift lesbar bleibt
  const f = H > W * 1.8 ? Math.min(1, 1200 / W, 16000 / H) : Math.min(1, maxSeite / Math.max(W, H))
  W = Math.max(1, Math.round(W * f)); H = Math.max(1, Math.round(H * f))
  // Ziel → Quelle, damit jedes Zielpixel genau einmal gefüllt wird
  const h = homographie([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], [tl, tr, br, bl])
  const sctx = quelle.getContext('2d')
  const sw = quelle.width, sh = quelle.height
  const sdata = sctx.getImageData(0, 0, sw, sh).data
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const octx = out.getContext('2d')
  const img = octx.createImageData(W, H)
  const d = img.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = h[6] * x + h[7] * y + h[8]
      const sx = (h[0] * x + h[1] * y + h[2]) / z
      const sy = (h[3] * x + h[4] * y + h[5]) / z
      const o = (y * W + x) * 4
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) { d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = 255; continue }
      // bilineare Interpolation
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4
      for (let k = 0; k < 3; k++) {
        d[o + k] = (sdata[i00 + k] * (1 - fx) + sdata[i10 + k] * fx) * (1 - fy) + (sdata[i01 + k] * (1 - fx) + sdata[i11 + k] * fx) * fy
      }
      d[o + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  return out
}

// „Scan-Look“: je Farbkanal strecken, damit Papier neutral weiß und Schrift dunkel wird
export function verbessern(canvas) {
  const ctx = canvas.getContext('2d')
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const n = d.length / 4
  const grenzen = [0, 1, 2].map((k) => {
    const hist = new Array(256).fill(0)
    for (let i = k; i < d.length; i += 4) hist[d[i]]++
    let lo = 0, hi = 255, acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break } }
    acc = 0
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.25) { hi = v; break } } // Papier = hellster großer Anteil
    return { lo, spanne: Math.max(30, hi - lo) }
  })
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, ((d[i + k] - grenzen[k].lo) / grenzen[k].spanne) * 255))
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// Ecken automatisch finden: weißestes zusammenhängendes Objekt (Papier vor farbigem oder dunklerem Untergrund).
// Schwelle nach Otsu, größte helle Fläche, Ecken über die Extrempunkte von x+y und x−y.
// Rückgabe: 4 Punkte in Pixeln von canvas (oben-links, oben-rechts, unten-rechts, unten-links) oder null.
export function eckenFinden(canvas) {
  const f = Math.min(1, 400 / Math.max(canvas.width, canvas.height))
  const w = Math.max(1, Math.round(canvas.width * f)), h = Math.max(1, Math.round(canvas.height * f))
  const k = document.createElement('canvas'); k.width = w; k.height = h
  const kx = k.getContext('2d'); kx.drawImage(canvas, 0, 0, w, h)
  const d = kx.getImageData(0, 0, w, h).data
  const lum = new Uint8Array(w * h)
  const hist = new Array(256).fill(0)
  // „Weiß-Anteil“ = kleinster Farbkanal: Papier ist in allen Kanälen hell, Holz/Tisch/Boden meist nicht (wenig Blau).
  // Danach leicht weichzeichnen (3×3), damit Schrift und Maserung die Fläche nicht zerreißen.
  const roh = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) roh[i] = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0, n = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) { sum += roh[yy * w + xx]; n++ }
    }
    const v = Math.round(sum / n); lum[y * w + x] = v; hist[v]++
  }
  // Otsu
  let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v]
  let sumB = 0, wB = 0, best = 0, schwelle = 128
  for (let v = 0; v < 256; v++) {
    wB += hist[v]; if (!wB) continue
    const wF = w * h - wB; if (!wF) break
    sumB += v * hist[v]
    const mB = sumB / wB, mF = (sum - sumB) / wF
    const zw = wB * wF * (mB - mF) * (mB - mF)
    if (zw > best) { best = zw; schwelle = v }
  }
  // größte helle zusammenhängende Fläche
  const markiert = new Int32Array(w * h).fill(-1)
  let groesste = null
  const stapel = new Int32Array(w * h)
  for (let start = 0; start < w * h; start++) {
    if (lum[start] <= schwelle || markiert[start] >= 0) continue
    let n = 0, top = 0
    stapel[top++] = start; markiert[start] = start
    const pts = { tl: [0, 0, Infinity], tr: [0, 0, -Infinity], br: [0, 0, -Infinity], bl: [0, 0, Infinity] }
    while (top) {
      const i = stapel[--top]; n++
      const x = i % w, y = (i / w) | 0
      if (x + y < pts.tl[2]) pts.tl = [x, y, x + y]
      if (x + y > pts.br[2]) pts.br = [x, y, x + y]
      if (x - y > pts.tr[2]) pts.tr = [x, y, x - y]
      if (x - y < pts.bl[2]) pts.bl = [x, y, x - y]
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
      for (const j of nb) if (j >= 0 && lum[j] > schwelle && markiert[j] < 0) { markiert[j] = start; stapel[top++] = j }
    }
    if (!groesste || n > groesste.n) groesste = { n, pts, start }
  }
  // Hysterese: von der gefundenen Fläche aus auch etwas dunklere Papierstellen (Schatten, Falz) mitnehmen,
  // damit Ecken im Schatten nicht nach innen rutschen
  if (groesste) {
    let sB = 0, nB = 0
    for (let i = 0; i < w * h; i++) if (lum[i] <= schwelle) { sB += lum[i]; nB++ }
    const weich = nB ? sB / nB + 0.5 * (schwelle - sB / nB) : schwelle
    const drin = new Uint8Array(w * h)
    let n = 0, top = 0
    stapel[top++] = groesste.start; drin[groesste.start] = 1
    const pts = { tl: [0, 0, Infinity], tr: [0, 0, -Infinity], br: [0, 0, -Infinity], bl: [0, 0, Infinity] }
    while (top) {
      const i = stapel[--top]; n++
      const x = i % w, y = (i / w) | 0
      if (x + y < pts.tl[2]) pts.tl = [x, y, x + y]
      if (x + y > pts.br[2]) pts.br = [x, y, x + y]
      if (x - y > pts.tr[2]) pts.tr = [x, y, x - y]
      if (x - y < pts.bl[2]) pts.bl = [x, y, x - y]
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
      for (const j of nb) if (j >= 0 && lum[j] > weich && !drin[j]) { drin[j] = 1; stapel[top++] = j }
    }
    // nur übernehmen, wenn das weichere Wachsen nicht in den Untergrund ausläuft
    if (n < groesste.n * 1.2) groesste = { n, pts, start: groesste.start }
  }
  // nur verwenden, wenn die Fläche plausibel groß ist und nicht das ganze Bild ausfüllt
  if (!groesste || groesste.n < w * h * 0.12 || groesste.n > w * h * 0.97) return null
  const p = groesste.pts
  const q = [p.tl, p.tr, p.br, p.bl]
  // Plausibilität: Ein Beleg füllt sein Viereck fast vollständig aus (Flächenvergleich, Gaußsche Trapezformel)
  let flaeche = 0
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; flaeche += a[0] * b[1] - b[0] * a[1] }
  flaeche = Math.abs(flaeche) / 2
  const fuellung = groesste.n / Math.max(1, flaeche)
  if (fuellung < 0.85 || fuellung > 1.1) return null
  return q.map(([x, y]) => ({ x: x / f, y: y / f }))
}

// Dokument-Filter für beste Lesbarkeit (wie „Dokument“ bei Scan-Apps):
// 1. Helligkeitsverlauf des Papiers schätzen (Schrift per Maximum-Filter entfernen, dann weichzeichnen)
// 2. jedes Pixel durch diesen Hintergrund teilen → gleichmäßig weißes Papier, Schatten verschwinden
// 3. Graustufen mit kräftiger Kontrastkurve → dunkle, scharfe Schrift, keine Farbstiche
export function dokumentFilter(canvas, S = 8, perz = 0.95) {
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const lum = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  // Hintergrund auf grobem Raster schätzen
  // S: Rastergröße der Hintergrundschätzung (fein genug, um harten Schattenkanten wie einer Hand zu folgen)
  const gw = Math.ceil(W / S), gh = Math.ceil(H / S)
  let g = new Float32Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    // hellster Wert der Zelle (90. Perzentil gegen Ausreißer) ≈ Papier
    const werte = []
    for (let y = gy * S; y < Math.min(H, gy * S + S); y += 2) for (let x = gx * S; x < Math.min(W, gx * S + S); x += 2) werte.push(lum[y * W + x])
    werte.sort((a, b) => a - b)
    g[gy * gw + gx] = werte[Math.floor(werte.length * perz)] || 255
  }
  // Maximum-Filter (Schrift und Linien größerer Zellen entfernen), dann zweimal glätten
  const filter = (src, fn) => {
    const out = new Float32Array(gw * gh)
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const v = []
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(gw - 1, Math.max(0, x + dx)), yy = Math.min(gh - 1, Math.max(0, y + dy))
        v.push(src[yy * gw + xx])
      }
      out[y * gw + x] = fn(v)
    }
    return out
  }
  g = filter(g, (v) => Math.max(...v))
  g = filter(g, (v) => v.reduce((a, b) => a + b, 0) / v.length)
  g = filter(g, (v) => v.reduce((a, b) => a + b, 0) / v.length)
  // bilinear auf volle Größe, teilen, Kontrastkurve
  for (let y = 0; y < H; y++) {
    const fy = Math.min(gh - 1.001, Math.max(0, y / S - 0.5)), y0 = Math.floor(fy), ty = fy - y0
    for (let x = 0; x < W; x++) {
      const fx = Math.min(gw - 1.001, Math.max(0, x / S - 0.5)), x0 = Math.floor(fx), tx = fx - x0
      const i0 = y0 * gw + x0
      const bg = (g[i0] * (1 - tx) + g[i0 + 1] * tx) * (1 - ty) + (g[i0 + gw] * (1 - tx) + g[i0 + gw + 1] * tx) * ty
      let r = lum[y * W + x] / Math.max(40, bg) // 1 = Papier, kleiner = Schrift
      r = Math.max(0, Math.min(1, (r - 0.45) / (0.84 - 0.45))) // Schwarz- und Weißpunkt (leichte Schattenränder werden weiß)
      const v = Math.round(255 * Math.pow(r, 1.6)) // Schrift kräftiger
      const o = (y * W + x) * 4
      d[o] = d[o + 1] = d[o + 2] = v
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// Textzeilen eines (zugeschnittenen) Belegs finden: Zeilen mit dunklen Pixeln zu Bändern zusammenfassen.
// Rückgabe: [{ y0, y1 }] in Pixeln
export function textzeilen(canvas) {
  const W = canvas.width, H = canvas.height
  const d = canvas.getContext('2d').getImageData(0, 0, W, H).data
  const dunkel = new Float32Array(H)
  for (let y = 0; y < H; y++) {
    let n = 0
    for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 140) n++ }
    dunkel[y] = n / (W / 2)
  }
  const baender = []
  let start = -1
  for (let y = 0; y <= H; y++) {
    const an = y < H && dunkel[y] > 0.004
    if (an && start < 0) start = y
    if (!an && start >= 0) { if (y - start >= 4) baender.push({ y0: start, y1: y }); start = -1 }
  }
  // sehr nahe Bänder (Unterlängen, Umlaute) zusammenführen
  const zus = []
  for (const b of baender) {
    const l = zus[zus.length - 1]
    if (l && b.y0 - l.y1 < Math.max(3, (l.y1 - l.y0) * 0.25)) l.y1 = b.y1
    else zus.push({ ...b })
  }
  return zus
}

// Bild mit roten Zeilennummern am linken Rand (für die KI), Rückgabe: { url, zeilen }
export async function nummeriertesBild(src) {
  const img = await ladeBild(src)
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  c.getContext('2d').drawImage(img, 0, 0)
  const zeilen = textzeilen(c)
  const rand = Math.round(c.width * 0.08)
  const o = document.createElement('canvas'); o.width = c.width + rand; o.height = c.height
  const x = o.getContext('2d')
  x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, rand, 0)
  x.fillStyle = '#e00'; x.textBaseline = 'middle'
  zeilen.forEach((z, i) => {
    x.font = 'bold ' + Math.max(12, Math.min(28, Math.round((z.y1 - z.y0) * 0.9))) + 'px sans-serif'
    x.fillText(String(i + 1), 4, (z.y0 + z.y1) / 2)
  })
  return { url: o.toDataURL('image/jpeg', 0.8), zeilen, breite: c.width, hoehe: c.height }
}
