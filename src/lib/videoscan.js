// Video-Scan für lange Belege: Erst ein Übersichtsfoto des ganzen Belegs, dann das Handy langsam über den Beleg ziehen.
// Jedes Kamerabild wird in der Übersicht wiedergefunden. So weiß die App immer, welcher Teil gerade zu sehen ist,
// nimmt scharfe Abschnitte auf und setzt sie passend zur Übersicht zu einem langen Belegbild zusammen.

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
    const y0 = Math.max(rand, dy + rand), y1 = Math.min(h - rand, b.h + dy - rand)
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
  // Treffer am Rand des Suchbereichs: das wahre Minimum liegt wahrscheinlich außerhalb
  best.rand = Math.abs(best.dy - Math.round(gy)) >= ry || Math.abs(best.dx - Math.round(gx)) >= rx
  return best
}

// Bild um seine Mitte drehen (winkel im Bogenmaß, positiv = im Uhrzeigersinn), gleiche Größe, Ränder weiß
export function drehen(quelle, winkel) {
  const w = quelle.videoWidth || quelle.width, h = quelle.videoHeight || quelle.height
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d')
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h)
  x.translate(w / 2, h / 2); x.rotate(winkel); x.drawImage(quelle, -w / 2, -h / 2)
  return c
}

// Graustufen eines Bildbereichs (sx, sy, sw, sh in Pixeln der Quelle), auf Breite w skaliert
export function grauBereich(quelle, sx, sy, sw, sh, w) {
  const h = Math.max(1, Math.round(sh * w / sw))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(quelle, sx, sy, sw, sh, 0, 0, w, h)
  const p = x.getImageData(0, 0, w, h).data
  const d = new Uint8Array(w * h)
  let summe = 0
  for (let i = 0; i < w * h; i++) { d[i] = (p[i * 4] * 77 + p[i * 4 + 1] * 150 + p[i * 4 + 2] * 29) >> 8; summe += d[i] }
  return { w, h, d, hell: summe / (w * h) }
}

// Kamerabild-Streifen F (gleiche Breite wie die Übersicht O) in der Übersicht einpassen:
// Zeile 0 von F liegt bei Zeile y von O, um dx Spalten verschoben. F darf über Anfang/Ende des Belegs hinausragen,
// mindestens 40 % von F müssen aber auf dem Beleg liegen. Rückgabe { y, dx, fehler, eindeutig, rand } oder null.
// band = [von, bis] (Anteile der Höhe von F): nur diese Zeilen vergleichen. Ein Band in der Bildmitte ist
// unempfindlich gegen kleine Maßstabsfehler (Abstand zum Beleg ändert sich beim Ziehen leicht).
export function einpassen(O, F, ymin, ymax, rx = 2, band = [0, 1]) {
  const w = O.w, rand = Math.round(w * 0.05), schritt = w > 150 ? 3 : 2
  const bA = Math.round(F.h * band[0]), bB = Math.round(F.h * band[1])
  let best = null, summe = 0, anzahl = 0
  const y0 = Math.round(ymin), y1 = Math.round(ymax)
  for (let y = y0; y <= y1; y++) {
    const j0 = Math.max(bA, -y), j1 = Math.min(bB, O.h - y)
    if (j1 - j0 < (bB - bA) * 0.4) continue
    for (let dx = -rx; dx <= rx; dx++) {
      const x0 = Math.max(rand, rand + dx), x1 = Math.min(w - rand, w - rand + dx)
      const k = mittel(O, x0, y + j0, x1, y + j1) - mittel(F, x0 - dx, j0, x1 - dx, j1)
      let s = 0, n = 0
      for (let j = j0; j < j1; j += schritt) {
        const io = (y + j) * w, iF = j * w - dx
        for (let x = x0; x < x1; x += schritt) { s += Math.abs(O.d[io + x] - F.d[iF + x] - k); n++ }
      }
      const f = s / n
      summe += f; anzahl++
      if (!best || f < best.fehler) best = { y, dx, fehler: f }
    }
  }
  if (!best) return null
  best.eindeutig = anzahl > 4 && best.fehler < (summe / anzahl) * 0.8
  best.mittel = summe / anzahl
  best.rand = best.y <= y0 || best.y >= y1 // Treffer am Rand des Suchbereichs: wahrscheinlich daneben
  return best
}

