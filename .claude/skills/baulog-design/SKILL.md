---
name: baulog-design
description: BauLog-Design-System — dunkles Glas-UI mit lucide-Icons, IconChips, responsiver Sidebar+Bottom-Nav, Gradient-Buttons und zentrierten Desktop-Modals. Anwenden beim Bauen oder Umstylen von UI/Screens/Komponenten in den Vite+React+Tailwind-PWAs (BauLog, Quitto, BadProfi) — also wann immer es ums Aussehen, Layout, Icons, Karten, Navigation oder „professioneller/moderner machen" geht. Die Struktur ist appübergreifend gleich; nur die Akzentfarbe (Gradient) ist pro App ein Theme-Parameter.
---

# BauLog-Design-System

Ein dunkles, modernes „Glassmorphism"-UI. **Struktur ist appübergreifend identisch**, nur die
**Akzentfarbe** (ein 2-Farben-Gradient) unterscheidet die Apps:

| App | Gradient (Akzent) | Tailwind-Farben |
|---|---|---|
| BauLog | `#f59e0b → #ef4444` (amber→ember) | `amber`, `ember` |
| Quitto | `#7c5cff → #22d3ee` (neon→aqua) | `neon`, `aqua`, `acid` |
| (neu)  | frei wählbar | im `tailwind.config.js` ergänzen |

Grundregeln: dunkler Verlaufs-Hintergrund, **Glas-Karten** (`.glass`), **echte SVG-Icons (lucide-react)
statt Emoji**, abgerundete Ecken (`rounded-2xl/3xl/4xl`), Hover-Lift, **Gradient nur für Akzente/CTAs**.

## 1) Setup pro Projekt
```bash
npm install lucide-react
```

`tailwind.config.js` → `theme.extend`: Akzentfarben + `boxShadow.glow` + `borderRadius['4xl']`.

`src/index.css` (in `@layer components` ergänzen — Gradient an die App-Farben anpassen):
```css
@layer components {
  .glass { background: rgba(255,255,255,.045); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.09); }
  .grad-text { background-image: linear-gradient(90deg, <C1>, <C2>); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .btn-grad { background-image: linear-gradient(135deg, <C1> 0%, <C2> 100%); color: #0c0a09; }
  .card-hover { transition: transform .16s ease, background .2s ease, border-color .2s ease; }
  .card-hover:hover { background: rgba(255,255,255,.075); border-color: rgba(255,255,255,.16); transform: translateY(-2px); }
  .icon-chip { background: rgba(<C1-rgb>,.12); border: 1px solid rgba(<C1-rgb>,.22); color: <C1-hell>; }
}
/* dezente Scrollbar */
* { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.16) transparent; }
*::-webkit-scrollbar { width: 11px; height: 11px; }
*::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 10px; border: 3px solid transparent; background-clip: content-box; }
```

Mobil (PWA): `viewport-fit=cover`, Safe-Areas berücksichtigen — `#root { padding-top: env(safe-area-inset-top); }`,
Bottom-Bar/Aktionsleisten `pb-[max(0.75rem,env(safe-area-inset-bottom))]`, `html,body { overflow-x: hidden; }`.
Vollbild-Flows (mehrstufige Formulare) **ohne** Bottom-Bar rendern, damit Buttons nicht überlappt werden.

## 2) IconChip (`src/ui/IconChip.jsx`) — getöntes Icon-Plättchen, überall genutzt
```jsx
export default function IconChip({ icon: I, size = 'w-10 h-10', iconClass = 'w-5 h-5', variant = 'tint', className = '' }) {
  const look = variant === 'grad' ? 'btn-grad shadow-glow'
    : variant === 'plain' ? 'bg-white/[0.06] border border-white/10 text-white/70'
    : 'icon-chip'
  return <div className={'shrink-0 rounded-xl flex items-center justify-center ' + size + ' ' + look + ' ' + className}>
    <I className={iconClass} strokeWidth={1.9} /></div>
}
```

## 2b) MoneyChip (`src/ui/MoneyChip.jsx`) — Profi-Finanz-Badge
Für Einnahme/Ausgabe (Geld rein/raus): **gefüllter Gradient-Kreis** mit weißem Trend-Icon, Glow + Lichtrand.
```jsx
import { TrendingUp, TrendingDown } from 'lucide-react'
export default function MoneyChip({ income, size = 'w-11 h-11', iconClass = 'w-5 h-5' }) {
  const I = income ? TrendingUp : TrendingDown
  const look = income
    ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_8px_24px_-8px_rgba(16,185,129,.95)]'
    : 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-[0_8px_24px_-8px_rgba(244,63,94,.95)]'
  return <div className={'shrink-0 rounded-full flex items-center justify-center text-white ring-1 ring-inset ring-white/25 ' + size + ' ' + look}>
    <I className={iconClass} strokeWidth={2.6} /></div>
}
```
Regel: **Einnahme = grün, Pfeil hoch · Ausgabe = rot, Pfeil runter.** Beträge `tabular-nums`, grün (`emerald-400`) / rot (`rose-400`).

