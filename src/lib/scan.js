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

// Bild auf maximale Kantenlänge verkleinern → Canvas
export function verkleinern(img, max = 1600) {
  const f = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
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
  const f = Math.min(1, maxSeite / Math.max(W, H))
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