// Abschnitte anhand ihrer Lage in der Übersicht zu einem Bild zusammensetzen.
// abschnitte: [{ bild: Canvas (volles Kamerabild), l, r (Papierränder 0–1), y (Oberkante in Übersichtszeilen), hO (Höhe in Übersichtszeilen) }]
// uebersicht: Canvas des zugeschnittenen Übersichtsfotos, WR = Breite der Übersicht in der Verfolgung.
// Nachbarn werden in höherer Auflösung genau aneinander ausgerichtet; Lücken füllt das (unschärfere) Übersichtsfoto.
export function zusammensetzenUebersicht(abschnitte, uebersicht, WR, HO) {
  const a = [...abschnitte].sort((p, q) => p.y - q.y).map((x) => ({ ...x, xoff: 0 }))
  // Jeden Abschnitt zuerst für sich im Übersichtsfoto einpassen: Maßstab und Lage. Der Papierrand im Kamerabild wird
  // oft zu knapp oder zu breit erkannt; dann wäre der Abschnitt vergrößert und liefe über die Zuschnittlinien hinaus
  // (Kopf, Ende und Seiten des Belegs fehlten). Maßgeblich sind die Linien des Übersichtsfotos.
  const O = grau(uebersicht, WR)
  const passung = (x, f, y0, y1) => {
    const c = (x.l + x.r) / 2 * x.bild.width, b = (x.r - x.l) * f * x.bild.width
    const F = grauBereich(x.bild, c - b / 2, 0, b, x.bild.height, WR)
    const r = einpassen(O, F, y0, y1, 3, [0.05, 0.95])
    return r && { f, r, h: F.h }
  }
  a.forEach((x) => {
    const R = Math.max(15, x.hO * 0.3)
    let best = null
    for (let f = 0.8; f <= 1.25 + 1e-9; f += 0.025) { const p = passung(x, f, x.y - R, x.y + R); if (p && (!best || p.r.fehler < best.r.fehler)) best = p }
    if (!best) return
    for (let f = best.f - 0.02; f <= best.f + 0.02 + 1e-9; f += 0.005) { const p = passung(x, f, best.r.y - 4, best.r.y + 4); if (p && p.r.fehler < best.r.fehler) best = p }
    const c = (x.l + x.r) / 2, b = (x.r - x.l) * best.f
    x.l = c - b / 2 - best.r.dx / WR * b; x.r = x.l + b
    x.y = best.r.y; x.hO = best.h; x.yUeb = best.r.y
  })
  const breiten = a.map((x) => (x.r - x.l) * x.bild.width).sort((p, q) => p - q)
  const Wout = Math.round(Math.min(1100, breiten[Math.floor(breiten.length / 2)]))
  const s = Wout / WR, M = 400
  // Papierstreifen eines Abschnitts auf Breite M (f = Ausschnitt breiter/schmaler, d. h. Maßstab korrigieren)
  const streifen = (x, f = 1) => {
    const c = (x.l + x.r) / 2 * x.bild.width, b = (x.r - x.l) * f * x.bild.width
    return grauBereich(x.bild, c - b / 2, 0, b, x.bild.height, M)
  }
  // Nachbarn in der Überlappung genau aufeinanderlegen (Lage und seitlicher Versatz): die Übersicht ist nur auf
  // wenige Pixel genau – das reicht nicht für saubere Nähte. Der Maßstab bleibt, und die Lage darf nur wenig von
  // der Übersicht abweichen, sonst würden sich kleine Fehler von Abschnitt zu Abschnitt aufsummieren.
  for (let i = 1; i < a.length; i++) {
    const p = a[i - 1], q = a[i]
    if (q.y > p.y + p.hO * 0.85) continue // kaum Überlappung
    const v = verschiebung(streifen(p), streifen(q), 0, (q.y - p.y) * M / WR, 6, 12)
    if (!v || v.rand) continue
    const y = p.y + v.dy * WR / M
    if (q.yUeb != null && Math.abs(y - q.yUeb) > 3) continue
    q.y = y; q.xoff = Math.max(-Wout * 0.02, Math.min(Wout * 0.02, p.xoff + v.dx * Wout / M))
  }
  // genau bis zu den Zuschnittlinien des Übersichtsfotos (die Abschnitte sind oben darauf eingepasst)
  const out = document.createElement('canvas')
  out.width = Wout; out.height = Math.round(HO * s)
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(uebersicht, 0, 0, out.width, out.height)
  a.forEach((x, i) => {
    const k = x.hO / x.bild.height // Übersichtszeilen je Kamerapixel
    let oben = 0
    if (i) { const p = a[i - 1], ende = Math.min(p.y + p.hO, x.y + x.hO); if (ende > x.y) oben = ((x.y + ende) / 2 - x.y) / k }
    const sx = x.l * x.bild.width, sw = (x.r - x.l) * x.bild.width
    ctx.drawImage(x.bild, sx, oben, sw, x.bild.height - oben, Math.round(x.xoff), (x.y + oben * k) * s, Wout, (x.bild.height - oben) * k * s)
  })
  return out
}