## 3) Icons (lucide-react) — Konventionen
- Import direkt: `import { Clock, Plus, ... } from 'lucide-react'`.
- `strokeWidth` 1.75–1.9 (Standard), 2.2 für Logo/Brand. Größen via `className="w-5 h-5"`.
- **Niemals Emoji als Bedien-Icon.** Gängige Zuordnung:
  Zeit `Clock` · Geld/Kosten `Wallet`/`BadgeEuro` · Material `Package` · Maschine/Werkzeug `Wrench` ·
  Menge/Maß `Ruler` · Foto `Camera` · Notiz/Tagebuch `NotebookPen` · KI `Sparkles` · Start `Play` ·
  Pause `Pause` · Stopp `Square` · Plus `Plus` · Löschen/Schließen `X` · Zurück `ChevronLeft` ·
  Team `Users`/`UserPlus`/`HardHat` · PDF/Doc `FileText` · Senden `Send` · Sync `RefreshCw` ·
  Abmelden `LogOut` · Einstellungen `Settings` · Auswertung `BarChart3` · Liste/Projekte `LayoutGrid`/`FolderKanban` ·
  Einnahme/Plus `TrendingUp` (grün) · Ausgabe/Minus `TrendingDown` (rot).

## 4) Responsive Navigation (Sidebar Desktop + Bottom-Bar Mobile)
Eine `Nav`-Komponente rendert **beide**: `<aside className="hidden md:flex ...">` (Sidebar, sticky, links,
Logo-Badge `btn-grad` + Links mit Icon) UND `<nav className="md:hidden fixed bottom-0 ...">` (Bottom-Bar,
zentriert, `max-w-md`, Icon über Label). Aktiver Link: voll deckend; inaktiv `text-white/45`.

## 5) App-Layout
```jsx
function Layout({ children }) {
  return (
    <div className="md:flex min-h-[100dvh]">
      <Nav />
      <main className="flex-1 min-w-0 pb-28 md:pb-12">
        <div className="max-w-6xl mx-auto w-full">{children}</div>
      </main>
    </div>
  )
}
```
- Listen/Übersichten füllen Desktop: `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`.
- Detail-/Formular-Screens zentriert begrenzen: `max-w-2xl` bzw. `max-w-3xl`.
- Detailseiten dürfen 2-spaltig werden: `lg:grid lg:grid-cols-12 lg:gap-6` (z.B. 5/7).
- Gegen Abschneiden auf Mobile: in Flex-Zeilen das flexible Element `min-w-0` + `truncate`, fixe Elemente `shrink-0`.

## 6) Bausteine
- **Karte:** `glass rounded-3xl p-5`; klickbar → zusätzlich `card-hover active:scale-[0.99]`.
- **Stat-Kachel:** `glass rounded-3xl p-4 flex items-center gap-3` + `IconChip` + Label(`text-white/40 text-xs`) + Wert(`font-bold`, Akzent via `grad-text`).
- **Primär-Button (CTA):** `rounded-2xl py-3 font-bold btn-grad`; mit Icon: `inline-flex items-center justify-center gap-2`.
- **Sekundär:** `bg-white/10 text-white rounded-2xl`. **Destruktiv:** `text-white/30 hover:text-ember/red`.
- **Eingaben:** `w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-<akzent>`.
- **Chips/Tags (Auswahl):** `px-2.5 py-1 rounded-full text-xs border` — aktiv `btn-grad`/Akzent, sonst `border-white/15 text-white/60`.
- **Überschrift Screen:** `text-3xl md:text-4xl font-extrabold grad-text tracking-tight`.

## 7) Modals / Sheets (mobil unten, Desktop zentriert)
```jsx
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-30" onClick={onClose}>
  <div className="glass w-full max-w-md mx-auto rounded-t-4xl md:rounded-4xl p-6 space-y-3 m-0 md:m-4 max-h-[90dvh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
    <div className="text-lg font-bold flex items-center gap-2.5"><IconChip icon={SomeIcon} size="w-9 h-9" iconClass="w-[18px] h-[18px]" /> Titel</div>
    …
  </div>
</div>
```
Status-Banner: Fehler `bg-ember/15 border-ember/30 text-ember`, Erfolg `bg-lime/15 border-lime/30 text-lime`.

## Do / Don't
- ✅ lucide-Icons in `IconChip`-Plättchen · ✅ Gradient nur für CTAs/Akzente · ✅ Desktop füllen (Grids/Sidebar) · ✅ Modals auf Desktop zentriert · ✅ Hover-Lift auf klickbaren Karten · ✅ Mobile: Safe-Areas + `min-w-0`/`shrink-0`.
- ❌ Emoji als Bedien-Icons · ❌ alles in `max-w-md` auf großen Screens · ❌ Gradient als Flächenfüller · ❌ harte reine Schwarz/Weiß-Flächen (immer `white/…`-Transparenzen).

## Referenz-Implementierung
**BauLog** (`C:\Users\eugen\OneDrive\Projekte\baulog`) ist die Goldvorlage — `src/ui/IconChip.jsx`,
`src/components/Nav.jsx`, `src/App.jsx`, `src/index.css`, `src/screens/*`. **Quitto** zeigt zusätzlich
`src/ui/MoneyChip.jsx` (Finanz-Badges) im Einsatz.
