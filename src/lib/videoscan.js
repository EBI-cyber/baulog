// Video-Scan für lange Belege: Handy langsam über den Beleg nach unten ziehen.
// Die App verfolgt die Verschiebung von Bild zu Bild, nimmt dabei scharfe Abschnitte auf
// und setzt sie zu einem langen Belegbild zusammen.

// Canvas/Video → Graustufenbild { w, h, d } in der Breite w
export function grau(quelle, w) {
  const qw = quelle.videoWidth || quelle.width, qh = quelle.videoHeight || quelle.height
  const h = Math.max(1, Math.round(qh * w / qw))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(quelle, 0, 0, w, h)
  const p = x.getImageData(0, 0, w, h).data
  const d = new Uint8Array(w * h)
  let summe = 0
  for (let i = 0; i < w * h; i++) { d[i] = (p[i * 4] * 77 + p[i * 4 + 1] * 150 + p[i * 4 + 2] * 29) >> 8; summe += d[i] }
  return { w, h, d, hell: summe / (w * h) }
}

// Schärfe: mittlerer Helligkeitssprung zwischen Nachbarpixeln (verwackelte Bilder haben weiche Kanten)
export function schaerfe(g) {
  const { w, h, d } = g
  let s = 0, n = 0
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const i = y * w + x
    s += Math.abs(d[i + 1] - d[i - 1]) + Math.abs(d[i + w] - d[i - w]); n++
  }
  return n ? s / n : 0
}

// Summentabelle (Integralbild) für schnelle Mittelwerte über Rechtecke
function summen(g) {
  if (g.sat) return g.sat
  const { w, h, d } = g, t = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let zeile = 0
    for (let x = 0; x < w; x++) { zeile += d[y * w + x]; t[(y + 1) * (w + 1) + x + 1] = t[y * (w + 1) + x + 1] + zeile }
  }
  g.sat = t
  return t
}
const mittel = (g, x0, y0, x1, y1) => {
  const t = summen(g), W = g.w + 1
  return (t[y1 * W + x1] - t[y0 * W + x1] - t[y1 * W + x0] + t[y0 * W + x0]) / Math.max(1, (x1 - x0) * (y1 - y0))
}

// Verschiebung von b gegenüber a: Inhalt an (x, y) in a liegt in b bei (x - dx, y - dy).
// Gesucht wird um die Schätzung (gx, gy) herum; Vergleich = mittlere absolute Differenz im gemeinsamen Bereich.
// Helligkeitsunterschiede (Kamera regelt die Belichtung nach) werden je Vergleich herausgerechnet.
// Rückgabe { dx, dy, fehler, eindeutig } – eindeutig = false bei leerem Papier ohne Struktur.
export function verschiebung(a, b, gx = 0, gy = 0, rx = 6, ry = 10) {
  const { w, h } = a
  const rand = Math.round(w * 0.06), schritt = w > 250 ? 3 : 2
  let best = null, zweit = Infinity, summe = 0, anzahl = 0
  for (let dy = Math.round(gy - ry); dy <= Math.round(gy + ry); dy++) {
    // gemeinsamer Bereich muss mindestens ein Viertel der Höhe sein
    const y0 = Math.max(rand, dy + rand), y1 = Math.min(h - rand, h + dy - rand)
    if (y1 - y0 < h * 0.25) continue
    for (let dx = Math.round(gx - rx); dx <= Math.round(gx + rx); dx++) {
      const x0 = Math.max(rand, dx + rand), x1 = Math.min(w - rand, w + dx - rand)
      if (x1 - x0 < w * 0.5) continue
      const k = mittel(a, x0, y0, x1, y1) - mittel(b, x0 - dx, y0 - dy, x1 - dx, y1 - dy)
      let s = 0, n = 0
      for (let y = y0; y < y1; y += schritt) {
        const ia = y * w, ib = (y - dy) * w - dx
        for (let x = x0; x < x1; x += schritt) { s += Math.abs(a.d[ia + x] - b.d[ib + x] - k); n++ }
      }
      const f = s / n
      summe += f; anzahl++
      if (!best || f < best.fehler) { if (best) zweit = Math.min(zweit, best.fehler); best = { dx, dy, fehler: f } }
      else zweit = Math.min(zweit, f)
    }
  }
  if (!best) return null
  // eindeutig, wenn das Minimum deutlich unter dem Durchschnitt liegt
  best.eindeutig = anzahl > 4 && best.fehler < (summe / anzahl) * 0.8
  return best
}

// Abschnitte zusammensetzen. abschnitte: [{ bild: Canvas, dx, dy }] – dx/dy = Versatz zum vorigen Abschnitt in Pixeln.
// Jeder Abschnitt wird ab der Mitte der Überlappung gezeichnet (dort ist das Bild am wenigsten verzerrt).
export function zusammensetzen(abschnitte) {
  const W = abschnitte[0].bild.width, H = abschnitte[0].bild.height
  const pos = []
  let x = 0, y = 0
  abschnitte.forEach((a, i) => { if (i) { x += a.dx; y += a.dy } pos.push({ x, y }) })
  const minX = Math.min(...pos.map((p) => p.x)), maxX = Math.max(...pos.map((p) => p.x))
  const out = document.createElement('canvas')
  out.width = Math.round(W + maxX - minX); out.height = Math.round(pos[pos.length - 1].y + H)
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, out.width, out.height)
  abschnitte.forEach((a, i) => {
    const schnitt = i ? Math.max(0, Math.round((H - a.dy) / 2)) : 0
    const px = Math.round(pos[i].x - minX), py = Math.round(pos[i].y)
    ctx.drawImage(a.bild, 0, schnitt, W, H - schnitt, px, py + schnitt, W, H - schnitt)
  })
  return out
}