// Abschnitte für die KI auswählen: möglichst wenige, die den Beleg von oben nach unten mit Überlappung abdecken.
// Die KI liest dann die einzelnen scharfen Kamerabilder statt des zusammengesetzten Bildes – eine schiefe Naht
// kann so keine Zeile verschlucken oder verdoppeln. Rückgabe: Papierstreifen als Canvas, leer bei mehr als max Stück.
export function kiAbschnitte(abschnitte, HO, max = 8) {
  const a = [...abschnitte].sort((p, q) => p.y - q.y)
  if (!a.length) return []
  const gewaehlt = []
  let bis = 0
  while (bis < HO * 0.995) {
    const frei = a.filter((x) => !gewaehlt.includes(x) && x.y + x.hO > bis + 2)
    if (!frei.length) break
    // bevorzugt mit deutlicher Überlappung (eine angeschnittene Zeile steht im nächsten Bild ganz), sonst lückenlos
    const ueber = gewaehlt.length ? x => x.y <= bis - x.hO * 0.12 : x => x.y <= x.hO * 0.1
    const k = frei.filter(ueber).length ? frei.filter(ueber) : frei.filter((x) => x.y <= bis)
    // sonst bleibt eine Lücke: dann der nächste Abschnitt darunter
    const n = k.length ? k.reduce((p, q) => (q.y + q.hO > p.y + p.hO ? q : p)) : frei[0]
    gewaehlt.push(n)
    bis = Math.max(bis, n.y + n.hO)
  }
  // zu viele für einen KI-Auftrag: dann liest die KI lieber Stücke des Gesamtbildes (Ausdünnen ließe Lücken)
  if (gewaehlt.length > max) return []
  return gewaehlt.map((x) => {
    const rand = (x.r - x.l) * 0.03
    const x0 = Math.max(0, Math.floor((x.l - rand) * x.bild.width)), x1 = Math.min(x.bild.width, Math.ceil((x.r + rand) * x.bild.width))
    const c = document.createElement('canvas'); c.width = x1 - x0; c.height = x.bild.height
    c.getContext('2d').drawImage(x.bild, x0, 0, c.width, c.height, 0, 0, c.width, c.height)
    return c
  })
}