// Versatz zweier Abschnitte genauer bestimmen (mittlere Auflösung, um die Schätzung aus der Verfolgung herum)
export function versatzVerfeinern(a, b, dx, dy) {
  // feiner als die Verfolgung, damit sich gleich aussehende Textzeilen unterscheiden lassen
  const B = Math.min(500, a.width), f = a.width / B
  const ga = grau(a, B), gb = grau(b, B)
  const v = verschiebung(ga, gb, dx / f, dy / f, 8, 16)
  if (!v || !v.eindeutig) return { dx, dy }
  return { dx: v.dx * f, dy: v.dy * f }
}

// Wo liegt das Papier im Bild? Spalten-Helligkeit im mittleren Bereich: Papier ist heller als der Untergrund.
// Rückgabe { links, rechts } als Anteile der Bildbreite, oder null, wenn der Untergrund zu hell ist (kein Kontrast).
export function papierSpalten(g) {
  const { w, h, d } = g
  const spalte = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    let s = 0, n = 0
    for (let y = Math.round(h * 0.2); y < h * 0.8; y += 2) { s += d[y * w + x]; n++ }
    spalte[x] = s / n
  }
  let lo = 255, hi = 0
  for (const v of spalte) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  if (hi - lo < 35) return null
  const schwelle = (lo + hi) / 2
  // längster zusammenhängender heller Bereich
  let best = null, start = -1
  for (let x = 0; x <= w; x++) {
    const hell = x < w && spalte[x] > schwelle
    if (hell && start < 0) start = x
    if (!hell && start >= 0) { if (!best || x - start > best.r - best.l) best = { l: start, r: x }; start = -1 }
  }
  return best ? { links: best.l / w, rechts: best.r / w } : null
}

// mittlere Helligkeit 0–255
export function helligkeit(g) {
  return g.hell
}

// Begleiter: aus Lage, Abstand, Tempo, Licht und Schärfe den wichtigsten Hinweis wählen.
// lage = { beta, gamma } in Grad (Handy flach mit Kamera nach unten ≈ 0/0) oder null
// papier = papierSpalten(...) oder null, tempo = Verschiebung je Bild als Anteil der Bildhöhe,
// scharf = Schärfe im Verhältnis zur besten bisher gesehenen (1 = so scharf wie das beste Bild)
// Rückgabe { text, stufe: 'gut' | 'achtung' | 'stopp', werte: { lage, abstand, tempo } }
export function begleiter({ lage, papier, tempo, hell, scharf, laeuft }) {
  const werte = { lage: 'gut', abstand: 'gut', tempo: 'gut' }
  const hinweise = []
  if (lage) {
    const neigung = Math.max(Math.abs(lage.beta), Math.abs(lage.gamma))
    if (neigung > 8) {
      werte.lage = neigung > 15 ? 'stopp' : 'achtung'
      hinweise.push({ text: 'Waagerecht halten – Punkt in die Mitte bringen', stufe: werte.lage, rang: 2 })
    }
  }
  if (papier) {
    const breite = papier.rechts - papier.links, mitte = (papier.links + papier.rechts) / 2
    if (papier.links < 0.01 && papier.rechts > 0.99) { werte.abstand = 'achtung'; hinweise.push({ text: 'Etwas höher halten – der Beleg muss ganz ins Bild', stufe: 'achtung', rang: 3 }) }
    else if (breite < 0.45) { werte.abstand = breite < 0.3 ? 'stopp' : 'achtung'; hinweise.push({ text: 'Näher an den Beleg heran', stufe: werte.abstand, rang: 3 }) }
    else if (Math.abs(mitte - 0.5) > 0.15) { werte.abstand = 'achtung'; hinweise.push({ text: mitte < 0.5 ? 'Handy etwas nach links' : 'Handy etwas nach rechts', stufe: 'achtung', rang: 4 }) }
  }
  if (laeuft && tempo != null) {
    if (tempo > 0.06) { werte.tempo = 'stopp'; hinweise.push({ text: 'Langsamer!', stufe: 'stopp', rang: 1 }) }
    else if (tempo > 0.035) { werte.tempo = 'achtung'; hinweise.push({ text: 'Etwas langsamer', stufe: 'achtung', rang: 1 }) }
    else if (tempo < -0.01) { werte.tempo = 'achtung'; hinweise.push({ text: 'Nach unten bewegen, nicht nach oben', stufe: 'achtung', rang: 1 }) }
  }
  if (hell < 70) hinweise.push({ text: 'Zu dunkel – Licht einschalten', stufe: 'achtung', rang: 5 })
  if (scharf != null && scharf < 0.5) hinweise.push({ text: 'Unscharf – ruhig halten, kurz warten', stufe: 'achtung', rang: 6 })
  hinweise.sort((a, b) => (a.stufe === 'stopp' ? 0 : 1) - (b.stufe === 'stopp' ? 0 : 1) || a.rang - b.rang)
  const h = hinweise[0]
  return { text: h ? h.text : (laeuft ? 'Gut so – gleichmäßig weiter nach unten' : 'Gut so – jetzt auf Start tippen'), stufe: h ? h.stufe : 'gut', werte }
}