// Wo liegt das Papier im Bild? Spalten-Helligkeit im mittleren Bereich: Papier ist heller als der Untergrund.
// Rückgabe { links, rechts } als Anteile der Bildbreite, oder null, wenn der Untergrund zu hell ist (kein Kontrast).
// von/bis: ausgewerteter Höhenbereich (Anteile), z. B. oben und unten getrennt, um Schräglage zu erkennen.
export function papierSpalten(g, von = 0.2, bis = 0.8) {
  const { w, h, d } = g
  // je Spalte eine helle Stelle (75. Perzentil) statt des Mittelwerts: Bons sind bis an den Rand bedruckt, und dichte
  // Schrift machte die Randspalten im Mittel so dunkel, dass das Papier zu schmal erkannt wurde (Bild dann vergrößert)
  const spalte = new Float32Array(w), werte = []
  for (let x = 0; x < w; x++) {
    werte.length = 0
    for (let y = Math.round(h * von); y < h * bis; y += 2) werte.push(d[y * w + x])
    werte.sort((a, b) => a - b)
    spalte[x] = werte[Math.floor(werte.length * 0.75)] || 0
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
  }
  if (hell < 70) hinweise.push({ text: 'Zu dunkel – Licht einschalten', stufe: 'achtung', rang: 5 })
  if (scharf != null && scharf < 0.5) hinweise.push({ text: 'Unscharf – ruhig halten, kurz warten', stufe: 'achtung', rang: 6 })
  hinweise.sort((a, b) => (a.stufe === 'stopp' ? 0 : 1) - (b.stufe === 'stopp' ? 0 : 1) || a.rang - b.rang)
  const h = hinweise[0]
  return { text: h ? h.text : (laeuft ? 'Gut so – weiter, bis die Leiste rechts ganz grün ist' : 'Gut so – jetzt auf Start tippen'), stufe: h ? h.stufe : 'gut', werte }
}

// Verfolgung über das Übersichtsfoto. uebersicht = zugeschnittenes Foto des ganzen Belegs (Canvas).
// schritt(quelle, t, aufnehmen, vollbild) einmal je Kamerabild aufrufen:
//   quelle = Video oder Canvas, t = Zeit in ms, aufnehmen = ob Abschnitte gesammelt werden,
//   vollbild() = liefert das aktuelle Kamerabild als Canvas in voller Auflösung.
// Rückgabe: Lage im Beleg, Abdeckung und Werte für den Begleiter.
export function verfolger(uebersicht) {
  const SPUR = 320, BAND = [0.3, 0.7]
  const WR = Math.min(200, uebersicht.width)
  const O = grau(uebersicht, WR), HO = O.h
  const bedeckt = new Uint8Array(HO)
  const z = { winkel: 0, f: 1, y: null, hO: 0, v: 0, unsicher: 9, lr: null, letzteSuche: -1e9, bestScharf: 0, abschnitte: [] }
  // Papierbereich des Kamerabilds auf Übersichtsbreite bringen (f = Breite strecken/stauchen)
  const streifen = (q, lr, f = 1) => {
    const qw = q.videoWidth || q.width, qh = q.videoHeight || q.height
    const c = (lr.links + lr.rechts) / 2, b = (lr.rechts - lr.links) * f
    return grauBereich(q, (c - b / 2) * qw, 0, b * qw, qh, WR)
  }
  const streifenHoehe = (q, lr, f) => {
    const qw = q.videoWidth || q.width, qh = q.videoHeight || q.height
    return Math.max(1, Math.round(qh * WR / ((lr.rechts - lr.links) * f * qw)))
  }
  // Maßstab f (Breite des Papierausschnitts) um f0 ± spanne durchprobieren, Lage um y ± ry: bester Treffer
  const skalieren = (q, y, f0, spanne, ry, stufe = 0.02) => {
    let best = null
    for (let f = f0 - spanne; f <= f0 + spanne + 1e-9; f += stufe) {
      const F = streifen(q, z.lr, f), r = einpassen(O, F, y - ry, y + ry, 2, [0.05, 0.95])
      if (r && (!best || r.fehler < best.r.fehler)) best = { f, r, h: F.h }
    }
    return best
  }
  const abdeckung = () => { let n = 0; for (let i = 0; i < HO; i++) n += bedeckt[i]; return n / HO }
  // Zeilen, die ein Abschnitt ab y mit Höhe h abdeckt (an den Bildrändern nicht ganz bis zum Rand). Anfang und Ende
  // des Belegs zählen nur, wenn das Kamerabild wirklich bis dorthin reicht – sonst fehlten die letzten Zeilen.
  const bereich = (y, h) => [y <= 2 ? 0 : Math.max(0, Math.round(y + h * 0.08)), y + h >= HO - 2 ? HO : Math.min(HO, Math.round(y + h * 0.92))]

  function schritt(q, t, aufnehmen, vollbild) {
    let g = grau(q, SPUR)
    // Schräglage: Papiermitte oben und unten vergleichen; liegt der Beleg schräg im Bild, das Bild gerade drehen
    const oben = papierSpalten(g, 0.15, 0.35), unten = papierSpalten(g, 0.65, 0.85)
    if (oben && unten && Math.abs((oben.rechts - oben.links) - (unten.rechts - unten.links)) < 0.08 && oben.rechts - oben.links > 0.15) {
      const dx = ((unten.links + unten.rechts) - (oben.links + oben.rechts)) / 2 * g.w, dy = 0.5 * g.h
      z.winkel = z.winkel * 0.6 + Math.atan2(dx, dy) * 0.4
    }
    if (Math.abs(z.winkel) > 0.004) {
      const gedreht = drehen(q, z.winkel)
      q = gedreht; vollbild = () => gedreht
      g = grau(q, SPUR)
    }
    const s = schaerfe(g)
    z.bestScharf = Math.max(z.bestScharf * 0.995, s)
    const p = papierSpalten(g)
    if (p && p.rechts - p.links > 0.15) z.lr = z.lr ? { links: z.lr.links * 0.6 + p.links * 0.4, rechts: z.lr.rechts * 0.6 + p.rechts * 0.4 } : p
    let m = null
    if (z.lr) {
      const F = streifen(q, z.lr, z.f)
      let ok = false
      z.perBewegung = false
      // 1) Bewegung seit dem letzten Bild im Kamerabild selbst messen (volle Schärfe, kleine Schritte: eindeutig,
      //    auch wenn viele Artikel gleich aussehen). Die Übersicht korrigiert danach nur noch langsames Abdriften.
      if (z.y != null && z.unsicher === 0 && z.gAlt && z.gAlt.h === g.h && z.hO) {
        const v = verschiebung(z.gAlt, g, 0, z.vPix || 0, 3, 14)
        if (v && !v.rand && v.eindeutig && v.fehler < (z.refPix || Infinity) * 1.5) {
          z.refPix = z.refPix ? z.refPix * 0.8 + v.fehler * 0.2 : v.fehler
          const vor = z.y + v.dy * z.hO / g.h
          // passt die Übersicht dort nicht (bestes Ergebnis am Rand), war die Bewegung falsch gemessen (Wackler)
          // Bestätigt die Übersicht nicht, trotzdem der gemessenen Bewegung folgen: die Vergleichsgüte schwankt mit dem
          // Inhalt (Kopf mit viel Weiß passt besser als dichte Textzeilen), sonst bliebe die Lage stehen und die
          // Verfolgung hinkte hinterher. Erst nach längerer Zeit ohne Bestätigung darf die Suche im ganzen Beleg korrigieren.
          const d = einpassen(O, F, vor - 4, vor + 4, 2, [0.1, 0.9])
          const bestaetigt = d && !d.rand && d.fehler < z.refFehler * 1.5
          z.ohneUeb = bestaetigt ? 0 : (z.ohneUeb || 0) + 1
          z.vPix = v.dy
          m = bestaetigt ? { y: vor * 0.7 + d.y * 0.3, fehler: d.fehler } : { y: vor, fehler: d && !d.rand ? d.fehler : z.refFehler }
          ok = true; z.perBewegung = z.ohneUeb < 15
        }
      }
      // 2) sonst in der Übersicht nahe der erwarteten Lage suchen (passt, wenn ähnlich gut wie bisher). Die Vorhersage
      //    über das Tempo ist begrenzt, damit sie bei gleich aussehenden Textzeilen nicht davonläuft.
      if (!ok && z.y != null && z.unsicher < 6) {
        const vor = z.y + Math.max(-12, Math.min(12, z.v))
        m = einpassen(O, F, vor - 20, vor + 20, 2, [0.1, 0.9])
        ok = m && !m.rand && (m.eindeutig || m.fehler < z.refFehler * 1.2)
      }
      // sonst höchstens alle 350 ms (zur Kontrolle jede Sekunde) im ganzen Beleg suchen. Dafür nur die Bildmitte
      // vergleichen, die ist unempfindlich gegen einen noch ungenauen Maßstab; danach den Maßstab bestimmen.
      if (t - z.letzteSuche > (ok ? 1000 : 350)) {
        z.letzteSuche = t
        let g2 = einpassen(O, F, -F.h * 0.6, HO - F.h * 0.4, 1, BAND)
        // im ganzen Beleg strenger: der Treffer muss sich klar vom Rest abheben
        if (g2 && g2.fehler > g2.mittel * 0.78) g2.eindeutig = false
        // Beim ersten Finden: man beginnt oben am Beleg. Passt es oben fast genauso gut, gilt oben –
        // weiter unten sieht bei langen Bons vieles gleich aus.
        // Danach gilt dasselbe für die zuletzt bekannte Lage: lieber in der Nähe weitermachen als springen.
        if (g2 && !ok) {
          const nahe = z.y == null ? 0 : z.y, r = F.h * 0.5
          const o = einpassen(O, F, Math.max(-F.h * 0.6, nahe - r), Math.min(HO - F.h * 0.4, nahe + r), 1, BAND)
          if (o && !o.rand && o.fehler <= g2.fehler * 1.15) g2 = { ...o, eindeutig: true }
        }
        if (g2 && g2.eindeutig && (!ok || (!z.perBewegung && Math.abs(g2.y - m.y) > 10 && g2.fehler < z.refBand * 0.85))) {
          const sk = skalieren(q, g2.y, 1, 0.06, 8)
          if (!ok || sk.r.fehler < m.fehler * 0.9) { m = sk.r; z.f = sk.f; ok = true; z.sprung = t }
        }
        if (g2 && g2.eindeutig) z.refBand = z.refBand ? z.refBand * 0.7 + g2.fehler * 0.3 : g2.fehler
      }
      if (ok) {
        z.refFehler = z.refFehler ? z.refFehler * 0.8 + m.fehler * 0.2 : m.fehler
        z.v = z.y != null && z.unsicher === 0 ? (z.v + (m.y - z.y)) / 2 : 0
        z.y = m.y; z.hO = streifenHoehe(q, z.lr, z.f); z.unsicher = 0
      } else { z.unsicher++; z.vPix = 0 }
      z.gAlt = g
    } else z.unsicher++
    let neu = false
    // erst aufnehmen, wenn die Lage nach einem Sprung ein paar Bilder lang bestätigt ist
    if (aufnehmen && z.unsicher === 0 && t - (z.sprung || -1e9) > 200) {
      const [a, e] = bereich(z.y, z.hO)
      let frei = 0
      for (let i = a; i < e; i++) if (!bedeckt[i]) frei++
      const anteil = frei / z.hO
      // eine Lücke, die dieses Bild ganz schließt (oben und unten schon erfasst)
      const schliesst = frei >= 3 && z.abschnitte.length > 0 && (a === 0 || bedeckt[a - 1] || bedeckt[a]) && (e === HO || bedeckt[e] || bedeckt[e - 1]) && s >= z.bestScharf * 0.8
      if ((anteil >= 0.35 && (s >= z.bestScharf * 0.75 || anteil >= 0.55)) || (!z.abschnitte.length && anteil > 0.2) || schliesst) {
        // Gegenprobe im ganzen Beleg: nur aufnehmen, wenn die Lage eindeutig dort ist
        // Ausnahmen: die Bewegung wurde von Bild zu Bild sicher verfolgt, oder es ist der Anfang oben am Beleg
        // (dort beginnt man laut Anleitung). Beim Zusammensetzen wird jeder Abschnitt ohnehin noch einmal genau in
        // der Übersicht eingepasst, und die KI liest die Abschnitte einzeln – eine strenge Gegenprobe ließ oben Lücken.
        const vertraut = z.perBewegung || (!z.abschnitte.length && z.y <= z.hO * 0.3)
        if (!vertraut) {
          const probe = einpassen(O, streifen(q, z.lr, z.f), -z.hO * 0.6, HO - z.hO * 0.4, 1, BAND)
          if (!probe || !probe.eindeutig) return zustandMelden(g, s, p, false)
          // weicht sie ab, lieber nicht aufnehmen: bei gleich aussehenden Artikeln irrt eher die Gegenprobe in der kleinen
          // Übersicht als die Verfolgung von Bild zu Bild (ein falscher Abschnitt verdoppelt oder verschluckt Zeilen)
          if (Math.abs(probe.y - z.y) > 10) return zustandMelden(g, s, p, false)
        }
        // Maßstab und seitliche Lage genauer bestimmen
        const best = skalieren(q, z.y, Math.max(0.95, Math.min(1.05, z.f)), 0.03, 5, 0.01)
        const b = (z.lr.rechts - z.lr.links) * best.f
        const c = (z.lr.links + z.lr.rechts) / 2 - (best.r.dx / WR) * b
        // nur den Papierstreifen (mit etwas Rand) aufheben, das spart Speicher auf dem Handy
        const voll = vollbild(), x0 = Math.max(0, Math.floor((c - b / 2 - 0.04) * voll.width)), x1 = Math.min(voll.width, Math.ceil((c + b / 2 + 0.04) * voll.width))
        const bild = document.createElement('canvas'); bild.width = x1 - x0; bild.height = voll.height
        bild.getContext('2d').drawImage(voll, x0, 0, bild.width, bild.height, 0, 0, bild.width, bild.height)
        const ab = { bild, l: ((c - b / 2) * voll.width - x0) / bild.width, r: ((c + b / 2) * voll.width - x0) / bild.width, y: best.r.y, hO: best.h }
        z.abschnitte.push(ab)
        const [a2, e2] = bereich(ab.y, ab.hO)
        for (let i = a2; i < e2; i++) bedeckt[i] = 1
        neu = true
      }
    }
    return zustandMelden(g, s, p, neu)
  }
  function zustandMelden(g, s, p, neu) {
    // Lücke: weiter oben fehlt etwas, obwohl darunter schon aufgenommen wurde
    let luecke = false
    if (z.y != null && z.abschnitte.length) {
      for (let i = 0; i < Math.min(HO, z.y); i++) if (!bedeckt[i]) { luecke = true; break }
    }
    return {
      y: z.y, hO: z.hO, HO, sicher: z.unsicher === 0, verloren: z.unsicher > 6, neu, abdeckung: abdeckung(), luecke,
      // Anfang und Ende des Belegs scharf erfasst (sonst kämen sie aus dem unschärferen Übersichtsfoto)
      endenErfasst: Boolean(bedeckt[0] && bedeckt[HO - 1]),
      tempo: z.hO ? z.v / z.hO : null, papier: p, hell: g.hell, scharf: z.bestScharf ? s / z.bestScharf : null,
      abschnitte: z.abschnitte.length,
    }
  }
  // bedeckte Bereiche als Liste [von, bis] in Anteilen 0–1 (für die Mini-Karte)
  function bereiche() {
    const out = []
    let start = -1
    for (let i = 0; i <= HO; i++) {
      const b = i < HO && bedeckt[i]
      if (b && start < 0) start = i
      if (!b && start >= 0) { out.push([start / HO, i / HO]); start = -1 }
    }
    return out
  }
  return { schritt, bereiche, zusammensetzen: () => zusammensetzenUebersicht(z.abschnitte, uebersicht, WR, HO), anzahl: () => z.abschnitte.length, abschnitte: () => z.abschnitte, kiAbschnitte: (max) => kiAbschnitte(z.abschnitte, HO, max) }
}
